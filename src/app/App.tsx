import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import { supabase, supabaseUrl } from '../../utils/supabase/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/admin/Sidebar';
import Header from './components/admin/Header';
import Dashboard from './components/admin/Dashboard';
import MemberList from './components/admin/MemberList';
import TransactionManage from './components/admin/TransactionManage';
import PartnerHierarchy from './components/admin/PartnerHierarchy';
import BettingHistory from './components/admin/BettingHistory';
import DailySettlement from './components/admin/DailySettlement';
import TotalSettlementTree from './components/admin/TotalSettlementTree';
import Notice from './components/admin/Notice';
import CustomerSupport from './components/admin/CustomerSupport';
import MessageCenter from './components/admin/MessageCenter';
import BannerManage from './components/admin/BannerManage';
import OnlineUsers from './components/admin/OnlineUsers';
import OnlineAdmins from './components/admin/OnlineAdmins';
import BlackMemberManage from './components/admin/BlackMemberManage';
import PointManage from './components/admin/PointManage';
import AccessLogs from './components/admin/AccessLogs';
import MenuManage from './components/admin/MenuManage';
import SystemSettings from './components/admin/SystemSettings';
import MoneyLogs from './components/admin/MoneyLogs';
import GameVendorManage from './components/admin/GameVendorManage';
import GameProviderManage from './components/admin/GameProviderManage';
import GameListManage from './components/admin/GameListManage';
import Login from './components/admin/Login';
import GameLobby, { ACTIVE_GAME_SESSION_KEY } from './components/game/GameLobby';
import { Toaster } from './components/ui/sonner';

function setFavicon(emoji: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, login, logout } = useAuth();

  useEffect(() => {
    document.body.classList.add('dark');
    document.title = 'GMS 시스템';
    setFavicon('⚙️');
  }, []);

  if (!user) {
    return <Login onLogin={login} />;
  }

  const getPageTitle = () => {
    const pathname = location.pathname;

    const titles: Record<string, string> = {
      '/admin': '대시보드',
      '/admin/online/users': '온라인 접속현황',
      '/admin/online/admins': '관리자 접속현황',
      '/admin/members/list': '회원 리스트',
      '/admin/members/black': '블랙회원 관리',
      '/admin/partners/hierarchy': '파트너 계층관리',
      '/admin/transactions/manage': '입출금 관리',
      '/admin/transactions/points': '포인트 관리',
      '/admin/betting': '베팅 내역',
      '/admin/settlement/daily': '일일 정산',
      '/admin/settlement/total': '통합 정산',
      '/admin/customer/notice': '공지사항',
      '/admin/customer/support': '고객센터',
      '/admin/customer/message': '메시지 센터',
      '/admin/customer/banner': '배너 관리',
      '/admin/game/vendor': '게임사 API 등록',
      '/admin/game/provider': '게임 제공사 관리',
      '/admin/game/list': '게임 목록 관리',
      '/admin/system/logs': '접속 및 사용 기록',
      '/admin/system/money-logs': '머니 로그 관리',
      '/admin/system/menu': '메뉴 관리',
      '/admin/system/settings': '시스템 설정',
    };
    return titles[pathname] || '대시보드';
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex h-screen bg-slate-900">
      <Sidebar currentPath={location.pathname} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={getPageTitle()} />
<main className="flex-1 overflow-y-auto">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="online/users" element={<OnlineUsers />} />
            <Route path="online/admins" element={<OnlineAdmins />} />
            <Route path="members/list" element={<MemberList />} />
            <Route path="members/black" element={<BlackMemberManage />} />
            <Route path="transactions/manage" element={<TransactionManage />} />
            <Route path="transactions/points" element={<PointManage />} />
            <Route path="partners/hierarchy" element={<PartnerHierarchy />} />
            <Route path="betting" element={<BettingHistory />} />
            <Route path="settlement/daily" element={<DailySettlement />} />
            <Route path="settlement/total" element={<TotalSettlementTree />} />
            <Route path="customer/notice" element={<Notice />} />
            <Route path="customer/support" element={<CustomerSupport />} />
            <Route path="customer/message" element={<MessageCenter />} />
            <Route path="customer/banner" element={<BannerManage />} />
            <Route path="game/vendor" element={<GameVendorManage />} />
            <Route path="game/provider" element={<GameProviderManage />} />
            <Route path="game/list" element={<GameListManage />} />
            <Route path="game/balance" element={<GameVendorManage />} />
            <Route path="system/logs" element={<AccessLogs />} />
            <Route path="system/money-logs" element={<MoneyLogs />} />
            <Route path="system/menu" element={<MenuManage />} />
            <Route path="system/settings" element={<SystemSettings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

const GAME_SESSION_KEY = 'benz_game_session';

function GameLayout() {
  const [balance, setBalance] = useState(0);
  const [gameUser, setGameUser] = useState<{ id: string; username: string; name: string; parent_id?: string | null } | null>(() => {
    try {
      const stored = localStorage.getItem(GAME_SESSION_KEY);
      return stored ? JSON.parse(stored).user : null;
    } catch { return null; }
  });

  useEffect(() => {
    document.body.classList.add('dark');
    document.title = '프리미엄 벤츠카지노';
    setFavicon('🏎️');
  }, []);

  // 저장된 세션 복원 시 잔액 조회 + 계정 유효성 검증
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = localStorage.getItem(GAME_SESSION_KEY);
        if (!stored) return;
        const { user: savedUser } = JSON.parse(stored);
        if (!savedUser?.id) return;
        const { data } = await supabase
          .from('users')
          .select('id, username, name, balance, status, role')
          .eq('id', savedUser.id)
          .single();
        if (!data || data.status !== 'active' || data.role !== 'member') {
          localStorage.removeItem(GAME_SESSION_KEY);
          setGameUser(null);
          setBalance(0);
          return;
        }
        setGameUser({ id: data.id, username: data.username, name: data.name ?? data.username });
        setBalance(Number(data.balance ?? 0));
        await supabase.from('users').update({ is_online: true, last_heartbeat_at: new Date().toISOString() }).eq('id', data.id);
      } catch { /* 세션 복원 실패 시 무시 */ }
    };
    restore();
  }, []);

  // 전역 heartbeat (30초) + 10분 비활성 시 자동 오프라인
  useEffect(() => {
    if (!gameUser) return;

    const HEARTBEAT_MS = 30_000;
    const INACTIVE_MS = 10 * 60 * 1000;
    let lastActivity = Date.now();

    const onActivity = () => { lastActivity = Date.now(); };
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const sendOffline = () => {
      const stored = localStorage.getItem(ACTIVE_GAME_SESSION_KEY);
      if (stored) {
        try {
          const { userId, cashout_token } = JSON.parse(stored);
          navigator.sendBeacon(
            `${supabaseUrl}/functions/v1/cashout-on-exit`,
            new Blob([JSON.stringify({ userId, cashout_token })], { type: 'application/json' })
          );
        } catch { /* 무시 */ }
      } else {
        navigator.sendBeacon(
          `${supabaseUrl}/functions/v1/set-user-offline`,
          new Blob([JSON.stringify({ userId: gameUser.id })], { type: 'application/json' })
        );
      }
    };

    const tick = async () => {
      const idle = Date.now() - lastActivity;
      if (idle >= INACTIVE_MS) {
        // 10분 비활성 → 오프라인 처리 후 로그아웃
        sendOffline();
        localStorage.removeItem(GAME_SESSION_KEY);
        setGameUser(null);
        setBalance(0);
        return;
      }

      // heartbeat: last_heartbeat_at 갱신 + 활성 게임 세션이 있으면 last_activity_at도 갱신
      const now = new Date().toISOString();
      await supabase.from('users').update({ last_heartbeat_at: now }).eq('id', gameUser.id);

      const stored = localStorage.getItem(ACTIVE_GAME_SESSION_KEY);
      if (stored) {
        supabase
          .from('online_sessions')
          .update({ last_activity_at: now })
          .eq('user_id', gameUser.id)
          .eq('is_active', true)
          .then(() => { /* best-effort */ });
      }
    };

    tick();
    const timer = setInterval(tick, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      activityEvents.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [gameUser?.id]);

  // DB is_online 실시간 구독: 어드민이 강제 오프라인 처리하거나 세션이 만료되면 자동 로그아웃
  useEffect(() => {
    if (!gameUser) return;
    const channel = supabase
      .channel(`user-online-${gameUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${gameUser.id}` },
        (payload) => {
          const updated = payload.new as { is_online: boolean; status: string };
          if (!updated.is_online || updated.status !== 'active') {
            // 서버에서 오프라인 처리되었거나 계정 상태 변경 → 자동 로그아웃
            localStorage.removeItem(GAME_SESSION_KEY);
            setGameUser(null);
            setBalance(0);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameUser?.id]);

  // 페이지 이탈 시 best-effort offline beacon (heartbeat 타임아웃이 1차 보장, 이건 보조)
  useEffect(() => {
    if (!gameUser) return;
    const handleBeforeUnload = () => {
      const stored = localStorage.getItem(ACTIVE_GAME_SESSION_KEY);
      if (stored) {
        try {
          const { userId, cashout_token } = JSON.parse(stored);
          navigator.sendBeacon(
            `${supabaseUrl}/functions/v1/cashout-on-exit`,
            new Blob([JSON.stringify({ userId, cashout_token })], { type: 'application/json' })
          );
        } catch { /* 무시 */ }
      } else {
        navigator.sendBeacon(
          `${supabaseUrl}/functions/v1/set-user-offline`,
          new Blob([JSON.stringify({ userId: gameUser.id })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [gameUser?.id]);

  // verify_user_login RPC로 비밀번호 포함 인증
  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('verify_user_login', {
        p_username: username,
        p_password: password,
      });

      if (error || !data || data.length === 0) {
        const { toast } = await import('sonner');
        toast.error('아이디 또는 비밀번호가 올바르지 않습니다.');
        return false;
      }

      const dbUser = data[0];

      if (dbUser.role !== 'member') {
        const { toast } = await import('sonner');
        toast.error('회원 계정으로만 로그인 가능합니다.');
        return false;
      }

      if (dbUser.status !== 'active') {
        const { toast } = await import('sonner');
        toast.error('사용이 제한된 계정입니다.');
        return false;
      }

      await supabase
        .from('users')
        .update({ is_online: true, last_login_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })
        .eq('id', dbUser.id);

      supabase.from('access_logs').insert({
        user_id: dbUser.id,
        log_type: 'login',
        action: 'login',
        description: '회원 로그인',
        success: true,
      });

      const userObj = { id: dbUser.id, username: dbUser.username, name: dbUser.name ?? dbUser.username, parent_id: dbUser.parent_id ?? null };
      localStorage.setItem(GAME_SESSION_KEY, JSON.stringify({ user: userObj }));
      setGameUser(userObj);
      setBalance(Number(dbUser.balance ?? 0));

      const { toast } = await import('sonner');
      toast.success('로그인되었습니다.');
      return true;
    } catch {
      const { toast } = await import('sonner');
      toast.error('서버 연결에 실패했습니다.');
      return false;
    }
  };

  const handleLogout = async () => {
    if (gameUser) {
      await supabase.from('users').update({ is_online: false, last_heartbeat_at: null }).eq('id', gameUser.id);
      supabase.from('access_logs').insert({
        user_id: gameUser.id,
        log_type: 'logout',
        action: 'logout',
        description: '회원 로그아웃',
        success: true,
      });
    }
    localStorage.removeItem(GAME_SESSION_KEY);
    setGameUser(null);
    setBalance(0);
  };

  return (
    <>
      <GameLobby
        user={gameUser}
        balance={balance}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSignup={() => {}}
      />
      <Toaster />
    </>
  );
}

function ComingSoon() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">🚧</div>
        <h2 className="text-2xl font-bold text-slate-100 mb-2">준비 중입니다</h2>
        <p className="text-slate-400">이 페이지는 곧 추가될 예정입니다.</p>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminHost =
    window.location.hostname === "gmsadmin.vercel.app";

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {isAdminHost ? (
            <>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/admin/*" element={<AdminLayout />} />
            </>
          ) : (
            <>
              <Route path="/admin/*" element={<AdminLayout />} />
              <Route path="/*" element={<GameLayout />} />
            </>
          )}
        </Routes>

        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}