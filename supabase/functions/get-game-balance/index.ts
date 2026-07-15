// get-game-balance Edge Function
// 게임 중인 유저의 실제 잔액을 게임사 API에서 조회
// Authorization: Bearer <admin JWT> 필요

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function aceGetBalance(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");
  const requestKey = `bal-${username}-${Date.now()}`;
  const signature = md5(`${opcode}${username}${requestKey}${secretKey}`).toString();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/balance`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { opcode, siteUsername: username, requestKey, signature },
    }),
  });
  if (!res.ok) throw new Error(`ACE balance error ${res.status}`);
  const json = await res.json();
  return Number(json?.data?.balance ?? json?.balance ?? 0);
}

async function honorGetBalance(
  apiBaseUrl: string,
  secretKey: string,
  username: string
): Promise<number> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/user?username=${encodeURIComponent(username)}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`HONOR balance error ${res.status}`);
  const json = await res.json();
  return Number(json?.balance ?? 0);
}

async function investGetBalance(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  token: string
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");
  const sig = md5(`${opcode}${username}${token}${secretKey}`).toString();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/account/balance`,
      method: "GET",
      headers: { "Content-Type": "application/json" },
      body: { opcode, username, token, signature: sig },
    }),
  });
  if (!res.ok) throw new Error(`INVEST balance error ${res.status}`);
  const json = await res.json();
  return Number(json?.DATA?.balance ?? json?.DATA?.Balance ?? 0);
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
    const { userId } = body as { userId: string };
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "userId required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 대상 유저 + 활성 게임 세션 조회
    const { data: userRow, error: userError } = await serviceSupabase
      .from("users")
      .select("id, balance, active_game_session")
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

    // 게임 중이 아니면 DB 잔액 반환
    if (!session) {
      return new Response(
        JSON.stringify({ success: true, balance: Number(userRow.balance ?? 0), source: "db" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 게임 중이면 게임사 API에서 실제 잔액 조회
    const { data: vendor } = await serviceSupabase
      .from("game_vendors")
      .select("id, vendor_key, api_base_url, opcode, secret_key")
      .eq("id", session.vendorId)
      .single();

    if (!vendor) {
      return new Response(
        JSON.stringify({ success: true, balance: Number(userRow.balance ?? 0), source: "db_fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let balance = 0;
    let source = session.vendorType;

    try {
      if (session.vendorType === "ace") {
        balance = await aceGetBalance(vendor.api_base_url, vendor.opcode, vendor.secret_key, session.username);
      } else if (session.vendorType === "honor") {
        balance = await honorGetBalance(vendor.api_base_url, vendor.secret_key, session.username);
      } else if (session.vendorType === "invest" && session.token) {
        balance = await investGetBalance(vendor.api_base_url, vendor.opcode, vendor.secret_key, session.username, session.token);
      }
    } catch (e) {
      console.error(`[get-game-balance] vendor API failed for ${userId}:`, e);
      // 게임사 API 실패 시 DB 잔액 폴백
      return new Response(
        JSON.stringify({ success: true, balance: Number(userRow.balance ?? 0), source: "db_fallback", error: String(e) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, balance, source }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[get-game-balance] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
