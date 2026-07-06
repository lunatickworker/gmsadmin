// 게임 API Edge Function
// INVEST: md5 signature 인증 (opcode + secret_key)
// HONOR: Authorization: Bearer {secret_key} 인증 (md5/signature 없음)
//        모든 파라미터는 (query) 타입 → URL 쿼리스트링으로 전달

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Honor 전용 프록시 ────────────────────────────────────────
// honor-api.md: Authorization: Bearer {secret_key}
// 파라미터: URL 쿼리스트링 (GET/POST 모두 동일)
async function honorRequest<T = any>(
  apiBaseUrl: string,
  endpoint: string,
  secretKey: string,
  method: "GET" | "POST" = "GET",
  params?: Record<string, string | number>
): Promise<T> {
  let url = `${apiBaseUrl.replace(/\/$/, "")}${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();
    url = `${url}?${qs}`;
  }

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method,
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    }),
  });

  if (!res.ok) throw new Error(`Honor proxy error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── INVEST 전용 프록시 ──────────────────────────────────────
async function investRequest<T = any>(
  apiBaseUrl: string,
  endpoint: string,
  method: "GET" | "POST",
  body: Record<string, any>
): Promise<{ RESULT: boolean; DATA?: T; message?: string }> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${apiBaseUrl}${endpoint}`,
      method,
      headers: { "Content-Type": "application/json" },
      body,
    }),
  });
  if (!res.ok) throw new Error(`INVEST proxy error ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, providerType, data } = body as {
      action: string;
      providerType: "invest" | "honor";
      data?: any;
    };

    // game_vendors에서 해당 벤더 자격증명 조회
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: vendor, error: vendorError } = await serviceSupabase
      .from("game_vendors")
      .select("id, vendor_key, api_base_url, opcode, secret_key")
      .eq("vendor_key", providerType)
      .eq("is_active", true)
      .single();

    if (vendorError || !vendor) {
      throw new Error(`'${providerType}' 벤더 설정을 찾을 수 없습니다.`);
    }

    let result: any;

    if (providerType === "honor") {
      // ── HONOR API 처리 ─────────────────────────────────────
      // honor-api.md 스펙: Bearer 인증, 모든 파라미터 쿼리스트링

      switch (action) {
        // GET /my-info — 에이전트 정보 및 잔액
        case "getMyInfo": {
          result = await honorRequest(vendor.api_base_url, "/my-info", vendor.secret_key, "GET");
          break;
        }

        // GET /user?username=xxx — 유저 정보 조회
        case "getUser": {
          if (!data?.username) throw new Error("username required");
          result = await honorRequest(vendor.api_base_url, "/user", vendor.secret_key, "GET", {
            username: data.username,
          });
          break;
        }

        // GET /user/create?username=xxx&nickname=xxx — 회원 가입
        case "createUser": {
          if (!data?.username) throw new Error("username required");
          const params: Record<string, string> = { username: data.username };
          if (data.nickname) params.nickname = data.nickname;
          result = await honorRequest(vendor.api_base_url, "/user/create", vendor.secret_key, "GET", params);
          break;
        }

        // GET /vendor-list — 게임 제공사 목록
        case "getVendorList": {
          result = await honorRequest(vendor.api_base_url, "/vendor-list", vendor.secret_key, "GET");
          break;
        }

        // GET /game-list?vendor=xxx — 게임 목록
        case "getGameList": {
          if (!data?.vendor) throw new Error("vendor required");
          result = await honorRequest(vendor.api_base_url, "/game-list", vendor.secret_key, "GET", {
            vendor: data.vendor,
          });
          break;
        }

        // GET /game-launch-link?username=xxx&game_id=xxx&vendor=xxx&nickname=xxx&skin=xxx
        case "launchGame": {
          if (!data?.username || !data?.game_id || !data?.vendor) {
            throw new Error("username, game_id, vendor required");
          }
          const params: Record<string, string | number> = {
            username: data.username,
            game_id: Number(data.game_id),
            vendor: data.vendor,
          };
          if (data.nickname) params.nickname = data.nickname;
          if (data.skin) params.skin = data.skin;
          result = await honorRequest(vendor.api_base_url, "/game-launch-link", vendor.secret_key, "GET", params);
          break;
        }

        // POST /user/add-balance?username=xxx&amount=xxx&uuid=xxx — 입금 (에이전트→유저)
        case "addBalance": {
          if (!data?.username || data?.amount == null) throw new Error("username, amount required");
          const params: Record<string, string | number> = {
            username: data.username,
            amount: Number(data.amount),
          };
          if (data.uuid) params.uuid = data.uuid;
          result = await honorRequest(vendor.api_base_url, "/user/add-balance", vendor.secret_key, "POST", params);
          break;
        }

        // POST /user/sub-balance?username=xxx&amount=xxx&uuid=xxx — 출금 (유저→에이전트)
        case "subBalance": {
          if (!data?.username || data?.amount == null) throw new Error("username, amount required");
          const params: Record<string, string | number> = {
            username: data.username,
            amount: Number(data.amount),
          };
          if (data.uuid) params.uuid = data.uuid;
          result = await honorRequest(vendor.api_base_url, "/user/sub-balance", vendor.secret_key, "POST", params);
          break;
        }

        // GET /transactions?start=xxx&end=xxx&page=xxx&perPage=xxx&withDetails=0|1&order=asc|desc
        // 주의: 요청 간격 30초 이상, 검색 기간 1시간 이내
        case "getTransactions": {
          if (!data?.start || !data?.end || data?.page == null) {
            throw new Error("start, end, page required");
          }
          const params: Record<string, string | number> = {
            start: data.start,
            end: data.end,
            page: Number(data.page),
            perPage: Number(data.perPage ?? 100),
          };
          if (data.withDetails !== undefined) params.withDetails = data.withDetails ? 1 : 0;
          if (data.order) params.order = data.order;
          result = await honorRequest(vendor.api_base_url, "/transactions", vendor.secret_key, "GET", params);
          break;
        }

        default:
          throw new Error(`Honor: 지원하지 않는 액션: ${action}`);
      }

    } else if (providerType === "invest") {
      // ── INVEST API 처리 ────────────────────────────────────
      // invest-api.md 스펙: md5(opcode + ... + secret_key) signature 인증

      switch (action) {
        case "getGameList": {
          if (!data?.provider_id) throw new Error("provider_id required");
          const { md5 } = await import("npm:crypto-js");
          const sig = md5(`${vendor.opcode}${data.provider_id}${vendor.secret_key}`).toString();
          result = await investRequest(vendor.api_base_url, "/game/lists", "GET", {
            opcode: vendor.opcode,
            provider_id: data.provider_id,
            signature: sig,
          });
          break;
        }

        default:
          throw new Error(`INVEST: 지원하지 않는 액션: ${action}`);
      }
    } else {
      throw new Error(`Unknown providerType: ${providerType}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Game API Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
