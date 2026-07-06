// HONOR 게임사 API 클라이언트
// Endpoint: https://api.honorlink.org/ap
// Auth: Authorization: Bearer {secret_key} (game_vendors.secret_key)
// Proxy: https://proxy.gms0811.com/proxy

const PROXY_URL = "https://proxy.gms0811.com/proxy";

export interface HonorMyInfoResponse {
  id: number;
  type: string;
  username: string;
  nickname: string;
  callback_url: string;
  balance: number;
  created_at: string;
}

export interface HonorUserResponse {
  id: number;
  username: string;
  nickname: string;
  country: string;
  currency_code: string;
  token: string | null;
  balance: number;
  point: number;
  created_at: string;
  updated_at: string;
  last_access_at: string | null;
  agent_id: number;
}

export interface HonorGameListItem {
  title: string;
  type: string;
  id: number;
  vendor: string;
  thumbnail: string;
  thumbnails: Record<string, string>;
  rank: number;
  langs: Record<string, string>;
}

export interface HonorLaunchLinkResponse {
  user: {
    username: string;
    nickname: string;
    balance: number;
    last_access_at: string | null;
    token: string;
  };
  userCreate: boolean;
  link: string;
}

export interface HonorBalanceResponse {
  username: string;
  balance: number;
  amount: number;
  transaction_id: number;
  cached: boolean;
}

export class HonorApiClient {
  private secretKey: string;
  private apiBaseUrl: string;

  constructor(secretKey: string, apiBaseUrl: string) {
    this.secretKey = secretKey;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  }

  // honor-api.md 규격: 모든 파라미터는 (query) 타입 — GET/POST 모두 URL 쿼리스트링으로 전달
  // Authorization: Bearer {secret_key} 만 사용 (md5/signature 없음)
  private async request<T>(endpoint: string, method: "GET" | "POST", params?: Record<string, string | number>): Promise<T> {
    let url = `${this.apiBaseUrl}${endpoint}`;

    // 모든 파라미터를 URL 쿼리스트링으로 전달 (GET/POST 공통)
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
      ).toString();
      url = `${url}?${qs}`;
    }

    const proxyBody: Record<string, unknown> = {
      url,
      method,
      headers: {
        "Authorization": `Bearer ${this.secretKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    };

    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proxyBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Honor API proxy error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // 에이전트 본인 정보 및 보유금 조회
  async getMyInfo(): Promise<HonorMyInfoResponse> {
    return this.request<HonorMyInfoResponse>("/my-info", "GET");
  }

  // 유저 정보 조회
  async getUser(username: string): Promise<HonorUserResponse> {
    return this.request<HonorUserResponse>("/user", "GET", { username });
  }

  // 유저 신규 생성
  async createUser(username: string, nickname?: string): Promise<HonorUserResponse> {
    const params: Record<string, string> = { username };
    if (nickname) params.nickname = nickname;
    return this.request<HonorUserResponse>("/user/create", "GET", params);
  }

  // 게임 벤더 리스트
  async getVendorList(): Promise<unknown[]> {
    return this.request<unknown[]>("/vendor-list", "GET");
  }

  // 게임 리스트
  async getGameList(vendor: string): Promise<HonorGameListItem[]> {
    return this.request<HonorGameListItem[]>("/game-list", "GET", { vendor });
  }

  // 게임 실행 링크
  async getGameLaunchLink(
    username: string,
    gameId: number,
    vendor: string,
    options?: { nickname?: string; skin?: string }
  ): Promise<HonorLaunchLinkResponse> {
    const params: Record<string, string | number> = { username, game_id: gameId, vendor };
    if (options?.nickname) params.nickname = options.nickname;
    if (options?.skin) params.skin = options.skin;
    return this.request<HonorLaunchLinkResponse>("/game-launch-link", "GET", params);
  }

  // 유저 머니 지급 (에이전트 → 유저)
  async addBalance(
    username: string,
    amount: number,
    uuid?: string
  ): Promise<HonorBalanceResponse> {
    const params: Record<string, string | number> = { username, amount };
    if (uuid) params.uuid = uuid;
    return this.request<HonorBalanceResponse>("/user/add-balance", "POST", params);
  }

  // 유저 머니 회수 (유저 → 에이전트)
  async subBalance(
    username: string,
    amount: number,
    uuid?: string
  ): Promise<HonorBalanceResponse> {
    const params: Record<string, string | number> = { username, amount };
    if (uuid) params.uuid = uuid;
    return this.request<HonorBalanceResponse>("/user/sub-balance", "POST", params);
  }
}
