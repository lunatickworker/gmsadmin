// admin-force-logout Edge Function
// 어드민이 특정 유저를 강제 로그아웃 + 캐시아웃 처리
// Authorization: Bearer <admin JWT> 필요

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function aceWithdraw(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  requestKey: string
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");
  const signature = md5(`${opcode}${username}${requestKey}${secretKey}`).toString();
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/withdraw`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { opcode, username, requestKey, signature },
    }),
  });
  if (!res.ok) throw new Error(`ACE proxy error ${res.status}`);
  const json = await res.json();
  return Number(json?.data?.balance ?? json?.balance ?? 0);
}

async function honorWithdraw(
  apiBaseUrl: string,
  secretKey: string,
  username: string
): Promise<number> {
  const getRes = await fetch(PROXY_URL, {
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
  if (!getRes.ok) throw new Error(`HONOR user fetch error ${getRes.status}`);
  const userData = await getRes.json();
  const balance = Number(userData?.balance ?? 0);
  if (balance <= 0) return 0;

  const subRes = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/user/sub-balance?username=${encodeURIComponent(username)}&amount=${balance}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    }),
  });
  if (!subRes.ok) throw new Error(`HONOR sub-balance error ${subRes.status}`);
  return balance;
}

async function investWithdraw(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  token: string
): Promise<number> {
  const { md5 } = await import("npm:crypto-js");

  const balSig = md5(`${opcode}${username}${token}${secretKey}`).toString();
  const balRes = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/account/balance`,
      method: "GET",
      headers: { "Content-Type": "application/json" },
      body: { opcode, username, token, signature: balSig },
    }),
  });
  if (!balRes.ok) throw new Error(`INVEST balance error ${balRes.status}`);
  const balJson = await balRes.json();
  const balance = Number(balJson?.DATA?.balance ?? balJson?.DATA?.Balance ?? 0);
  if (balance <= 0) return 0;

  const wdSig = md5(`${opcode}${username}${token}${balance}${secretKey}`).toString();
  const wdRes = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}/account/balance`,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: { opcode, username, token, amount: balance, signature: wdSig },
    }),
  });
  if (!wdRes.ok) throw new Error(`INVEST withdraw error ${wdRes.status}`);
  const wdJson = await wdRes.json();
  return Number(wdJson?.DATA?.balance ?? balance);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 어드민 JWT 검증
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

    // 요청자가 어드민 role인지 확인
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

    let returnedAmount = 0;

    if (session) {
      const { data: vendor } = await serviceSupabase
        .from("game_vendors")
        .select("id, vendor_key, api_base_url, opcode, secret_key")
        .eq("id", session.vendorId)
        .single();

      if (vendor) {
        try {
          if (session.vendorType === "ace") {
            returnedAmount = await aceWithdraw(
              vendor.api_base_url,
              vendor.opcode,
              vendor.secret_key,
              session.username,
              `admin-force-${session.username}-${Date.now()}`
            );
          } else if (session.vendorType === "honor") {
            returnedAmount = await honorWithdraw(
              vendor.api_base_url,
              vendor.secret_key,
              session.username
            );
          } else if (session.vendorType === "invest" && session.token) {
            returnedAmount = await investWithdraw(
              vendor.api_base_url,
              vendor.opcode,
              vendor.secret_key,
              session.username,
              session.token
            );
          }
        } catch (e) {
          console.error(`[admin-force-logout] cashout failed for ${userId}:`, e);
          // 캐시아웃 실패해도 강제 로그아웃은 계속 진행
        }
      }
    }

    // is_online=false + 세션 초기화 → 게임 클라이언트 실시간 구독이 자동 로그아웃 처리
    const now = new Date().toISOString();
    await Promise.all([
      serviceSupabase
        .from("users")
        .update({ is_online: false, active_game_session: null, balance: returnedAmount || userRow.balance })
        .eq("id", userId),
      serviceSupabase
        .from("online_sessions")
        .update({ is_active: false, logout_at: now })
        .eq("user_id", userId)
        .eq("is_active", true),
    ]);

    console.log(`[admin-force-logout] admin=${user.id} target=${userId} returned=${returnedAmount}`);

    return new Response(
      JSON.stringify({ success: true, returnedAmount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[admin-force-logout] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
