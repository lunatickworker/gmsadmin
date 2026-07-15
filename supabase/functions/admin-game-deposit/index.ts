// admin-game-deposit Edge Function
// 관리자가 게임 중인 유저에게 충전할 때 게임사 API에도 직접 입금
// Authorization: Bearer <admin JWT> 필요

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function aceDeposit(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  amount: number
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");
  const requestKey = `adm-dep-${username}-${Date.now()}`;
  const signature = md5(`${opcode}${username}${requestKey}${secretKey}`).toString();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/deposit`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { opcode, siteUsername: username, amount, cashtype: "cash", requestKey, signature },
    }),
  });
  if (!res.ok) throw new Error(`ACE deposit error ${res.status}`);
  const json = await res.json();
  return Number(json?.data?.balance ?? json?.balance ?? 0);
}

async function honorDeposit(
  apiBaseUrl: string,
  secretKey: string,
  username: string,
  amount: number
): Promise<number> {
  const uuid = crypto.randomUUID();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/user/add-balance?username=${encodeURIComponent(username)}&amount=${amount}&uuid=${uuid}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`HONOR deposit error ${res.status}`);
  const json = await res.json();
  return Number(json?.balance ?? 0);
}

async function investDeposit(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  token: string,
  amount: number
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");
  const sig = md5(`${opcode}${username}${token}${amount}${secretKey}`).toString();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/account/balance`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { opcode, username, token, amount, signature: sig },
    }),
  });
  if (!res.ok) throw new Error(`INVEST deposit error ${res.status}`);
  const json = await res.json();
  return Number(json?.DATA?.balance ?? 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Authorization required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const anonSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 요청자가 어드민 role인지 확인
    const { data: adminRow } = await serviceSupabase
      .from("users")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    const adminRoles = ["system_admin", "operator", "head_office", "sub_office", "distributor", "store"];
    if (!adminRow || !adminRoles.includes(adminRow.role)) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json();
    const { userId, amount } = body as { userId: string; amount: number };
    if (!userId || !amount || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "userId, amount required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 대상 유저 + 활성 게임 세션 조회
    const { data: userRow, error: userError } = await serviceSupabase
      .from("users")
      .select("id, balance, active_game_session, username")
      .eq("id", userId)
      .single();

    if (userError || !userRow) {
      return new Response(JSON.stringify({ success: false, error: "User not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const session = userRow.active_game_session as {
      vendorId: string;
      vendorType: "ace" | "honor" | "invest";
      username: string;
      token?: string;
      cashout_token: string;
    } | null;

    // 게임 중이 아니면 게임사 deposit 불필요 (DB만 업데이트됨을 알림)
    if (!session) {
      return new Response(
        JSON.stringify({ success: true, inGame: false, message: "User is not in game. DB balance already updated." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 게임사 자격증명 조회
    const { data: vendor } = await serviceSupabase
      .from("game_vendors")
      .select("id, vendor_key, api_base_url, opcode, secret_key")
      .eq("id", session.vendorId)
      .single();

    if (!vendor) {
      return new Response(
        JSON.stringify({ success: false, error: "Vendor config not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 게임사 API에 직접 deposit
    let newVendorBalance = 0;
    try {
      if (session.vendorType === "ace") {
        newVendorBalance = await aceDeposit(vendor.api_base_url, vendor.opcode, vendor.secret_key, session.username, amount);
      } else if (session.vendorType === "honor") {
        newVendorBalance = await honorDeposit(vendor.api_base_url, vendor.secret_key, session.username, amount);
      } else if (session.vendorType === "invest" && session.token) {
        newVendorBalance = await investDeposit(vendor.api_base_url, vendor.opcode, vendor.secret_key, session.username, session.token, amount);
      }
    } catch (e) {
      console.error(`[admin-game-deposit] vendor deposit failed for ${userId}:`, e);
      return new Response(
        JSON.stringify({ success: false, error: `게임사 입금 실패: ${String(e)}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        inGame: true,
        vendorType: session.vendorType,
        newVendorBalance,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[admin-game-deposit] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
