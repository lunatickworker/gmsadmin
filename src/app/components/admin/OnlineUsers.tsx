import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Users, Monitor, Clock, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { supabase, supabaseUrl } from '../../../utils/supabase/client';
import { supabaseAnonKey } from '../../../utils/supabase/client';
import { api } from '../../../utils/api';
import { useAuth } from '../../context/AuthContext';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const PARTNER_ROLE: Record<string, string> = {
  system_admin: '시스템관리자', operator: '운영사', head_office: '본사',
  sub_office: '부본사', distributor: '총판', store: '매장', member: '회원',
};

interface SessionRow {
  id: string;
  user_id: string;
  ip_address: string | null;
  login_at: string | null;
  last_activity_at: string | null;
  provider_name: string | null;
  game_name: string | null;
  user: {
    id: string;
    username: string;
    name: string | null;
    balance: number | null;
    last_heartbeat_at: string | null;
    parent: { username: string; name: string | null; role: string } | null;
  } | null;
}

function isStillOnline(row: SessionRow): boolean {
  const heartbeat = row.user?.last_heartbeat_at;
  if (!heartbeat) return true;
  return Date.now() - new Date(heartbeat).getTime() < ONLINE_THRESHOLD_MS;
}

function timeDiff(iso: string | null): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR');
}

function BalanceCell({ userId, initialBalance }: { userId: string; initialBalance: number | null }) {
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('no token');
      const res = await api.getUserGameBalance(userId, token);
      setBalance(res.balance ?? null);
      setSource(res.source ?? null);
    } catch {
      // 폴백: DB에서 직접 조회
      const { data } = await supabase.from('users').select('balance').eq('id', userId).single();
      setBalance(data?.balance ?? null);
      setSource('db');
    } finally {
      setLoading(false);
    }
  };

  const isLive = source && source !== 'db' && source !== 'db_fallback';

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-slate-300 text-sm font-medium">
        {balance !== null ? `₩${Number(balance).toLocaleString()}` : '-'}
      </span>
      {isLive && (
        <span className="px-1 py-0.5 text-[10px] bg-green-500/15 text-green-400 rounded border border-green-500/20" title={`${source} API 실시간`}>
          LIVE
        </span>
      )}
      <button
        onClick={refresh}
        className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-600/50 transition-colors"
        title={isLive ? `${source} API 실시간 잔액` : '잔액 새로고침'}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
      </button>
    </div>
  );
}

// 강제 로그아웃 확인 모달
function ConfirmModal({
  username,
  onConfirm,
  onCancel,
  loading,
}: {
  username: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <AlertTriangle className="text-red-400" size={20} />
          </div>
          <h3 className="text-lg font-semibold text-slate-100">강제 로그아웃</h3>
        </div>
        <p className="text-slate-300 text-sm mb-1">
          <span className="font-semibold text-white">{username}</span> 회원을 강제 로그아웃 하시겠습니까?
        </p>
        <p className="text-slate-500 text-xs mb-6">
          진행 중인 게임이 종료되고 보유 실머니가 자동 환전 처리됩니다.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {loading ? '처리 중...' : '강제 로그아웃'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnlineUsers() {
  const { user: adminUser } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<{ userId: string; username: string } | null>(null);
  const [forceLoading, setForceLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('online_sessions')
        .select(`
          id, user_id, ip_address, login_at, last_activity_at, provider_name, game_name,
          user:user_id(id, username, name, balance, last_heartbeat_at, parent:parent_id(username, name, role))
        `)
        .eq('is_active', true)
        .order('login_at', { ascending: false });

      setSessions((data as unknown as SessionRow[]) ?? []);
    } catch {
      // 조회 실패 시 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('online-sessions-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'online_sessions' }, () => load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'online_sessions' }, (payload) => {
        setSessions((prev) => prev.filter((s) => s.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'online_sessions' }, (payload) => {
        if (payload.new.is_active === false) {
          setSessions((prev) => prev.filter((s) => s.id !== payload.new.id));
        } else {
          load();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'role=eq.member' }, (payload) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.user_id === payload.new.id
              ? { ...s, user: s.user ? { ...s.user, last_heartbeat_at: payload.new.last_heartbeat_at, balance: payload.new.balance } : s.user }
              : s
          )
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // 30초마다 "방금 전 / N분 전" 시간 표시만 갱신 (데이터 재조회 없음 — Realtime으로 처리)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleForceLogout = async () => {
    if (!confirmTarget) return;
    if (!adminUser?.id) {
      setResultMsg({ type: 'error', text: '관리자 세션 정보가 없습니다. 다시 로그인해 주세요.' });
      return;
    }
    setForceLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-force-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ userId: confirmTarget.userId, adminId: adminUser.id }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? '처리 실패');

      const amount = json.returnedAmount ?? 0;
      setResultMsg({
        type: 'success',
        text: `${confirmTarget.username} 강제 로그아웃 완료. 환전액: ₩${Number(amount).toLocaleString()}`,
      });
      setConfirmTarget(null);
      setTimeout(() => load(), 500);
    } catch (e) {
      setResultMsg({ type: 'error', text: e instanceof Error ? e.message : '오류 발생' });
    } finally {
      setForceLoading(false);
    }
  };

  useEffect(() => {
    if (!resultMsg) return;
    const t = setTimeout(() => setResultMsg(null), 4000);
    return () => clearTimeout(t);
  }, [resultMsg]);

  // user_id 기준 최신 세션 1건만 유지 (중복 세션 방어)
  const deduped = Object.values(
    sessions.reduce<Record<string, SessionRow>>((acc, s) => {
      const existing = acc[s.user_id];
      if (!existing || (s.last_activity_at ?? '') > (existing.last_activity_at ?? '')) {
        acc[s.user_id] = s;
      }
      return acc;
    }, {})
  );

  const displayed = deduped.filter((s) => {
    if (!isStillOnline(s)) return false;
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    const u = s.user;
    return (
      u?.username?.toLowerCase().includes(term) ||
      u?.name?.toLowerCase().includes(term) ||
      s.provider_name?.toLowerCase().includes(term) ||
      s.game_name?.toLowerCase().includes(term)
    );
  });

  const activeCount = displayed.filter((s) => {
    const diff = s.last_activity_at ? Date.now() - new Date(s.last_activity_at).getTime() : 0;
    return diff < 5 * 60 * 1000;
  }).length;

  const idleCount = displayed.length - activeCount;

  return (
    <div className="p-6 space-y-6">
      {confirmTarget && (
        <ConfirmModal
          username={confirmTarget.username}
          onConfirm={handleForceLogout}
          onCancel={() => setConfirmTarget(null)}
          loading={forceLoading}
        />
      )}

      {resultMsg && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          resultMsg.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {resultMsg.text}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Users className="text-blue-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">온라인 접속현황</h2>
            <p className="text-sm text-slate-400">현재 게임 중인 회원 목록</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 안내 배너 */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/8 border border-blue-500/20 rounded-lg">
        <RefreshCw size={15} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-300 leading-relaxed">
          최신 접속 현황을 확인하려면 우측 상단의 <span className="font-semibold text-blue-200">새로고침</span> 버튼을 클릭해 주세요.
          목록은 새로고침 시점의 데이터를 기준으로 표시됩니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Users className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">전체 접속자</p>
              <p className="text-2xl font-bold text-slate-100">{displayed.length}명</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Monitor className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">활성 세션</p>
              <p className="text-2xl font-bold text-slate-100">{activeCount}명</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Clock className="text-yellow-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">유휴 사용자</p>
              <p className="text-2xl font-bold text-slate-100">{idleCount}명</p>
            </div>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="아이디, 닉네임, 게임명으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">아이디</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">닉네임</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">소속 파트너</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">게임명</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">현재 보유금</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">IP 주소</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">로그인 시간</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">마지막 활동</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">상태</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {displayed.map((s) => {
                const u = s.user;
                const isActive = s.last_activity_at
                  ? Date.now() - new Date(s.last_activity_at).getTime() < 5 * 60 * 1000
                  : true;
                const parent = u?.parent;
                return (
                  <tr key={s.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-100 text-sm">{u?.username ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">{u?.name ?? '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {parent ? (
                        <span>
                          <span className="text-slate-500 text-xs mr-1">[{PARTNER_ROLE[parent.role] ?? parent.role}]</span>
                          <span className="text-slate-300">{parent.username}</span>
                          {parent.name && <span className="text-slate-500 text-xs ml-1">({parent.name})</span>}
                        </span>
                      ) : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {s.game_name
                        ? <span className="text-slate-200">{s.game_name}</span>
                        : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u ? <BalanceCell userId={u.id} initialBalance={u.balance} /> : <span className="text-slate-600 text-sm">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 font-mono">
                      {s.ip_address ?? <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">{formatTime(s.login_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">{timeDiff(s.last_activity_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {isActive ? '활성' : '유휴'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {u && (
                        <button
                          onClick={() => setConfirmTarget({ userId: u.id, username: u.username })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg transition-colors text-xs font-medium"
                          title="강제 로그아웃"
                        >
                          <LogOut size={12} />
                          강제 로그아웃
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && displayed.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto text-slate-600 mb-3" size={48} />
            <p className="text-slate-400">현재 게임 중인 회원이 없습니다.</p>
          </div>
        )}

        {loading && sessions.length === 0 && (
          <div className="text-center py-12">
            <Loader2 className="mx-auto text-slate-500 mb-3 animate-spin" size={32} />
            <p className="text-slate-500">불러오는 중...</p>
          </div>
        )}
      </div>
    </div>
  );
}
