import { Users, DollarSign, TrendingUp, Activity, ArrowUp, ArrowDown, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { useAuth } from '../../context/AuthContext';
import InitDataButton from './InitDataButton';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: any;
}

function StatCard({ title, value, change, isPositive, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm mb-2">{title}</p>
          <h3 className="text-2xl font-bold text-slate-100 mb-2">{value}</h3>
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            <span>{change}</span>
          </div>
        </div>
        <div className="p-3 bg-blue-600/20 rounded-lg">
          <Icon size={24} className="text-blue-400" />
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function calcChangePct(today: number, yesterday: number): string {
  if (yesterday === 0) return today > 0 ? '+∞%' : '0%';
  const pct = ((today - yesterday) / yesterday) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs 어제`;
}

const COLORS = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-red-500'];

export default function Dashboard() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'system_admin';

  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [bets, setBets] = useState<any[]>([]);
  const [hasMember, setHasMember] = useState(true);
  const [loading, setLoading] = useState(true);
  const [operatorBalance, setOperatorBalance] = useState(0);
  const [gameBreakdown, setGameBreakdown] = useState<{ name: string; pct: number; color: string }[]>([]);
  const [notifications, setNotifications] = useState<{ color: string; text: string; time: string }[]>([]);

  const fetchOperatorBalance = async () => {
    const { data } = await supabase
      .from('users')
      .select('balance')
      .eq('role', 'operator')
      .eq('status', 'active');
    setOperatorBalance((data ?? []).reduce((s, r: any) => s + Number(r.balance ?? 0), 0));
  };

  useEffect(() => {
    if (!user) return;
    loadData();

    if (isSystemAdmin) {
      fetchOperatorBalance();
      const ch = supabase.channel('dashboard-operator-balance')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'role=eq.operator' }, fetchOperatorBalance)
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [user?.id, isSystemAdmin]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString();

      // ── 조직격리: system_admin은 전체, 그 외는 자신의 하위 트리만 ──
      // hierarchy_path 배열에 현재 유저 ID가 포함된 모든 유저 = 하위 조직원
      let orgUserIds: string[] | null = null;
      if (!isSystemAdmin) {
        const { data: orgUsers } = await supabase
          .from('users')
          .select('id')
          .contains('hierarchy_path', [user.id]);
        orgUserIds = (orgUsers ?? []).map((u: any) => u.id);
      }

      // 빈 조직이면 쿼리가 풀스캔 되지 않도록 impossible ID 사용
      const IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';

      // 유저 테이블에 대한 조직 필터
      const memberFilter = (q: any): any => {
        if (isSystemAdmin) return q;
        return q.contains('hierarchy_path', [user.id]);
      };

      // user_id 컬럼이 있는 테이블에 대한 조직 필터
      const userIdFilter = (q: any): any => {
        if (orgUserIds === null) return q; // system_admin
        if (orgUserIds.length === 0) return q.eq('user_id', IMPOSSIBLE_ID);
        return q.in('user_id', orgUserIds);
      };

      const [
        { count: totalMembers },
        { count: prevTotalMembers },
        { data: todayDepositRows },
        { data: yesterdayDepositRows },
        { data: todayWithdrawalRows },
        { data: yesterdayWithdrawalRows },
        { count: onlineCount },
        { data: txData },
        { data: betData },
        { count: newMembersToday },
        { data: gameBetsData },
        { count: pendingWithdrawalsCount },
        { data: newMembersList },
        { data: highBetsList },
      ] = await Promise.all([
        // 총 회원수
        memberFilter(supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'member')),
        // 어제까지 총 회원수 (변화율 계산)
        memberFilter(supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'member').lt('created_at', todayStr)),
        // 오늘 입금
        userIdFilter(supabase.from('transactions').select('amount').eq('type', 'deposit').eq('status', 'approved').gte('created_at', todayStr)),
        // 어제 입금
        userIdFilter(supabase.from('transactions').select('amount').eq('type', 'deposit').eq('status', 'approved').gte('created_at', yesterdayStr).lt('created_at', todayStr)),
        // 오늘 출금
        userIdFilter(supabase.from('transactions').select('amount').eq('type', 'withdrawal').eq('status', 'approved').gte('created_at', todayStr)),
        // 어제 출금
        userIdFilter(supabase.from('transactions').select('amount').eq('type', 'withdrawal').eq('status', 'approved').gte('created_at', yesterdayStr).lt('created_at', todayStr)),
        // 현재 접속자
        userIdFilter(supabase.from('online_sessions').select('*', { count: 'exact', head: true }).eq('is_active', true)),
        // 최근 입출금 5건
        userIdFilter(supabase.from('transactions').select('id, type, amount, status, created_at, user_id, users(name, username)').order('created_at', { ascending: false }).limit(5)),
        // 최근 베팅 5건
        userIdFilter(supabase.from('betting_history').select('id, game_name, bet_amount, win_amount, created_at, user_id, users(username)').order('created_at', { ascending: false }).limit(5)),
        // 오늘 신규 회원
        memberFilter(supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'member').gte('created_at', todayStr)),
        // 오늘 게임별 베팅 데이터
        userIdFilter(supabase.from('betting_history').select('game_name, bet_amount').gte('created_at', todayStr)),
        // 대기 중인 출금 건수
        userIdFilter(supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'withdrawal').eq('status', 'pending')),
        // 오늘 가입 회원 목록 (알림용)
        memberFilter(supabase.from('users').select('username, created_at').eq('role', 'member').gte('created_at', todayStr).order('created_at', { ascending: false }).limit(3)),
        // 고액 베팅 (알림용)
        userIdFilter(supabase.from('betting_history').select('id, game_name, bet_amount, created_at, users(username)').gte('created_at', todayStr).order('bet_amount', { ascending: false }).limit(3)),
      ]);

      const todayDeposits = (todayDepositRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const yesterdayDeposits = (yesterdayDepositRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const todayWithdrawals = (todayWithdrawalRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const yesterdayWithdrawals = (yesterdayWithdrawalRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

      const memberPct = calcChangePct(totalMembers ?? 0, prevTotalMembers ?? 0);
      const depositPct = calcChangePct(todayDeposits, yesterdayDeposits);
      const withdrawalPct = calcChangePct(todayWithdrawals, yesterdayWithdrawals);

      // 게임별 베팅 비율 계산
      const gameMap: Record<string, number> = {};
      let totalBetAmt = 0;
      for (const row of (gameBetsData ?? [])) {
        const name = row.game_name ?? '기타';
        gameMap[name] = (gameMap[name] ?? 0) + Number(row.bet_amount ?? 0);
        totalBetAmt += Number(row.bet_amount ?? 0);
      }
      const newGameBreakdown = Object.entries(gameMap)
        .map(([name, amount], i) => ({ name, pct: totalBetAmt > 0 ? Math.round(amount / totalBetAmt * 100) : 0, color: COLORS[i % COLORS.length] }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5);
      setGameBreakdown(newGameBreakdown);

      // 실시간 알림 생성
      const notifs: { color: string; text: string; time: string }[] = [];
      for (const m of (newMembersList ?? []).slice(0, 2)) {
        notifs.push({ color: 'green', text: `신규 회원 가입: ${m.username}`, time: formatRelativeTime(m.created_at) });
      }
      if ((pendingWithdrawalsCount ?? 0) > 0) {
        notifs.push({ color: 'yellow', text: `대기 중인 출금 요청 ${pendingWithdrawalsCount}건`, time: '현재' });
      }
      const highBet = (highBetsList ?? [])[0];
      if (highBet && Number(highBet.bet_amount ?? 0) > 0) {
        notifs.push({ color: 'blue', text: `고액 베팅 ₩${Number(highBet.bet_amount).toLocaleString()} (${(highBet.users as any)?.username ?? '-'})`, time: formatRelativeTime(highBet.created_at) });
      }
      setNotifications(notifs.length > 0 ? notifs : [{ color: 'slate', text: '알림 없음', time: '-' }]);

      setStats({
        totalMembers: totalMembers ?? 0,
        todayDeposits,
        todayWithdrawals,
        onlineUsers: onlineCount ?? 0,
        netProfit: todayDeposits - todayWithdrawals,
        todayBetAmount: totalBetAmt,
        todayBetCount: gameBetsData?.length ?? 0,
        newMembersToday: newMembersToday ?? 0,
        memberPct,
        depositPct,
        withdrawalPct,
        depositIsPositive: !depositPct.startsWith('-'),
        withdrawalIsPositive: !withdrawalPct.startsWith('-'),
        memberIsPositive: !memberPct.startsWith('-'),
      });

      setHasMember((totalMembers ?? 0) > 0);

      setTransactions(txData ?? []);
      setBets((betData ?? []).map((b: any) => ({
        id: b.id,
        user: (b.users as any)?.username ?? '-',
        game: b.game_name ?? '-',
        bet: Number(b.bet_amount ?? 0),
        result: Number(b.win_amount ?? 0) - Number(b.bet_amount ?? 0),
        time: b.created_at ? new Date(b.created_at).toLocaleString('ko-KR') : '-',
      })));
    } catch (error) {
      console.error('Dashboard loadData error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400">로딩 중...</div>
      </div>
    );
  }

  const recentTransactions = transactions.map((tx: any) => ({
    id: tx.id,
    name: (tx.users as any)?.name || (tx.users as any)?.username || '-',
    type: tx.type === 'deposit' ? '입금' : '출금',
    amount: Number(tx.amount),
    status: ({ pending: '대기', approved: '승인', completed: '완료', rejected: '거절', reviewing: '검토중', cancelled: '취소' } as Record<string, string>)[tx.status] ?? tx.status,
    time: tx.created_at ? new Date(tx.created_at).toLocaleString('ko-KR') : '-',
  }));

  const notifColorMap: Record<string, string> = {
    green: 'bg-green-400',
    yellow: 'bg-yellow-400',
    blue: 'bg-blue-400',
    slate: 'bg-slate-500',
  };

  return (
    <div className="p-6 space-y-6">
      {!hasMember && (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-blue-400 font-medium mb-1">데이터가 없습니다</p>
            <p className="text-slate-400 text-sm">샘플 데이터를 추가하여 시작하세요</p>
          </div>
          <InitDataButton />
        </div>
      )}

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isSystemAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <StatCard
          title="총 회원수"
          value={(stats?.totalMembers ?? 0).toLocaleString()}
          change={stats?.memberPct ?? '0%'}
          isPositive={stats?.memberIsPositive ?? true}
          icon={Users}
        />
        <StatCard
          title="오늘 입금액"
          value={`₩${(stats?.todayDeposits ?? 0).toLocaleString()}`}
          change={stats?.depositPct ?? '0%'}
          isPositive={stats?.depositIsPositive ?? true}
          icon={DollarSign}
        />
        <StatCard
          title="오늘 출금액"
          value={`₩${(stats?.todayWithdrawals ?? 0).toLocaleString()}`}
          change={stats?.withdrawalPct ?? '0%'}
          isPositive={stats?.withdrawalIsPositive ?? false}
          icon={TrendingUp}
        />
        <StatCard
          title="현재 접속자"
          value={(stats?.onlineUsers ?? 0).toString()}
          change="실시간 반영"
          isPositive={true}
          icon={Activity}
        />
        {isSystemAdmin && (
          <StatCard
            title="운영사 보유금"
            value={`₩${operatorBalance.toLocaleString()}`}
            change="실시간 반영"
            isPositive={true}
            icon={Wallet}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-6 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100">최근 입출금 내역</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-slate-700/50">
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">회원</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">유형</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">금액</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">상태</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">시간</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">내역 없음</td></tr>
                ) : recentTransactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                    <td className="px-6 py-4 text-sm text-slate-200">{tx.name}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${tx.type === '입금' ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">₩{tx.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${tx.status === '완료' || tx.status === '승인' ? 'bg-green-600/20 text-green-400' : tx.status === '거절' || tx.status === '취소' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{tx.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-6 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100">최근 베팅 내역</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-slate-700/50">
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">회원</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">게임</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">베팅</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">결과</th>
                  <th className="px-6 py-3 text-sm font-medium text-slate-300">시간</th>
                </tr>
              </thead>
              <tbody>
                {bets.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">내역 없음</td></tr>
                ) : bets.map((bet) => (
                  <tr key={bet.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                    <td className="px-6 py-4 text-sm text-slate-200">{bet.user}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">{bet.game}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">₩{bet.bet.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={bet.result > 0 ? 'text-green-400' : 'text-red-400'}>
                        {bet.result > 0 ? '+' : ''}₩{bet.result.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{bet.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">게임별 베팅 현황</h3>
          {gameBreakdown.length === 0 ? (
            <p className="text-slate-500 text-sm">오늘 베팅 데이터 없음</p>
          ) : (
            <div className="space-y-4">
              {gameBreakdown.map((g) => (
                <div key={g.name}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">{g.name}</span>
                    <span className="text-slate-400">{g.pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${g.color}`} style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">실시간 알림</h3>
          <div className="space-y-3">
            {notifications.map((n, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className={`w-2 h-2 ${notifColorMap[n.color] ?? 'bg-slate-400'} rounded-full mt-1.5 flex-shrink-0`} />
                <div>
                  <p className="text-slate-200">{n.text}</p>
                  <p className="text-slate-400 text-xs">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">오늘의 요약</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">신규 회원</span>
              <span className="text-slate-200 font-medium">+{(stats?.newMembersToday ?? 0).toLocaleString()}명</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">총 베팅 건수</span>
              <span className="text-slate-200 font-medium">{(stats?.todayBetCount ?? 0).toLocaleString()}건</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">총 베팅 금액</span>
              <span className="text-slate-200 font-medium">₩{(stats?.todayBetAmount ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">순 수익</span>
              <span className={`font-medium ${(stats?.netProfit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(stats?.netProfit ?? 0) >= 0 ? '+' : ''}₩{(stats?.netProfit ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
