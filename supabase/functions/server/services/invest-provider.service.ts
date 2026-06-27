// INVEST 게임사 API 서비스 구현

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import type {
  BaseGameProvider,
  BaseGame,
  CreateGameProviderRequest,
  UpdateGameProviderRequest,
  CreateGameRequest,
  UpdateGameRequest,
} from "../types/game-provider.types";
import type { IGameProviderService } from "./game-provider.interface";

interface VendorInfo {
  id: string;
  vendor_key: string;
  opcode: string;
  secret_key: string;
  api_base_url: string;
}

export class InvestProviderService implements IGameProviderService {
  private supabase;
  private readonly PROVIDER_TABLE = "game_provider_invest";
  private readonly GAME_TABLE = "game_invest";

  constructor() {
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
  }

  // vendor_key로 게임사 자격증명 조회
  private async getVendorByKey(vendorKey: string): Promise<VendorInfo> {
    const { data, error } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, opcode, secret_key, api_base_url")
      .eq("vendor_key", vendorKey)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      throw new Error(`활성화된 '${vendorKey}' 게임사 벤더를 찾을 수 없습니다.`);
    }
    return data as VendorInfo;
  }

  // 게임 코드로 해당 게임이 속한 벤더 조회 (game_invest → game_provider_invest → game_vendors)
  private async getVendorForGame(gameCode: string): Promise<VendorInfo> {
    const { data: gameRow, error: gameErr } = await this.supabase
      .from(this.GAME_TABLE)
      .select("provider_id")
      .eq("game_code", gameCode)
      .single();

    if (gameErr || !gameRow) throw new Error(`게임을 찾을 수 없습니다: ${gameCode}`);

    const { data: providerRow, error: provErr } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("vendor_id")
      .eq("id", gameRow.provider_id)
      .single();

    if (provErr || !providerRow) throw new Error(`게임 제공사를 찾을 수 없습니다.`);

    const { data: vendorRow, error: vendorErr } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, opcode, secret_key, api_base_url")
      .eq("id", providerRow.vendor_id)
      .eq("is_active", true)
      .single();

    if (vendorErr || !vendorRow) throw new Error(`게임사 벤더 정보를 찾을 수 없습니다.`);

    return vendorRow as VendorInfo;
  }

  // 회원의 계층에서 운영사 UUID 조회
  private async getOperatorForUser(userId: string): Promise<string | null> {
    const { data: userRow } = await this.supabase
      .from("users")
      .select("hierarchy_path")
      .eq("id", userId)
      .single();

    if (!userRow?.hierarchy_path?.length) return null;

    const { data: operatorRow } = await this.supabase
      .from("users")
      .select("id")
      .eq("role", "operator")
      .in("id", userRow.hierarchy_path)
      .maybeSingle();

    return operatorRow?.id ?? null;
  }

  // 운영사가 해당 벤더를 사용할 수 있는지 검증
  private async verifyOperatorVendorAccess(userId: string, vendorKey: string): Promise<void> {
    const operatorId = await this.getOperatorForUser(userId);
    if (!operatorId) return; // 운영사가 없으면 제한 없음 (시스템 관리자 직속)

    const { data: settings } = await this.supabase
      .from("partner_settings")
      .select("game_vendor_keys")
      .eq("user_id", operatorId)
      .maybeSingle();

    const allowedKeys: string[] = settings?.game_vendor_keys ?? [];
    if (allowedKeys.length > 0 && !allowedKeys.includes(vendorKey)) {
      throw new Error(`운영사에서 '${vendorKey}' 게임사 API 사용 권한이 없습니다.`);
    }
  }

  // 사용자의 특정 벤더 토큰 조회 또는 생성 (user_vendor_tokens 테이블)
  async ensureUserTokenForVendor(userId: string, vendor: VendorInfo): Promise<string> {
    const { data: tokenRow } = await this.supabase
      .from("user_vendor_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    if (tokenRow?.token) return tokenRow.token;

    const { data: user, error } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (error || !user) throw new Error(`User not found: ${userId}`);

    const { InvestApiClient } = await import("../clients/invest-api-client.ts");
    const apiClient = new InvestApiClient(vendor.opcode, vendor.secret_key);
    const result = await apiClient.createOrLoginAccount(user.username);

    await this.supabase
      .from("user_vendor_tokens")
      .upsert(
        { user_id: userId, vendor_id: vendor.id, token: result.token },
        { onConflict: "user_id,vendor_id" }
      );

    return result.token;
  }

  // 기존 호환성 유지용 (INVEST 벤더 기본값)
  async ensureUserToken(userId: string): Promise<string> {
    const vendor = await this.getVendorByKey("invest");
    return this.ensureUserTokenForVendor(userId, vendor);
  }

  // 제공사 API /info 호출 후 game_vendors.total_balance 동기화
  private async syncVendorBalance(vendor: VendorInfo): Promise<void> {
    try {
      const apiClient = await this.getApiClientForVendor(vendor);
      const info = await apiClient.getInfo();
      const balance = info?.balance ?? info?.Balance ?? info?.total_balance ?? info?.amount ?? null;
      if (balance !== null) {
        await this.supabase
          .from("game_vendors")
          .update({ total_balance: Number(balance), balance_checked_at: new Date().toISOString() })
          .eq("id", vendor.id);
      }
    } catch {
      // balance sync 실패는 입출금 결과에 영향 없음
    }
  }

  private async getApiClientForVendor(vendor: VendorInfo) {
    const { InvestApiClient } = await import("../clients/invest-api-client.ts");
    return new InvestApiClient(vendor.opcode, vendor.secret_key, vendor.api_base_url);
  }

  // ==================== 게임사 관리 ====================

  async getProviders(): Promise<BaseGameProvider[]> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Error fetching providers: ${error.message}`);
    return data as BaseGameProvider[];
  }

  async getProviderById(id: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Error fetching provider: ${error.message}`);
    return data as BaseGameProvider | null;
  }

  async getProviderByCode(code: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .eq("provider_code", code)
      .maybeSingle();

    if (error) throw new Error(`Error fetching provider: ${error.message}`);
    return data as BaseGameProvider | null;
  }

  async createProvider(data: CreateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: provider, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .insert({
        ...data,
        status: data.status || "active",
        settings: data.settings || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Error creating provider: ${error.message}`);
    return provider as BaseGameProvider;
  }

  async updateProvider(id: string, data: UpdateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: provider, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Error updating provider: ${error.message}`);
    return provider as BaseGameProvider;
  }

  async deleteProvider(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Error deleting provider: ${error.message}`);
  }

  // ==================== 게임 관리 ====================

  async getGames(providerId?: string): Promise<BaseGame[]> {
    let query = this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Error fetching games: ${error.message}`);
    return data as BaseGame[];
  }

  async getGameById(id: string): Promise<BaseGame | null> {
    const { data, error } = await this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Error fetching game: ${error.message}`);
    return data as BaseGame | null;
  }

  async getGameByCode(code: string): Promise<BaseGame | null> {
    const { data, error } = await this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .eq("game_code", code)
      .maybeSingle();

    if (error) throw new Error(`Error fetching game: ${error.message}`);
    return data as BaseGame | null;
  }

  async createGame(data: CreateGameRequest): Promise<BaseGame> {
    const { data: game, error } = await this.supabase
      .from(this.GAME_TABLE)
      .insert({
        ...data,
        status: data.status || "active",
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Error creating game: ${error.message}`);
    return game as BaseGame;
  }

  async updateGame(id: string, data: UpdateGameRequest): Promise<BaseGame> {
    const { data: game, error } = await this.supabase
      .from(this.GAME_TABLE)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Error updating game: ${error.message}`);
    return game as BaseGame;
  }

  async deleteGame(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.GAME_TABLE)
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Error deleting game: ${error.message}`);
  }

  // ==================== 외부 API 연동 ====================

  async syncGamesFromProvider(providerId: string): Promise<number> {
    const provider = await this.getProviderById(providerId);
    if (!provider) throw new Error("Provider not found");

    // 제공사의 벤더 조회
    const { data: providerRow } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("vendor_id")
      .eq("id", providerId)
      .single();

    if (!providerRow?.vendor_id) throw new Error("제공사에 연결된 벤더가 없습니다.");

    const { data: vendorRow } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, opcode, secret_key, api_base_url")
      .eq("id", providerRow.vendor_id)
      .single();

    if (!vendorRow) throw new Error("벤더 정보를 찾을 수 없습니다.");

    const apiClient = await this.getApiClientForVendor(vendorRow as VendorInfo);
    const externalProviderId: number = (provider as any).settings?.external_provider_id ?? 0;
    const gameListResponse = await apiClient.getGameList(externalProviderId);

    let syncCount = 0;

    for (const gameData of gameListResponse.games) {
      try {
        const gameCode = String(gameData.id);
        const existingGame = await this.getGameByCode(gameCode);
        const gameName: string = gameData.game_title ?? gameData.name ?? gameData.game_name ?? `Game ${gameCode}`;
        const thumbnailUrl: string | undefined = gameData.game_image ?? gameData.thumbnail ?? undefined;

        if (existingGame) {
          await this.updateGame(existingGame.id, {
            game_name: gameName,
            thumbnail_url: thumbnailUrl,
            metadata: gameData,
          });
        } else {
          await this.createGame({
            provider_id: providerId,
            game_code: gameCode,
            game_name: gameName,
            game_type: "slot",
            thumbnail_url: thumbnailUrl,
            status: "active",
            metadata: gameData,
          });
        }
        syncCount++;
      } catch (err) {
        console.error(`Error syncing game ${gameData.id}:`, err);
      }
    }

    return syncCount;
  }

  // 게임 실행 - 게임이 속한 벤더의 자격증명 자동 선택
  async launchGame(gameCode: string, userId: string): Promise<string> {
    const game = await this.getGameByCode(gameCode);
    if (!game) throw new Error("Game not found");

    // 게임 → 제공사 → 벤더 체인으로 자격증명 조회
    const vendor = await this.getVendorForGame(gameCode);

    // 운영사 벤더 접근 권한 검증
    await this.verifyOperatorVendorAccess(userId, vendor.vendor_key);

    // 해당 벤더의 사용자 토큰 확인/발급
    const token = await this.ensureUserTokenForVendor(userId, vendor);

    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const apiClient = await this.getApiClientForVendor(vendor);
    const launchResponse = await apiClient.launchGame(user.username, token, Number(gameCode));
    return launchResponse.gameUrl;
  }

  async getGameBalance(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (!user) throw new Error(`User not found: ${userId}`);

    // INVEST 기본 벤더로 잔고 조회
    const vendor = await this.getVendorByKey("invest");
    const apiClient = await this.getApiClientForVendor(vendor);
    const allBalances = await apiClient.getAllBalances();
    const found = allBalances.accounts.find((a) => a.username === user.username);
    return found?.balance ?? 0;
  }

  // 입금 (충전) - 운영사 보유금 차감
  async depositToUser(
    userId: string,
    amount: number,
    vendorKey: string = "invest"
  ): Promise<{ balance: number; amount: number }> {
    const vendor = await this.getVendorByKey(vendorKey);
    const token = await this.ensureUserTokenForVendor(userId, vendor);

    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const apiClient = await this.getApiClientForVendor(vendor);
    const result = await apiClient.deposit(user.username, token, amount);

    await this.syncVendorBalance(vendor);

    return result;
  }

  // 출금 (환전) - 운영사 보유금 증가
  async withdrawFromUser(
    userId: string,
    amount: number,
    vendorKey: string = "invest"
  ): Promise<{ balance: number; amount: number }> {
    const vendor = await this.getVendorByKey(vendorKey);
    const token = await this.ensureUserTokenForVendor(userId, vendor);

    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const apiClient = await this.getApiClientForVendor(vendor);
    const result = await apiClient.withdraw(user.username, token, amount);

    await this.syncVendorBalance(vendor);

    return result;
  }
}
