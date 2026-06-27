import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Gamepad2, Play, Grid3x3, List } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CryptoJS from 'crypto-js';

const PROXY_URL = 'https://vi8282.com/proxy';

function md5(...parts: (string | number)[]): string {
  return CryptoJS.MD5(parts.join('')).toString().toLowerCase();
}

function sha256Base64(body: Record<string, any> | null, secretKey: string): string {
  const jsonString = body && Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  return CryptoJS.SHA256(jsonString + secretKey).toString(CryptoJS.enc.Base64);
}

async function callProxy<T = any>(
  apiBaseUrl: string, endpoint: string, method: 'GET' | 'POST', body: Record<string, any>
): Promise<{ RESULT: boolean; DATA?: T; message?: string }> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${apiBaseUrl}${endpoint}`, method, headers: { 'Content-Type': 'application/json' }, body }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}`);
  return res.json();
}

async function callAceProxy<T = any>(
  apiBaseUrl: string, endpoint: string, agent: string, secretKey: string,
  body: Record<string, any> | null = null
): Promise<T> {
  const hash = sha256Base64(body, secretKey);
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${apiBaseUrl}${endpoint}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', agent, hash },
      body: body
        ? Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
        : '',
    }),
  });
  if (!res.ok) throw new Error(`Proxy error ${res.status}`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.msg || `ACE API 오류 (code: ${data.code})`);
  return data as T;
}

interface Game {
  id: string;
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type?: string;
  thumbnail_url?: string;
  status: string;
  rtp?: number;
  metadata: Record<string, any>;
}

interface GameVendor {
  id: string;
  vendor_key: string;
  api_base_url: string;
  opcode: string;
  secret_key: string;
}

interface GameListProps {
  userId?: string;
  userName?: string;
}

export default function GameList({ userId, userName }: GameListProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [launchingGame, setLaunchingGame] = useState<string | null>(null);
  const tokenCache = useRef<Record<string, string>>({});
  const aceRegisterCache = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadAllGames();
  }, []);

  const loadAllGames = async () => {
    try {
      setLoading(true);

      const { data: investProviders } = await supabase
        .from('game_provider_invest')
        .select('id')
        .eq('is_active', true);

      const investProviderIds = (investProviders ?? []).map((p: any) => p.id);

      const [investRes, aceRes] = await Promise.all([
        investProviderIds.length > 0
          ? supabase.from('game_invest').select('*').eq('status', 'active').in('provider_id', investProviderIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('game_ace').select('*, provider:game_provider_ace(vendor_key)').eq('status', 'active'),
      ]);

      const investGames: Game[] = (investRes.data ?? []).map((g: any) => ({
        id: g.id,
        provider_id: g.provider_id,
        game_code: g.game_code,
        game_name: g.game_name,
        game_type: g.game_type,
        thumbnail_url: g.thumbnail_url,
        status: g.status,
        rtp: g.rtp,
        metadata: { ...(g.metadata ?? {}), _invest: true },
      }));

      const aceGames: Game[] = (aceRes.data ?? []).map((g: any) => ({
        id: g.id,
        provider_id: g.provider_id,
        game_code: g.game_key,
        game_name: g.game_name_ko || g.game_name_en || g.game_key,
        game_type: g.category,
        thumbnail_url: g.thumbnail_url,
        status: g.status,
        rtp: undefined,
        metadata: { ...(g.metadata ?? {}), _ace: true, _vendorKey: g.provider?.vendor_key ?? '' },
      }));

      setGames([...investGames, ...aceGames].filter((g) => g.status === 'active'));
    } catch (error) {
      console.error(error);
      toast.error('게임 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const launchGame = async (game: Game) => {
    if (!userId) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    const siteUsername = userName || userId;

    try {
      setLaunchingGame(game.id);

      if (game.metadata?._ace) {
        // ACE 게임 실행
        const { data: aceVendor } = await supabase
          .from('game_vendors').select('*').eq('vendor_key', 'ace').maybeSingle<GameVendor>();
        if (!aceVendor) throw new Error('ACE 게임사 정보를 찾을 수 없습니다.');

        const vendorKey = game.metadata?._vendorKey as string;
        if (!vendorKey) throw new Error('ACE 제공사 키를 찾을 수 없습니다.');

        // 유저 등록 (이미 등록된 경우 무시)
        if (!aceRegisterCache.current.has(aceVendor.id)) {
          try {
            await callAceProxy(
              aceVendor.api_base_url, '/register', aceVendor.opcode, aceVendor.secret_key,
              { username: siteUsername, nickname: siteUsername, siteUsername }
            );
          } catch (regErr: any) {
            if (!regErr.message?.includes('ALREADY_USER_EXISTS')) throw regErr;
          }
          aceRegisterCache.current.add(aceVendor.id);
        }

        const requestKey = `${siteUsername}-${Date.now()}`;
        const res = await callAceProxy<{ code: number; url: string }>(
          aceVendor.api_base_url, '/play', aceVendor.opcode, aceVendor.secret_key,
          { vendorKey, gameKey: game.game_code, siteUsername, nickname: siteUsername, ip: '127.0.0.1', language: 'ko', platform: 'desktop', requestKey }
        );
        if (res.url) {
          window.open(res.url, '_blank', 'width=1280,height=720');
        } else {
          throw new Error('게임 URL을 받을 수 없습니다.');
        }
      } else {
        // Invest / Honor 게임 실행
        const { data: provRow } = await supabase
          .from('game_provider_invest')
          .select('*, vendor:game_vendors(*)')
          .eq('id', game.provider_id)
          .maybeSingle<any>();
        if (!provRow?.vendor) throw new Error('게임사 정보를 찾을 수 없습니다.');
        const vendor: GameVendor = provRow.vendor;

        const gameNumId = parseInt(game.game_code.split('_').slice(1).join('_'), 10);
        if (isNaN(gameNumId)) throw new Error('게임 ID를 파악할 수 없습니다.');

        if (!tokenCache.current[vendor.id]) {
          const sig = md5(vendor.opcode, siteUsername, vendor.secret_key);
          const tokenRes = await callProxy(vendor.api_base_url, '/account', 'POST',
            { opcode: vendor.opcode, username: siteUsername, signature: sig }
          );
          if (!tokenRes.RESULT) throw new Error(tokenRes.message ?? '토큰 발급 실패');
          const token = tokenRes.DATA?.token ?? tokenRes.DATA?.Token ?? tokenRes.DATA?.TOKEN;
          if (!token) throw new Error('토큰을 받을 수 없습니다.');
          tokenCache.current[vendor.id] = String(token);
        }

        const token = tokenCache.current[vendor.id];
        const sig2 = md5(vendor.opcode, siteUsername, token, gameNumId, vendor.secret_key);
        const launchRes = await callProxy(vendor.api_base_url, '/game/launch', 'POST', {
          opcode: vendor.opcode, username: siteUsername, token, game: gameNumId, signature: sig2,
        });
        if (!launchRes.RESULT) {
          delete tokenCache.current[vendor.id];
          throw new Error(launchRes.message ?? '게임 실행 실패');
        }
        const url = launchRes.DATA?.url ?? launchRes.DATA?.URL ?? launchRes.DATA?.game_url;
        if (url) {
          window.open(url, '_blank', 'width=1280,height=720');
        } else {
          throw new Error('게임 URL을 받을 수 없습니다.');
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`게임 실행 실패: ${error.message}`);
    } finally {
      setLaunchingGame(null);
    }
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = game.game_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'all' || game.game_type === selectedType;
    return matchesSearch && matchesType;
  });

  const gameTypes = Array.from(new Set(games.map(g => g.game_type).filter(Boolean)));

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-slate-400">게임 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <Gamepad2 size={32} />
          BENZ CASINO
        </h1>
        <p className="text-slate-400 text-sm mt-2">최고의 게임 경험을 제공합니다</p>
      </div>

      {/* 필터 및 검색 */}
      <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex gap-2 overflow-x-auto w-full md:w-auto">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                selectedType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              전체
            </button>
            {gameTypes.map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type as string)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap capitalize ${
                  selectedType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="게임 검색..."
              className="flex-1 md:w-64 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500"
            />
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
            >
              {viewMode === 'grid' ? <List size={20} /> : <Grid3x3 size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* 게임 목록 */}
      {filteredGames.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-12 text-center border border-slate-700">
          <Gamepad2 size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400">검색 결과가 없습니다</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredGames.map((game) => (
            <div
              key={game.id}
              className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-blue-500 transition-all group"
            >
              <div className="relative aspect-square">
                {game.thumbnail_url ? (
                  <img
                    src={game.thumbnail_url}
                    alt={game.game_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                    <Gamepad2 size={48} className="text-slate-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all flex items-center justify-center">
                  <button
                    onClick={() => launchGame(game)}
                    disabled={launchingGame === game.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <Play size={18} />
                    {launchingGame === game.id ? '실행 중...' : '게임 시작'}
                  </button>
                </div>
                {game.rtp && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-green-600 text-white text-xs rounded">
                    RTP {game.rtp}%
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-medium text-slate-100 text-sm truncate">{game.game_name}</h3>
                <p className="text-xs text-slate-400 mt-1 capitalize">{game.game_type || '카지노'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">게임</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">타입</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">RTP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredGames.map((game) => (
                  <tr key={game.id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {game.thumbnail_url ? (
                          <img src={game.thumbnail_url} alt={game.game_name} className="w-12 h-12 rounded object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-slate-700 flex items-center justify-center">
                            <Gamepad2 size={20} className="text-slate-500" />
                          </div>
                        )}
                        <span className="text-slate-100">{game.game_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 capitalize">{game.game_type || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{game.rtp ? `${game.rtp}%` : '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => launchGame(game)}
                        disabled={launchingGame === game.id}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 text-sm"
                      >
                        <Play size={16} />
                        {launchingGame === game.id ? '실행 중...' : '시작'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
