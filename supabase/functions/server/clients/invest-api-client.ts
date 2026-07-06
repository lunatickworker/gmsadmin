// INVEST 게임사 API 클라이언트
// API 스펙: https://api.invest-ho.com
// Signature: tolower( md5( ...fields + secret_key ) )
// Proxy: https://proxy.gms0811.com/proxy (모든 API 문서 공통)

import { crypto as stdCrypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";

const PROXY_URL = "https://proxy.gms0811.com/proxy";

// MD5 해시 생성 — Web Crypto는 MD5 미지원, @std/crypto 사용
async function md5Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await stdCrypto.subtle.digest("MD5", data);
  return encodeHex(new Uint8Array(hashBuffer));
}

export interface InvestAccountResponse {
  token: string;
  username: string;
  balance?: number;
}

export interface InvestBalanceItem {
  username: string;
  balance: number;
}

export interface InvestAllBalanceResponse {
  accounts: InvestBalanceItem[];
}

export interface InvestDepositWithdrawResponse {
  balance: number;
  amount: number;
}

export interface InvestGameListItem {
  id: number;
  name: string;
  thumbnail?: string;
}

export interface InvestGameListResponse {
  games: InvestGameListItem[];
}

export interface InvestLaunchGameResponse {
  gameUrl: string;
}

export interface InvestGameHistoryItem {
  id: number;
  username: string;
  game_id: number;
  bet_amount: number;
  win_amount: number;
  created_at: string;
}

export interface InvestGameHistoryResponse {
  data: InvestGameHistoryItem[];
  last_id: number;
}

export class InvestApiClient {
  private opcode: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(opcode: string, secretKey: string, baseUrl?: string) {
    this.opcode = opcode;
    this.secretKey = secretKey;
    this.baseUrl = (baseUrl ?? "https://api.invest-ho.com").replace(/\/$/, "");
  }

  // 모든 요청은 proxy.gms0811.com/proxy를 통해 전달
  private async request<T>(
    endpoint: string,
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${this.baseUrl}${endpoint}`,
        method,
        headers: { "Content-Type": "application/json" },
        body,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`INVEST API proxy error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // 계정 생성 / 로그인 → token 반환
  // Signature: md5(opcode + username + secret_key)
  async createOrLoginAccount(username: string): Promise<InvestAccountResponse> {
    const signature = await md5Hex(this.opcode + username + this.secretKey);
    return this.request<InvestAccountResponse>("/api/account", "POST", {
      opcode: this.opcode,
      username,
      signature,
    });
  }

  // 운영사 정보 및 보유금 조회
  // Signature: md5(opcode + secret_key)
  async getInfo(): Promise<{ balance?: number; Balance?: number; total_balance?: number; amount?: number; [key: string]: unknown }> {
    const signature = await md5Hex(this.opcode + this.secretKey);
    return this.request("/info", "GET", { opcode: this.opcode, signature });
  }

  // 계정 잔고 조회 (단일 회원)
  // Signature: md5(opcode + username + token + secret_key)
  async getAccountBalance(username: string, token: string): Promise<{ balance: number; Balance?: number }> {
    const signature = await md5Hex(this.opcode + username + token + this.secretKey);
    return this.request<{ balance: number; Balance?: number }>("/api/account/balance", "GET", {
      opcode: this.opcode,
      username,
      token,
      signature,
    });
  }

  // 전체 잔고 조회
  // Signature: md5(opcode + secret_key)
  async getAllBalances(): Promise<InvestAllBalanceResponse> {
    const signature = await md5Hex(this.opcode + this.secretKey);
    return this.request<InvestAllBalanceResponse>("/api/account/balance", "PATCH", {
      opcode: this.opcode,
      signature,
    });
  }

  // 계정 잔고 입금
  // Signature: md5(opcode + username + token + amount + secret_key)
  async deposit(username: string, token: string, amount: number): Promise<InvestDepositWithdrawResponse> {
    const signature = await md5Hex(this.opcode + username + token + amount + this.secretKey);
    return this.request<InvestDepositWithdrawResponse>("/api/account/balance", "POST", {
      opcode: this.opcode,
      username,
      token,
      amount,
      signature,
    });
  }

  // 계정 잔고 출금
  // Signature: md5(opcode + username + token + amount + secret_key)
  async withdraw(username: string, token: string, amount: number): Promise<InvestDepositWithdrawResponse> {
    const signature = await md5Hex(this.opcode + username + token + amount + this.secretKey);
    return this.request<InvestDepositWithdrawResponse>("/api/account/balance", "PUT", {
      opcode: this.opcode,
      username,
      token,
      amount,
      signature,
    });
  }

  // 게임 목록 조회
  // Signature: md5(opcode + provider_id + secret_key)
  async getGameList(providerId: number): Promise<InvestGameListResponse> {
    const signature = await md5Hex(this.opcode + providerId + this.secretKey);
    return this.request<InvestGameListResponse>("/api/game/lists", "GET", {
      opcode: this.opcode,
      provider_id: providerId,
      signature,
    });
  }

  // 게임 실행 URL 생성
  // Signature: md5(opcode + username + token + game + secret_key)
  async launchGame(username: string, token: string, gameId: number): Promise<InvestLaunchGameResponse> {
    const signature = await md5Hex(this.opcode + username + token + gameId + this.secretKey);
    return this.request<InvestLaunchGameResponse>("/api/game/launch", "POST", {
      opcode: this.opcode,
      username,
      token,
      game: gameId,
      signature,
    });
  }

  // 게임 기록 (인덱스 방식)
  // Signature: md5(opcode + year + month + index + secret_key)
  async getGameHistory(
    year: string,
    month: string,
    index: number,
    limit = 1000
  ): Promise<InvestGameHistoryResponse> {
    const signature = await md5Hex(this.opcode + year + month + index + this.secretKey);
    return this.request<InvestGameHistoryResponse>("/api/game/historyindex", "GET", {
      opcode: this.opcode,
      year,
      month,
      index,
      limit,
      signature,
    });
  }

  // 라운드 상세 정보
  // Signature: md5(opcode + yyyymm + txid + secret_key)
  async getGameDetail(yyyymm: string, txid: number): Promise<unknown> {
    const signature = await md5Hex(this.opcode + yyyymm + txid + this.secretKey);
    return this.request<unknown>("/api/game/detail", "GET", {
      opcode: this.opcode,
      yyyymm,
      txid,
      signature,
    });
  }

  // 에볼루션 제한 테이블 조회
  // Signature: md5(opcode + secret_key)
  async getEvolutionTableLimits(): Promise<unknown> {
    const signature = await md5Hex(this.opcode + this.secretKey);
    return this.request<unknown>("/api/game/evolution/table", "GET", {
      opcode: this.opcode,
      signature,
    });
  }
}
