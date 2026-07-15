import CryptoJS from 'crypto-js';
import { supabase } from '../lib/supabase';

const PROXY_URL = 'https://proxy.gms0811.com/proxy';

// ─── Proxy 호출 헬퍼 ───────────────────────────────────────────

async function callProxy<T = any>(
  apiBaseUrl: string,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: Record<string, any>
): Promise<{ RESULT: boolean; DATA?: T; message?: string }> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${apiBaseUrl}${endpoint}`,
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}: ${res.statusText}`);
  return res.json();
}

function md5(...parts: (string | number)[]): string {
  return CryptoJS.MD5(parts.join('')).toString().toLowerCase();
}

// honorlink API: Bearer 토큰 인증 (md5/signature 없음 - honor는 Bearer만 사용)
// GET: 파라미터 → URL 쿼리스트링, POST: 파라미터 → JSON body

// /transactions 전용 직렬 큐 — 30초 간격 제한은 베팅 내역 조회에만 적용 (honor-api.md 참조)
// 다른 엔드포인트(게임 실행, 입출금 등)는 제한 없음
const HONOR_TRANSACTIONS_INTERVAL_MS = 31_000;
let _lastTransactionsCallAt = 0;
let _transactionsQueue: Promise<any> = Promise.resolve();

function _enqueueTransactionsCall<T>(fn: () => Promise<T>): Promise<T> {
  const next = _transactionsQueue.then(async () => {
    const gap = Date.now() - _lastTransactionsCallAt;
    if (_lastTransactionsCallAt > 0 && gap < HONOR_TRANSACTIONS_INTERVAL_MS) {
      const wait = HONOR_TRANSACTIONS_INTERVAL_MS - gap;
      console.log(`[HONOR TRANSACTIONS] rate-limit 대기 ${Math.ceil(wait / 1000)}초...`);
      await new Promise(r => setTimeout(r, wait));
    }
    _lastTransactionsCallAt = Date.now();
    return fn();
  });
  _transactionsQueue = next.catch(() => {});
  return next;
}

async function callHonorProxy<T = any>(
  apiBaseUrl: string,
  endpoint: string,
  bearerToken: string,
  method: 'GET' | 'POST' = 'GET',
  params?: Record<string, string | number>,
  maxRetries = 3,
  direct = false,  // true면 큐/대기 없이 즉시 호출 (수동 버튼 클릭용)
): Promise<T> {
  const isTransactions = endpoint === '/transactions';

  const doCall = async (): Promise<T> => {
    let url = `${apiBaseUrl.replace(/\/$/, '')}${endpoint}`;

    const proxyPayload: Record<string, any> = {
      method,
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    proxyPayload.url = url;

    if (params && Object.keys(params).length > 0) {
      // Honor API는 프록시의 body 필드로 파라미터 전달 (쿼리스트링 X)
      proxyPayload.body = Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      );
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log('[HONOR PROXY] payload:', JSON.stringify(proxyPayload));
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload),
      });

      if (res.status === 429) {
        const errText = await res.text().catch(() => '');
        // direct(수동 버튼)면 즉시 throw → 호출부에서 토스트로 처리
        if (direct) {
          throw new Error(`HONOR_429: ${errText}`);
        }
        console.warn(`[HONOR PROXY] 429 (시도 ${attempt}/${maxRetries}), ${HONOR_TRANSACTIONS_INTERVAL_MS / 1000}초 후 재시도...`, errText);
        if (attempt < maxRetries && isTransactions) {
          _lastTransactionsCallAt = Date.now();
          await new Promise(r => setTimeout(r, HONOR_TRANSACTIONS_INTERVAL_MS));
          _lastTransactionsCallAt = Date.now();
          continue;
        }
        throw new Error(`Proxy error 429: ${errText}`);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        console.error('[HONOR PROXY] error:', res.status, errText);
        throw new Error(`Proxy error ${res.status}: ${errText}`);
      }
      return res.json() as Promise<T>;
    }
    throw new Error('Honor API 최대 재시도 횟수 초과');
  };

  // direct=true(수동 버튼)면 큐/대기 없이 즉시 호출, 아니면 /transactions만 직렬 큐
  if (isTransactions && !direct) {
    return _enqueueTransactionsCall(doCall);
  }
  return doCall();
}

// ─── Constants ───────────────────────────────────────────────
export const HONOR_VENDOR_KEY = 'honor';
export const ACE_VENDOR_KEY_CONST = 'ace';

// ─── Types ────────────────────────────────────────────────────

export interface GameVendor {
  id: string;
  vendor_key: string;
  vendor_name: string;
  api_base_url: string;
  opcode: string;
  secret_key: string;
  description: string;
  is_active: boolean;
  total_balance: number | null;
  balance_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameProvider {
  id: string;
  vendor_id: string;
  provider_id: number;
  provider_name: string;
  category: 'casino' | 'slot' | string;
  is_active: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  vendor?: GameVendor;
}

export interface GameItem {
  id: string;
  provider_id: string;        // FK to game_provider_invest.id
  game_code: string;          // "{provider_id}_{game_id}"
  game_name: string;
  game_type: 'casino' | 'slot' | null;
  thumbnail_url: string | null;
  status: 'active' | 'inactive';
  rtp: number | null;
  min_bet: number | null;
  max_bet: number | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  provider?: GameProvider;
}

// ─── Operator Balance Sync ────────────────────────────────────
// vendor 잔액 업데이트 후 해당 벤더를 사용하는 운영사의 users.balance도 동기화

async function syncOperatorBalance(vendorKey: string, freshVendorBalance: number): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from('partner_settings')
      .select('user_id, game_vendor_keys')
      .contains('game_vendor_keys', [vendorKey]);

    if (!settings || settings.length === 0) return;

    for (const ps of settings) {
      const keys: string[] = ps.game_vendor_keys ?? [];
      if (keys.length === 0) continue;

      // 이 운영사가 보유한 모든 벤더 잔액 합산 (현재 벤더는 freshVendorBalance 사용)
      const { data: vendors } = await supabase
        .from('game_vendors')
        .select('vendor_key, total_balance')
        .in('vendor_key', keys);

      const totalBalance = (vendors ?? []).reduce((sum, v) => {
        const bal = v.vendor_key === vendorKey ? freshVendorBalance : Number(v.total_balance ?? 0);
        return sum + bal;
      }, 0);

      await supabase
        .from('users')
        .update({ balance: totalBalance })
        .eq('id', ps.user_id)
        .eq('role', 'operator');
    }
  } catch {
    // 운영사 동기화 실패는 메인 흐름에 영향 없음
  }
}

// 충전(charge) 시 game_vendors.total_balance를 로컬에서 즉시 차감하고 운영사 잔액 동기화
// API 재호출 없이 차감만 하며, 게임 종료 시 실제 API 값으로 덮어씌워짐
export async function deductVendorBalanceOnCharge(vendorKey: string, amount: number): Promise<void> {
  try {
    const { data: vendor } = await supabase
      .from('game_vendors')
      .select('total_balance')
      .eq('vendor_key', vendorKey)
      .single();
    if (!vendor) return;
    const newBalance = Math.max(0, Number(vendor.total_balance ?? 0) - amount);
    await supabase
      .from('game_vendors')
      .update({ total_balance: newBalance })
      .eq('vendor_key', vendorKey);
    await syncOperatorBalance(vendorKey, newBalance);
  } catch {
    // 차감 실패는 메인 흐름에 영향 없음
  }
}

// ─── Game Vendor Service ──────────────────────────────────────

export const gameVendorService = {
  async getAll(): Promise<GameVendor[]> {
    const { data, error } = await supabase
      .from('game_vendors')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: Omit<GameVendor, 'id' | 'created_at' | 'updated_at'>): Promise<GameVendor> {
    const { data, error } = await supabase
      .from('game_vendors')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, input: Partial<GameVendor>): Promise<GameVendor> {
    const { data, error } = await supabase
      .from('game_vendors')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('game_vendors').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async testConnection(vendor: GameVendor): Promise<{ RESULT: boolean; DATA?: any; message?: string }> {
    const signature = md5(vendor.opcode, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/info', 'GET', {
      opcode: vendor.opcode,
      signature,
    });
    if (result.RESULT) {
      const raw = result.DATA ?? result;
      const balance =
        raw?.balance ?? raw?.Balance ?? raw?.BALANCE ??
        raw?.total_balance ?? raw?.amount ?? null;
      const numBalance = balance !== null ? Number(balance) : null;
      await supabase
        .from('game_vendors')
        .update({
          total_balance: numBalance,
          balance_checked_at: new Date().toISOString(),
        })
        .eq('id', vendor.id);
      if (numBalance !== null) {
        await syncOperatorBalance(vendor.vendor_key, numBalance);
      }
    }
    return result;
  },

  // honorlink: /my-info로 에이전트 잔액 조회 (Bearer 인증, md5/signature 없음)
  // honor-api.md: GET /my-info → { id, type, username, nickname, callback_url, balance, created_at }
  async fetchHonorBalance(vendor: GameVendor): Promise<number> {
    const data = await callHonorProxy<{ id?: number; balance?: number; [key: string]: any }>(
      vendor.api_base_url, '/my-info', vendor.secret_key, 'GET'
    );
    const balance = Number(data.balance ?? 0);
    await supabase
      .from('game_vendors')
      .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
      .eq('id', vendor.id);
    await syncOperatorBalance(vendor.vendor_key, balance);
    return balance;
  },

  // API에서 제공사 목록을 가져와 game_provider_invest에 upsert (slot + casino 각각 호출)
  // 제공사 목록은 api.slotgates.com/api/game/provider 사용 (invest-api.md 스펙 참조)
  async fetchProvidersFromApi(vendor: GameVendor): Promise<{ created: number; skipped: number; providers: GameProvider[] }> {
    const signature = md5(vendor.opcode, vendor.secret_key);
    const result = await callProxy<any[]>(vendor.api_base_url, '/game/provider', 'GET', {
      opcode: vendor.opcode,
      signature,
    });
    if (!result.RESULT) throw new Error(result.message || '제공사 목록 API 응답 실패');

    const providerList: any[] = result.DATA || [];
    let created = 0, skipped = 0;
    const createdProviders: GameProvider[] = [];

    for (const p of providerList) {
      const providerId = p.id ?? p.provider_id;
      const providerName = p.title ?? p.name ?? p.provider_name ?? `Provider ${providerId}`;
      // category는 제공사 API 응답에 없으므로 기본 'slot'으로 등록.
      // 게임 목록 동기화(syncFromApi) 시 metadata.category 기반으로 자동 갱신됨.

      const { data: existing } = await supabase
        .from('game_provider_invest')
        .select('*')
        .eq('vendor_id', vendor.id)
        .eq('provider_id', providerId)
        .maybeSingle();

      if (existing) {
        skipped++;
        createdProviders.push(existing);
      } else {
        const { data: newProv, error } = await supabase
          .from('game_provider_invest')
          .insert({
            vendor_id: vendor.id,
            provider_id: providerId,
            provider_name: providerName,
            category: 'slot',   // 게임 동기화 후 자동 갱신
            is_active: true,
          })
          .select()
          .single();
        if (!error && newProv) {
          created++;
          createdProviders.push(newProv);
        }
      }
    }

    return { created, skipped, providers: createdProviders };
  },

  // 벤더에 속한 모든 제공사의 게임 목록을 API에서 동기화
  async syncAllGames(vendorId: string): Promise<{ providerCount: number; added: number; updated: number; errors: string[] }> {
    const providers = await gameProviderService.getAll(vendorId);
    let added = 0, updated = 0;
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const vendor = provider.vendor;
        if (!vendor) throw new Error('벤더 정보 없음');
        const result = await gameItemService.syncFromApi(provider, vendor);
        added += result.added;
        updated += result.updated;
      } catch (e: any) {
        errors.push(`${provider.provider_name}: ${e.message}`);
      }
    }

    return { providerCount: providers.length, added, updated, errors };
  },
};

// ─── Game Provider Service ────────────────────────────────────

export const gameProviderService = {
  async getAll(vendorId?: string): Promise<GameProvider[]> {
    let q = supabase
      .from('game_provider_invest')
      .select('*, vendor:game_vendors(*)')
      .order('provider_name');
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async create(input: {
    vendor_id: string;
    provider_id: number;
    provider_name: string;
    category: string;
    is_active: boolean;
  }): Promise<GameProvider> {
    const { data, error } = await supabase
      .from('game_provider_invest')
      .insert(input)
      .select('*, vendor:game_vendors(*)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(id: string, input: Partial<Pick<GameProvider, 'provider_id' | 'provider_name' | 'category' | 'is_active'>>): Promise<GameProvider> {
    const { data, error } = await supabase
      .from('game_provider_invest')
      .update(input)
      .eq('id', id)
      .select('*, vendor:game_vendors(*)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('game_provider_invest').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ─── Game Item Service ────────────────────────────────────────

export const gameItemService = {
  async getByProvider(providerDbId: string): Promise<GameItem[]> {
    const { data, error } = await supabase
      .from('game_invest')
      .select('*')
      .eq('provider_id', providerDbId)
      .order('game_name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // vendor를 직접 전달하거나, provider.vendor에서 자동으로 가져옴
  async syncFromApi(provider: GameProvider, vendor?: GameVendor): Promise<{ added: number; updated: number }> {
    const v = vendor ?? provider.vendor;
    if (!v) throw new Error('vendor 정보가 없습니다. vendor를 인자로 전달해주세요.');

    // 게임 목록 API: vendor.api_base_url 사용 (invest-api.md 스펙: /game/lists)
    // Signature: md5(opcode + provider_id + secret_key)
    const signature = md5(v.opcode, provider.provider_id, v.secret_key);
    const result = await callProxy<any>(v.api_base_url, '/game/lists', 'GET', {
      opcode: v.opcode,
      provider_id: provider.provider_id,
      signature,
    });

    // 프록시 응답은 대문자(RESULT/DATA) 또는 소문자(result/data) 두 형태 모두 처리
    const isSuccess = result.RESULT ?? result.result ?? false;
    if (!isSuccess) {
      const msg = result.message ?? result.MESSAGE ?? '게임 목록 API 응답 실패';
      throw new Error(msg);
    }

    // DATA가 배열이면 직접 사용, 객체면 .games 또는 .data 속성에서 추출
    const rawData = result.DATA ?? result.data ?? [];
    const games: any[] = Array.isArray(rawData)
      ? rawData
      : (rawData.games ?? rawData.data ?? rawData.list ?? []);

    console.log(`[syncFromApi] provider=${provider.provider_name}(${provider.provider_id}) games=${games.length}`, { isSuccess, rawData: Array.isArray(rawData) ? `array[${(rawData as any[]).length}]` : rawData });
    let added = 0, updated = 0;
    // 이 제공사의 실제 카테고리를 게임 데이터에서 결정
    let detectedCategory: 'casino' | 'slot' | null = null;

    for (const g of games) {
      const gameId: number = g.id ?? g.game_id;
      const gameCode = `${provider.provider_id}_${gameId}`;
      const gameName: string = g.game_title ?? g.title ?? g.name ?? g.game_name ?? `Game ${gameId}`;
      const thumbnail: string | null = g.game_image ?? g.thumbnail ?? g.thumbnail_url ?? null;

      // metadata.category ("Live casino", "Slot" 등)에서 game_type 결정
      const rawCategory = (g.category ?? g.type ?? g.game_type ?? '').toString().toLowerCase();
      const gameType: 'casino' | 'slot' =
        rawCategory.includes('casino') || rawCategory.includes('live') ? 'casino' : 'slot';

      // 첫 번째 게임에서 제공사 카테고리 확정 (같은 제공사의 게임은 동일 카테고리)
      if (detectedCategory === null) detectedCategory = gameType;

      const { data: existing } = await supabase
        .from('game_invest')
        .select('id')
        .eq('game_code', gameCode)
        .maybeSingle();

      if (existing) {
        await supabase.from('game_invest').update({
          game_name: gameName,
          thumbnail_url: thumbnail,
          game_type: gameType,
          metadata: g,
        }).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('game_invest').insert({
          provider_id: provider.id,
          game_code: gameCode,
          game_name: gameName,
          thumbnail_url: thumbnail,
          game_type: gameType,
          status: 'active',
          metadata: g,
        });
        added++;
      }
    }

    // 게임 동기화 후 제공사 category를 실제 게임 데이터 기준으로 갱신
    await supabase
      .from('game_provider_invest')
      .update({
        ...(detectedCategory !== null ? { category: detectedCategory } : {}),
        synced_at: new Date().toISOString(),
      })
      .eq('id', provider.id);

    return { added, updated };
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const status = isActive ? 'active' : 'inactive';
    const { error } = await supabase.from('game_invest').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('game_invest').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ============================================================
// Honor API 서비스
// 인증: Authorization: Bearer {secret_key} (game_vendors.secret_key)
// Proxy: proxy.gms0811.com/proxy → api.honorlink.org/api
// md5/signature 없음 — Bearer 토큰만으로 에이전트 구별
// ============================================================

export interface HonorProvider {
  id: string;
  vendor_id: string | null;
  vendor_key: string;
  vendor_name: string;
  category: string;
  is_active: boolean;
  metadata: Record<string, any>;  // { honor_vendor: "evolution" }
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HonorGame {
  id: string;
  provider_id: string;
  game_id: number;           // API: id (int) or hash of lobby string id
  vendor_key: string | null; // game: API vendor / lobby: 로비 문자열 ID
  title: string;
  title_ko: string | null;   // API: langs.ko
  type: 'casino' | 'slot' | 'lobby' | null; // API: type
  thumbnail: string | null;
  thumbnails: Record<string, string>;
  rank: number | null;
  status: 'active' | 'inactive';
  metadata: Record<string, any>;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// /lobby-list API 응답 아이템
export interface HonorLobbyItem {
  id: string;       // 문자열 로비 ID (예: "evolution_game_shows")
  title: string;
  type: 'lobby';
  provider: string;
  vendor: string;
  thumbnail: string | null;
  thumbnails: Record<string, string>;
}

// lobby string id → 안정적인 양수 정수 변환 (postgres int 범위 내)
function lobbyIdToInt(lobbyId: string): number {
  let h = 5381;
  for (let i = 0; i < lobbyId.length; i++) {
    h = ((h * 33) ^ lobbyId.charCodeAt(i)) >>> 0;
  }
  return (h % 2_000_000_000) + 1;
}

export const honorVendorService = {
  // 제공사 목록 조회 (vendor_id FK 기준)
  async getProviders(vendorId: string): Promise<HonorProvider[]> {
    const { data, error } = await supabase
      .from('game_provider_honor')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('vendor_name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // /vendor-list API → game_provider_honor에 저장
  // honor-api.md: GET /vendor-list, Authorization: Bearer {secret_key}
  async fetchVendorList(vendor: GameVendor): Promise<{ created: number; skipped: number }> {
    const data = await callHonorProxy<any>(
      vendor.api_base_url, '/vendor-list', vendor.secret_key, 'GET'
    );

    // API 응답: { "vendorKey": { name: string, enabled: number }, ... } 형태의 객체
    let entries: Array<{ code: string; name: string }> = [];
    if (Array.isArray(data)) {
      entries = data.map((v: any) => {
        const code: string = typeof v === 'string' ? v : (v.vendor ?? v.name ?? v.key ?? v.code ?? String(v));
        return { code, name: code };
      });
    } else if (data && typeof data === 'object') {
      entries = Object.entries(data).map(([key, val]: [string, any]) => ({
        code: key,
        name: (val && typeof val === 'object' ? val.name : null) ?? key,
      }));
    } else {
      throw new Error('vendor-list API 응답이 올바르지 않습니다.');
    }

    let created = 0, skipped = 0;

    for (const { code: vendorCode, name: vendorName } of entries) {
      const { data: existing } = await supabase
        .from('game_provider_honor')
        .select('id')
        .eq('vendor_id', vendor.id)
        .eq('vendor_key', vendorCode)
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        const { error } = await supabase
          .from('game_provider_honor')
          .insert({
            vendor_id: vendor.id,
            vendor_key: vendorCode,
            vendor_name: vendorName,
            // category는 게임 싱크 후 refresh_honor_provider_category()로 자동 결정
            is_active: true,
            metadata: { honor_vendor: vendorCode },
          });
        if (!error) created++;
      }
    }

    return { created, skipped };
  },

  // /game-list?vendor=xxx API → game_honor에 저장
  // honor-api.md: GET /game-list, query: vendor*, Authorization: Bearer {secret_key}
  // 응답: [{ title, type, id, vendor, thumbnail, thumbnails, rank, langs }]
  async syncGamesForProvider(
    provider: HonorProvider,
    vendor: GameVendor
  ): Promise<{ added: number; updated: number }> {
    const honorVendor: string = provider.metadata?.honor_vendor || provider.vendor_key;
    if (!honorVendor) throw new Error('honor_vendor 값이 없습니다.');

    const games = await callHonorProxy<any[]>(
      vendor.api_base_url, '/game-list', vendor.secret_key, 'GET', { vendor: honorVendor }
    );
    if (!Array.isArray(games)) throw new Error('game-list API 응답이 올바르지 않습니다.');

    let added = 0, updated = 0;
    const now = new Date().toISOString();

    for (const g of games) {
      const gameId: number = Number(g.id);
      if (!Number.isFinite(gameId) || gameId <= 0) continue;

      const title: string = g.title || `Game ${g.id}`;
      if (!title) continue;

      const rawType = (g.type ?? '').toLowerCase();
      const type: 'casino' | 'slot' =
        rawType === 'casino' || rawType.includes('live') ? 'casino' : 'slot';

      const row = {
        provider_id:  provider.id,
        game_id:      gameId,
        vendor_key:   g.vendor ?? provider.vendor_key ?? null,
        title,
        title_ko:     g.langs?.ko ?? null,
        type,
        thumbnail:    g.thumbnail ?? null,
        thumbnails:   g.thumbnails ?? {},
        rank:         g.rank ?? null,
        status:       'active' as const,
        metadata:     g,
        synced_at:    now,
      };

      const { data: existing } = await supabase
        .from('game_honor')
        .select('id')
        .eq('provider_id', provider.id)
        .eq('game_id', gameId)
        .maybeSingle();

      if (existing) {
        const { type: _t, provider_id: _p, game_id: _g, ...updateFields } = row;
        await supabase.from('game_honor').update(updateFields).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('game_honor').insert(row);
        added++;
      }
    }

    // 싱크 완료 후 provider category 자동 갱신 (casino/slot 집계)
    await supabase.rpc('refresh_honor_provider_category', { p_provider_id: provider.id });

    await supabase
      .from('game_provider_honor')
      .update({ synced_at: now })
      .eq('id', provider.id);

    return { added, updated };
  },

  // 벤더에 속한 모든 제공사의 게임 동기화
  async syncAllGames(
    _vendorId: string,
    vendor: GameVendor
  ): Promise<{ providerCount: number; added: number; updated: number; errors: string[] }> {
    const providers = await honorVendorService.getProviders(vendor.id);
    let added = 0, updated = 0;
    const errors: string[] = [];

    for (const p of providers) {
      try {
        const r = await honorVendorService.syncGamesForProvider(p, vendor);
        added += r.added;
        updated += r.updated;
      } catch (e: any) {
        errors.push(`${p.vendor_name}: ${e.message}`);
      }
    }

    return { providerCount: providers.length, added, updated, errors };
  },

  async deleteProvider(id: string): Promise<void> {
    const { error } = await supabase.from('game_provider_honor').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // /lobby-list API 호출 → game_honor에 type='lobby'로 저장
  // vendor_key에 로비 문자열 ID 저장, game_id에 해시값 사용
  async syncLobbyListForProvider(
    provider: HonorProvider,
    vendor: GameVendor
  ): Promise<{ added: number; updated: number }> {
    const honorVendorName: string = provider.metadata?.honor_vendor || provider.vendor_key;

    const lobbies = await callHonorProxy<HonorLobbyItem[]>(
      vendor.api_base_url, '/lobby-list', vendor.secret_key, 'GET'
    );
    if (!Array.isArray(lobbies)) throw new Error('lobby-list API 응답이 올바르지 않습니다.');

    // 해당 provider의 vendor 키에 해당하는 로비만 필터링
    const filtered = lobbies.filter(l => l.vendor === honorVendorName);

    let added = 0, updated = 0;
    const now = new Date().toISOString();

    for (const l of filtered) {
      const gameId = lobbyIdToInt(l.id);

      const row = {
        provider_id: provider.id,
        game_id:     gameId,
        vendor_key:  l.id,          // 로비 문자열 ID를 vendor_key에 저장
        title:       l.title,
        title_ko:    null,
        type:        'lobby' as const,
        thumbnail:   l.thumbnail ?? null,
        thumbnails:  l.thumbnails ?? {},
        rank:        null,
        status:      'active' as const,
        metadata:    l as Record<string, any>,
        synced_at:   now,
      };

      const { data: existing } = await supabase
        .from('game_honor')
        .select('id')
        .eq('provider_id', provider.id)
        .eq('vendor_key', l.id)
        .eq('type', 'lobby')
        .maybeSingle();

      if (existing) {
        const { type: _t, provider_id: _p, game_id: _g, ...updateFields } = row;
        await supabase.from('game_honor').update(updateFields).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('game_honor').insert(row);
        added++;
      }
    }

    return { added, updated };
  },

  // game_honor에서 type='lobby' 항목 조회
  async getLobbyGames(providerDbId: string): Promise<HonorGame[]> {
    const { data, error } = await supabase
      .from('game_honor')
      .select('*')
      .eq('provider_id', providerDbId)
      .eq('type', 'lobby')
      .order('title');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // /user/add-balance: POST, body: { username, amount, uuid? }
  // honor-api.md: 에이전트 → 유저 머니 지급
  async addBalance(
    vendor: GameVendor,
    username: string,
    amount: number,
    uuid?: string
  ): Promise<{ username: string; balance: number; amount: number; transaction_id: number; cached: boolean }> {
    const params: Record<string, string | number> = { username, amount };
    if (uuid) params.uuid = uuid;
    return callHonorProxy(vendor.api_base_url, '/user/add-balance', vendor.secret_key, 'POST', params);
  },

  // /user/sub-balance: POST, body: { username, amount, uuid? }
  // honor-api.md: 유저 → 에이전트 머니 회수
  async subBalance(
    vendor: GameVendor,
    username: string,
    amount: number,
    uuid?: string
  ): Promise<{ username: string; balance: number; amount: number; transaction_id: number; cached: boolean }> {
    const params: Record<string, string | number> = { username, amount };
    if (uuid) params.uuid = uuid;
    return callHonorProxy(vendor.api_base_url, '/user/sub-balance', vendor.secret_key, 'POST', params);
  },

  // /user: GET, query: username
  async getUser(vendor: GameVendor, username: string): Promise<any> {
    return callHonorProxy(vendor.api_base_url, '/user', vendor.secret_key, 'GET', { username });
  },

  // /user/create: GET, query: username, nickname?
  async createUser(vendor: GameVendor, username: string, nickname?: string): Promise<any> {
    const params: Record<string, string> = { username };
    if (nickname) params.nickname = nickname;
    return callHonorProxy(vendor.api_base_url, '/user/create', vendor.secret_key, 'GET', params);
  },

  // /game-launch-link: GET, query: username, game_id, vendor, nickname?, skin?
  // game_id: 일반 게임은 숫자, 로비는 문자열 ID
  async getGameLaunchLink(
    vendor: GameVendor,
    username: string,
    gameId: number | string,
    honorVendorName: string,
    options?: { nickname?: string; skin?: string }
  ): Promise<{ user: any; userCreate: boolean; link: string }> {
    const params: Record<string, string | number> = { username, game_id: gameId, vendor: honorVendorName };
    if (options?.nickname) params.nickname = options.nickname;
    if (options?.skin) params.skin = options.skin;
    return callHonorProxy(vendor.api_base_url, '/game-launch-link', vendor.secret_key, 'GET', params);
  },

  // /transactions: GET, query: start, end, page, perPage, withDetails?, order?
  // honor-api.md: 베팅 내역 조회 (30초 이상 간격, 1시간 이내 기간)
  async getTransactions(
    vendor: GameVendor,
    params: {
      start: string;   // YYYY-MM-DD hh:ii:ss (UTC+0)
      end: string;     // YYYY-MM-DD hh:ii:ss (UTC+0)
      page: number;
      perPage?: number;
      withDetails?: 0 | 1;
      order?: 'asc' | 'desc';
    },
    direct = false,
  ): Promise<any> {
    const queryParams: Record<string, string | number> = {
      start: params.start,
      end: params.end,
      page: params.page,
      perpage: params.perPage ?? 100,
    };
    if (params.withDetails !== undefined) queryParams.withDetails = params.withDetails;
    if (params.order) queryParams.order = params.order;
    return callHonorProxy(vendor.api_base_url, '/transactions', vendor.secret_key, 'GET', queryParams, 3, direct);
  },

  async syncBettingHistory(
    vendor: GameVendor,
    options: { hours?: number; direct?: boolean; startDate?: Date; endDate?: Date } = {}
  ): Promise<{ inserted: number; updated: number; errors: string[] }> {
    const fmt = (d: Date) => d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

    // direct=true(수동 버튼)면 첫 호출만 즉시, 이후 청크는 큐로 30초 간격 보장
    if (options.direct) {
      _lastTransactionsCallAt = 0;
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    // startDate/endDate가 있으면 해당 범위를 1시간 청크로 분할
    const rangeEnd   = options.endDate   ? new Date(options.endDate)   : new Date();
    const rangeStart = options.startDate ? new Date(options.startDate) : new Date(rangeEnd.getTime() - (options.hours ?? 24) * 60 * 60 * 1000);
    const totalHours = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (60 * 60 * 1000)) || 1;

    for (let i = 0; i < totalHours; i++) {
      const chunkStart = fmt(new Date(rangeStart.getTime() + i * 60 * 60 * 1000));
      const chunkEnd   = fmt(new Date(Math.min(rangeStart.getTime() + (i + 1) * 60 * 60 * 1000, rangeEnd.getTime())));
      // 항상 큐를 통해 30초 간격 보장 (direct=false 고정)
      try {
        let page = 1;
        while (true) {
          const res = await honorVendorService.getTransactions(vendor, {
            start: chunkStart, end: chunkEnd, page, perPage: 1000,
          }, false);
          const transactions: any[] = res?.data ?? [];
          if (transactions.length === 0) break;

          for (const tx of transactions) {
            try {
              const username: string = tx.user?.username ?? '';
              if (!username) continue;
              if (!['bet', 'win', 'cancel'].includes(tx.type)) continue;

              const { data: userRow } = await supabase
                .from('users')
                .select('id, username, hierarchy_path, depth')
                .eq('username', username)
                .maybeSingle();
              if (!userRow) { errors.push(`유저 없음: ${username} (txid: ${tx.id})`); continue; }

              // hierarchy_path = [..., operator, head_office, sub_office, distributor, store, self]
              const hp = (userRow.hierarchy_path ?? []) as string[];
              const hpLen = hp.length;
              const getHpId = (depth: number) => (hpLen > depth ? hp[depth] : null);

              const isBet    = tx.type === 'bet';
              const isWin    = tx.type === 'win';
              const gameDetail = tx.details?.game ?? {};
              const roundId  = gameDetail.round ?? null;

              if (isWin && roundId) {
                const { data: existing } = await supabase
                  .from('betting_history_honor')
                  .select('id')
                  .eq('round_id', roundId)
                  .eq('user_id', userRow.id)
                  .eq('round_status', 'betting')
                  .maybeSingle();
                if (existing) {
                  const { error } = await supabase
                    .from('betting_history_honor')
                    .update({
                      win_amount:   Math.abs(Number(tx.amount ?? 0)),
                      round_status: 'settled',
                      settle_time:  tx.processed_at ?? null,
                      synced_at:    new Date().toISOString(),
                    })
                    .eq('id', existing.id);
                  if (error) errors.push(`win 갱신 실패 (${tx.id}): ${error.message}`);
                  else updated++;
                  continue;
                }
              }

              // UUID 컬럼은 빈 문자열이면 null로 변환 (PostgreSQL UUID 타입 오류 방지)
              const toUuid = (v: string | null | undefined) => (v && v.trim() !== '' ? v : null);
              const record = {
                txid:            String(tx.id),
                user_id:         userRow.id,
                username,
                operator_id:     toUuid(getHpId(1)),
                head_office_id:  toUuid(getHpId(2)),
                sub_office_id:   toUuid(getHpId(3)),
                distributor_id:  toUuid(getHpId(4)),
                store_id:        toUuid(getHpId(5)),
                game_id:         gameDetail.id   != null ? String(gameDetail.id)   : null,
                game_name:       gameDetail.title != null ? String(gameDetail.title) : null,
                game_type:       gameDetail.type  != null ? String(gameDetail.type)  : null,
                game_category:   gameDetail.vendor != null ? String(gameDetail.vendor) : null,
                provider_name:   gameDetail.vendor != null ? String(gameDetail.vendor) : null,
                bet_amount:      isBet ? Math.abs(Number(tx.amount ?? 0)) : 0,
                win_amount:      isWin ? Math.abs(Number(tx.amount ?? 0)) : 0,
                before_amount:   tx.before != null ? Number(tx.before) : null,
                after_amount:    (tx.before != null && tx.amount != null) ? Number(tx.before) + Number(tx.amount) : null,
                round_id:        roundId ?? null,
                round_status:    isBet ? 'betting' : (isWin ? 'settled' : tx.type),
                bet_time:        isBet ? (tx.processed_at ?? null) : null,
                settle_time:     isWin ? (tx.processed_at ?? null) : null,
                raw_data:        tx,
                synced_at:       new Date().toISOString(),
              };

              const { error } = await supabase
                .from('betting_history_honor')
                .upsert(record, { onConflict: 'txid' });
              if (error) {
                console.error('[HONOR UPSERT ERROR]', {
                  code: error.code, message: error.message,
                  details: error.details, hint: error.hint,
                  record,
                });
                errors.push(`upsert 실패 (${tx.id}): [${error.code}] ${error.message} | ${error.details ?? ''}`);
              }
              else inserted++;
            } catch (e: any) {
              errors.push(`처리 오류 (${tx.id}): ${e.message}`);
            }
          }

          if (transactions.length < 1000) break;
          page++;
        }
      } catch (e: any) {
        errors.push(`구간 조회 실패 (${chunkStart} ~ ${chunkEnd}): ${e.message}`);
      }
    }

    return { inserted, updated, errors };
  },
};

// ============================================================
// ACE API 서비스
// 인증: agent + hash (SHA-256 Base64) in 요청 헤더
// Content-Type: application/x-www-form-urlencoded
// Proxy: proxy.gms0811.com/proxy를 통해 gate.st88-ace.com 호출
// ============================================================

function sha256Base64(body: Record<string, any> | null, secretKey: string): string {
  let jsonString = '';
  if (body && Object.keys(body).length > 0) {
    jsonString = JSON.stringify(body);
  }
  return CryptoJS.SHA256(jsonString + secretKey).toString(CryptoJS.enc.Base64);
}

async function callAceProxy<T = any>(
  apiBaseUrl: string,
  endpoint: string,
  agent: string,
  secretKey: string,
  body: Record<string, any> | null = null
): Promise<T> {
  const hash = sha256Base64(body, secretKey);
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${apiBaseUrl}${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'agent': agent,
        'hash': hash,
      },
      body: body
        ? Object.entries(body)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
        : '',
    }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.msg || `ACE API 오류 (code: ${data.code})`);
  return data as T;
}

// ─── ACE Types ───────────────────────────────────────────────

export interface AceVendorSkin {
  skin: string;
  name: string;
}

export interface AceProvider {
  id: string;
  vendor_id: string;
  vendor_key: string;
  vendor_name: string;
  category: 'casino' | 'slot' | string;
  is_active: boolean;
  metadata: Record<string, any>;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  vendor?: GameVendor;
  game_count?: number;
}

export interface AceGame {
  id: string;
  provider_id: string;
  game_key: string;
  game_id: string | null;
  skin: string | null;
  game_name_ko: string | null;
  game_name_en: string | null;
  platform: string | null;
  category: string | null;
  game_type: string | null;
  thumbnail_url: string | null;
  status: 'active' | 'inactive';
  metadata: Record<string, any>;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  provider?: AceProvider;
}

// ─── ACE Vendor Service ───────────────────────────────────────

export const aceProviderService = {
  async getAll(vendorId?: string): Promise<AceProvider[]> {
    let q = supabase
      .from('game_provider_ace')
      .select('*, vendor:game_vendors(*)')
      .order('vendor_name');
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('game_provider_ace').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('game_provider_ace')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ─── ACE Game Service ─────────────────────────────────────────

export const aceGameService = {
  async getByProvider(providerDbId: string): Promise<AceGame[]> {
    const { data, error } = await supabase
      .from('game_ace')
      .select('*')
      .eq('provider_id', providerDbId)
      .order('game_name_ko');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('game_ace')
      .update({ status: isActive ? 'active' : 'inactive' })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('game_ace').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

// ─── ACE Vendor Management Service ───────────────────────────

export const aceVendorService = {
  // 에이전트 잔액 조회 (/partner/balance) — body 없음, SecretKey만으로 해시 생성
  async fetchAgentBalance(vendor: GameVendor): Promise<number> {
    const data = await callAceProxy<{ code: number; balance: number }>(
      vendor.api_base_url, '/partner/balance', vendor.opcode, vendor.secret_key, null
    );
    const balance = data.balance ?? 0;
    await supabase
      .from('game_vendors')
      .update({ total_balance: balance, balance_checked_at: new Date().toISOString() })
      .eq('id', vendor.id);
    await syncOperatorBalance(vendor.vendor_key, balance);
    return balance;
  },

  // 벤더(제공사) 목록 조회 (/vendors) — body 없음
  async fetchProvidersFromApi(vendor: GameVendor): Promise<{ created: number; skipped: number; providers: AceProvider[] }> {
    const data = await callAceProxy<{ code: number; vendors: any[] }>(
      vendor.api_base_url, '/vendors', vendor.opcode, vendor.secret_key, null
    );

    const vendorList: any[] = data.vendors || [];
    let created = 0, skipped = 0;
    const result: AceProvider[] = [];

    // ACE category 추론: casino / slot / sports / lottery
    for (const v of vendorList) {
      const vendorKey: string = v.key ?? v.vendorKey ?? String(v.row_num);
      const vendorName: string = v.name ?? vendorKey;
      const rawCategory = (v.category ?? '').toString().toLowerCase();
      const category: 'casino' | 'slot' | 'sports' | 'lottery' =
        rawCategory.includes('casino') || rawCategory.includes('live') ? 'casino' :
        rawCategory.includes('sport') ? 'sports' :
        rawCategory.includes('lottery') || rawCategory.includes('lotto') ? 'lottery' :
        'slot';

      const { data: existing } = await supabase
        .from('game_provider_ace')
        .select('*')
        .eq('vendor_id', vendor.id)
        .eq('vendor_key', vendorKey)
        .maybeSingle();

      if (existing) {
        skipped++;
        result.push(existing);
      } else {
        const { data: newProv, error } = await supabase
          .from('game_provider_ace')
          .insert({
            vendor_id: vendor.id,
            vendor_key: vendorKey,
            vendor_name: vendorName,
            category,
            is_active: true,
            metadata: { skins: v.skins ?? [], row_num: v.row_num },
          })
          .select()
          .single();
        if (!error && newProv) {
          created++;
          result.push(newProv);
        }
      }
    }

    return { created, skipped, providers: result };
  },

  // 카지노 제공사: /games API 미호출, skins 메타데이터로 게임 목록 관리
  // ace-api-info.md: 카지노 게임실행 시 gameKey에 스킨(A/B/C/D/E...)을 입력
  // game_name_ko = 제공사명, game_name_en = 벤더키, game_type = 한도 범위, game_key = 스킨 코드
  async syncCasinoSkinsForProvider(
    provider: AceProvider,
    vendor: GameVendor
  ): Promise<{ added: number; updated: number }> {
    const skins: AceVendorSkin[] = provider.metadata?.skins ?? [];
    const now = new Date().toISOString();

    // 기존 게임 행 전체 삭제 후 스킨 행만 재등록 (개별 게임 잔재 제거)
    await supabase.from('game_ace').delete().eq('provider_id', provider.id);

    let added = 0;

    for (const s of skins) {
      const skinCode = s.skin;
      if (!skinCode) continue;

      await supabase.from('game_ace').insert({
        provider_id: provider.id,
        game_key: skinCode,
        game_id: null,
        skin: skinCode,
        game_name_ko: provider.vendor_name,   // 제공사명 (예: 에볼루션 카지노)
        game_name_en: provider.vendor_key,    // 벤더키 (예: evolution_casino)
        platform: null,
        category: 'casino',
        game_type: s.name ?? skinCode,        // 한도 범위 (예: 10,000 ~ 10,000,000 ₩)
        thumbnail_url: null,
        status: 'active',
        metadata: { skin: skinCode, limit: s.name, vendorKey: provider.vendor_key },
        synced_at: now,
      });
      added++;
    }

    await supabase
      .from('game_provider_ace')
      .update({ category: 'casino', synced_at: now })
      .eq('id', provider.id);

    return { added, updated: 0 };
  },

  // 게임 목록 조회 및 DB 저장 (/games) — 슬롯 전용
  // 카지노 category는 /games 미호출, syncCasinoSkinsForProvider 사용
  async syncGamesForProvider(
    provider: AceProvider,
    vendor: GameVendor,
    skin?: string
  ): Promise<{ added: number; updated: number }> {
    if (provider.category === 'casino') {
      return aceVendorService.syncCasinoSkinsForProvider(provider, vendor);
    }

    const body: Record<string, any> = { vendorKey: provider.vendor_key };
    if (skin) body.skin = skin;

    const data = await callAceProxy<{ code: number; games: any[] }>(
      vendor.api_base_url, '/games', vendor.opcode, vendor.secret_key, body
    );

    const games: any[] = data.games || [];
    let added = 0, updated = 0;
    let detectedCategory: string | null = null;

    for (const g of games) {
      const gameKey: string = g.key ?? g.gameKey ?? String(g.id);
      const gameId: string | null = g.id != null ? String(g.id) : null;
      const gameSkin: string | null = g.skin ?? null;
      const nameKo: string | null = g.names?.ko ?? g.name ?? null;
      const nameEn: string | null = g.names?.en ?? null;
      const platform: string | null = g.platform ?? null;
      const rawCat = (g.category ?? '').toString().toLowerCase();
      const category: string =
        rawCat.includes('casino') || rawCat.includes('live') ? 'casino' :
        rawCat.includes('sport') ? 'sports' :
        rawCat.includes('lottery') || rawCat.includes('lotto') ? 'lottery' :
        'slot';
      const gameType: string | null = g.type ?? null;
      const thumbnail: string | null = g.image ?? null;

      if (detectedCategory === null) detectedCategory = category;

      const { data: existing } = await supabase
        .from('game_ace')
        .select('id')
        .eq('provider_id', provider.id)
        .eq('game_key', gameKey)
        .maybeSingle();

      if (existing) {
        await supabase.from('game_ace').update({
          game_id: gameId,
          skin: gameSkin,
          game_name_ko: nameKo,
          game_name_en: nameEn,
          platform,
          category,
          game_type: gameType,
          thumbnail_url: thumbnail,
          metadata: g,
          synced_at: new Date().toISOString(),
        }).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('game_ace').insert({
          provider_id: provider.id,
          game_key: gameKey,
          game_id: gameId,
          skin: gameSkin,
          game_name_ko: nameKo,
          game_name_en: nameEn,
          platform,
          category,
          game_type: gameType,
          thumbnail_url: thumbnail,
          status: 'active',
          metadata: g,
          synced_at: new Date().toISOString(),
        });
        added++;
      }
    }

    // 제공사 category 업데이트
    await supabase
      .from('game_provider_ace')
      .update({
        ...(detectedCategory ? { category: detectedCategory } : {}),
        synced_at: new Date().toISOString(),
      })
      .eq('id', provider.id);

    return { added, updated };
  },

  // 벤더의 전체 제공사 게임 동기화
  async syncAllGames(vendorId: string, vendor: GameVendor): Promise<{ providerCount: number; added: number; updated: number; errors: string[] }> {
    const providers = await aceProviderService.getAll(vendorId);
    let added = 0, updated = 0;
    const errors: string[] = [];

    for (const p of providers) {
      try {
        const r = await aceVendorService.syncGamesForProvider(p, vendor);
        added += r.added;
        updated += r.updated;
      } catch (e: any) {
        errors.push(`${p.vendor_name}: ${e.message}`);
      }
    }

    return { providerCount: providers.length, added, updated, errors };
  },

  // 회원 등록 (/register)
  async registerMember(
    vendor: GameVendor,
    params: { username: string; nickname: string; siteUsername: string }
  ): Promise<void> {
    await callAceProxy(
      vendor.api_base_url, '/register', vendor.opcode, vendor.secret_key, params
    );
  },

  // 게임 실행 URL 획득 (/play)
  async launchGame(
    vendor: GameVendor,
    params: {
      vendorKey: string;
      gameKey: string;
      siteUsername: string;
      nickname?: string;
      ip: string;
      language?: string;
      platform?: string;
      requestKey: string;
    }
  ): Promise<{ url: string; balance: number; userId: number }> {
    const data = await callAceProxy<{ code: number; url: string; balance: number; userId: number }>(
      vendor.api_base_url, '/play', vendor.opcode, vendor.secret_key, params
    );
    return { url: data.url, balance: data.balance, userId: data.userId };
  },

  // 회원 잔액 조회 (/balance)
  async getMemberBalance(vendor: GameVendor, siteUsername: string): Promise<number> {
    const body = { siteUsername };
    const data = await callAceProxy<{ code: number; balance: number }>(
      vendor.api_base_url, '/balance', vendor.opcode, vendor.secret_key, body
    );
    return data.balance ?? 0;
  },

  // 회원 입금 (/deposit) — 플랫폼 잔액 → ACE 게임 충전
  async depositMember(
    vendor: GameVendor,
    siteUsername: string,
    amount: number,
    requestKey: string
  ): Promise<number> {
    const body = { siteUsername, amount, cashtype: 'cash', requestKey };
    const data = await callAceProxy<{ code: number; balance: number }>(
      vendor.api_base_url, '/deposit', vendor.opcode, vendor.secret_key, body
    );
    return data.balance ?? 0;
  },

  // 회원 출금 (/withdraw) — ACE 게임 잔액 전액 회수 (amount=0 → 전액)
  async withdrawMember(
    vendor: GameVendor,
    siteUsername: string,
    requestKey: string
  ): Promise<number> {
    const body = { siteUsername, amount: 0, cashtype: 'cash', requestKey };
    const data = await callAceProxy<{ code: number; balance: number; amount: number }>(
      vendor.api_base_url, '/withdraw', vendor.opcode, vendor.secret_key, body
    );
    return data.amount ?? 0;
  },

  // 베팅 내역 조회 (/transaction) — sdate 이후 최대 limit건
  async getTransactions(
    vendor: GameVendor,
    params: {
      sdate?: string;   // UTC ISO 8601 (예: 2026-06-17T14:02:42.927Z)
      edate?: string;
      vendorKey?: string;
      username?: string;
      limit?: number;   // 100 ~ 2000, default 100
    } = {}
  ): Promise<{ transactions: any[]; lastObjectId: string | null }> {
    const body: Record<string, any> = { limit: params.limit ?? 100 };
    if (params.sdate)     body.sdate     = params.sdate;
    if (params.edate)     body.edate     = params.edate;
    if (params.vendorKey) body.vendorKey = params.vendorKey;
    if (params.username)  body.username  = params.username;

    const data = await callAceProxy<{
      code: number;
      transactions: any[];
      lastObjectId?: string;
    }>(vendor.api_base_url, '/transaction', vendor.opcode, vendor.secret_key, body);

    return {
      transactions: data.transactions ?? [],
      lastObjectId: data.lastObjectId ?? null,
    };
  },

  // 베팅 내역 DB 동기화 — /transaction 결과를 betting_history_ace 에 upsert
  // turn_bet 트랜잭션은 bet_amount 로, turn_win 트랜잭션은 기존 라운드의 win_amount 를 갱신
  async syncBettingHistory(
    vendor: GameVendor,
    options: { sdate?: string; edate?: string; limit?: number } = {}
  ): Promise<{ inserted: number; updated: number; errors: string[] }> {
    const { transactions } = await aceVendorService.getTransactions(vendor, options);

    let inserted = 0;
    let updated  = 0;
    const errors: string[] = [];

    for (const tx of transactions) {
      try {
        const siteUsername: string = tx.siteUsername ?? tx.username ?? '';

        // 유저 조회 (siteUsername = users.username)
        const { data: userRow } = await supabase
          .from('users')
          .select('id, username')
          .eq('username', siteUsername)
          .maybeSingle();

        if (!userRow) {
          errors.push(`유저 없음: ${siteUsername} (txid: ${tx._id})`);
          continue;
        }

        const isBet = tx.type === 'turn_bet';
        const isWin = tx.type === 'turn_win';

        if (isWin) {
          // win 트랜잭션: round_id(=tx.key) 기준으로 기존 레코드에 win_amount 갱신
          const { data: existing } = await supabase
            .from('betting_history_ace')
            .select('id, win_amount')
            .eq('round_id', tx.key)
            .eq('user_id', userRow.id)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('betting_history_ace')
              .update({
                win_amount:   Number(tx.cash ?? 0) + Number(tx.updepositCash ?? 0),
                round_status: 'settled',
                settle_time:  tx.utcCreatedAt ?? null,
                synced_at:    new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (error) errors.push(`win 갱신 실패 (${tx._id}): ${error.message}`);
            else updated++;
            continue;
          }
          // 대응 bet 레코드가 없으면 win도 독립 레코드로 삽입
        }

        const record = {
          txid:          String(tx._id),
          user_id:       userRow.id,
          username:      siteUsername,
          provider_id:   String(tx.vendorId   ?? ''),
          provider_name: tx.vendorName ?? tx.vendorKey ?? '',
          game_id:       tx.gameId    ?? tx.gameKey ?? '',
          game_name:     tx.gameName  ?? '',
          game_type:     tx.gameType  ?? '',
          game_category: tx.gameCategory ?? '',
          bet_amount:    isBet ? Number(tx.cash ?? 0) : 0,
          win_amount:    isWin ? Number(tx.cash ?? 0) + Number(tx.updepositCash ?? 0) : 0,
          round_id:      tx.key       ?? null,
          round_status:  isBet ? 'betting' : (isWin ? 'settled' : tx.type ?? ''),
          ref_id:        tx.refId     ?? null,
          is_bonus:      tx.isBonus   ?? false,
          is_promo:      tx.isPromo   ?? false,
          is_jackpot:    tx.isJackpot ?? false,
          bet_time:      isBet ? (tx.utcCreatedAt ?? null) : null,
          settle_time:   isWin ? (tx.utcCreatedAt ?? null) : null,
          raw_data:      tx,
          synced_at:     new Date().toISOString(),
        };

        const { error } = await supabase
          .from('betting_history_ace')
          .upsert(record, { onConflict: 'txid' });

        if (error) errors.push(`upsert 실패 (${tx._id}): ${error.message}`);
        else inserted++;
      } catch (e: any) {
        errors.push(`처리 오류 (${tx._id}): ${e.message}`);
      }
    }

    return { inserted, updated, errors };
  },
};

// ─── INVEST Vendor Service ───────────────────────────────────
// 인증: MD5 signature (opcode + username + token + [amount +] secret_key)
// invest-api.md: /account/balance GET/POST/PUT

export const investVendorService = {
  // 계정 잔고 조회 (GET /account/balance)
  async getBalance(vendor: GameVendor, username: string, token: string): Promise<number> {
    const signature = md5(vendor.opcode, username, token, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/account/balance', 'GET', {
      opcode: vendor.opcode, username, token, signature,
    });
    if (!result.RESULT) throw new Error(result.message ?? '잔고 조회 실패');
    return Number(result.DATA?.Balance ?? result.DATA?.balance ?? 0);
  },

  // 계정 잔고 입금 (POST /account/balance)
  async depositBalance(vendor: GameVendor, username: string, token: string, amount: number): Promise<number> {
    const signature = md5(vendor.opcode, username, token, amount, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/account/balance', 'POST', {
      opcode: vendor.opcode, username, token, amount, signature,
    });
    if (!result.RESULT) throw new Error(result.message ?? '잔고 입금 실패');
    return Number(result.DATA?.Balance ?? result.DATA?.balance ?? 0);
  },

  // 계정 잔고 출금 (PUT /account/balance)
  async withdrawBalance(vendor: GameVendor, username: string, token: string, amount: number): Promise<number> {
    const signature = md5(vendor.opcode, username, token, amount, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/account/balance', 'PUT', {
      opcode: vendor.opcode, username, token, amount, signature,
    });
    if (!result.RESULT) throw new Error(result.message ?? '잔고 출금 실패');
    return Number(result.DATA?.amount ?? result.DATA?.Amount ?? 0);
  },
};

// ─── Game Launch Service ─────────────────────────────────────
// dev1 : 게임 실행 테스트 전용 계정 (회원 관리 대상 아님)
const DEV_USERNAME = 'dev1';

export const gameLaunchService = {
  async getToken(vendor: GameVendor): Promise<string> {
    const signature = md5(vendor.opcode, DEV_USERNAME, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/account', 'POST', {
      opcode: vendor.opcode,
      username: DEV_USERNAME,
      signature,
    });
    if (!result.RESULT) throw new Error(result.message || '계정 API 실패');
    const token = result.DATA?.token ?? result.DATA?.Token ?? result.DATA?.TOKEN;
    if (!token) throw new Error('토큰을 받을 수 없습니다.');
    return String(token);
  },

  async launch(vendor: GameVendor, token: string, gameId: number): Promise<string> {
    const signature = md5(vendor.opcode, DEV_USERNAME, token, gameId, vendor.secret_key);
    const result = await callProxy(vendor.api_base_url, '/game/launch', 'POST', {
      opcode: vendor.opcode,
      username: DEV_USERNAME,
      token,
      game: gameId,
      signature,
    });
    if (!result.RESULT) throw new Error(result.message || '게임 실행 실패');
    const url = result.DATA?.url ?? result.DATA?.URL ?? result.DATA?.game_url ?? result.DATA?.launchUrl;
    if (!url) throw new Error('게임 URL을 받을 수 없습니다.');
    return String(url);
  },
};

