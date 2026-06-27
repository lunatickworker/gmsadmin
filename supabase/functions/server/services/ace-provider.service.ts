// ACE 게임사 API 서비스 구현
// Auth: agent(opcode) + SHA-256 Base64 hash, proxy 경유
// DB 테이블: game_provider_ace, game_ace

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

export class AceProviderService implements IGameProviderService {
  private supabase;
  private readonly PROVIDER_TABLE = "game_provider_ace";
  private readonly GAME_TABLE = "game_ace";

  constructor() {
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );
  }

  // vendor_key로 게임사 자격증명 조회
  private async getVendorByKey(vendorKey: string = "ace"): Promise<VendorInfo> {
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

  // game_key로 해당 게임이 속한 벤더 조회 (game_ace → game_provider_ace → game_vendors)
  private async getVendorForGame(gameKey: string): Promise<VendorInfo> {
    const { data: gameRow, error: gameErr } = await this.supabase
      .from(this.GAME_TABLE)
      .select("provider_id")
      .eq("game_key", gameKey)
      .single();

    if (gameErr || !gameRow) throw new Error(`게임을 찾을 수 없습니다: ${gameKey}`);

    const { data: providerRow, error: provErr } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("vendor_id")
      .eq("id", gameRow.provider_id)
      .single();

    if (provErr || !providerRow?.vendor_id) {
      return this.getVendorByKey("ace");
    }

    const { data: vendorRow, error: vendorErr } = await this.supabase
      .from("game_vendors")
      .select("id, vendor_key, opcode, secret_key, api_base_url")
      .eq("id", providerRow.vendor_id)
      .eq("is_active", true)
      .single();

    if (vendorErr || !vendorRow) throw new Error("게임사 벤더 정보를 찾을 수 없습니다.");
    return vendorRow as VendorInfo;
  }

  private async getApiClient(vendor: VendorInfo) {
    const { AceApiClient } = await import("../clients/ace-api-client.ts");
    return new AceApiClient(vendor.opcode, vendor.secret_key, vendor.api_base_url);
  }

  // 에이전트 잔액 동기화
  async syncVendorBalance(vendor: VendorInfo): Promise<number> {
    try {
      const apiClient = await this.getApiClient(vendor);
      const balance = await apiClient.getAgentBalance();
      await this.supabase
        .from("game_vendors")
        .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
        .eq("id", vendor.id);
      return balance;
    } catch {
      return 0;
    }
  }

  // ==================== 게임사(제공사) 관리 ====================

  async getProviders(): Promise<BaseGameProvider[]> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .order("vendor_name");

    if (error) throw new Error(`Error fetching ACE providers: ${error.message}`);
    return data as BaseGameProvider[];
  }

  async getProviderById(id: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Error fetching ACE provider: ${error.message}`);
    return data as BaseGameProvider | null;
  }

  async getProviderByCode(code: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*")
      .eq("vendor_key", code)
      .maybeSingle();

    if (error) throw new Error(`Error fetching ACE provider: ${error.message}`);
    return data as BaseGameProvider | null;
  }

  async createProvider(data: CreateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: provider, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .insert({ ...data, is_active: true, metadata: data.settings || {} })
      .select()
      .single();

    if (error) throw new Error(`Error creating ACE provider: ${error.message}`);
    return provider as BaseGameProvider;
  }

  async updateProvider(id: string, data: UpdateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: provider, error } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Error updating ACE provider: ${error.message}`);
    return provider as BaseGameProvider;
  }

  async deleteProvider(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.PROVIDER_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Error deleting ACE provider: ${error.message}`);
  }

  // ==================== 게임 관리 ====================

  async getGames(providerId?: string): Promise<BaseGame[]> {
    let query = this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .order("game_name_ko");

    if (providerId) query = query.eq("provider_id", providerId);

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching ACE games: ${error.message}`);
    return data as BaseGame[];
  }

  async getGameById(id: string): Promise<BaseGame | null> {
    const { data, error } = await this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Error fetching ACE game: ${error.message}`);
    return data as BaseGame | null;
  }

  async getGameByCode(code: string): Promise<BaseGame | null> {
    const { data, error } = await this.supabase
      .from(this.GAME_TABLE)
      .select("*")
      .eq("game_key", code)
      .maybeSingle();

    if (error) throw new Error(`Error fetching ACE game: ${error.message}`);
    return data as BaseGame | null;
  }

  async createGame(data: CreateGameRequest): Promise<BaseGame> {
    const { data: game, error } = await this.supabase
      .from(this.GAME_TABLE)
      .insert({ ...data, status: data.status || "active", metadata: data.metadata || {} })
      .select()
      .single();

    if (error) throw new Error(`Error creating ACE game: ${error.message}`);
    return game as BaseGame;
  }

  async updateGame(id: string, data: UpdateGameRequest): Promise<BaseGame> {
    const { data: game, error } = await this.supabase
      .from(this.GAME_TABLE)
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Error updating ACE game: ${error.message}`);
    return game as BaseGame;
  }

  async deleteGame(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.GAME_TABLE).delete().eq("id", id);
    if (error) throw new Error(`Error deleting ACE game: ${error.message}`);
  }

  // ==================== 외부 API 연동 ====================

  // 제공사 목록 API → game_provider_ace DB 동기화
  async syncProvidersFromApi(vendorKey: string = "ace"): Promise<{ created: number; skipped: number }> {
    const vendor = await this.getVendorByKey(vendorKey);
    const apiClient = await this.getApiClient(vendor);
    const vendorList = await apiClient.getVendors();

    let created = 0, skipped = 0;

    for (const v of vendorList) {
      const vKey: string = v.key ?? v.vendorKey ?? String(v.row_num);
      const vName: string = v.name ?? vKey;
      const rawCat = (v.category ?? "").toLowerCase();
      const category =
        rawCat.includes("casino") || rawCat.includes("live") ? "casino" :
        rawCat.includes("sport") ? "sports" :
        rawCat.includes("lottery") || rawCat.includes("lotto") ? "lottery" : "slot";

      const { data: existing } = await this.supabase
        .from(this.PROVIDER_TABLE)
        .select("id")
        .eq("vendor_id", vendor.id)
        .eq("vendor_key", vKey)
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        await this.supabase.from(this.PROVIDER_TABLE).insert({
          vendor_id: vendor.id,
          vendor_key: vKey,
          vendor_name: vName,
          category,
          is_active: true,
          metadata: { skins: v.skins ?? [], row_num: v.row_num },
        });
        created++;
      }
    }

    return { created, skipped };
  }

  // 제공사별 게임 동기화 (providerId = game_provider_ace.id)
  async syncGamesFromProvider(providerId: string): Promise<number> {
    const { data: providerRow, error: provErr } = await this.supabase
      .from(this.PROVIDER_TABLE)
      .select("*, vendor:game_vendors(id, vendor_key, opcode, secret_key, api_base_url)")
      .eq("id", providerId)
      .single();

    if (provErr || !providerRow) throw new Error("ACE 제공사를 찾을 수 없습니다.");

    const vendor = providerRow.vendor as VendorInfo;
    const apiClient = await this.getApiClient(vendor);
    const now = new Date().toISOString();

    // 카지노: /games 미호출, skins 메타데이터로 게임 행 관리
    if (providerRow.category === "casino") {
      const skins: Array<{ skin: string; name: string }> = providerRow.metadata?.skins ?? [];
      await this.supabase.from(this.GAME_TABLE).delete().eq("provider_id", providerId);

      for (const s of skins) {
        if (!s.skin) continue;
        await this.supabase.from(this.GAME_TABLE).insert({
          provider_id: providerId,
          game_key: s.skin,
          game_id: null,
          skin: s.skin,
          game_name_ko: providerRow.vendor_name,
          game_name_en: providerRow.vendor_key,
          category: "casino",
          game_type: s.name ?? s.skin,
          status: "active",
          metadata: { skin: s.skin, limit: s.name, vendorKey: providerRow.vendor_key },
          synced_at: now,
        });
      }

      await this.supabase
        .from(this.PROVIDER_TABLE)
        .update({ synced_at: now })
        .eq("id", providerId);

      return skins.length;
    }

    // 슬롯: /games API 호출
    const games = await apiClient.getGames(providerRow.vendor_key);
    let syncCount = 0;

    for (const g of games) {
      const gameKey: string = g.key ?? g.gameKey ?? String(g.id);
      const rawCat = (g.category ?? "").toLowerCase();
      const category =
        rawCat.includes("casino") || rawCat.includes("live") ? "casino" :
        rawCat.includes("sport") ? "sports" :
        rawCat.includes("lottery") ? "lottery" : "slot";

      const { data: existing } = await this.supabase
        .from(this.GAME_TABLE)
        .select("id")
        .eq("provider_id", providerId)
        .eq("game_key", gameKey)
        .maybeSingle();

      const payload = {
        game_id: g.id != null ? String(g.id) : null,
        skin: g.skin ?? null,
        game_name_ko: g.names?.ko ?? g.name ?? null,
        game_name_en: g.names?.en ?? null,
        platform: g.platform ?? null,
        category,
        game_type: g.type ?? null,
        thumbnail_url: g.image ?? null,
        metadata: g,
        synced_at: now,
      };

      if (existing) {
        await this.supabase.from(this.GAME_TABLE).update(payload).eq("id", existing.id);
      } else {
        await this.supabase.from(this.GAME_TABLE).insert({
          provider_id: providerId,
          game_key: gameKey,
          status: "active",
          ...payload,
        });
      }
      syncCount++;
    }

    await this.supabase
      .from(this.PROVIDER_TABLE)
      .update({ synced_at: now })
      .eq("id", providerId);

    return syncCount;
  }

  // 게임 실행 URL 획득
  async launchGame(
    gameKey: string,
    userId: string,
    options?: { ip?: string; language?: string; platform?: string; requestKey?: string }
  ): Promise<string> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username, name")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const { data: gameRow } = await this.supabase
      .from(this.GAME_TABLE)
      .select("*, provider:game_provider_ace(vendor_key)")
      .eq("game_key", gameKey)
      .single();
    if (!gameRow) throw new Error(`Game not found: ${gameKey}`);

    const vendor = await this.getVendorForGame(gameKey);
    const apiClient = await this.getApiClient(vendor);

    const result = await apiClient.launchGame({
      vendorKey: gameRow.provider?.vendor_key ?? "",
      gameKey,
      siteUsername: user.username,
      nickname: user.name ?? user.username,
      ip: options?.ip ?? "127.0.0.1",
      language: options?.language ?? "ko",
      platform: options?.platform ?? "desktop",
      requestKey: options?.requestKey ?? `${userId}-${Date.now()}`,
    });

    return result.url;
  }

  // 회원 게임 잔액 조회
  async getGameBalance(userId: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorByKey("ace");
    const apiClient = await this.getApiClient(vendor);
    return apiClient.getMemberBalance(user.username);
  }

  // 회원 입금
  async depositToUser(userId: string, amount: number, requestKey?: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorByKey("ace");
    const apiClient = await this.getApiClient(vendor);
    const balance = await apiClient.depositMember(
      user.username,
      amount,
      requestKey ?? `dep-${userId}-${Date.now()}`
    );

    await this.syncVendorBalance(vendor);
    return balance;
  }

  // 회원 출금 (전액 회수)
  async withdrawFromUser(userId: string, requestKey?: string): Promise<number> {
    const { data: user } = await this.supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getVendorByKey("ace");
    const apiClient = await this.getApiClient(vendor);
    const amount = await apiClient.withdrawMember(
      user.username,
      requestKey ?? `wd-${userId}-${Date.now()}`
    );

    await this.syncVendorBalance(vendor);
    return amount;
  }

  // 베팅 내역 DB 동기화
  async syncBettingHistory(options: {
    vendorKey?: string;
    sdate?: string;
    edate?: string;
    limit?: number;
  } = {}): Promise<{ inserted: number; updated: number; errors: string[] }> {
    const vendor = await this.getVendorByKey(options.vendorKey ?? "ace");
    const apiClient = await this.getApiClient(vendor);
    const { transactions } = await apiClient.getTransactions({
      sdate: options.sdate,
      edate: options.edate,
      limit: options.limit,
    });

    let inserted = 0, updated = 0;
    const errors: string[] = [];

    for (const tx of transactions) {
      try {
        const siteUsername: string = tx.siteUsername ?? tx.username ?? "";
        const { data: userRow } = await this.supabase
          .from("users")
          .select("id, username")
          .eq("username", siteUsername)
          .maybeSingle();

        if (!userRow) {
          errors.push(`유저 없음: ${siteUsername} (txid: ${tx._id})`);
          continue;
        }

        const isBet = tx.type === "turn_bet";
        const isWin = tx.type === "turn_win";

        if (isWin) {
          const { data: existing } = await this.supabase
            .from("betting_history_ace")
            .select("id")
            .eq("round_id", tx.key)
            .eq("user_id", userRow.id)
            .maybeSingle();

          if (existing) {
            const { error } = await this.supabase
              .from("betting_history_ace")
              .update({
                win_amount: Number(tx.cash ?? 0) + Number(tx.updepositCash ?? 0),
                round_status: "settled",
                settle_time: tx.utcCreatedAt ?? null,
                synced_at: new Date().toISOString(),
              })
              .eq("id", existing.id);

            if (error) errors.push(`win 갱신 실패 (${tx._id}): ${error.message}`);
            else updated++;
            continue;
          }
        }

        const { error } = await this.supabase
          .from("betting_history_ace")
          .upsert({
            txid:          String(tx._id),
            user_id:       userRow.id,
            username:      siteUsername,
            provider_id:   String(tx.vendorId ?? ""),
            provider_name: tx.vendorName ?? tx.vendorKey ?? "",
            game_id:       tx.gameId ?? tx.gameKey ?? "",
            game_name:     tx.gameName ?? "",
            game_type:     tx.gameType ?? "",
            game_category: tx.gameCategory ?? "",
            bet_amount:    isBet ? Number(tx.cash ?? 0) : 0,
            win_amount:    isWin ? Number(tx.cash ?? 0) + Number(tx.updepositCash ?? 0) : 0,
            round_id:      tx.key ?? null,
            round_status:  isBet ? "betting" : (isWin ? "settled" : (tx.type ?? "")),
            ref_id:        tx.refId ?? null,
            is_bonus:      tx.isBonus ?? false,
            is_promo:      tx.isPromo ?? false,
            is_jackpot:    tx.isJackpot ?? false,
            bet_time:      isBet ? (tx.utcCreatedAt ?? null) : null,
            settle_time:   isWin ? (tx.utcCreatedAt ?? null) : null,
            raw_data:      tx,
            synced_at:     new Date().toISOString(),
          }, { onConflict: "txid" });

        if (error) errors.push(`upsert 실패 (${tx._id}): ${error.message}`);
        else inserted++;
      } catch (e: any) {
        errors.push(`처리 오류 (${tx._id}): ${e.message}`);
      }
    }

    return { inserted, updated, errors };
  }
}
