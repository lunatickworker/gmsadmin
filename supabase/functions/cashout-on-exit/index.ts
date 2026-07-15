// cashout-on-exit Edge Function
// sendBeacon으로 호출되며 Authorization 헤더 없이 동작
// userId + cashout_token으로 인증

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function md5(...parts: (string | number)[]): string {
  // Deno에서 crypto-js 사용
  // @ts-ignore
  const CryptoJS = (globalThis as any).CryptoJS;
  return CryptoJS.MD5(parts.join("")).toString();
}

async function aceWithdraw(
  apiBaseUrl: string,
  opcode: string,
  secretKey: string,
  username: string,
  requestKey: string
): Promise<number> {
  const signature = md5(opcode, username, requestKey, secretKey);
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
  // 1. 잔액 조회
  const getUrl = `${apiBaseUrl}/user?username=${encodeURIComponent(username)}`;
  const getRes = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: getUrl,
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

  // 2. 전액 출금
  const subUrl = `${apiBaseUrl}/user/sub-balance?username=${encodeURIComponent(username)}&amount=${balance}`;
  const subRes = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: subUrl,
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
  const { md5: cryptoMd5 } = await import("npm:crypto-js");

  // 1. 잔액 조회
  const balSig = cryptoMd5(`${opcode}${username}${token}${secretKey}`).toString();
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

  // 2. 전액 출금
  const wdSig = cryptoMd5(`${opcode}${username}${token}${balance}${secretKey}`).toString();
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
    const body = await req.json();
    const { userId, cashout_token } = body as { userId: string; cashout_token: string };

    if (!userId || !cashout_token) {
      return new Response(JSON.stringify({ success: false, error: "userId and cashout_token required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 유저 + 활성 세션 조회
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

    // cashout_token 검증
    if (!session || session.cashout_token !== cashout_token) {
      return new Response(JSON.stringify({ success: false, error: "Invalid cashout token or no active session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // 게임 벤더 자격증명 조회
    const { data: vendor, error: vendorError } = await serviceSupabase
      .from("game_vendors")
      .select("id, vendor_key, api_base_url, opcode, secret_key")
      .eq("id", session.vendorId)
      .single();

    if (vendorError || !vendor) {
      // 세션은 지우고 실패 반환
      await serviceSupabase.from("users").update({ active_game_session: null }).eq("id", userId);
      return new Response(JSON.stringify({ success: false, error: "Vendor not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    let returnedAmount = 0;

    if (session.vendorType === "ace") {
      returnedAmount = await aceWithdraw(
        vendor.api_base_url,
        vendor.opcode,
        vendor.secret_key,
        session.username,
        `beacon-exit-${session.username}-${Date.now()}`
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

    // DB 잔액 업데이트 + 세션 초기화 + online_sessions 행 삭제
    await Promise.all([
      serviceSupabase
        .from("users")
        .update({ balance: returnedAmount, active_game_session: null, is_online: false })
        .eq("id", userId),
      serviceSupabase.from("online_sessions").delete().eq("user_id", userId),
    ]);

    console.log(`[cashout-on-exit] userId=${userId} vendorType=${session.vendorType} returned=${returnedAmount}`);

    return new Response(
      JSON.stringify({ success: true, returnedAmount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[cashout-on-exit] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
