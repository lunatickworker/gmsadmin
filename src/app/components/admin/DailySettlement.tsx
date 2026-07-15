import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { supabase } from '../../../utils/supabase/client';

interface SettlementRow {
  date: string;
  level: number;
  levelName: string;
  username: string;
  casinoRollingRate: number;
  slotRollingRate: number;
  casinoLosingRate: number;
  slotLosingRate: number;
  losingRate: number;
  gongBetEnabled: boolean;
  gongBetRate: number;
  balance: number;
  points: number;
  onlineDeposit: number;
  onlineWithdrawal: number;
  manualDeposit: number;
  manualWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  totalRolling: number;
  totalLosing: number;
  individualRolling: number;
  individualLosing: number;
  gongBetCutRolling: number;
}

interface DayAccum {
  onlineDeposit: number;
  onlineWithdrawal: number;
  manualDeposit: number;
  manualWithdrawal: number;
  pointGiven: number;
  pointRecovered: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
}

function makeDayAccum(): DayAccum {
  return {
    onlineDeposit: 0, onlineWithdrawal: 0,
    manualDeposit: 0, manualWithdrawal: 0,
    pointGiven: 0, pointRecovered: 0,
    casinoBet: 0, casinoWin: 0,
    slotBet: 0, slotWin: 0,
  };
}

function isSlotGame(gameType: string | null | undefined): boolean {
  const t = (gameType || '').toLowerCase();
  return t.includes('slot') || t.includes('slots');
}

function toDateStr(ts: string | null | undefined): string {
  if (!ts) return '';
  return ts.slice(0, 10);
}

function calcRolling(casinoBet: number, slotBet: number, casinoRate: number, slotRate: number) {
  return casinoBet * (casinoRate / 100) + slotBet * (slotRate / 100);
}

function calcGongBetCut(totalRolling: number, gongBetEnabled: boolean, gongBetRate: number) {
  return gongBetEnabled ? totalRolling * (gongBetRate / 100) : 0;
}

function calcGGR(casinoBet: number, casinoWin: number, slotBet: number, slotWin: number) {
  return (casinoBet - casinoWin) + (slotBet - slotWin);
}

function getLevelColor(level: number) {
  const map: Record<number, string> = {
    2: 'bg-red-600/30 text-red-300',
    3: 'bg-cyan-600/30 text-cyan-300',
    4: 'bg-green-600/30 text-green-300',
    5: 'bg-yellow-600/30 text-yellow-300',
    6: 'bg-orange-600/30 text-orange-300',
  };
  return map[level] ?? 'bg-gray-600/30 text-gray-300';
}

// 소스 테이블에서 직접 일일 정산 계산
async function fetchDailySettlements(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ rows: SettlementRow[]; error: string | null }> {
  try {
    const startTs = startDate + 'T00:00:00';
    const endTs = endDate + 'T23:59:59';

    // 사용자 정보 + 파트너 설정 병렬 조회
    const [userRes, settingsRes] = await Promise.all([
      supabase.from('users').select('id, username, role, level, balance').eq('id', userId).maybeSingle(),
      supabase.from('partner_settings').select('casino_rolling_rate, slot_rolling_rate, losing_rate, rolling_shave_enabled, rolling_shave_rate').eq('user_id', userId).maybeSingle(),
    ]);

    const userRow = userRes.data;
    const settings = settingsRes.data;

    const casinoRollingRate = Number(settings?.casino_rolling_rate ?? 0);
    const slotRollingRate = Number(settings?.slot_rolling_rate ?? 0);
    const losingRate = Number(settings?.losing_rate ?? 0);
    const gongBetEnabled = settings?.rolling_shave_enabled ?? false;
    const gongBetRate = Number(settings?.rolling_shave_rate ?? 0);

    // 온라인 입출금 (승인된 거래)
    const txnRes = await supabase
      .from('transactions')
      .select('type, amount, updated_at')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .gte('updated_at', startTs)
      .lte('updated_at', endTs);

    // 수동 입출금
    const manualRes = await supabase
      .from('transaction_manual')
      .select('type, amount, created_at')
      .eq('target_user_id', userId)
      .gte('created_at', startTs)
      .lte('created_at', endTs);

    // 포인트 내역
    const pointRes = await supabase
      .from('points_history')
      .select('type, amount, created_at')
      .eq('user_id', userId)
      .gte('created_at', startTs)
      .lte('created_at', endTs);

    // 베팅 내역 (invest + honor) 병렬 조회
    const [investRes, honorRes] = await Promise.all([
      supabase
        .from('betting_history_invest')
        .select('bet_amount, win_amount, game_type, bet_time')
        .eq('user_id', userId)
        .gte('bet_time', startTs)
        .lte('bet_time', endTs),
      supabase
        .from('betting_history_honor')
        .select('bet_amount, win_amount, game_type, bet_time')
        .eq('user_id', userId)
        .gte('bet_time', startTs)
        .lte('bet_time', endTs),
    ]);

    // 날짜별 데이터 맵 구성
    const dateMap: Record<string, DayAccum> = {};
    const getDay = (d: string) => {
      if (!dateMap[d]) dateMap[d] = makeDayAccum();
      return dateMap[d];
    };

    // 온라인 입출금 집계
    for (const txn of (txnRes.data || [])) {
      const d = toDateStr(txn.updated_at);
      if (!d) continue;
      const day = getDay(d);
      if (txn.type === 'deposit') day.onlineDeposit += Number(txn.amount);
      else if (txn.type === 'withdrawal') day.onlineWithdrawal += Number(txn.amount);
    }

    // 수동 입출금 집계
    for (const txn of (manualRes.data || [])) {
      const d = toDateStr(txn.created_at);
      if (!d) continue;
      const day = getDay(d);
      if (txn.type === 'deposit') day.manualDeposit += Number(txn.amount);
      else if (txn.type === 'withdrawal') day.manualWithdrawal += Number(txn.amount);
    }

    // 포인트 집계
    for (const pt of (pointRes.data || [])) {
      const d = toDateStr(pt.created_at);
      if (!d) continue;
      const day = getDay(d);
      if (pt.type === 'grant' || pt.type === 'add') day.pointGiven += Number(pt.amount);
      else if (pt.type === 'deduct' || pt.type === 'use') day.pointRecovered += Number(pt.amount);
    }

    // 베팅 집계 (invest)
    for (const bet of (investRes.data || [])) {
      const d = toDateStr(bet.bet_time);
      if (!d) continue;
      const day = getDay(d);
      if (isSlotGame(bet.game_type)) {
        day.slotBet += Number(bet.bet_amount);
        day.slotWin += Number(bet.win_amount);
      } else {
        day.casinoBet += Number(bet.bet_amount);
        day.casinoWin += Number(bet.win_amount);
      }
    }

    // 베팅 집계 (honor)
    for (const bet of (honorRes.data || [])) {
      const d = toDateStr(bet.bet_time);
      if (!d) continue;
      const day = getDay(d);
      if (isSlotGame(bet.game_type)) {
        day.slotBet += Number(bet.bet_amount);
        day.slotWin += Number(bet.win_amount);
      } else {
        day.casinoBet += Number(bet.bet_amount);
        day.casinoWin += Number(bet.win_amount);
      }
    }

    // 데이터가 없는 경우 빈 결과
    if (Object.keys(dateMap).length === 0) {
      return { rows: [], error: null };
    }

    // 날짜별 행 생성 (내림차순)
    const rows: SettlementRow[] = Object.entries(dateMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, day]) => {
        const totalRolling = calcRolling(day.casinoBet, day.slotBet, casinoRollingRate, slotRollingRate);
        const gongBetCutRolling = calcGongBetCut(totalRolling, gongBetEnabled, gongBetRate);
        const individualRolling = totalRolling - gongBetCutRolling;

        const ggr = calcGGR(day.casinoBet, day.casinoWin, day.slotBet, day.slotWin);
        const netGGR = ggr - totalRolling;
        const totalLosing = netGGR > 0 ? netGGR * (losingRate / 100) : 0;

        return {
          date,
          level: userRow?.level ?? 0,
          levelName: userRow?.role ?? '',
          username: userRow?.username ?? userId,
          casinoRollingRate,
          slotRollingRate,
          casinoLosingRate: 0,
          slotLosingRate: 0,
          losingRate,
          gongBetEnabled,
          gongBetRate,
          balance: Number(userRow?.balance ?? 0),
          points: 0,
          onlineDeposit: day.onlineDeposit,
          onlineWithdrawal: day.onlineWithdrawal,
          manualDeposit: day.manualDeposit,
          manualWithdrawal: day.manualWithdrawal,
          pointGiven: day.pointGiven,
          pointRecovered: day.pointRecovered,
          casinoBet: day.casinoBet,
          casinoWin: day.casinoWin,
          slotBet: day.slotBet,
          slotWin: day.slotWin,
          totalRolling,
          totalLosing,
          individualRolling,
          individualLosing: totalLosing,
          gongBetCutRolling,
        } as SettlementRow;
      });

    return { rows, error: null };
  } catch (err: any) {
    console.error('fetchDailySettlements 오류:', err);
    return { rows: [], error: err?.message ?? String(err) };
  }
}

export default function DailySettlement() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showSettingColumns, setShowSettingColumns] = useState(true);

  const canSeeGongBet = user?.role === 'system_admin' || user?.role === 'operator';
  const hasGongBetActive = rows.some(r => r.gongBetEnabled);
  const showGongBetColumn = canSeeGongBet && hasGongBetActive;
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(today);
  const [endDate, setEndDate] = useState<Date>(today);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(null);
    try {
      const start = format(startDate, 'yyyy-MM-dd');
      const end = format(endDate, 'yyyy-MM-dd');
      const result = await fetchDailySettlements(user.id, start, end);
      if (result.error) setFetchError(result.error);
      setRows(Array.isArray(result.rows) ? result.rows : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, startDate, endDate]);

  const calcDepositDiff = (row: SettlementRow) =>
    (row.onlineDeposit + row.manualDeposit) - (row.onlineWithdrawal + row.manualWithdrawal);

  const w = (n: number) => `₩${Math.round(n).toLocaleString()}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">일일 정산</h2>
          <p className="text-slate-400 text-sm mt-1">
            날짜별 본인 정산 현황 — 루징 계산: (GGR − 정상롤링금) × 루징률
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSettingColumns(!showSettingColumns)}
            className="flex items-center gap-2"
          >
            {showSettingColumns ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            정산 기준 설정 {showSettingColumns ? '숨기기' : '보기'}
          </Button>
          <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
            <Download size={18} />
            엑셀 다운로드
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm">시작일:</span>
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <CalendarIcon size={16} />
                  {format(startDate, 'yyyy-MM-dd')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => { if (d) { setStartDate(d); setStartOpen(false); } }}
                  className="bg-slate-800"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm">종료일:</span>
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <CalendarIcon size={16} />
                  {format(endDate, 'yyyy-MM-dd')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) => { if (d) { setEndDate(d); setEndOpen(false); } }}
                  className="bg-slate-800"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setStartDate(d); setEndDate(d); }}>오늘</Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setStartDate(d); setEndDate(d); }}>어제</Button>
            <Button variant="outline" size="sm" onClick={() => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); setStartDate(start); setEndDate(end); }}>최근 7일</Button>
            <Button variant="outline" size="sm" onClick={() => { const now = new Date(); setStartDate(new Date(now.getFullYear(), now.getMonth(), 1)); setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)); }}>이번 달</Button>
          </div>

          <Button onClick={loadData} disabled={loading} className="flex items-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            새로고침
          </Button>

          {user && (
            <div className="ml-auto">
              <span className="text-sm text-slate-400">현재 레벨: </span>
              <span className={`px-3 py-1 rounded text-sm font-medium ${getLevelColor(user.level)}`}>
                {user.levelName} ({user.username})
              </span>
            </div>
          )}
        </div>
      </Card>

      {fetchError && (
        <div className="bg-red-900/30 border border-red-700/60 rounded-lg px-4 py-3">
          <p className="text-sm text-red-300">
            <span className="font-bold">조회 오류:</span> {fetchError}
          </p>
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-300">
          💡 <span className="font-bold">루징 계산 원칙:</span>{' '}
          NetGGR = GGR − 정상롤링금 → 루징정산액 = NetGGR × 루징률.
          카지노/슬롯 루징률이 각각 설정된 경우 분리 계산.
        </p>
      </div>

      {loading ? (
        <Card className="bg-slate-800 border-slate-700 p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 size={48} className="animate-spin text-blue-500" />
            <p className="text-slate-400">정산 데이터를 불러오는 중...</p>
          </div>
        </Card>
      ) : (
        <Card className="bg-slate-800 border-slate-700 overflow-hidden">
          <div className="overflow-x-auto settlement-scroll" style={{ maxHeight: '70vh' }}>
            <style>{`
              .settlement-scroll::-webkit-scrollbar { height: 12px; width: 12px; }
              .settlement-scroll::-webkit-scrollbar-track { background: #1e293b; border-radius: 6px; }
              .settlement-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 6px; border: 2px solid #1e293b; }
              .settlement-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
              .settlement-scroll { scrollbar-width: auto; scrollbar-color: #475569 #1e293b; }
            `}</style>
            <table className="w-full text-sm" style={{ minWidth: '2200px' }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-700 border-b-2 border-slate-500">
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold sticky left-0 bg-slate-700 z-30 border-r-2 border-slate-600 shadow-lg" style={{ minWidth: '110px' }}>날짜</th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold sticky left-[110px] bg-slate-700 z-30 border-r-2 border-slate-600 shadow-lg" style={{ minWidth: '90px' }}>등급</th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold sticky left-[200px] bg-slate-700 z-30 border-r-2 border-slate-600 shadow-lg" style={{ minWidth: '120px' }}>아이디</th>

                  {showSettingColumns && (
                    <th colSpan={showGongBetColumn ? 4 : 3} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-blue-900/30">
                      정산 기준 설정
                    </th>
                  )}

                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600">보유 자산</th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-green-900/20">온라인 입출금</th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-purple-900/20">수동 입출금</th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600">포인트 관리</th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-yellow-900/30">입출차액</th>
                  <th colSpan={4} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-cyan-900/20">게임 실적</th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-orange-900/30">GGR 합산</th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-pink-900/20">실정산 (총)</th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-emerald-900/20">코드별 실정산</th>
                </tr>
                <tr className="bg-slate-800 border-b-2 border-slate-500">
                  <th className="px-4 py-2 sticky left-0 bg-slate-800 z-30 border-r-2 border-slate-600 shadow-lg" />
                  <th className="px-4 py-2 sticky left-[110px] bg-slate-800 z-30 border-r-2 border-slate-600 shadow-lg" />
                  <th className="px-4 py-2 sticky left-[200px] bg-slate-800 z-30 border-r-2 border-slate-600 shadow-lg" />

                  {showSettingColumns && (
                    <>
                      <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>카지노롤링</th>
                      <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>슬롯롤링</th>
                      <th className="px-4 py-2 text-center text-purple-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>루징</th>
                      {showGongBetColumn && (
                        <th className="px-4 py-2 text-center text-orange-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '80px' }}>공배팅</th>
                      )}
                    </>
                  )}

                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 whitespace-nowrap" style={{ minWidth: '110px' }}>보유머니</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium whitespace-nowrap" style={{ minWidth: '90px' }}>포인트</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-green-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>입금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-green-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>출금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-purple-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>수동입금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-purple-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>수동출금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 whitespace-nowrap" style={{ minWidth: '100px' }}>포인트지급</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium whitespace-nowrap" style={{ minWidth: '100px' }}>포인트회수</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-yellow-900/30 whitespace-nowrap" style={{ minWidth: '120px' }} />
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '120px' }}>카지노 베팅</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '120px' }}>카지노 당첨</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>슬롯 베팅</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>슬롯 당첨</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-orange-900/30 whitespace-nowrap" style={{ minWidth: '120px' }} />
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-pink-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>총 롤링금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-pink-900/20 whitespace-nowrap" style={{ minWidth: '100px' }}>총 루징</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-emerald-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>실정산롤링</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-emerald-900/20 whitespace-nowrap" style={{ minWidth: '100px' }}>실정산루징</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={99} className="px-6 py-10 text-center text-slate-500">
                      선택한 기간에 정산 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const depositDiff = calcDepositDiff(row);
                    const ggr = calcGGR(row.casinoBet, row.casinoWin, row.slotBet, row.slotWin);

                    return (
                      <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-center text-slate-300 text-sm font-medium sticky left-0 bg-slate-800 z-10 border-r-2 border-slate-700 shadow-md">{row.date}</td>
                        <td className="px-4 py-3 text-center sticky left-[110px] bg-slate-800 z-10 border-r-2 border-slate-700 shadow-md">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getLevelColor(row.level)}`}>
                            {row.levelName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-200 font-medium sticky left-[200px] bg-slate-800 z-10 border-r-2 border-slate-700 shadow-md">{row.username}</td>

                        {showSettingColumns && (
                          <>
                            <td className="px-4 py-3 text-center text-blue-400 font-medium border-l-2 border-slate-700 bg-blue-900/10">{row.casinoRollingRate}%</td>
                            <td className="px-4 py-3 text-center text-blue-400 font-medium bg-blue-900/10">{row.slotRollingRate}%</td>
                            <td className="px-4 py-3 text-center text-purple-400 font-medium bg-blue-900/10">
                              {row.losingRate > 0 ? `${row.losingRate}%` : '-'}
                            </td>
                            {showGongBetColumn && (
                              <td className="px-4 py-3 text-center bg-blue-900/10">
                                {row.gongBetEnabled
                                  ? <span className="text-orange-300 font-medium">{row.gongBetRate}%</span>
                                  : <span className="text-slate-500 text-xs">비활성</span>
                                }
                              </td>
                            )}
                          </>
                        )}

                        <td className="px-4 py-3 text-right text-slate-200 border-l-2 border-slate-700">{w(row.balance)}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{row.points.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-400 border-l-2 border-slate-700 bg-green-900/10">{w(row.onlineDeposit)}</td>
                        <td className="px-4 py-3 text-right text-red-400 bg-green-900/10">{w(row.onlineWithdrawal)}</td>
                        <td className="px-4 py-3 text-right text-green-400 border-l-2 border-slate-700 bg-purple-900/10">{w(row.manualDeposit)}</td>
                        <td className="px-4 py-3 text-right text-red-400 bg-purple-900/10">{w(row.manualWithdrawal)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 border-l-2 border-slate-700">{row.pointGiven.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{row.pointRecovered.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-right font-bold border-l-2 border-slate-700 bg-yellow-900/10 ${depositDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {w(depositDiff)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 border-l-2 border-slate-700 bg-cyan-900/10">{w(row.casinoBet)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 bg-cyan-900/10">{w(row.casinoWin)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 bg-cyan-900/10">{w(row.slotBet)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 bg-cyan-900/10">{w(row.slotWin)}</td>
                        <td className="px-4 py-3 text-right text-yellow-400 font-bold border-l-2 border-slate-700 bg-orange-900/10">
                          {w(ggr)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold border-l-2 border-slate-700 bg-pink-900/10">{w(row.totalRolling)}</td>
                        <td className="px-4 py-3 text-right text-purple-400 font-bold bg-pink-900/10">{w(row.totalLosing)}</td>
                        <td className="px-4 py-3 text-right text-green-300 font-bold border-l-2 border-slate-700 bg-emerald-900/10">{w(row.individualRolling)}</td>
                        <td className="px-4 py-3 text-right text-purple-300 font-bold bg-emerald-900/10">{w(row.individualLosing)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="bg-slate-800 border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-100 mb-4">정산 계산 방식</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h4 className="text-blue-400 font-bold mb-2">롤링 계산</h4>
            <div className="space-y-1 text-slate-300">
              <p>• 정상롤링금 = 카지노베팅 × 카지노롤링률 + 슬롯베팅 × 슬롯롤링률</p>
              <p>• 공배팅 절삭액 = 정상롤링금 × 공배팅률</p>
              <p className="text-green-400 font-bold">• 실지급 롤링금 = 정상롤링금 − 공배팅 절삭액</p>
            </div>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h4 className="text-purple-400 font-bold mb-2">루징 계산</h4>
            <div className="space-y-1 text-slate-300">
              <p>• GGR = (카지노베팅 − 카지노당첨) + (슬롯베팅 − 슬롯당첨)</p>
              <p>• NetGGR = GGR − 정상롤링금</p>
              <p className="text-purple-400 font-bold">• 루징정산액 = NetGGR × 루징률</p>
              <p className="text-slate-500 text-xs">※ 카지노/슬롯 루징률 분리 설정 시 각각 계산</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
