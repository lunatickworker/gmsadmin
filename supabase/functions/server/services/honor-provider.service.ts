// HONOR 게임사 API 서비스 구현
// Honor는 시크릿키로만 에이전트를 구별 (game_vendors.secret_key → Bearer 토큰)

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
  secret_key: string;
  api_base_url: string;
}

export class HonorProviderService implements IGameProviderService {
  private supabase;
  private readonly PROVIDER_TABLE = "game_provider_honor";
  private readonly GAME_TABLE = "game_honor";

  constructor() {
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
  }

  // vendor_key로 game_vendors에서 Honor 자격증명 조회
  private async getVendorByKey(vendorKey: string = "honor"): Promise<VendorInfo> {
    const { data, error } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, secret_key, api_base_url")
      .eq("vendor_key", vendorKey)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      throw new Error(`활성화된 '${vendorKey}' 게임사 벤더를 찾을 수 없습니다.`);
    }
    return data as VendorInfo;
  }

  // 게임 코드 → provider → vendor 체인으로 자격증명 조회
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

    if (provErr || !providerRow?.vendor_id) {
      // vendor_id 없으면 기본 honor 벤더 사용
      return this.getVendorByKey("honor");
    }

    const { data: vendorRow, error: vendorErr } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, secret_key, api_base_url")
      .eq("id", providerRow.vendor_id)
      .eq("is_active", true)
      .single();

    if (vendorErr || !vendorRow) throw new Error("게임사 벤더 정보를 찾을 수 없습니다.");
    return vendorRow as VendorInfo;
  }

  private async getApiClient(vendor: VendorInfo) {
    const { HonorApiClient } = await import("../clients/honor-api-client.ts");
    return new HonorApiClient(vendor.secret_key, vendor.api_base_url);
  }

  // 에이전트 잔액 동기화 (보유금)
  async syncVendorBalance(vendor: VendorInfo): Promise<number> {
    try {
      const apiClient = await this.getApiClient(vendor);
      const info = await apiClient.getMyInfo();
      const balance = info?.balance ?? 0;
      await this.supabase
        .from("game_vendors")
        .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
        .eq("id", vendor.id);
      return balance;
    } catch {
      return 0;
    }
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
      .insert({ ...data, status: data.status || "active", settings: data.settings || {} })
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
    const { error } = await this.supabase.from(this.PROVIDER_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Error deleting provider: ${error.message}`);
  }

  // ==================== 게임 관리 ====================

  async getGames(providerId?: string): Promise<BaseGame[]> {
    let query = this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (providerId) query = query.eq("provider_id", providerId);

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
      .insert({ ...data, status: data.status || "active", metadata: data.metadata || {} })
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
    const { error } = await this.supabase.from(this.GAME_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Error deleting game: ${error.message}`);
  }

  // ==================== 외부 API 연동 ====================

  // game-list API로 vendor별 게임 동기화
  // honor-api.md: GET /game-list?vendor={vendor명}, Authorization: Bearer {secret_key}
  async syncGamesFromProvider(providerId: string): Promise<number> {
    const provider = await this.getProviderById(providerId);
    if (!provider) throw new Error("Provider not found");

    // provider.vendor_id가 있으면 해당 벤더 사용, 없으면 기본 honor 벤더
    let vendor: VendorInfo;
    if ((provider as any).vendor_id) {
      const { data, error } = await this.supabase
        .from("game_vendors")
        .select("id, vendor_key, secret_key, api_base_url")
        .eq("id", (provider as any).vendor_id)
        .eq("is_active", true)
        .single();
      if (error || !data) {
        vendor = await this.getVendorByKey("honor");
      } else {
        vendor = data as VendorInfo;
      }
    } else {
      vendor = await this.getVendorByKey("honor");
    }
    const apiClient = await this.getApiClient(vendor);

    // settings에 vendor 값이 있으면 해당 vendor만, 없으면 벤더 리스트 전체
    const vendorName: string = (provider as any).settings?.honor_vendor || "";
    if (!vendorName) throw new Error("settings.honor_vendor 값이 없습니다.");

    const games = await apiClient.getGameList(vendorName);
    let syncCount = 0;

    for (const gameData of games) {
      try {
        const gameCode = String(gameData.id);
        const existing = await this.getGameByCode(gameCode);
        const thumbnailUrl = gameData.thumbnails?.["300x300"] || gameData.thumbnail;

        if (existing) {
          await this.updateGame(existing.id, {
            game_name: gameData.title,
            game_type: (gameData.type as any) || "other",
            thumbnail_url: thumbnailUrl,
            metadata: gameData as any,
          });
        } else {
          await this.createGame({
            provider_id: providerId,
            game_code: gameCode,
            game_name: gameData.title,
            game_type: (gameData.type as any) || "other",
            thumbnail_url: thumbnailUrl,
            status: "active",
            metadata: gameData as any,
          });
        }
        syncCount++;
      } catch (err) {
        console.error(`Error syncing honor game ${gameData.id}:`, err);
      }
    }

    return syncCount;
  }

  // game-launch-link API로 게임 실행
  async launchGame(gameCode: string, userId: string, options?: any): Promise<string> {
    const game = await this.getGameByCode(gameCode);
    if (!game) throw new Error("Game not found");

    const { data: user } = await this.supabase
      .from("users")
      .select("username, name")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorForGame(gameCode);
    const apiClient = await this.getApiClient(vendor);

    const vendorName: string = (game.metadata as any)?.vendor || options?.vendor || "";
    if (!vendorName) throw new Error("게임 metadata에 vendor 정보가 없습니다.");

    const launchResponse = await apiClient.getGameLaunchLink(
      user.username,
      Number(gameCode),
      vendorName,
      { nickname: user.name || user.username, skin: options?.skin }
    );

    return launchResponse.link;
  }

  // /my-info로 에이전트 보유금 조회
  async getGameBalance(_userId: string): Promise<number> {
    const vendor = await this.getVendorByKey("honor");
    return this.syncVendorBalance(vendor);
  }

  // 유저에게 머니 지급
  async depositToUser(userId: string, amount: number, uuid?: string): Promise<{ balance: number; amount: number }> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorByKey("honor");
    const apiClient = await this.getApiClient(vendor);
    const result = await apiClient.addBalance(user.username, amount, uuid);

    await this.syncVendorBalance(vendor);
    return { balance: result.balance, amount: result.amount };
  }

  // 유저에서 머니 회수
  async withdrawFromUser(userId: string, amount: number, uuid?: string): Promise<{ balance: number; amount: number }> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorByKey("honor");
    const apiClient = await this.getApiClient(vendor);
    const result = await apiClient.subBalance(user.username, amount, uuid);

    await this.syncVendorBalance(vendor);
    return { balance: result.balance, amount: Math.abs(result.amount) };
  }
}
