import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// ==================== Types ====================

type ProviderStatus = 'active' | 'inactive' | 'maintenance';
type GameStatus = 'active' | 'inactive' | 'maintenance';
type GameType = 'slot' | 'live' | 'table' | 'video' | 'other';
type ProviderType = 'invest' | 'honor';

interface BaseGameProvider {
  id: string;
  provider_code: string;
  provider_name: string;
  api_endpoint: string;
  api_key?: string;
  api_secret?: string;
  status: ProviderStatus;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface BaseGame {
  id: string;
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface LevelProviderAssignment {
  id: string;
  level: string;
  provider_type: ProviderType;
  provider_id: string;
  is_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface CreateGameProviderRequest {
  provider_code: string;
  provider_name: string;
  api_endpoint: string;
  api_key?: string;
  api_secret?: string;
  status?: ProviderStatus;
  settings?: Record<string, any>;
}

interface UpdateGameProviderRequest {
  provider_name?: string;
  api_endpoint?: string;
  api_key?: string;
  api_secret?: string;
  status?: ProviderStatus;
  settings?: Record<string, any>;
}

interface CreateGameRequest {
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status?: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata?: Record<string, any>;
}

interface UpdateGameRequest {
  game_name?: string;
  game_type?: GameType;
  thumbnail_url?: string;
  status?: GameStatus;
  rtp?: number;
  min_bet?: number;
  max_bet?: number;
  metadata?: Record<string, any>;
}

interface AssignProviderToLevelRequest {
  level: string;
  provider_type: ProviderType;
  provider_id: string;
  is_enabled?: boolean;
  priority?: number;
}

// ==================== KV Store ====================

const kvClient = () => createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
);

const kv = {
  async set(key: string, value: any): Promise<void> {
    const { error } = await kvClient().from("kv_store_cd65d9bc").upsert({ key, value });
    if (error) throw new Error(error.message);
  },
  async get(key: string): Promise<any> {
    const { data, error } = await kvClient().from("kv_store_cd65d9bc").select("value").eq("key", key).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value;
  },
  async del(key: string): Promise<void> {
    const { error } = await kvClient().from("kv_store_cd65d9bc").delete().eq("key", key);
    if (error) throw new Error(error.message);
  },
  async getByPrefix(prefix: string): Promise<any[]> {
    const { data, error } = await kvClient().from("kv_store_cd65d9bc").select("key, value").like("key", prefix + "%");
    if (error) throw new Error(error.message);
    return data?.map((d: any) => d.value) ?? [];
  },
};

// ==================== Game Provider Services ====================

const getSupabase = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

class InvestProviderService {
  private readonly PROVIDER_TABLE = "game_provider_invest";
  private readonly GAME_TABLE = "game_invest";
  private get sb() { return getSupabase(); }

  async getProviders(): Promise<BaseGameProvider[]> {
    const { data, error } = await this.sb.from(this.PROVIDER_TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as BaseGameProvider[];
  }
  async getProviderById(id: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.sb.from(this.PROVIDER_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGameProvider | null;
  }
  async createProvider(data: CreateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: p, error } = await this.sb.from(this.PROVIDER_TABLE).insert({ ...data, status: data.status || "active", settings: data.settings || {} }).select().single();
    if (error) throw new Error(error.message);
    return p as BaseGameProvider;
  }
  async updateProvider(id: string, data: UpdateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: p, error } = await this.sb.from(this.PROVIDER_TABLE).update(data).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return p as BaseGameProvider;
  }
  async deleteProvider(id: string): Promise<void> {
    const { error } = await this.sb.from(this.PROVIDER_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  async getGames(providerId?: string): Promise<BaseGame[]> {
    let q = this.sb.from(this.GAME_TABLE).select("*").order("created_at", { ascending: false });
    if (providerId) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as BaseGame[];
  }
  async getGameById(id: string): Promise<BaseGame | null> {
    const { data, error } = await this.sb.from(this.GAME_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGame | null;
  }
  async getGameByCode(code: string): Promise<BaseGame | null> {
    const { data, error } = await this.sb.from(this.GAME_TABLE).select("*").eq("game_code", code).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGame | null;
  }
  async createGame(data: CreateGameRequest): Promise<BaseGame> {
    const { data: g, error } = await this.sb.from(this.GAME_TABLE).insert({ ...data, status: data.status || "active", metadata: data.metadata || {} }).select().single();
    if (error) throw new Error(error.message);
    return g as BaseGame;
  }
  async updateGame(id: string, data: UpdateGameRequest): Promise<BaseGame> {
    const { data: g, error } = await this.sb.from(this.GAME_TABLE).update(data).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return g as BaseGame;
  }
  async deleteGame(id: string): Promise<void> {
    const { error } = await this.sb.from(this.GAME_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  async syncGamesFromProvider(providerId: string): Promise<number> {
    const provider = await this.getProviderById(providerId);
    if (!provider) throw new Error("Provider not found");

    try {
      const providerType = this instanceof InvestProviderService ? 'invest' : 'honor';
      const requestBody: any = { agent_code: provider.api_key };

      // honor는 provider_code가 필요
      if (providerType === 'honor' && provider.api_secret) {
        requestBody.provider_code = provider.api_secret;
      }

      const response = await fetch("https://proxy.gms0811.com/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${provider.api_endpoint}/games/list`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch games from provider");
      const result = await response.json();
      const games = result.data?.games || [];

      let count = 0;
      for (const game of games) {
        const existing = await this.getGameByCode(game.code);
        if (!existing) {
          await this.createGame({
            provider_id: providerId,
            game_code: game.code,
            game_name: game.name,
            game_type: game.type || "slot",
            thumbnail_url: game.thumbnail,
            status: "active",
            rtp: game.rtp,
            metadata: { ...game },
          });
          count++;
        }
      }
      return count;
    } catch (error: any) {
      console.error("Sync games error:", error);
      return 0;
    }
  }

  async launchGame(gameCode: string, userId: string, options?: any): Promise<string> {
    const game = await this.getGameByCode(gameCode);
    if (!game) throw new Error("Game not found");

    const provider = await this.getProviderById(game.provider_id);
    if (!provider) throw new Error("Provider not found");

    try {
      const providerType = this instanceof InvestProviderService ? 'invest' : 'honor';
      const requestBody: any = {
        agent_code: provider.api_key,
        game_code: gameCode,
        user_id: userId,
        user_name: options?.userName || userId,
        return_url: options?.returnUrl || "https://benzcasino.com",
      };

      // honor는 provider_code와 language가 필요
      if (providerType === 'honor' && provider.api_secret) {
        requestBody.provider_code = provider.api_secret;
        requestBody.language = options?.language || 'ko';
      }

      const response = await fetch("https://proxy.gms0811.com/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${provider.api_endpoint}/game/launch`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }),
      });

      if (!response.ok) throw new Error("Failed to launch game");
      const result = await response.json();
      return result.data?.game_url || result.data?.url || "";
    } catch (error: any) {
      console.error("Launch game error:", error);
      throw error;
    }
  }

  async getGameBalance(userId: string): Promise<number> {
    const providers = await this.getProviders();
    if (providers.length === 0) return 0;

    const provider = providers[0];
    try {
      const providerType = this instanceof InvestProviderService ? 'invest' : 'honor';
      const requestBody: any = {
        agent_code: provider.api_key,
        user_id: userId,
      };

      // honor는 provider_code가 필요
      if (providerType === 'honor' && provider.api_secret) {
        requestBody.provider_code = provider.api_secret;
      }

      const response = await fetch("https://proxy.gms0811.com/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${provider.api_endpoint}/user/balance`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }),
      });

      if (!response.ok) return 0;
      const result = await response.json();
      return result.data?.balance || 0;
    } catch (error) {
      console.error("Get balance error:", error);
      return 0;
    }
  }
}

class HonorProviderService {
  private readonly PROVIDER_TABLE = "game_provider_honor";
  private readonly GAME_TABLE = "game_honor";
  private get sb() { return getSupabase(); }

  // game_vendors에서 honor 벤더 자격증명 조회 (secret_key → Bearer 토큰)
  private async getHonorVendor(): Promise<{ id: string; secret_key: string; api_base_url: string } | null> {
    const { data } = await this.sb
      .from("game_vendors")
      .select("id, secret_key, api_base_url")
      .eq("vendor_key", "honor")
      .eq("is_active", true)
      .maybeSingle();
    return data;
  }

  // Honor API 프록시 호출 (Bearer 인증)
  // honor-api.md: Authorization: Bearer {secret_key} — md5/signature 없음
  // 모든 파라미터는 (query) 타입 → URL 쿼리스트링으로 전달 (GET/POST 공통)
  private async honorRequest<T>(
    vendor: { secret_key: string; api_base_url: string },
    endpoint: string,
    method: "GET" | "POST",
    params?: Record<string, string | number>
  ): Promise<T> {
    const baseUrl = vendor.api_base_url.replace(/\/$/, "");
    let url = `${baseUrl}${endpoint}`;

    const proxyBody: any = {
      url,
      method,
      headers: {
        "Authorization": `Bearer ${vendor.secret_key}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    };
    if (params && Object.keys(params).length > 0) {
      proxyBody.body = params;
    }

    const res = await fetch("https://proxy.gms0811.com/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proxyBody),
    });

    if (!res.ok) throw new Error(`Honor proxy error ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getProviders(): Promise<BaseGameProvider[]> {
    const { data, error } = await this.sb.from(this.PROVIDER_TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as BaseGameProvider[];
  }
  async getProviderById(id: string): Promise<BaseGameProvider | null> {
    const { data, error } = await this.sb.from(this.PROVIDER_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGameProvider | null;
  }
  async createProvider(data: CreateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: p, error } = await this.sb.from(this.PROVIDER_TABLE).insert({ ...data, status: data.status || "active", settings: data.settings || {} }).select().single();
    if (error) throw new Error(error.message);
    return p as BaseGameProvider;
  }
  async updateProvider(id: string, data: UpdateGameProviderRequest): Promise<BaseGameProvider> {
    const { data: p, error } = await this.sb.from(this.PROVIDER_TABLE).update(data).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return p as BaseGameProvider;
  }
  async deleteProvider(id: string): Promise<void> {
    const { error } = await this.sb.from(this.PROVIDER_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  async getGames(providerId?: string): Promise<BaseGame[]> {
    let q = this.sb.from(this.GAME_TABLE).select("*").order("created_at", { ascending: false });
    if (providerId) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as BaseGame[];
  }
  async getGameById(id: string): Promise<BaseGame | null> {
    const { data, error } = await this.sb.from(this.GAME_TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGame | null;
  }
  async getGameByCode(code: string): Promise<BaseGame | null> {
    const { data, error } = await this.sb.from(this.GAME_TABLE).select("*").eq("game_code", code).maybeSingle();
    if (error) throw new Error(error.message);
    return data as BaseGame | null;
  }
  async createGame(data: CreateGameRequest): Promise<BaseGame> {
    const { data: g, error } = await this.sb.from(this.GAME_TABLE).insert({ ...data, status: data.status || "active", metadata: data.metadata || {} }).select().single();
    if (error) throw new Error(error.message);
    return g as BaseGame;
  }
  async updateGame(id: string, data: UpdateGameRequest): Promise<BaseGame> {
    const { data: g, error } = await this.sb.from(this.GAME_TABLE).update(data).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return g as BaseGame;
  }
  async deleteGame(id: string): Promise<void> {
    const { error } = await this.sb.from(this.GAME_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  // game-list API로 vendor별 게임 동기화 (settings.honor_vendor에 벤더명 지정)
  async syncGamesFromProvider(providerId: string): Promise<number> {
    const provider = await this.getProviderById(providerId);
    if (!provider) throw new Error("Provider not found");

    const vendor = await this.getHonorVendor();
    if (!vendor) throw new Error("honor 벤더 설정을 찾을 수 없습니다.");

    const honorVendor: string = (provider as any).settings?.honor_vendor || "";
    if (!honorVendor) throw new Error("settings.honor_vendor 값이 없습니다.");

    const games = await this.honorRequest<any[]>(vendor, "/game-list", "GET", { vendor: honorVendor });
    let count = 0;

    for (const game of games) {
      try {
        const gameCode = String(game.id);
        const existing = await this.getGameByCode(gameCode);
        const thumbnailUrl = game.thumbnails?.["300x300"] || game.thumbnail;

        if (existing) {
          await this.updateGame(existing.id, { game_name: game.title, game_type: game.type || "other", thumbnail_url: thumbnailUrl, metadata: game });
        } else {
          await this.createGame({ provider_id: providerId, game_code: gameCode, game_name: game.title, game_type: game.type || "other", thumbnail_url: thumbnailUrl, status: "active", metadata: game });
        }
        count++;
      } catch (err) {
        console.error(`Error syncing honor game ${game.id}:`, err);
      }
    }
    return count;
  }

  // game-launch-link API로 게임 실행
  async launchGame(gameCode: string, userId: string, options?: any): Promise<string> {
    const game = await this.getGameByCode(gameCode);
    if (!game) throw new Error("Game not found");

    const { data: user } = await this.sb.from("users").select("username, name").eq("id", userId).single();
    if (!user) throw new Error(`User not found: ${userId}`);

    const vendor = await this.getHonorVendor();
    if (!vendor) throw new Error("honor 벤더 설정을 찾을 수 없습니다.");

    const honorVendor: string = (game.metadata as any)?.vendor || options?.vendor || "";
    if (!honorVendor) throw new Error("게임 metadata에 vendor 정보가 없습니다.");

    const params: Record<string, string | number> = {
      username: user.username,
      game_id: Number(gameCode),
      vendor: honorVendor,
      nickname: user.name || user.username,
    };
    if (options?.skin) params.skin = options.skin;

    const result = await this.honorRequest<any>(vendor, "/game-launch-link", "GET", params);
    return result?.link || "";
  }

  // /my-info로 에이전트 보유금(balance) 조회 및 game_vendors 동기화
  async getGameBalance(_userId: string): Promise<number> {
    const vendor = await this.getHonorVendor();
    if (!vendor) return 0;

    try {
      const info = await this.honorRequest<any>(vendor, "/my-info", "GET");
      const balance = info?.balance ?? 0;
      await this.sb
        .from("game_vendors")
        .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
        .eq("id", vendor.id);
      return balance;
    } catch {
      return 0;
    }
  }
}

function getGameProviderService(type: ProviderType): InvestProviderService | HonorProviderService {
  if (type === "invest") return new InvestProviderService();
  if (type === "honor") return new HonorProviderService();
  throw new Error(`Unknown provider type: ${type}`);
}

// ==================== Level Assignment Service ====================

class LevelAssignmentService {
  private readonly TABLE_NAME = "level_provider_assignment";
  private get sb() { return getSupabase(); }

  async getAssignmentsByLevel(level: string): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.sb.from(this.TABLE_NAME).select("*").eq("level", level).order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data as LevelProviderAssignment[];
  }
  async getAllAssignments(): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.sb.from(this.TABLE_NAME).select("*").order("level", { ascending: true }).order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data as LevelProviderAssignment[];
  }
  async assignProviderToLevel(request: AssignProviderToLevelRequest): Promise<LevelProviderAssignment> {
    const { data, error } = await this.sb.from(this.TABLE_NAME).insert({ level: request.level, provider_type: request.provider_type, provider_id: request.provider_id, is_enabled: request.is_enabled ?? true, priority: request.priority ?? 0 }).select().single();
    if (error) { if (error.code === "23505") throw new Error("Already assigned"); throw new Error(error.message); }
    return data as LevelProviderAssignment;
  }
  async updateAssignment(id: string, updates: Partial<Pick<LevelProviderAssignment, "is_enabled" | "priority">>): Promise<LevelProviderAssignment> {
    const { data, error } = await this.sb.from(this.TABLE_NAME).update(updates).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as LevelProviderAssignment;
  }
  async removeAssignment(id: string): Promise<void> {
    const { error } = await this.sb.from(this.TABLE_NAME).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
  async getEnabledProvidersForLevel(level: string): Promise<LevelProviderAssignment[]> {
    const { data, error } = await this.sb.from(this.TABLE_NAME).select("*").eq("level", level).eq("is_enabled", true).order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data as LevelProviderAssignment[];
  }
}

// ==================== Hono App ====================

const app = new Hono().basePath('/swift-api');

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-cd65d9bc/health", (c) => c.json({ status: "ok" }));

// ==================== 인증 API ====================

app.post("/make-server-cd65d9bc/auth/login", async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) return c.json({ success: false, error: "아이디와 비밀번호를 입력해주세요" }, 400);
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("verify_user_login", { p_username: username, p_password: password });
    if (error) return c.json({ success: false, error: "로그인 처리 중 오류가 발생했습니다" }, 500);
    if (!data || data.length === 0) return c.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다" }, 401);
    const user = data[0];
    await supabase.from("access_logs").insert({ user_id: user.id, log_type: "login", action: "login", description: `${user.username} 로그인`, success: true });
    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/auth/change-password", async (c) => {
  try {
    const { userId, oldPassword, newPassword } = await c.req.json();
    const { data, error } = await getSupabase().rpc("change_user_password", { p_user_id: userId, p_old_password: oldPassword, p_new_password: newPassword });
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 사용자 API ====================

app.get("/make-server-cd65d9bc/users", async (c) => {
  try {
    const supabase = getSupabase();
    const viewerId = c.req.query("viewer_id");
    const role = c.req.query("role");
    const status = c.req.query("status");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = (page - 1) * limit;
    let query = supabase.from("users").select("id, username, name, role, status, parent_id, hierarchy_path, depth, balance, points, email, phone, created_at, last_login_at", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (role) query = query.eq("role", role);
    if (status) query = query.eq("status", status);
    if (viewerId) {
      const { data: viewer } = await supabase.from("users").select("role, id").eq("id", viewerId).single();
      if (viewer && viewer.role !== "system_admin") query = query.contains("hierarchy_path", [viewerId]);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return c.json({ success: true, data, total: count });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get("/make-server-cd65d9bc/users/:id", async (c) => {
  try {
    const { data, error } = await getSupabase().from("users").select("id, username, name, role, status, parent_id, hierarchy_path, depth, balance, points, email, phone, notes, created_at, last_login_at").eq("id", c.req.param("id")).single();
    if (error) return c.json({ success: false, error: "사용자를 찾을 수 없습니다" }, 404);
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/users", async (c) => {
  try {
    const body = await c.req.json();
    const { data, error } = await getSupabase().rpc("create_user_with_password", { p_username: body.username, p_password: body.password, p_name: body.name, p_role: body.role, p_parent_id: body.parent_id || null });
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: { id: data } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/users/:id/status", async (c) => {
  try {
    const { status } = await c.req.json();
    const { error } = await getSupabase().from("users").update({ status, updated_at: new Date().toISOString() }).eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/users/:id/balance", async (c) => {
  try {
    const { balance } = await c.req.json();
    const { error } = await getSupabase().from("users").update({ balance, updated_at: new Date().toISOString() }).eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// 계정잔고 가져오기 (invest API 호출 후 DB 업데이트)
// GET /users/:id/invest-balance
app.get("/make-server-cd65d9bc/users/:id/invest-balance", async (c) => {
  try {
    const userId = c.req.param("id");
    const supabase = getSupabase();

    // 1. 유저 정보 조회
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();
    if (userErr || !user) return c.json({ error: "유저를 찾을 수 없습니다." }, 404);

    // 2. invest 벤더 정보 조회
    const { data: vendor, error: vendorErr } = await supabase
      .from("game_vendors")
      .select("id, opcode, secret_key, api_base_url")
      .eq("vendor_key", "invest")
      .eq("is_active", true)
      .maybeSingle();
    if (vendorErr || !vendor) return c.json({ error: "invest 벤더 설정을 찾을 수 없습니다." }, 404);

    // 3. 유저 토큰 조회 또는 생성
    const { InvestApiClient } = await import("./clients/invest-api-client.ts");
    const apiClient = new InvestApiClient(vendor.opcode, vendor.secret_key, vendor.api_base_url);

    let { data: tokenRow } = await supabase
      .from("user_vendor_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    let token = tokenRow?.token;
    if (!token) {
      const result = await apiClient.createOrLoginAccount(user.username);
      token = result.token;
      await supabase
        .from("user_vendor_tokens")
        .upsert({ user_id: userId, vendor_id: vendor.id, token }, { onConflict: "user_id,vendor_id" });
    }

    // 4. invest API로 잔고 조회 (GET /api/account/balance)
    const balanceRes = await apiClient.getAccountBalance(user.username, token);
    const balance = balanceRes.balance ?? balanceRes.Balance ?? 0;

    // 5. DB 업데이트
    await supabase
      .from("users")
      .update({ balance, updated_at: new Date().toISOString() })
      .eq("id", userId);

    return c.json({ balance });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// honor 에이전트 보유금 조회 (/my-info) 및 game_vendors.total_balance 동기화
// GET /users/:id/honor-balance
app.get("/make-server-cd65d9bc/users/:id/honor-balance", async (c) => {
  try {
    const supabase = getSupabase();

    // honor 벤더 정보 조회 (secret_key → Bearer 토큰)
    const { data: vendor, error: vendorErr } = await supabase
      .from("game_vendors")
      .select("id, secret_key, api_base_url")
      .eq("vendor_key", "honor")
      .eq("is_active", true)
      .maybeSingle();
    if (vendorErr || !vendor) return c.json({ error: "honor 벤더 설정을 찾을 수 없습니다." }, 404);

    // /my-info 호출 → 에이전트 잔액(보유금) 조회
    const proxyRes = await fetch("https://proxy.gms0811.com/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${vendor.api_base_url.replace(/\/$/, "")}/my-info`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${vendor.secret_key}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
      }),
    });
    if (!proxyRes.ok) return c.json({ error: "Honor API 호출 실패" }, 502);

    const info = await proxyRes.json();
    const balance = info?.balance ?? 0;

    // game_vendors.total_balance 동기화
    await supabase
      .from("game_vendors")
      .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
      .eq("id", vendor.id);

    return c.json({ balance, agent: { id: info?.id, username: info?.username, type: info?.type } });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== 입출금 API ====================

app.get("/make-server-cd65d9bc/db/transactions", async (c) => {
  try {
    const type = c.req.query("type");
    const status = c.req.query("status");
    const userId = c.req.query("user_id");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = (page - 1) * limit;
    let query = getSupabase().from("transactions").select("*, users!user_id(username, name)", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    if (userId) query = query.eq("user_id", userId);
    const { data, error, count } = await query;
    if (error) throw error;
    return c.json({ success: true, data, total: count });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/db/transactions/:id/status", async (c) => {
  try {
    const { status, processed_by, admin_memo, reject_reason } = await c.req.json();
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (status === "approved" || status === "completed") { updateData.processed_at = new Date().toISOString(); updateData.processed_by = processed_by; }
    if (admin_memo) updateData.admin_memo = admin_memo;
    if (reject_reason) updateData.reject_reason = reject_reason;
    const { error } = await getSupabase().from("transactions").update(updateData).eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 대시보드 통계 ====================

app.get("/make-server-cd65d9bc/db/stats", async (c) => {
  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];
    const [membersRes, depositRes, withdrawalRes, pendingRes, onlineRes] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "member").eq("status", "active"),
      supabase.from("transactions").select("amount").eq("type", "deposit").eq("status", "completed").gte("created_at", today),
      supabase.from("transactions").select("amount").eq("type", "withdrawal").eq("status", "completed").gte("created_at", today),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("online_sessions").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    const totalDeposits = (depositRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const totalWithdrawals = (withdrawalRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    return c.json({ success: true, data: { totalMembers: membersRes.count || 0, todayDeposits: totalDeposits, todayWithdrawals: totalWithdrawals, onlineUsers: onlineRes.count || 0, pendingTransactions: pendingRes.count || 0, netProfit: totalDeposits - totalWithdrawals } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== Members (KV) API ====================

app.get("/make-server-cd65d9bc/members", async (c) => {
  try { return c.json({ success: true, data: await kv.getByPrefix("member:") }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/members/:id", async (c) => {
  try {
    const member = await kv.get(`member:${c.req.param("id")}`);
    if (!member) return c.json({ success: false, error: "Member not found" }, 404);
    return c.json({ success: true, data: member });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/members", async (c) => {
  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const member = { id, ...body, joinDate: new Date().toISOString(), lastLogin: new Date().toISOString() };
    await kv.set(`member:${id}`, member);
    return c.json({ success: true, data: member });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/members/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const existing = await kv.get(`member:${id}`);
    if (!existing) return c.json({ success: false, error: "Member not found" }, 404);
    const updated = { ...existing, ...await c.req.json() };
    await kv.set(`member:${id}`, updated);
    return c.json({ success: true, data: updated });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/members/:id", async (c) => {
  try { await kv.del(`member:${c.req.param("id")}`); return c.json({ success: true }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== Transactions (KV) API ====================

app.get("/make-server-cd65d9bc/transactions", async (c) => {
  try { return c.json({ success: true, data: await kv.getByPrefix("transaction:") }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/transactions", async (c) => {
  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const transaction = { id, ...body, requestTime: new Date().toISOString(), status: body.status || "대기" };
    await kv.set(`transaction:${id}`, transaction);
    return c.json({ success: true, data: transaction });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/transactions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const existing = await kv.get(`transaction:${id}`);
    if (!existing) return c.json({ success: false, error: "Transaction not found" }, 404);
    const updated = { ...existing, ...body, processTime: body.status === "완료" ? new Date().toISOString() : existing.processTime };
    await kv.set(`transaction:${id}`, updated);
    return c.json({ success: true, data: updated });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== Bets (KV) API ====================

app.get("/make-server-cd65d9bc/bets", async (c) => {
  try { return c.json({ success: true, data: await kv.getByPrefix("bet:") }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/bets", async (c) => {
  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const bet = { id, ...body, time: new Date().toISOString() };
    await kv.set(`bet:${id}`, bet);
    return c.json({ success: true, data: bet });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== Stats (KV) ====================

app.get("/make-server-cd65d9bc/stats", async (c) => {
  try {
    const [members, transactions, bets] = await Promise.all([kv.getByPrefix("member:"), kv.getByPrefix("transaction:"), kv.getByPrefix("bet:")]);
    const today = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter((t: any) => t.requestTime?.startsWith(today));
    const todayBets = bets.filter((b: any) => b.time?.startsWith(today));
    const deposits = todayTx.filter((t: any) => t.type === "입금");
    const withdrawals = todayTx.filter((t: any) => t.type === "출금");
    return c.json({ success: true, data: {
      totalMembers: members.length,
      todayDeposits: deposits.reduce((s: number, t: any) => s + (t.amount || 0), 0),
      todayWithdrawals: withdrawals.reduce((s: number, t: any) => s + (t.amount || 0), 0),
      onlineUsers: Math.floor(Math.random() * 500) + 100,
      pendingTransactions: transactions.filter((t: any) => t.status === "대기").length,
      todayBetCount: todayBets.length,
      todayBetAmount: todayBets.reduce((s: number, b: any) => s + (b.bet || 0), 0),
      netProfit: todayBets.reduce((s: number, b: any) => s + (b.result || 0), 0),
    }});
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

app.post("/make-server-cd65d9bc/init-data", async (c) => {
  try {
    const sampleMembers = [
      { username: 'hong123', name: '홍길동', level: 'VIP', balance: 5430000, status: '정상' },
      { username: 'kim456', name: '김철수', level: '일반', balance: 1200000, status: '정상' },
      { username: 'lee789', name: '이영희', level: 'VIP', balance: 8900000, status: '정상' },
      { username: 'park012', name: '박민수', level: '일반', balance: 450000, status: '정지' },
      { username: 'jung345', name: '정지원', level: 'VVIP', balance: 15600000, status: '정상' },
    ];
    for (const member of sampleMembers) {
      const id = crypto.randomUUID();
      await kv.set(`member:${id}`, { id, ...member, joinDate: new Date(Date.now() - Math.random() * 180 * 86400000).toISOString(), lastLogin: new Date(Date.now() - Math.random() * 86400000).toISOString() });
    }
    const sampleTransactions = [
      { username: 'hong123', name: '홍길동', type: '입금', amount: 500000, bank: '신한은행', account: '110-123-****', status: '완료' },
      { username: 'kim456', name: '김철수', type: '출금', amount: 300000, bank: '국민은행', account: '123-456-****', status: '대기' },
      { username: 'lee789', name: '이영희', type: '입금', amount: 1000000, bank: '우리은행', account: '456-789-****', status: '완료' },
    ];
    for (const tx of sampleTransactions) {
      const id = crypto.randomUUID();
      await kv.set(`transaction:${id}`, { id, ...tx, requestTime: new Date(Date.now() - Math.random() * 86400000).toISOString(), processTime: tx.status === '완료' ? new Date(Date.now() - Math.random() * 82800000).toISOString() : '-' });
    }
    return c.json({ success: true, message: "Sample data initialized" });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== 게임사 관리 API ====================

app.get("/make-server-cd65d9bc/providers/:type", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).getProviders() }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/providers/:type/:id", async (c) => {
  try {
    const provider = await getGameProviderService(c.req.param("type") as ProviderType).getProviderById(c.req.param("id"));
    if (!provider) return c.json({ success: false, error: "Provider not found" }, 404);
    return c.json({ success: true, data: provider });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/providers/:type", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).createProvider(await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/providers/:type/:id", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).updateProvider(c.req.param("id"), await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/providers/:type/:id", async (c) => {
  try { await getGameProviderService(c.req.param("type") as ProviderType).deleteProvider(c.req.param("id")); return c.json({ success: true }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== 게임 목록 API ====================

app.get("/make-server-cd65d9bc/games/:type", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).getGames(c.req.query("provider_id")) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/games/:type/:id", async (c) => {
  try {
    const game = await getGameProviderService(c.req.param("type") as ProviderType).getGameById(c.req.param("id"));
    if (!game) return c.json({ success: false, error: "Game not found" }, 404);
    return c.json({ success: true, data: game });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/games/:type", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).createGame(await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/games/:type/:id", async (c) => {
  try { return c.json({ success: true, data: await getGameProviderService(c.req.param("type") as ProviderType).updateGame(c.req.param("id"), await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/games/:type/:id", async (c) => {
  try { await getGameProviderService(c.req.param("type") as ProviderType).deleteGame(c.req.param("id")); return c.json({ success: true }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/games/:type/sync/:providerId", async (c) => {
  try {
    const count = await getGameProviderService(c.req.param("type") as ProviderType).syncGamesFromProvider(c.req.param("providerId"));
    return c.json({ success: true, message: `Synced ${count} games`, count });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/games/:type/launch", async (c) => {
  try {
    const { gameCode, userId, options } = await c.req.json();
    const gameUrl = await getGameProviderService(c.req.param("type") as ProviderType).launchGame(gameCode, userId, options);
    return c.json({ success: true, data: { gameUrl } });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== 레벨별 게임사 할당 API ====================

const levelAssignmentService = new LevelAssignmentService();

app.get("/make-server-cd65d9bc/level-assignments/level/:level", async (c) => {
  try { return c.json({ success: true, data: await levelAssignmentService.getAssignmentsByLevel(c.req.param("level")) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/level-assignments/level/:level/enabled", async (c) => {
  try { return c.json({ success: true, data: await levelAssignmentService.getEnabledProvidersForLevel(c.req.param("level")) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/level-assignments", async (c) => {
  try { return c.json({ success: true, data: await levelAssignmentService.getAllAssignments() }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/level-assignments", async (c) => {
  try { return c.json({ success: true, data: await levelAssignmentService.assignProviderToLevel(await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/level-assignments/:id", async (c) => {
  try { return c.json({ success: true, data: await levelAssignmentService.updateAssignment(c.req.param("id"), await c.req.json()) }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/level-assignments/:id", async (c) => {
  try { await levelAssignmentService.removeAssignment(c.req.param("id")); return c.json({ success: true }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== API Config (DB) ====================

app.get("/make-server-cd65d9bc/api-configs/summary", async (c) => {
  try {
    const { data, error } = await getSupabase()
      .from("api_config")
      .select("id, config_name, description, is_active, environment, created_at, updated_at, created_by, last_used_at, opcode, token")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const summary = (data || []).map((cfg: any) => ({
      id: cfg.id,
      config_name: cfg.config_name,
      description: cfg.description,
      is_active: cfg.is_active,
      environment: cfg.environment,
      created_at: cfg.created_at,
      updated_at: cfg.updated_at,
      created_by: cfg.created_by,
      last_used_at: cfg.last_used_at,
      opcode_preview: cfg.opcode ? cfg.opcode.substring(0, 8) + '...' : '',
      secret_key_masked: '****',
      token: cfg.token || null,
    }));
    return c.json(summary);
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/api-configs/active", async (c) => {
  try {
    const { data, error } = await getSupabase()
      .from("api_config")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return c.json({ success: false, error: "No active config found" }, 404);
    return c.json(data);
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/api-configs/:id", async (c) => {
  try {
    const { data, error } = await getSupabase()
      .from("api_config")
      .select("*")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return c.json({ success: false, error: "Config not found" }, 404);
    return c.json(data);
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.post("/make-server-cd65d9bc/api-configs", async (c) => {
  try {
    const body = await c.req.json();
    const sb = getSupabase();
    if (body.is_active) {
      await sb.from("api_config").update({ is_active: false }).eq("is_active", true);
    }
    const { data, error } = await sb.from("api_config").insert({
      config_name: body.config_name,
      opcode: body.opcode,
      secret_key: body.secret_key,
      token: body.token || null,
      description: body.description || '',
      is_active: body.is_active || false,
      environment: body.environment || 'production',
      created_by: body.created_by || 'admin',
    }).select().single();
    if (error) throw new Error(error.message);
    return c.json(data);
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/api-configs/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const sb = getSupabase();
    if (body.is_active) {
      await sb.from("api_config").update({ is_active: false }).neq("id", id).eq("is_active", true);
    }
    const updateData: any = { updated_at: new Date().toISOString() };
    const allowed = ["config_name", "opcode", "secret_key", "token", "description", "is_active", "environment"];
    for (const key of allowed) { if (key in body) updateData[key] = body[key]; }
    const { data, error } = await sb.from("api_config").update(updateData).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return c.json({ success: false, error: "Config not found" }, 404);
    return c.json(data);
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/api-configs/:id", async (c) => {
  try {
    const sb = getSupabase();
    const { data: config, error: fetchErr } = await sb.from("api_config").select("is_active").eq("id", c.req.param("id")).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!config) return c.json({ success: false, error: "Config not found" }, 404);
    if (config.is_active) return c.json({ success: false, error: "Cannot delete active config" }, 400);
    const { error } = await sb.from("api_config").delete().eq("id", c.req.param("id"));
    if (error) throw new Error(error.message);
    return c.json({ success: true });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.patch("/make-server-cd65d9bc/api-configs/:id/last-used", async (c) => {
  try {
    const { error } = await getSupabase().from("api_config").update({ last_used_at: new Date().toISOString() }).eq("id", c.req.param("id"));
    if (error) throw new Error(error.message);
    return c.json({ success: true });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== 게임사 API 설정 (KV) ====================

app.get("/make-server-cd65d9bc/provider-configs", async (c) => {
  try { return c.json({ success: true, data: await kv.getByPrefix("provider_config:") }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.get("/make-server-cd65d9bc/provider-configs/:type", async (c) => {
  try {
    const config = await kv.get(`provider_config:${c.req.param("type")}`);
    if (!config) return c.json({ success: false, error: "Config not found" }, 404);
    return c.json({ success: true, data: config });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.put("/make-server-cd65d9bc/provider-configs/:type", async (c) => {
  try {
    const type = c.req.param("type");
    const body = await c.req.json();
    const config = { type, api_url: body.api_url, agent_code: body.agent_code, provider_code: body.provider_code || null, description: body.description || '', is_active: body.is_active !== undefined ? body.is_active : true, updated_at: new Date().toISOString() };
    await kv.set(`provider_config:${type}`, config);
    return c.json({ success: true, data: config });
  } catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});
app.delete("/make-server-cd65d9bc/provider-configs/:type", async (c) => {
  try { await kv.del(`provider_config:${c.req.param("type")}`); return c.json({ success: true }); }
  catch (error) { return c.json({ success: false, error: String(error) }, 500); }
});

// ==================== 회원가입 (자가 가입) API ====================

app.post("/make-server-cd65d9bc/auth/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, name, phone, bank_name, account_number, referral_code } = body;

    if (!username || !password || !name) return c.json({ success: false, error: "아이디, 비밀번호, 이름은 필수 항목입니다" }, 400);
    if (username.length < 4) return c.json({ success: false, error: "아이디는 4자 이상이어야 합니다" }, 400);
    if (password.length < 6) return c.json({ success: false, error: "비밀번호는 6자 이상이어야 합니다" }, 400);

    const sb = getSupabase();

    // 아이디 중복 확인
    const { data: existing } = await sb.from("users").select("id").eq("username", username).maybeSingle();
    if (existing) return c.json({ success: false, error: "이미 사용 중인 아이디입니다" }, 400);

    // 추천인 코드로 상위 파트너 찾기
    let parentId: string | null = null;
    if (referral_code?.trim()) {
      const { data: parent } = await sb
        .from("users")
        .select("id, role, status")
        .eq("username", referral_code.trim())
        .neq("role", "member")
        .eq("status", "active")
        .maybeSingle();
      if (!parent) return c.json({ success: false, error: "유효하지 않은 추천인 코드입니다" }, 400);
      parentId = parent.id;
    }

    // 회원 생성
    const { data: userId, error } = await sb.rpc("create_user_with_password", {
      p_username: username,
      p_password: password,
      p_name: name,
      p_role: "member",
      p_parent_id: parentId,
    });
    if (error) return c.json({ success: false, error: error.message }, 500);

    // 추가 정보 업데이트 (status=inactive → 관리자 승인 대기)
    const updateData: any = { status: "inactive", updated_at: new Date().toISOString() };
    if (phone) updateData.phone = phone;
    if (bank_name || account_number) {
      updateData.metadata = { bank_name: bank_name || "", bank_account: account_number || "" };
    }
    await sb.from("users").update(updateData).eq("id", userId);

    return c.json({ success: true, data: { id: userId } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 고객센터 티켓 API ====================

app.get("/make-server-cd65d9bc/support-tickets", async (c) => {
  try {
    const sb = getSupabase();
    const userId = c.req.query("user_id");
    const status = c.req.query("status");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = (page - 1) * limit;

    let query = sb.from("customer_support")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq("user_id", userId);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;
    return c.json({ success: true, data, total: count });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/support-tickets", async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, username, category, title, content } = body;
    if (!user_id || !title || !content) return c.json({ success: false, error: "필수 항목이 누락되었습니다" }, 400);

    const ticketNo = `TK${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
    const sb = getSupabase();

    const { data, error } = await sb.from("customer_support").insert({
      ticket_no: ticketNo,
      user_id,
      username: username || "",
      category: category || "기타",
      title,
      content,
      status: "pending",
    }).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/support-tickets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { answer, status, answered_by } = body;
    const sb = getSupabase();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (answer !== undefined) {
      updateData.answer = answer;
      updateData.answered_at = new Date().toISOString();
      if (answered_by) updateData.answered_by = answered_by;
      if (!status) updateData.status = "answered";
    }

    const { data, error } = await sb.from("customer_support").update(updateData).eq("id", id).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 공지사항 API ====================

app.get("/make-server-cd65d9bc/notices", async (c) => {
  try {
    const sb = getSupabase();
    const published = c.req.query("published");
    let q = sb.from("notices").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
    if (published === "true") q = q.eq("is_published", true);
    const { data, error } = await q;
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/notices", async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, type = "general", is_pinned = false, is_published = true, author_name = "관리자" } = body;
    const sb = getSupabase();
    const { data, error } = await sb.from("notices").insert({ title, content, type, is_pinned, is_published, author_name, view_count: 0 }).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/notices/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const sb = getSupabase();
    const { data, error } = await sb.from("notices").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.delete("/make-server-cd65d9bc/notices/:id", async (c) => {
  try {
    const { error } = await getSupabase().from("notices").delete().eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/notices/:id/view", async (c) => {
  try {
    const sb = getSupabase();
    const { data: notice } = await sb.from("notices").select("view_count").eq("id", c.req.param("id")).single();
    await sb.from("notices").update({ view_count: (notice?.view_count ?? 0) + 1 }).eq("id", c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 메시지 API ====================

app.get("/make-server-cd65d9bc/messages", async (c) => {
  try {
    const sb = getSupabase();
    const recipient_id = c.req.query("recipient_id");
    let q = sb.from("messages").select("*").order("created_at", { ascending: false });
    if (recipient_id) q = q.eq("recipient_id", recipient_id);
    const { data, error } = await q;
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get("/make-server-cd65d9bc/messages/sent", async (c) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("messages").select("*, users!recipient_id(username, name)").order("created_at", { ascending: false });
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/messages", async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, recipient_id, sender_name = "관리자", type = "admin" } = body;
    const sb = getSupabase();
    if (recipient_id) {
      const { data, error } = await sb.from("messages").insert({ title, content, recipient_id, sender_name, type, is_read: false }).select().single();
      if (error) throw error;
      return c.json({ success: true, data });
    } else {
      const { data: users, error: uErr } = await sb.from("users").select("id").eq("role", "member").eq("status", "active");
      if (uErr) throw uErr;
      const rows = (users || []).map((u: any) => ({ title, content, recipient_id: u.id, sender_name, type, is_read: false }));
      if (rows.length > 0) {
        const { error } = await sb.from("messages").insert(rows);
        if (error) throw error;
      }
      return c.json({ success: true, count: rows.length });
    }
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/messages/:id/read", async (c) => {
  try {
    const { error } = await getSupabase().from("messages").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get("/make-server-cd65d9bc/messages/stats", async (c) => {
  try {
    const sb = getSupabase();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [today, week, month] = await Promise.all([
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", weekStart),
      sb.from("messages").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    ]);
    return c.json({ success: true, data: { today: today.count ?? 0, week: week.count ?? 0, month: month.count ?? 0 } });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 배너 API ====================

app.get("/make-server-cd65d9bc/banners", async (c) => {
  try {
    const sb = getSupabase();
    const active = c.req.query("active");
    const position = c.req.query("position");
    let q = sb.from("banners").select("*").order("display_order", { ascending: true });
    if (active === "true") q = q.eq("is_active", true);
    if (position) q = q.eq("position", position);
    const { data, error } = await q;
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-cd65d9bc/banners", async (c) => {
  try {
    const body = await c.req.json();
    const { title, image_url, link_url, position = "popup", display_order = 1, is_active = false, metadata = {} } = body;
    const sb = getSupabase();
    const { data, error } = await sb.from("banners").insert({ title, image_url, link_url, position, display_order, is_active, metadata, click_count: 0 }).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch("/make-server-cd65d9bc/banners/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const sb = getSupabase();
    const { data, error } = await sb.from("banners").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.delete("/make-server-cd65d9bc/banners/:id", async (c) => {
  try {
    const { error } = await getSupabase().from("banners").delete().eq("id", c.req.param("id"));
    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ==================== 어드민 알림 집계 API ====================

app.get("/make-server-cd65d9bc/db/notifications", async (c) => {
  try {
    const sb = getSupabase();
    const [pendingUsers, pendingDeposits, pendingWithdrawals, pendingSupport, unreadMessages] = await Promise.all([
      sb.from("users").select("id", { count: "exact", head: true }).eq("status", "inactive").eq("role", "member"),
      sb.from("transactions").select("id", { count: "exact", head: true }).eq("type", "deposit").eq("status", "pending"),
      sb.from("transactions").select("id", { count: "exact", head: true }).eq("type", "withdrawal").eq("status", "pending"),
      sb.from("customer_support").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("is_read", false),
    ]);
    return c.json({
      success: true,
      data: {
        pendingRegistrations: pendingUsers.count ?? 0,
        pendingDeposits: pendingDeposits.count ?? 0,
        pendingWithdrawals: pendingWithdrawals.count ?? 0,
        pendingSupport: pendingSupport.count ?? 0,
        unreadMessages: unreadMessages.count ?? 0,
        total: (pendingUsers.count ?? 0) + (pendingDeposits.count ?? 0) + (pendingWithdrawals.count ?? 0) + (pendingSupport.count ?? 0) + (unreadMessages.count ?? 0),
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
