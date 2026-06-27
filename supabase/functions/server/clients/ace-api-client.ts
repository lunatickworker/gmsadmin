// ACE 게임사 API 클라이언트
// Endpoint: gate.st88-ace.com (api_base_url from game_vendors)
// Auth: agent(=opcode) + hash(SHA-256 Base64) in 요청 헤더
// Content-Type: application/x-www-form-urlencoded
// Proxy: https://vi8282.com/proxy (모든 API 문서 공통)

const PROXY_URL = "https://vi8282.com/proxy";

// SHA-256 Base64 해시 생성 (Deno Web Crypto API 사용)
// hash = Base64( SHA-256( JSON.stringify(body) + secretKey ) )
// body가 없거나 빈 객체면 JSON.stringify 생략
async function sha256Base64(body: Record<string, unknown> | null, secretKey: string): Promise<string> {
  const jsonString = body && Object.keys(body).length > 0 ? JSON.stringify(body) : "";
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString + secretKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const binaryString = hashArray.map((b) => String.fromCharCode(b)).join("");
  return btoa(binaryString);
}

// ─── Response 타입 ────────────────────────────────────────────

export interface AceBaseResponse {
  code: number;
  msg?: string;
}

export interface AceBalanceResponse extends AceBaseResponse {
  balance: number;
}

export interface AceVendorSkin {
  skin: string;
  name: string;
}

export interface AceVendorItem {
  key?: string;
  vendorKey?: string;
  row_num?: number;
  name?: string;
  category?: string;
  skins?: AceVendorSkin[];
}

export interface AceVendorsResponse extends AceBaseResponse {
  vendors: AceVendorItem[];
}

export interface AceGameItem {
  key?: string;
  gameKey?: string;
  id?: number;
  skin?: string;
  names?: { ko?: string; en?: string };
  name?: string;
  platform?: string;
  category?: string;
  type?: string;
  image?: string;
}

export interface AceGamesResponse extends AceBaseResponse {
  games: AceGameItem[];
}

export interface AceLaunchResponse extends AceBaseResponse {
  url: string;
  balance: number;
  userId: number;
}

export interface AceTransactionItem {
  _id: string;
  type: string;
  siteUsername?: string;
  username?: string;
  vendorId?: string;
  vendorName?: string;
  vendorKey?: string;
  gameId?: string;
  gameKey?: string;
  gameName?: string;
  gameType?: string;
  gameCategory?: string;
  cash?: number;
  updepositCash?: number;
  key?: string;
  refId?: string;
  isBonus?: boolean;
  isPromo?: boolean;
  isJackpot?: boolean;
  utcCreatedAt?: string;
}

export interface AceTransactionsResponse extends AceBaseResponse {
  transactions: AceTransactionItem[];
  lastObjectId?: string;
}

// ─── Client ───────────────────────────────────────────────────

export class AceApiClient {
  private agent: string;   // game_vendors.opcode
  private secretKey: string;
  private apiBaseUrl: string;

  constructor(agent: string, secretKey: string, apiBaseUrl: string) {
    this.agent = agent;
    this.secretKey = secretKey;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  }

  // 모든 요청은 vi8282.com/proxy를 통해 전달
  // ACE: POST, Content-Type: application/x-www-form-urlencoded, agent+hash 헤더
  private async request<T extends AceBaseResponse>(
    endpoint: string,
    body: Record<string, unknown> | null = null
  ): Promise<T> {
    const hash = await sha256Base64(body, this.secretKey);

    const formBody = body && Object.keys(body).length > 0
      ? Object.entries(body)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";

    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${this.apiBaseUrl}${endpoint}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "agent": this.agent,
          "hash": hash,
        },
        body: formBody,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ACE API proxy error ${response.status}: ${text}`);
    }

    const data = await response.json() as T;
    if (data.code !== 0) {
      throw new Error(data.msg || `ACE API 오류 (code: ${data.code})`);
    }
    return data;
  }

  // 에이전트 잔액 조회 (/partner/balance)
  async getAgentBalance(): Promise<number> {
    const data = await this.request<AceBalanceResponse>("/partner/balance", null);
    return data.balance ?? 0;
  }

  // 벤더(제공사) 목록 조회 (/vendors)
  async getVendors(): Promise<AceVendorItem[]> {
    const data = await this.request<AceVendorsResponse>("/vendors", null);
    return data.vendors ?? [];
  }

  // 게임 목록 조회 (/games) — 슬롯 전용, 카지노는 skins 메타데이터로 관리
  async getGames(vendorKey: string, skin?: string): Promise<AceGameItem[]> {
    const body: Record<string, unknown> = { vendorKey };
    if (skin) body.skin = skin;
    const data = await this.request<AceGamesResponse>("/games", body);
    return data.games ?? [];
  }

  // 회원 등록 (/register)
  async registerMember(params: {
    username: string;
    nickname: string;
    siteUsername: string;
  }): Promise<void> {
    await this.request<AceBaseResponse>("/register", params as Record<string, unknown>);
  }

  // 게임 실행 URL 획득 (/play)
  async launchGame(params: {
    vendorKey: string;
    gameKey: string;
    siteUsername: string;
    nickname?: string;
    ip: string;
    language?: string;
    platform?: string;
    requestKey: string;
  }): Promise<AceLaunchResponse> {
    return this.request<AceLaunchResponse>("/play", params as Record<string, unknown>);
  }

  // 회원 잔액 조회 (/balance)
  async getMemberBalance(siteUsername: string): Promise<number> {
    const data = await this.request<AceBalanceResponse>("/balance", { siteUsername });
    return data.balance ?? 0;
  }

  // 회원 입금 (/deposit) — 플랫폼 잔액 → ACE 게임 충전
  async depositMember(siteUsername: string, amount: number, requestKey: string): Promise<number> {
    const data = await this.request<AceBalanceResponse>("/deposit", {
      siteUsername,
      amount,
      cashtype: "cash",
      requestKey,
    });
    return data.balance ?? 0;
  }

  // 회원 출금 (/withdraw) — ACE 게임 잔액 전액 회수 (amount=0 → 전액)
  async withdrawMember(siteUsername: string, requestKey: string): Promise<number> {
    const data = await this.request<AceBalanceResponse & { amount?: number }>("/withdraw", {
      siteUsername,
      amount: 0,
      cashtype: "cash",
      requestKey,
    });
    return data.amount ?? 0;
  }

  // 베팅 내역 조회 (/transaction)
  async getTransactions(params: {
    sdate?: string;
    edate?: string;
    vendorKey?: string;
    username?: string;
    limit?: number;
  } = {}): Promise<{ transactions: AceTransactionItem[]; lastObjectId: string | null }> {
    const body: Record<string, unknown> = { limit: params.limit ?? 100 };
    if (params.sdate)     body.sdate     = params.sdate;
    if (params.edate)     body.edate     = params.edate;
    if (params.vendorKey) body.vendorKey = params.vendorKey;
    if (params.username)  body.username  = params.username;
    const data = await this.request<AceTransactionsResponse>("/transaction", body);
    return {
      transactions: data.transactions ?? [],
      lastObjectId: data.lastObjectId ?? null,
    };
  }
}
