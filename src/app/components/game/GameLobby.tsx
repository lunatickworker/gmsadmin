import { useState, useEffect, useRef } from 'react';
import {
  LogOut, Wallet, Loader2, AlertCircle,
  ExternalLink, X, Bell,
  PlusCircle, MinusCircle, UserCog, Gamepad2, ChevronLeft,
  ChevronDown, Mail, Star, Trophy, Ticket, ArrowRightLeft, Receipt, Headphones,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import CryptoJS from 'crypto-js';
import GameLoginModal from './GameLogin';
import { honorVendorService, aceVendorService, investVendorService, gameVendorService, deductVendorBalanceOnCharge } from '../../../utils/game-management';
import DepositPage from './DepositPage';
import WithdrawPage from './WithdrawPage';
import PointPage from './PointPage';
import BettingHistoryPage from './BettingHistoryPage';
import CustomerSupportPage from './CustomerSupportPage';
import NoticePage from './NoticePage';
import MessagePage from './MessagePage';
import { api } from '../../../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameLobbyProps {
  user: { id: string; username: string; name: string } | null;
  balance: number;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onLogout: () => void;
  onSignup: () => void;
}

interface GameVendor {
  id: string;
  vendor_key: string;
  vendor_name: string;
  api_base_url: string;
  opcode: string;
  secret_key: string;
  is_active: boolean;
}

interface GameProvider {
  id: string;
  vendor_id: string;
  provider_id: number;
  provider_name: string;
  category: 'casino' | 'slot' | 'sports' | 'lottery';
  is_active: boolean;
  thumbnail_url?: string | null;
  vendor?: GameVendor;
  ace_vendor_key?: string; // game_provider_ace.vendor_key (게임 실행용 vendorKey)
}

interface GameItem {
  id: string;
  provider_id: string;
  game_code: string;
  game_name: string;
  game_type: 'casino' | 'slot' | null;
  thumbnail_url: string | null;
  status: 'active' | 'inactive';
  min_bet: number | null;
  max_bet: number | null;
  metadata: Record<string, any>;
}

interface ProviderWithGames extends GameProvider {
  games: GameItem[];
}

interface MergedProvider extends ProviderWithGames {
  _sources: ProviderWithGames[];
}

interface LaunchModal {
  game: GameItem;
  provider: ProviderWithGames;
  launchUrl: string | null;
  loading: boolean;
  error: string | null;
  openedInNewTab?: boolean;
}

type VendorType = 'ace' | 'honor' | 'invest';

interface ActiveSession {
  vendor: GameVendor;
  vendorType: VendorType;
  username: string;
  token?: string;
  cashout_token: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 30_000;
const PROXY_URL = 'https://vi8282.com/proxy';
export const ACTIVE_GAME_SESSION_KEY = 'benz_active_game_session';
const BASE = 'https://iqkgwsdgxmxxvpydrlrm.supabase.co/storage/v1/object/public/casino';

const IMG = {
  logo:         `${BASE}/images/Benz%20logo.png`,
  heroBg:       `${BASE}/images/casino_background_1.png`,
  bannerText:   `${BASE}/images/Banner-Text.png`,
  casinoHeader: `${BASE}/images/Casino-game-list.png`,
  slotHeader:   `${BASE}/images/Slot-game-list.png`,
  bottomBanner: `${BASE}/images/Gaming_bottom.png`,
  liveCasinoBg: `${BASE}/images/live_casino_bg.png`,
  slotBg:       `${BASE}/images/slot_game_bg.png`,
  menuBg:       `${BASE}/images/Menu-bg.png`,
  menuLine:     `${BASE}/images/Menu-line.png`,
  menuItem:     `${BASE}/images/Menu.png`,
};


const SIDEBAR_MENU = [
  { id: 'casino',   label: '카지노',       icon: Gamepad2,   hasArrow: true,  authRequired: false },
  { id: 'slot',     label: '슬롯',         icon: Gamepad2,   hasArrow: true,  authRequired: false },
  { id: 'deposit',  label: '입금',         icon: PlusCircle, hasArrow: false, authRequired: true  },
  { id: 'withdraw', label: '출금',         icon: MinusCircle,hasArrow: false, authRequired: true  },
  { id: 'betting',  label: '베팅내역',     icon: Receipt,    hasArrow: false, authRequired: true  },
  { id: 'notice',   label: '공지사항',     icon: Bell,       hasArrow: false, authRequired: false },
  { id: 'point',    label: '포인트',       icon: Star,       hasArrow: false, authRequired: true  },
  { id: 'message',  label: '쪽지관리',     icon: Mail,        hasArrow: false, authRequired: true  },
  { id: 'support',  label: '고객센터',     icon: Headphones,  hasArrow: false, authRequired: true  },
  { id: 'profile',  label: '회원정보수정', icon: UserCog,     hasArrow: false, authRequired: true  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function md5(...parts: (string | number)[]): string {
  return CryptoJS.MD5(parts.join('')).toString().toLowerCase();
}

function sha256Base64(body: Record<string, any> | null, secretKey: string): string {
  const jsonString = body && Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  return CryptoJS.SHA256(jsonString + secretKey).toString(CryptoJS.enc.Base64);
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

// ─── Play Now Button ──────────────────────────────────────────────────────────

function PlayNowButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: 87,
        top: '66.6%',
        width: '225px',
        height: '48px',
        border: '0px solid #c9a227',
        background: hovered ? '#c9a227' : 'transparent',
        color: hovered ? '#000' : 'transparent',
        fontWeight: 700,
        fontSize: '13px',
        letterSpacing: '0.25em',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hovered ? '0 0 36px rgba(201,162,39,0.55)' : 'none',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
        zIndex: 10,
      }}
    >
      PLAY NOW
    </button>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onClick,
}: {
  provider: ProviderWithGames;
  onClick: () => void;
}) {
  const imgSrc = provider.thumbnail_url ?? null;

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:scale-[1.04] w-full"
      style={{ aspectRatio: '1/1' }}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={provider.provider_name} className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1c1505] via-[#120f04] to-[#080600]">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #c9a227 0, #c9a227 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[#c9a227]/60 text-xl font-black tracking-tight group-hover:text-[#c9a227]/90 transition-colors drop-shadow-lg px-3 text-center leading-tight">
              {provider.provider_name}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

function hasProviderImage(provider: ProviderWithGames): boolean {
  return !!provider.thumbnail_url;
}

// ─── Game Card ────────────────────────────────────────────────────────────────

function GameCard({
  game,
  launching,
  onSelect,
}: {
  game: GameItem;
  launching?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group relative overflow-hidden rounded-lg transition-all duration-300 hover:scale-[1.03] aspect-[4/3]"
    >
      <div className="absolute inset-0 bg-[#0d0d0d]" />
      {game.thumbnail_url ? (
        <img src={game.thumbnail_url} alt={game.game_name} className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a150a] to-[#0d0d0d]" />
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-2.5 bg-black/50">
        <p className="text-white text-[15px] font-bold leading-tight drop-shadow truncate">{game.game_name}</p>
      </div>
      {launching && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 size={20} className="text-[#c9a227] animate-spin" />
        </div>
      )}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameLobby({ user, balance, onLogin, onLogout, onSignup }: GameLobbyProps) {
  const [providers, setProviders] = useState<ProviderWithGames[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithGames | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null);
  const [launchModal, setLaunchModal] = useState<LaunchModal | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string>('');
  const [localBalance, setLocalBalance] = useState(balance);
  const [localPoints, setLocalPoints] = useState(0);
  const [convertingPoints, setConvertingPoints] = useState(false);
  const [closingGame, setClosingGame] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [gameSearch, setGameSearch] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [bannerPopups, setBannerPopups] = useState<any[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(() => {
    try {
      const today = new Date().toDateString();
      const stored = localStorage.getItem(`benz_dismissed_banners_${today}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const tokenCache = useRef<Record<string, string>>({});
  const aceRegisterCache = useRef<Set<string>>(new Set());
  const activeSession = useRef<ActiveSession | null>(null);
  const gameWindowRef = useRef<Window | null>(null);
  const casinoRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const sportsRef = useRef<HTMLDivElement>(null);
  const lotteryRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalBalance(balance); }, [balance]);

  // 게임 탭이 닫히면 자동으로 정산 처리
  useEffect(() => {
    if (!launchModal?.openedInNewTab) return;
    const interval = setInterval(() => {
      if (gameWindowRef.current?.closed) {
        clearInterval(interval);
        gameWindowRef.current = null;
        handleModalClose();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [launchModal?.openedInNewTab]);

  // 로그인 직후 잔액이 0이면 게임 세션 비정상 종료 가능성 안내
  useEffect(() => {
    if (!user || balance > 0) return;
    supabase.from('users').select('balance').eq('id', user.id).single().then(({ data }) => {
      if (Number(data?.balance ?? 0) === 0) {
        toast('보유금이 0원입니다. 게임 도중 세션이 끊긴 경우 잔액 복구가 필요하면 고객센터로 문의하세요.', { duration: 6000 });
      }
    });
  }, [user?.id]);

  // 포인트 로드
  useEffect(() => {
    if (!user) { setLocalPoints(0); return; }
    supabase.from('users').select('points').eq('id', user.id).single()
      .then(({ data }) => setLocalPoints(Number(data?.points ?? 0)));
  }, [user?.id]);

  // 로그인 직후 읽지 않은 쪽지 수 조회 (쪽지관리 페이지 방문 없이도 알림 표시)
  useEffect(() => {
    if (!user) { setUnreadMessages(0); return; }
    api.getMessages(user.id)
      .then(res => {
        const data = res.data || [];
        setUnreadMessages(data.filter((m: any) => !m.is_read).length);
      })
      .catch(() => {});
  }, [user?.id]);

  // 배너 팝업 로드
  useEffect(() => {
    api.getBanners({ active: true, position: 'popup' })
      .then(res => setBannerPopups(res.data || []))
      .catch(() => {});
  }, []);

  const handleConvertPointsInHeader = async () => {
    if (!user || localPoints <= 0 || convertingPoints) return;
    setConvertingPoints(true);
    try {
      const { data: userRow } = await supabase.from('users').select('balance, points').eq('id', user.id).single();
      if (!userRow) throw new Error('사용자 정보를 불러올 수 없습니다.');
      const pts = Number(userRow.points);
      if (pts <= 0) { toast.error('전환할 포인트가 없습니다.'); return; }
      const newBalance = Number(userRow.balance) + pts;
      const txNo = `PNT${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await supabase.from('points_history').insert({
        transaction_no: txNo, user_id: user.id, type: 'convert_to_money',
        amount: pts, balance_before: pts, balance_after: 0,
        processed_by: user.id, converted_money_amount: pts, reason: '사용자 보유금 전환',
      });
      await supabase.from('users').update({ points: 0, balance: newBalance }).eq('id', user.id);
      setLocalPoints(0);
      setLocalBalance(newBalance);
      toast.success(`${pts.toLocaleString()}P가 보유금으로 전환되었습니다.`);
    } catch (e: any) {
      toast.error('전환 실패: ' + e.message);
    } finally {
      setConvertingPoints(false);
    }
  };

  // heartbeat는 App.tsx에서 전역으로 관리 (중복 제거)

  const fetchAllowedVendorKeys = async (memberId: string): Promise<string[]> => {
    try {
      const { data: userRow } = await supabase.from('users').select('hierarchy_path').eq('id', memberId).single();
      if (!userRow?.hierarchy_path?.length) return [];
      const { data: opRow } = await supabase.from('users').select('id').eq('role', 'operator').in('id', userRow.hierarchy_path).maybeSingle();
      if (!opRow?.id) return [];
      const { data: settings } = await supabase.from('partner_settings').select('game_vendor_keys').eq('user_id', opRow.id).maybeSingle();
      return settings?.game_vendor_keys ?? [];
    } catch { return []; }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const allowedKeys = user ? await fetchAllowedVendorKeys(user.id) : [];
        const allProviders: ProviderWithGames[] = [];

        // ── Invest / Honor 계열 제공사 ──────────────────────────────
        const nonAceKeys = allowedKeys.filter(k => k !== 'ace');
        const showInvest = allowedKeys.length === 0 || nonAceKeys.length > 0;
        if (showInvest) {
          const { data: provRows, error: pErr } = await supabase
            .from('game_provider_invest')
            .select('*, vendor:game_vendors(*)')
            .eq('is_active', true)
            .order('provider_name');
          if (pErr) throw new Error(pErr.message);

          const filtered = nonAceKeys.length > 0
            ? (provRows ?? []).filter((p: any) => nonAceKeys.includes(p.vendor?.vendor_key))
            : (provRows ?? []);

          if (filtered.length > 0) {
            const pIds = filtered.map((p: any) => p.id);
            const { data: gRows, error: gErr } = await supabase
              .from('game_invest')
              .select('*')
              .eq('status', 'active')
              .in('provider_id', pIds)
              .order('game_name');
            if (gErr) throw new Error(gErr.message);

            const byProv: Record<string, GameItem[]> = {};
            for (const g of gRows ?? []) {
              if (!byProv[g.provider_id]) byProv[g.provider_id] = [];
              byProv[g.provider_id].push(g);
            }
            allProviders.push(...filtered.map((p: any) => ({
              ...p,
              thumbnail_url: p.metadata?.image_url ?? p.thumbnail_url ?? null,
              games: (byProv[p.id] ?? []).sort((a: any, b: any) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))),
            })));
          }
        }

        // ── HONOR 계열 제공사 ────────────────────────────────────────
        const showHonor = allowedKeys.length === 0 || allowedKeys.includes('honor');
        if (showHonor) {
          const { data: honorVendor } = await supabase
            .from('game_vendors').select('*').eq('vendor_key', 'honor').maybeSingle();

          if (honorVendor) {
            const { data: honorProvRows } = await supabase
              .from('game_provider_honor').select('*')
              .eq('vendor_id', honorVendor.id).eq('is_active', true).order('vendor_name');

            if (honorProvRows && honorProvRows.length > 0) {
              const honorProvIds = honorProvRows.map((p: any) => p.id);
              const { data: honorGameRows } = await supabase
                .from('game_honor').select('*')
                .eq('status', 'active').in('provider_id', honorProvIds).order('title');

              const byHonorProv: Record<string, GameItem[]> = {};
              for (const g of honorGameRows ?? []) {
                if (!byHonorProv[g.provider_id]) byHonorProv[g.provider_id] = [];
                byHonorProv[g.provider_id].push({
                  id: g.id,
                  provider_id: g.provider_id,
                  game_code: `${g.provider_id}_${g.game_id}`,
                  game_name: g.title_ko || g.title || String(g.game_id),
                  game_type: (g.type === 'casino' || g.type === 'slot') ? g.type : null,
                  thumbnail_url: g.thumbnail ?? null,
                  status: g.status,
                  min_bet: null,
                  max_bet: null,
                  metadata: { ...g.metadata, _honor: true, _honorVendor: g.vendor_key, _gameId: g.game_id },
                });
              }

              for (const p of honorProvRows) {
                const cat: 'casino' | 'slot' = (p.category === 'casino' || p.category === 'slot') ? p.category : 'casino';
                allProviders.push({
                  id: p.id, vendor_id: p.vendor_id, provider_id: 0,
                  provider_name: p.vendor_name, category: cat, is_active: p.is_active,
                  thumbnail_url: p.metadata?.image_url ?? null, vendor: honorVendor,
                  metadata: p.metadata ?? {},
                  games: (byHonorProv[p.id] ?? []).sort((a: any, b: any) => ((a.metadata?.sort_order ?? a.rank ?? 9999) - (b.metadata?.sort_order ?? b.rank ?? 9999))),
                } as any);
              }
            }
          }
        }

        // ── ACE 계열 제공사 ─────────────────────────────────────────
        const showAce = allowedKeys.length === 0 || allowedKeys.includes('ace');
        if (showAce) {
          const { data: aceVendor } = await supabase
            .from('game_vendors')
            .select('*')
            .eq('vendor_key', 'ace')
            .maybeSingle();

          if (aceVendor) {
            const { data: aceProvRows } = await supabase
              .from('game_provider_ace')
              .select('*')
              .eq('vendor_id', aceVendor.id)
              .eq('is_active', true)
              .order('vendor_name');

            if (aceProvRows && aceProvRows.length > 0) {
              const aceProvIds = aceProvRows.map((p: any) => p.id);
              const { data: aceGameRows } = await supabase
                .from('game_ace')
                .select('*')
                .eq('status', 'active')
                .in('provider_id', aceProvIds)
                .order('game_name_ko');

              // provider_id → vendor_key 맵 (게임 실행 시 필요)
              const aceProvVendorKeyMap: Record<string, string> = {};
              for (const p of aceProvRows) {
                aceProvVendorKeyMap[p.id] = p.vendor_key;
              }

              const byAceProv: Record<string, GameItem[]> = {};
              for (const g of aceGameRows ?? []) {
                if (!byAceProv[g.provider_id]) byAceProv[g.provider_id] = [];
                byAceProv[g.provider_id].push({
                  id: g.id,
                  provider_id: g.provider_id,
                  game_code: g.game_key,
                  game_name: g.game_name_ko || g.game_name_en || g.game_key,
                  game_type: g.category ?? null,
                  thumbnail_url: g.thumbnail_url ?? null,
                  status: g.status,
                  min_bet: null,
                  max_bet: null,
                  metadata: { ...g.metadata, _ace: true, _vendorKey: aceProvVendorKeyMap[g.provider_id] ?? '' },
                });
              }

              for (const p of aceProvRows) {
                const validCats = ['casino', 'slot', 'sports', 'lottery'] as const;
                const cat = validCats.includes(p.category) ? p.category as typeof validCats[number] : 'casino';
                allProviders.push({
                  id: p.id,
                  vendor_id: p.vendor_id,
                  provider_id: 0,
                  provider_name: p.vendor_name,
                  category: cat,
                  is_active: p.is_active,
                  thumbnail_url: p.metadata?.image_url ?? null,
                  vendor: aceVendor,
                  ace_vendor_key: p.vendor_key,
                  metadata: p.metadata ?? {},
                  games: (byAceProv[p.id] ?? []).sort((a: any, b: any) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))),
                } as any);
              }
            }
          }
        }

        allProviders.sort((a, b) => (((a as any).metadata?.sort_order ?? 9999) - ((b as any).metadata?.sort_order ?? 9999)));
        setProviders(allProviders);
      } catch (e: any) {
        setError(e.message ?? '게임 목록 로드 실패');
      } finally { setLoading(false); }
    };
    load();
  }, [user?.id]);

  // 플랫폼 DB에서 최신 잔액 조회
  const getPlatformBalance = async (): Promise<number> => {
    const { data } = await supabase.from('users').select('balance').eq('id', user!.id).single();
    return Number(data?.balance ?? 0);
  };

  // 플랫폼 DB 잔액 업데이트 + 로컬 상태 갱신
  const setPlatformBalance = async (amount: number) => {
    await supabase.from('users').update({ balance: amount }).eq('id', user!.id);
    setLocalBalance(amount);
  };

  // 활성 게임 세션을 DB + localStorage에 저장 (브라우저 강제 종료 시 환전 복구용)
  const saveActiveSessionToDB = async (session: ActiveSession) => {
    const sessionData = {
      vendorId: session.vendor.id,
      vendorType: session.vendorType,
      username: session.username,
      token: session.token ?? null,
      cashout_token: session.cashout_token,
    };
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({ userId: user!.id, cashout_token: session.cashout_token }));
    await supabase.from('users').update({ active_game_session: sessionData }).eq('id', user!.id);
  };

  // 활성 세션 DB + localStorage 초기화 + online_sessions 비활성화
  const clearActiveSessionFromDB = async () => {
    localStorage.removeItem(ACTIVE_GAME_SESSION_KEY);
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('users').update({ active_game_session: null }).eq('id', user!.id),
      supabase.from('online_sessions')
        .update({ is_active: false, logout_at: now })
        .eq('user_id', user!.id)
        .eq('is_active', true),
    ]);
  };

  // 게임 시작 시 online_sessions에 세션 기록
  const insertOnlineSession = async (session: ActiveSession, providerName: string, gameName: string) => {
    const now = new Date().toISOString();
    await supabase.from('online_sessions').insert({
      user_id: user!.id,
      session_token: session.cashout_token,
      login_at: now,
      last_activity_at: now,
      is_active: true,
      provider_name: providerName,
      game_name: gameName,
    });
  };

  const handleGameSelect = async (game: GameItem, provider: ProviderWithGames) => {
    if (!user) { setShowLoginModal(true); return; }
    const vendor = provider.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    setLaunchingGameId(game.id);
    setLaunchModal({ game, provider, launchUrl: null, loading: true, error: null });

    try {
      // ── ACE 게임 실행 ──────────────────────────────────────────────
      if (vendor.vendor_key === 'ace') {
        const vendorKey = game.metadata?._vendorKey as string | undefined;
        if (!vendorKey) throw new Error('ACE 제공사 키를 찾을 수 없습니다.');

        // 1. 회원 등록 (캐시)
        if (!aceRegisterCache.current.has(vendor.id)) {
          try {
            await callAceProxy(
              vendor.api_base_url, '/register', vendor.opcode, vendor.secret_key,
              { username: user.username, nickname: user.username, siteUsername: user.username }
            );
          } catch (regErr: any) {
            if (!regErr.message?.includes('ALREADY_USER_EXISTS')) throw regErr;
          }
          aceRegisterCache.current.add(vendor.id);
        }

        // 2. ACE 잔액 확인 → 잔액이 있으면 먼저 전액 회수
        try {
          const existingBalance = await aceVendorService.getMemberBalance(vendor, user.username);
          if (existingBalance > 0) {
            await aceVendorService.withdrawMember(vendor, user.username, `pre-${user.username}-${Date.now()}`);
          }
        } catch { /* 잔액 없거나 오류 무시 */ }

        // 3. 플랫폼 잔액 → ACE 충전 (DB 잔액은 0으로 만들지 않음)
        const platformBalance = await getPlatformBalance();
        if (platformBalance > 0) {
          await aceVendorService.depositMember(vendor, user.username, platformBalance, `dep-${user.username}-${Date.now()}`);
          deductVendorBalanceOnCharge(vendor.vendor_key, platformBalance).catch(() => {});
        }

        // 4. 게임 실행
        const requestKey = `${user.username}-${Date.now()}`;
        const res = await callAceProxy<{ code: number; url: string }>(
          vendor.api_base_url, '/play', vendor.opcode, vendor.secret_key,
          { vendorKey, gameKey: game.game_code, siteUsername: user.username, nickname: user.username, ip: '127.0.0.1', language: 'ko', platform: 'desktop', requestKey }
        );
        const launchUrl = res.url ?? null;
        if (!launchUrl) throw new Error('게임 URL을 받을 수 없습니다.');

        const aceSession: ActiveSession = { vendor, vendorType: 'ace', username: user.username, cashout_token: crypto.randomUUID() };
        activeSession.current = aceSession;
        await saveActiveSessionToDB(aceSession);
        insertOnlineSession(aceSession, provider.name ?? vendor.vendor_key, game.game_name ?? game.game_code).catch(() => { /* best-effort */ });
        gameWindowRef.current = window.open(launchUrl, '_blank');
        setLaunchModal({ game, provider, launchUrl: null, loading: false, error: null, openedInNewTab: true });
        return;
      }

      // ── HONOR 게임 실행 ────────────────────────────────────────────
      if (vendor.vendor_key === 'honor') {
        const honorVendorName = (game.metadata?._honorVendor ?? game.metadata?.vendor ?? '') as string;
        const gameId = game.metadata?._gameId ?? parseInt(game.game_code.split('_').slice(1).join('_'), 10);
        if (!gameId) throw new Error('게임 ID를 파악할 수 없습니다.');

        // 1. HONOR 유저 잔액 확인 → 잔액이 있으면 먼저 전액 회수
        try {
          const honorUser = await honorVendorService.getUser(vendor, user.username);
          const honorBalance = Number(honorUser?.balance ?? 0);
          if (honorBalance > 0) {
            await honorVendorService.subBalance(vendor, user.username, honorBalance);
          }
        } catch { /* 유저 미존재 또는 오류 무시 */ }

        // 2. 플랫폼 잔액 → HONOR 충전 (DB 잔액은 0으로 만들지 않음)
        const platformBalance = await getPlatformBalance();
        if (platformBalance > 0) {
          await honorVendorService.addBalance(vendor, user.username, platformBalance);
          deductVendorBalanceOnCharge(vendor.vendor_key, platformBalance).catch(() => {});
        }

        // 3. 게임 실행
        const result = await honorVendorService.getGameLaunchLink(
          vendor, user.username, gameId, honorVendorName, { nickname: user.username }
        );
        const launchUrl = result.link ?? null;
        if (!launchUrl) throw new Error('게임 URL을 받을 수 없습니다.');

        const honorSession: ActiveSession = { vendor, vendorType: 'honor', username: user.username, cashout_token: crypto.randomUUID() };
        activeSession.current = honorSession;
        await saveActiveSessionToDB(honorSession);
        insertOnlineSession(honorSession, provider.name ?? vendor.vendor_key, game.game_name ?? game.game_code).catch(() => { /* best-effort */ });
        setLaunchModal({ game, provider, launchUrl, loading: false, error: null });
        return;
      }

      // ── INVEST 게임 실행 ───────────────────────────────────────────
      const gameNumId = parseInt(game.game_code.split('_').slice(1).join('_'), 10);
      if (isNaN(gameNumId)) throw new Error('게임 ID를 파악할 수 없습니다.');

      // 1. 토큰 발급 (캐시)
      if (!tokenCache.current[vendor.id]) {
        const sig = md5(vendor.opcode, user.username, vendor.secret_key);
        const tokenRes = await callProxy(vendor.api_base_url, '/account', 'POST', { opcode: vendor.opcode, username: user.username, signature: sig });
        if (!tokenRes.RESULT) throw new Error(tokenRes.message ?? '토큰 발급 실패');
        const token = tokenRes.DATA?.token ?? tokenRes.DATA?.Token ?? tokenRes.DATA?.TOKEN;
        if (!token) throw new Error('토큰을 받을 수 없습니다.');
        tokenCache.current[vendor.id] = String(token);
      }
      const token = tokenCache.current[vendor.id];

      // 2. INVEST 잔액 확인 → 잔액이 있으면 먼저 전액 출금
      try {
        const investBalance = await investVendorService.getBalance(vendor, user.username, token);
        if (investBalance > 0) {
          await investVendorService.withdrawBalance(vendor, user.username, token, investBalance);
        }
      } catch { /* 잔액 없거나 오류 무시 */ }

      // 3. 플랫폼 잔액 → INVEST 충전 (DB 잔액은 0으로 만들지 않음)
      const platformBalance = await getPlatformBalance();
      if (platformBalance > 0) {
        await investVendorService.depositBalance(vendor, user.username, token, platformBalance);
        deductVendorBalanceOnCharge(vendor.vendor_key, platformBalance).catch(() => {});
      }

      // 4. 게임 실행
      const sig2 = md5(vendor.opcode, user.username, token, gameNumId, vendor.secret_key);
      const launchRes = await callProxy(vendor.api_base_url, '/game/launch', 'POST', {
        opcode: vendor.opcode, username: user.username, token, game: gameNumId, signature: sig2,
      });
      if (!launchRes.RESULT) throw new Error(launchRes.message ?? '게임 실행 실패');
      const launchUrl = launchRes.DATA?.url ?? launchRes.DATA?.URL ?? launchRes.DATA?.game_url ?? null;
      if (!launchUrl) throw new Error('게임 URL을 받을 수 없습니다.');

      const investSession: ActiveSession = { vendor, vendorType: 'invest', username: user.username, token, cashout_token: crypto.randomUUID() };
      activeSession.current = investSession;
      await saveActiveSessionToDB(investSession);
      insertOnlineSession(investSession, provider.name ?? vendor.vendor_key, game.game_name ?? game.game_code).catch(() => { /* best-effort */ });
      setLaunchModal({ game, provider, launchUrl, loading: false, error: null });

    } catch (e: any) {
      delete tokenCache.current[provider.vendor?.id ?? ''];
      setLaunchModal(null);
      toast.error(`게임 실행 실패: ${e.message}`);
    } finally { setLaunchingGameId(null); }
  };

  // 새 탭에서 게임 열기: 벤더별 API를 재호출하여 새 URL 발급
  const handleOpenInNewTab = async () => {
    if (!launchModal || !user) return;
    const { game, provider } = launchModal;
    const vendor = provider.vendor;
    if (!vendor) return;

    try {
      let newUrl: string | null = null;

      if (vendor.vendor_key === 'ace') {
        const vendorKey = game.metadata?._vendorKey as string | undefined;
        if (!vendorKey) throw new Error('ACE 제공사 키를 찾을 수 없습니다.');
        const requestKey = `${user.username}-newtab-${Date.now()}`;
        const res = await callAceProxy<{ code: number; url: string }>(
          vendor.api_base_url, '/play', vendor.opcode, vendor.secret_key,
          { vendorKey, gameKey: game.game_code, siteUsername: user.username, nickname: user.username, ip: '127.0.0.1', language: 'ko', platform: 'desktop', requestKey }
        );
        newUrl = res.url ?? null;
      } else if (vendor.vendor_key === 'honor') {
        const honorVendorName = (game.metadata?._honorVendor ?? game.metadata?.vendor ?? '') as string;
        const gameId = game.metadata?._gameId ?? parseInt(game.game_code.split('_').slice(1).join('_'), 10);
        if (!gameId) throw new Error('게임 ID를 파악할 수 없습니다.');
        const result = await honorVendorService.getGameLaunchLink(vendor, user.username, gameId, honorVendorName, { nickname: user.username });
        newUrl = result.link ?? null;
      } else {
        newUrl = launchModal.launchUrl;
      }

      if (!newUrl) throw new Error('게임 URL을 받을 수 없습니다.');
      gameWindowRef.current = window.open(newUrl, '_blank');
    } catch (e: any) {
      toast.error(`새 탭 열기 실패: ${e.message}`);
    }
  };

  // 게임 종료: API 잔액 전액 회수 → 플랫폼 잔액으로 반환
  const handleModalClose = async () => {
    if (closingGame) return;
    const session = activeSession.current;

    if (!session || !user) {
      activeSession.current = null;
      setLaunchModal(null);
      return;
    }

    setClosingGame(true);
    let returnedAmount = 0;

    try {
      const { vendor, vendorType, username, token } = session;

      if (vendorType === 'ace') {
        try {
          returnedAmount = await aceVendorService.withdrawMember(vendor, username, `exit-${username}-${Date.now()}`);
        } catch { /* 환전 오류 무시 */ }
      } else if (vendorType === 'honor') {
        try {
          const honorUser = await honorVendorService.getUser(vendor, username);
          const honorBalance = Number(honorUser?.balance ?? 0);
          if (honorBalance > 0) {
            await honorVendorService.subBalance(vendor, username, honorBalance);
            returnedAmount = honorBalance;
          }
        } catch { /* 환전 오류 무시 */ }
      } else {
        // invest
        if (token) {
          try {
            const investBalance = await investVendorService.getBalance(vendor, username, token);
            if (investBalance > 0) {
              returnedAmount = await investVendorService.withdrawBalance(vendor, username, token, investBalance);
            }
          } catch { /* 환전 오류 무시 */ }
        }
      }

      if (returnedAmount > 0) {
        await setPlatformBalance(returnedAmount);
      }

      // 게임 종료 후 벤더 에이전트 잔액 재조회 → game_vendors.total_balance + 운영사 users.balance 동기화
      try {
        const { vendor, vendorType } = session;
        if (vendorType === 'ace') {
          await aceVendorService.fetchAgentBalance(vendor);
        } else if (vendorType === 'honor') {
          await gameVendorService.fetchHonorBalance(vendor);
        } else if (vendorType === 'invest') {
          await gameVendorService.testConnection(vendor);
        }
      } catch {
        // 벤더 잔액 동기화 실패는 회원 환전에 영향 없음
      }
    } finally {
      activeSession.current = null;
      await clearActiveSessionFromDB();
      setClosingGame(false);
      setLaunchModal(null);
    }
  };

  // 로그아웃 전 활성 게임 세션 잔액 회수 후 로그아웃
  const handleLogoutWithCleanup = async () => {
    if (activeSession.current && user) {
      await handleModalClose();
    }
    setActiveMenu('');
    setSelectedProvider(null);
    onLogout();
  };

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    setLoginLoading(true);
    try {
      const ok = await onLogin(username, password);
      if (ok) setShowLoginModal(false);
      return ok;
    } finally { setLoginLoading(false); }
  };

  // 제공사 이름 기준 중복 제거 (같은 이름의 제공사는 하나로 합치고, _sources에 원본 목록 보관)
  function deduplicateProviders(list: ProviderWithGames[]): MergedProvider[] {
    const map = new Map<string, MergedProvider>();
    for (const p of list) {
      const key = p.provider_name.toLowerCase().trim();
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing._sources.push(p);
        existing.games = [...existing.games, ...p.games];
      } else {
        map.set(key, { ...p, _sources: [p] });
      }
    }
    return Array.from(map.values());
  }

  const casinoProviders  = deduplicateProviders(providers.filter(p => p.category === 'casino'));
  const slotProviders    = deduplicateProviders(providers.filter(p => p.category === 'slot'));
  const sportsProviders  = deduplicateProviders(providers.filter(p => p.category === 'sports'));
  const lotteryProviders = deduplicateProviders(providers.filter(p => p.category === 'lottery'));

  const fetchGamesForSource = async (src: ProviderWithGames): Promise<GameItem[]> => {
    const vendorKey = src.vendor?.vendor_key ?? '';
    const PAGE = 1000;

    if (vendorKey === 'ace') {
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('game_ace').select('*').eq('status', 'active')
          .eq('provider_id', src.id).order('game_name_ko').range(from, from + PAGE - 1);
        if (error) break;
        allRows = allRows.concat(data ?? []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return allRows.map((g: any) => ({
        id: g.id, provider_id: g.provider_id, game_code: g.game_key,
        game_name: g.game_name_ko || g.game_name_en || g.game_key,
        game_type: (g.category === 'casino' || g.category === 'slot') ? g.category : null,
        thumbnail_url: g.thumbnail_url ?? null, status: g.status,
        min_bet: null, max_bet: null,
        metadata: { ...g.metadata, _ace: true, _vendorKey: src.ace_vendor_key ?? g.metadata?.vendorKey ?? '' },
      }));
    }

    if (vendorKey === 'honor') {
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('game_honor').select('*').eq('status', 'active')
          .eq('provider_id', src.id).order('title').range(from, from + PAGE - 1);
        if (error) break;
        allRows = allRows.concat(data ?? []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return allRows.map((g: any) => ({
        id: g.id, provider_id: g.provider_id,
        game_code: `${g.provider_id}_${g.game_id}`,
        game_name: g.title_ko || g.title || String(g.game_id),
        game_type: (g.type === 'casino' || g.type === 'slot') ? g.type : null,
        thumbnail_url: g.thumbnail ?? null, status: g.status,
        min_bet: null, max_bet: null,
        metadata: { ...g.metadata, _honor: true, _honorVendor: g.vendor_key, _gameId: g.game_id },
      }));
    }

    // invest
    let allRows: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('game_invest').select('*').eq('status', 'active')
        .eq('provider_id', src.id).order('game_name').range(from, from + PAGE - 1);
      if (error) break;
      allRows = allRows.concat(data ?? []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return allRows;
  };

  const handleProviderSelect = async (provider: ProviderWithGames) => {
    if (!user) { setShowLoginModal(true); return; }
    setLoadingGames(true);
    try {
      const sources = (provider as MergedProvider)._sources ?? [provider];
      const results = await Promise.all(sources.map(fetchGamesForSource));
      const allGames = results.flat();
      // 카지노: 게임 1개면 바로 실행, 여러 개면 목록 표시
      if (provider.category === 'casino' && allGames.length === 1) {
        setLoadingGames(false);
        await handleGameSelect(allGames[0], { ...provider, games: allGames });
        return;
      }
      setGameSearch('');
      setSelectedProvider({ ...provider, games: allGames });
    } catch {
      // show whatever loaded
    } finally {
      setLoadingGames(false);
    }
  };

  const handleSectionChange = (id: string) => {
    const menuItem = SIDEBAR_MENU.find(m => m.id === id);
    if (menuItem?.authRequired && !user) {
      setShowLoginModal(true);
      setSidebarOpen(false);
      return;
    }
    setActiveMenu(id);
    setSelectedProvider(null);
    setProviderSearch('');
    setGameSearch('');
    setSidebarOpen(false);
    setTimeout(() => {
      if (id === 'casino') {
        casinoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (id === 'slot') {
        slotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (id === 'sports') {
        sportsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (id === 'lottery') {
        lotteryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const FORMAT_ASPECT: Record<string, string> = {
    portrait_full: 'aspect-[9/16] max-w-[320px]',
    portrait_half: 'aspect-[9/16] max-w-[180px]',
    landscape_full: 'aspect-video max-w-[600px]',
    landscape_half: 'aspect-video max-w-[360px]',
  };

  const visibleBanners = bannerPopups.filter(b => !dismissedBanners.has(b.id));

  const dismissForSession = (bannerId: string) => {
    setDismissedBanners(prev => new Set([...prev, bannerId]));
  };

  const dismissForToday = (bannerId: string) => {
    const today = new Date().toDateString();
    setDismissedBanners(prev => {
      const next = new Set([...prev, bannerId]);
      try { localStorage.setItem(`benz_dismissed_banners_${today}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const getBannerSize = (fmt: string): { w: number; h: number } => {
    if (fmt?.includes('portrait')) return { w: 250, h: 400 };
    return { w: 400, h: 250 };
  };

  return (
    <div className="flex min-h-screen bg-[#080808] text-white">

      {/* ── 배너 팝업 ── */}
      {visibleBanners.length > 0 && (() => {
        const STACK_OFFSET = 10;
        const topBanner = visibleBanners[0];
        const topSize = getBannerSize(topBanner.metadata?.format || 'landscape_full');
        const extraW = (visibleBanners.length - 1) * STACK_OFFSET;
        const extraH = (visibleBanners.length - 1) * STACK_OFFSET;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
            <div className="relative" style={{ width: topSize.w + extraW, height: topSize.h + extraH }}>
              {[...visibleBanners].reverse().map((banner, revIdx) => {
                const stackIdx = visibleBanners.length - 1 - revIdx;
                const offset = stackIdx * STACK_OFFSET;
                const isText = banner.metadata?.content_type === 'text';
                const { w, h } = getBannerSize(banner.metadata?.format || 'landscape_full');
                return (
                  <div
                    key={banner.id}
                    className="absolute rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
                    style={{ width: w, height: h, top: offset, left: offset, zIndex: visibleBanners.length - stackIdx }}
                  >
                    {/* 콘텐츠 */}
                    <div className="relative flex-1 overflow-hidden">
                      {isText ? (
                        <div className="absolute inset-0 flex items-center justify-center p-6"
                          style={{ backgroundColor: banner.metadata?.bg_color || '#1e293b', color: banner.metadata?.text_color || '#fff' }}>
                          <p className="text-center font-semibold leading-relaxed text-lg whitespace-pre-wrap">{banner.metadata?.text_content}</p>
                        </div>
                      ) : banner.image_url ? (
                        <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center text-slate-400 text-sm">{banner.title}</div>
                      )}
                      {/* X 닫기 버튼 */}
                      <button
                        onClick={() => dismissForSession(banner.id)}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 flex items-center justify-center text-white transition-all"
                        style={{ zIndex: 10 }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {/* 링크 버튼 */}
                      {banner.link_url && (
                        <a href={banner.link_url}
                          className="absolute bottom-10 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-full text-white text-sm font-medium transition-all whitespace-nowrap"
                          style={{ zIndex: 10 }}>
                          자세히 보기
                        </a>
                      )}
                    </div>
                    {/* 오늘하루 안띄우기 */}
                    <div className="flex items-center justify-center bg-black/80 px-4 py-2 shrink-0">
                      <button
                        onClick={() => dismissForToday(banner.id)}
                        className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                      >
                        <span className="w-3.5 h-3.5 border border-slate-500 rounded-sm flex items-center justify-center">
                          <span className="w-2 h-2 bg-slate-500 rounded-sm" />
                        </span>
                        오늘하루 안띄우기
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (fixed, never scrolls) ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[220px] flex flex-col
          transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0900 55%, #100c00 100%)',
          borderRight: '1px solid rgba(201,162,39,0.14)',
          boxShadow: 'inset -1px 0 0 rgba(201,162,39,0.06), 4px 0 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 flex items-center justify-center shrink-0">
          <button
            onClick={() => { setSelectedProvider(null); setProviderSearch(''); setGameSearch(''); setActiveMenu(''); setSidebarOpen(false); }}
            className="focus:outline-none"
          >
            <img
              src={IMG.logo}
              alt="BENZ CASINO"
              className="h-16 w-auto object-contain hover:opacity-80 transition-opacity"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto px-3 pb-6" style={{ scrollbarWidth: 'none' }}>
          {SIDEBAR_MENU.map(({ id, label, icon: Icon, hasArrow }, idx) => {
            const isActive = activeMenu === id;
            const showDivider = idx === 2; // deposit 앞에 구분선

            return (
              <div key={id}>
                {showDivider && (
                  <div className="my-2 h-px bg-gradient-to-r from-transparent via-[#c9a227]/30 to-transparent" />
                )}
                <button
                  onClick={() => handleSectionChange(id)}
                  className={`relative w-full flex items-center gap-3 px-3 py-[11px] mb-1.5 rounded-md transition-all duration-200 group border ${isActive ? 'border-[#c9a227]/70' : 'border-transparent'}`}
                >
                  <Icon
                    size={18}
                    className={`shrink-0 transition-colors ${isActive ? 'text-[#c9a227]' : 'text-slate-500 group-hover:text-[#c9a227]/70'}`}
                  />
                  <span
                    className={`flex-1 text-left text-[17px] font-semibold tracking-wide transition-colors ${
                      isActive ? 'text-[#c9a227]' : 'text-slate-400 group-hover:text-[#c9a227]/80'
                    }`}
                  >
                    {label}
                  </span>
                  {id === 'message' && unreadMessages > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                  {hasArrow && (
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-colors ${isActive ? 'text-[#c9a227]' : 'text-slate-600 group-hover:text-[#c9a227]/60'}`}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Bottom user info */}
        {user && (
          <div className="px-4 py-3 shrink-0 border-t border-white/5">
            <p className="text-[11px] text-slate-600 truncate text-center">{user.username}</p>
          </div>
        )}
      </aside>

      {/* ── Main (offset by sidebar width on desktop) ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[210px]">

        {/* ── Top Header ── */}
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0a0a08]/95 border-b border-[#c9a227]/10 shrink-0 backdrop-blur-sm sticky top-0 z-20">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-1.5 text-slate-400 hover:text-[#c9a227] transition-colors"
            onClick={() => setSidebarOpen(v => !v)}
          >
            <Gamepad2 size={18} />
          </button>

          {/* Right side */}
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {user && (
              <>
                <button
                  onClick={handleConvertPointsInHeader}
                  disabled={convertingPoints || localPoints <= 0}
                  title="클릭하여 포인트를 보유금으로 전환"
                  className="hidden sm:flex items-center gap-2 text-base text-slate-400 bg-[#111]/60 px-4 py-2 rounded-full border border-[#c9a227]/15 hover:border-[#c9a227]/40 transition-colors disabled:cursor-default disabled:hover:border-[#c9a227]/15 group"
                >
                  <Star size={14} className="text-[#c9a227]/60 group-hover:text-[#c9a227] transition-colors" />
                  <span>포인트</span>
                  <span className="text-[#c9a227] font-semibold ml-1">
                    {convertingPoints ? '...' : localPoints.toLocaleString()}P
                  </span>
                  {localPoints > 0 && (
                    <ArrowRightLeft size={12} className="text-slate-600 group-hover:text-[#c9a227] transition-colors" />
                  )}
                </button>
                <div className="flex items-center gap-2 text-base bg-[#111]/60 px-4 py-2 rounded-full border border-[#c9a227]/20">
                  <Wallet size={15} className="text-[#c9a227]" />
                  <span className="text-slate-400">보유금</span>
                  <span className="text-[#c9a227] font-bold ml-1">₩{localBalance.toLocaleString()}</span>
                </div>
              </>
            )}

            {user && (
              <>
                <button
                  onClick={() => handleSectionChange('deposit')}
                  className="px-5 py-2 text-base rounded-full bg-gradient-to-r from-[#c9a227] to-[#a07820] hover:from-[#d4b030] hover:to-[#b08828] text-black font-bold transition-all shadow-lg shadow-[#c9a227]/20">
                  입금
                </button>
                <button
                  onClick={() => handleSectionChange('withdraw')}
                  className="px-5 py-2 text-base rounded-full bg-[#111] border border-[#c9a227]/25 text-slate-300 hover:border-[#c9a227]/60 hover:text-[#c9a227] font-semibold transition-all">
                  출금
                </button>
              </>
            )}

            {user ? (
              <button
                onClick={handleLogoutWithCleanup}
                className="flex items-center gap-2 px-4 py-2 text-base rounded-full bg-[#111] border border-[#c9a227]/15 text-slate-400 hover:text-[#c9a227] hover:border-[#c9a227]/50 transition-all"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">{user.username}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-5 py-2 text-base rounded-full bg-gradient-to-r from-[#c9a227] to-[#a07820] hover:from-[#d4b030] hover:to-[#b08828] text-black font-bold transition-all shadow-lg shadow-[#c9a227]/20"
              >
                로그인
              </button>
            )}
          </div>
        </header>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>

          {/* ══════════════════════════════════════════
              선택된 프로바이더 게임 그리드 오버레이
          ══════════════════════════════════════════ */}
          {selectedProvider && (
            <div className="min-h-full bg-[#080808]">
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 bg-[#0a0a08]/95 border-b border-[#c9a227]/10 backdrop-blur-sm">
                <button
                  onClick={() => setSelectedProvider(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#c9a227] transition-colors group"
                >
                  <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                  목록으로
                </button>
                <div className="h-3 w-px bg-[#c9a227]/20" />
                <span className="text-white text-sm font-bold">{selectedProvider.provider_name}</span>
                <span className="text-[#c9a227] text-xs ml-1">
                  {selectedProvider.category === 'casino' ? '카지노' : '슬롯'}
                </span>
              </div>
              {/* 게임 검색 */}
              <div className="px-5 pt-4 pb-2">
                <div className="relative max-w-xs">
                  <input
                    type="text"
                    value={gameSearch}
                    onChange={e => setGameSearch(e.target.value)}
                    placeholder="게임 검색..."
                    className="w-full bg-black/40 border border-[#c9a227]/25 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a227]/60"
                  />
                  {gameSearch && (
                    <button onClick={() => setGameSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-5 py-4">
                {loadingGames ? (
                  <div className="py-24 flex justify-center">
                    <Loader2 size={32} className="text-[#c9a227] animate-spin" />
                  </div>
                ) : (() => {
                  const filtered = gameSearch.trim()
                    ? selectedProvider.games.filter(g => g.game_name.toLowerCase().includes(gameSearch.toLowerCase()))
                    : selectedProvider.games;
                  return (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {filtered.map(game => (
                        <GameCard
                          key={game.id}
                          game={game}
                          launching={launchingGameId === game.id}
                          onSelect={() => handleGameSelect(game, selectedProvider)}
                        />
                      ))}
                      {filtered.length === 0 && (
                        <div className="col-span-full py-16 text-center text-slate-600 text-sm">
                          {gameSearch ? '검색 결과가 없습니다.' : '등록된 게임이 없습니다.'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              서브 페이지: 입금 / 출금 / 포인트 / 베팅 / 기타
          ══════════════════════════════════════════ */}
          {!selectedProvider && activeMenu === 'deposit' && (
            <DepositPage user={user} />
          )}
          {!selectedProvider && activeMenu === 'withdraw' && (
            <WithdrawPage user={user} balance={localBalance} onBalanceUpdate={setLocalBalance} />
          )}
          {!selectedProvider && activeMenu === 'point' && (
            <PointPage
              user={user}
              points={localPoints}
              onPointsUpdate={setLocalPoints}
              onBalanceUpdate={setLocalBalance}
            />
          )}
          {!selectedProvider && activeMenu === 'betting' && (
            <BettingHistoryPage user={user} />
          )}
          {!selectedProvider && activeMenu === 'notice' && (
            <div className="min-h-full bg-[#080808]">
              <NoticePage userId={user?.id} />
            </div>
          )}
          {!selectedProvider && activeMenu === 'message' && user && (
            <div className="min-h-full bg-[#080808]">
              <MessagePage userId={user.id} onUnreadCountChange={setUnreadMessages} />
            </div>
          )}
          {!selectedProvider && activeMenu === 'support' && (
            <CustomerSupportPage user={user} />
          )}
          {!selectedProvider && activeMenu === 'profile' && (
            <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8">
              <h2 className="text-2xl font-bold text-white mb-6">회원정보 수정</h2>
              <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#1a1500] border border-[#c9a227]/30 flex items-center justify-center text-[#c9a227] font-bold text-lg">
                    {user?.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-bold">{user?.name}</p>
                    <p className="text-slate-500 text-sm">{user?.username}</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm">회원정보 수정 기능은 준비 중입니다.</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              스포츠 / 로또 게임 목록 뷰
          ══════════════════════════════════════════ */}
          {!selectedProvider && (activeMenu === 'sports' || activeMenu === 'lottery') && (() => {
            const isSports = activeMenu === 'sports';
            const catProviders = isSports ? sportsProviders : lotteryProviders;
            const allGames = catProviders.flatMap(p => p.games);
            const accentColor = isSports ? '#22c55e' : '#a855f7';
            const accentMuted = isSports ? 'text-green-400' : 'text-purple-400';
            const accentBg = isSports ? 'bg-green-900/20 border-green-700/30' : 'bg-purple-900/20 border-purple-700/30';
            const Icon = isSports ? Trophy : Ticket;
            return (
              <div className="min-h-full bg-[#080808]">
                <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 bg-[#0a0a08]/95 border-b border-white/5 backdrop-blur-sm">
                  <button
                    onClick={() => setActiveMenu('casino')}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors group"
                  >
                    <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                    메인으로
                  </button>
                  <div className="h-3 w-px bg-white/10" />
                  <Icon size={14} className={accentMuted} />
                  <span className={`text-sm font-bold ${accentMuted}`}>{isSports ? '스포츠' : '로또'}</span>
                  <span className="text-slate-600 text-xs">{allGames.length}개 게임</span>
                </div>
                <div className="px-5 py-6">
                  {allGames.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-24 gap-3 border rounded-xl ${accentBg}`}>
                      <Icon size={40} className={`${accentMuted} opacity-40`} />
                      <p className="text-slate-500 text-sm">등록된 {isSports ? '스포츠' : '로또'} 게임이 없습니다.</p>
                      <p className="text-slate-600 text-xs">관리자 페이지에서 ACE 게임 동기화를 실행해주세요.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {allGames.map(game => {
                        const prov = catProviders.find(p => p.games.some(g => g.id === game.id))!;
                        return (
                          <GameCard
                            key={game.id}
                            game={game}
                            launching={launchingGameId === game.id}
                            onSelect={() => handleGameSelect(game, prov)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════
              메인 레이아웃 (프로바이더 미선택 시)
          ══════════════════════════════════════════ */}
          {!selectedProvider && !['sports', 'lottery', 'deposit', 'withdraw', 'point', 'betting', 'notice', 'message', 'profile'].includes(activeMenu) && (
            <>
              {/* ── 1단: 배너 (카지노/슬롯 공통) ── */}
              <div className="relative overflow-visible" style={{ minHeight: '650px', maxHeight: '630px' }}>
                <img src={IMG.heroBg} alt="Casino background" className="absolute inset-0 w-full h-full object-cover object-center" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-transparent" style={{ bottom: '-65px' }} />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_60%,rgba(201,162,39,0.06),transparent_55%)]" />
                <div className="relative z-10 h-full flex items-center justify-start pl-8 sm:pl-16" style={{ minHeight: '450px' }}>
                  {/* 배너 이미지 + PLAY NOW 버튼을 하나의 래퍼로 묶어 상대 위치 기준 설정 */}
                  <div className="relative" style={{ maxHeight: '390px', maxWidth: '55%' }}>
                    <img src={IMG.bannerText} alt="Banner" className="h-auto w-full object-contain block" style={{ maxHeight: '390px' }} />
                    <PlayNowButton onClick={() => handleSectionChange('slot')} />
                  </div>
                </div>
              </div>

              {error && (
                <div className="mx-5 mt-6 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {!error && (
                <>
                  {/* ── 카지노 제공사 목록 ── */}
                  {(activeMenu === 'casino' || activeMenu === '') && (() => {
                    const withImg = casinoProviders.filter(hasProviderImage);
                    const noImg   = casinoProviders.filter(p => !hasProviderImage(p));
                    const all     = (user ? [...withImg, ...noImg] : withImg)
                      .sort((a, b) => (((a as any).metadata?.sort_order ?? 9999) - ((b as any).metadata?.sort_order ?? 9999)));
                    const filtered = providerSearch.trim()
                      ? all.filter(p => p.provider_name.toLowerCase().includes(providerSearch.toLowerCase()))
                      : all;
                    return (
                      <div ref={casinoRef} className="relative" style={{ backgroundImage: `url(${IMG.liveCasinoBg})`, backgroundSize: '70%', backgroundRepeat: 'no-repeat', backgroundPosition: 'right bottom', marginTop: '-65px', position: 'relative', zIndex: 5 }}>
                        <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />
                        <div className="relative flex items-center pl-8 sm:pl-16" style={{ height: '80px', background: 'linear-gradient(to right, #0e0900, #2a1e00, #1c1400, #0e0900)' }}>
                          <img src={IMG.casinoHeader} alt="Casino Game List" className="relative z-10 object-contain object-left h-full w-auto" />
                        </div>
                        {activeMenu === 'casino' && (
                          <div className="px-8 sm:px-16 pt-4 pb-2">
                            <div className="relative max-w-xs">
                              <input
                                type="text"
                                value={providerSearch}
                                onChange={e => setProviderSearch(e.target.value)}
                                placeholder="제공사 검색..."
                                className="w-full bg-black/40 border border-[#c9a227]/25 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a227]/60"
                              />
                              {providerSearch && (
                                <button onClick={() => setProviderSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="px-8 sm:px-16 pt-4 pb-10">
                          {loading ? (
                            <div className="grid gap-3 grid-cols-5">
                              {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
                              ))}
                            </div>
                          ) : filtered.length === 0 ? (
                            <div className="py-16 text-center text-slate-600 text-sm">검색 결과가 없습니다.</div>
                          ) : (
                            <div className="grid gap-3 grid-cols-5">
                              {filtered.map(provider => (
                                <ProviderCard key={provider.id} provider={provider} onClick={() => handleProviderSelect(provider)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── 슬롯 제공사 목록 ── */}
                  {(activeMenu === 'slot' || activeMenu === '') && (() => {
                    const withImg = slotProviders.filter(hasProviderImage);
                    const noImg   = slotProviders.filter(p => !hasProviderImage(p));
                    const isSlotMenu = activeMenu === 'slot';
                    const all = (isSlotMenu
                      ? (user ? [...withImg, ...noImg] : withImg)
                      : withImg)
                      .sort((a, b) => (((a as any).metadata?.sort_order ?? 9999) - ((b as any).metadata?.sort_order ?? 9999)));
                    const filtered = (isSlotMenu && providerSearch.trim())
                      ? all.filter(p => p.provider_name.toLowerCase().includes(providerSearch.toLowerCase()))
                      : all;
                    return (
                      <div ref={slotRef} className="relative" style={{ backgroundImage: `url(${IMG.slotBg})`, backgroundSize: '40%', backgroundRepeat: 'no-repeat', backgroundPosition: 'right bottom' }}>
                        <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />
                        <div className="relative flex items-center pl-8 sm:pl-16" style={{ height: '80px', background: 'linear-gradient(to right, #0e0900, #2a1e00, #1c1400, #0e0900)' }}>
                          <img src={IMG.slotHeader} alt="Slot Game List" className="relative z-10 object-contain object-left h-full w-auto" />
                        </div>
                        {isSlotMenu && (
                          <div className="px-8 sm:px-16 pt-4 pb-2">
                            <div className="relative max-w-xs">
                              <input
                                type="text"
                                value={providerSearch}
                                onChange={e => setProviderSearch(e.target.value)}
                                placeholder="제공사 검색..."
                                className="w-full bg-black/40 border border-[#c9a227]/25 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a227]/60"
                              />
                              {providerSearch && (
                                <button onClick={() => setProviderSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="px-8 sm:px-16 pt-4 pb-10">
                          {loading ? (
                            <div className="grid gap-3 grid-cols-5">
                              {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
                              ))}
                            </div>
                          ) : filtered.length === 0 ? (
                            <div className="py-16 text-center text-slate-600 text-sm">
                              {isSlotMenu && providerSearch ? '검색 결과가 없습니다.' : '등록된 슬롯 제공사가 없습니다.'}
                            </div>
                          ) : (
                            <div className="grid gap-3 grid-cols-5">
                              {filtered.map(provider => (
                                <ProviderCard key={provider.id} provider={provider} onClick={() => handleProviderSelect(provider)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── 스포츠 배너 ── */}
                  {!loading && (activeMenu === 'casino' || activeMenu === '') && sportsProviders.length > 0 && (
                    <div ref={sportsRef}>
                      <button onClick={() => handleSectionChange('sports')} className="group relative w-full overflow-hidden flex items-center justify-between px-8 sm:px-16 transition-all" style={{ height: '120px', background: 'linear-gradient(135deg, #0a1a0a 0%, #0d2b0d 40%, #071507 100%)' }}>
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(34,197,94,0.15),transparent_60%)]" />
                        <div className="relative z-10 flex items-center gap-4">
                          <Trophy size={36} className="text-green-400 drop-shadow-lg group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="text-green-300 text-xl font-black tracking-widest uppercase">Sports</p>
                            <p className="text-green-600 text-sm mt-0.5">스포츠 게임 {sportsProviders.reduce((s, p) => s + p.games.length, 0)}개</p>
                          </div>
                        </div>
                        <div className="relative z-10 flex items-center gap-2 text-green-400 text-sm font-semibold group-hover:translate-x-1 transition-transform">
                          게임 보기 <ChevronDown size={16} className="-rotate-90" />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* ── 로또 배너 ── */}
                  {!loading && (activeMenu === 'casino' || activeMenu === '') && lotteryProviders.length > 0 && (
                    <div ref={lotteryRef}>
                      <button onClick={() => handleSectionChange('lottery')} className="group relative w-full overflow-hidden flex items-center justify-between px-8 sm:px-16 transition-all" style={{ height: '120px', background: 'linear-gradient(135deg, #1a0a1a 0%, #2b0d2b 40%, #150715 100%)' }}>
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(168,85,247,0.15),transparent_60%)]" />
                        <div className="relative z-10 flex items-center gap-4">
                          <Ticket size={36} className="text-purple-400 drop-shadow-lg group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="text-purple-300 text-xl font-black tracking-widest uppercase">Lottery</p>
                            <p className="text-purple-600 text-sm mt-0.5">로또 게임 {lotteryProviders.reduce((s, p) => s + p.games.length, 0)}개</p>
                          </div>
                        </div>
                        <div className="relative z-10 flex items-center gap-2 text-purple-400 text-sm font-semibold group-hover:translate-x-1 transition-transform">
                          게임 보기 <ChevronDown size={16} className="-rotate-90" />
                        </div>
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="w-full mt-0 pb-16">
                <img src={IMG.bottomBanner} alt="Gaming Brands" className="w-full object-contain" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Game launch modal — 로딩 중 (작은 모달) ── */}
      {launchModal && !launchModal.openedInNewTab && launchModal.loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-[#c9a227]/20 rounded-2xl w-full max-w-xs shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#c9a227]/10">
              <div>
                <p className="text-sm font-bold text-white leading-tight">{launchModal.game.game_name}</p>
                <p className="text-[11px] text-slate-500">{launchModal.provider.provider_name}</p>
              </div>
              <button
                onClick={handleModalClose}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-6 py-10 flex flex-col items-center gap-4">
              <Loader2 size={36} className="text-[#c9a227] animate-spin" />
              <div className="text-center">
                <p className="text-white font-bold text-base">게임 실행중</p>
                <p className="text-slate-500 text-xs mt-1">게임을 불러오는 중...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Game launch modal — 오류 (작은 모달) ── */}
      {launchModal && !launchModal.openedInNewTab && launchModal.error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-[#c9a227]/20 rounded-2xl w-full max-w-xs shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#c9a227]/10">
              <div>
                <p className="text-sm font-bold text-white leading-tight">{launchModal.game.game_name}</p>
                <p className="text-[11px] text-slate-500">{launchModal.provider.provider_name}</p>
              </div>
              <button onClick={handleModalClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0">
                <X size={15} />
              </button>
            </div>
            <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
              <AlertCircle size={36} className="text-red-400" />
              <div>
                <p className="text-white font-bold text-base">게임 실행 실패</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">{launchModal.error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Game launch modal — iframe (큰 모달) ── */}
      {launchModal && !launchModal.openedInNewTab && !launchModal.loading && !launchModal.error && launchModal.launchUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-[#c9a227]/20 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#c9a227]/10 shrink-0">
              <div>
                <p className="text-sm font-bold text-white">{launchModal.game.game_name}</p>
                <p className="text-xs text-slate-500">{launchModal.provider.provider_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenInNewTab}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a227]/10 hover:bg-[#c9a227]/20 text-[#c9a227] rounded-full transition-colors border border-[#c9a227]/20"
                >
                  <ExternalLink size={11} />새 탭
                </button>
                <button
                  onClick={handleModalClose}
                  disabled={closingGame}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
                >
                  {closingGame ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <iframe
                src={launchModal.launchUrl}
                className="w-full h-full rounded-b-2xl"
                allow="fullscreen"
                title={launchModal.game.game_name}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Game launch modal (새 탭 모드 — 작은 모달) ── */}
      {launchModal?.openedInNewTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-[#c9a227]/20 rounded-2xl w-full max-w-xs shadow-2xl shadow-black/80">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#c9a227]/10">
              <div>
                <p className="text-sm font-bold text-white leading-tight">{launchModal.game.game_name}</p>
                <p className="text-[11px] text-slate-500">{launchModal.provider.provider_name}</p>
              </div>
              <button
                onClick={handleModalClose}
                disabled={closingGame}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 shrink-0"
              >
                {closingGame ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
              </button>
            </div>
            {/* Body */}
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              {closingGame ? (
                <>
                  <Loader2 size={36} className="text-[#c9a227] animate-spin" />
                  <div>
                    <p className="text-white font-bold text-base">게임 정산중</p>
                    <p className="text-slate-500 text-xs mt-1">잔액을 회수하고 있습니다...</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-[#c9a227]/10 border border-[#c9a227]/25 flex items-center justify-center">
                    <ExternalLink size={24} className="text-[#c9a227]" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base">게임이 새 탭에서 열렸습니다</p>
                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                      게임 탭을 닫으면 자동으로 정산됩니다.
                    </p>
                  </div>
                  <button
                    onClick={handleOpenInNewTab}
                    className="flex items-center gap-2 px-4 py-2 bg-[#c9a227]/10 hover:bg-[#c9a227]/20 border border-[#c9a227]/25 text-[#c9a227] rounded-full text-xs font-semibold transition-colors"
                  >
                    <ExternalLink size={12} />
                    게임 다시 열기
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Login modal ── */}
      <GameLoginModal
        open={showLoginModal}
        onLogin={handleLogin}
        onClose={() => setShowLoginModal(false)}
        onSwitchToSignup={() => { setShowLoginModal(false); onSignup(); }}
        isLoading={loginLoading}
      />
    </div>
  );
}
