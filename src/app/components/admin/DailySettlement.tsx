import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format } from 'date-fns';
import { supabase } from '../../../utils/supabase/client';

// 정산 행 인터페이스 (Supabase total_settlement 기반)
interface SettlementRow {
  date: string;
  level: number;
  levelName: string;
  username: string;
  // 정산 기준 설정
  casinoRollingRate: number;
  slotRollingRate: number;
  casinoLosingRate: number;
  slotLosingRate: number;
  losingRate: number; // 단일 루징률 fallback
  // 공배팅
  gongBetEnabled: boolean;
  gongBetRate: number;
  // 보유 자산
  balance: number;
  points: number;
  // 온라인 입출금
  onlineDeposit: number;
  onlineWithdrawal: number;
  // 수동 입출금
  manualDeposit: number;
  manualWithdrawal: number;
  // 포인트 관리
  pointGiven: number;
  pointRecovered: number;
  // 게임 실적
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
  // 계산된 값 (DB에서 가져오거나 직접 계산)
  totalRolling: number;
  totalLosing: number;
  // 코드별 실정산 (개인 실정산)
  individualRolling: number;
  individualLosing: number;
  // 공배팅 차감
  gongBetCutRolling: number;
}

// 롤링 계산
function calcRolling(casinoBet: number, slotBet: number, casinoRate: number, slotRate: number) {
  return casinoBet * (casinoRate / 100) + slotBet * (slotRate / 100);
}

// 공배팅 차감 계산
function calcGongBetCut(totalRolling: number, gongBetEnabled: boolean, gongBetRate: number) {
  return gongBetEnabled ? totalRolling * (gongBetRate / 100) : 0;
}

// GGR 계산
function calcGGR(casinoBet: number, casinoWin: number, slotBet: number, slotWin: number) {
  return (casinoBet - casinoWin) + (slotBet - slotWin);
}

/**
 * 루징 계산
 * rooling_shave.md 기준:
 *   NetGGR = GGR - 정상롤링금
 *   루징정산액 = NetGGR × 루징률
 * logic_analysis.md 기준 (카지노/슬롯 별도):
 *   casinoLosing = (casinoBet - casinoWin) × casinoLosingRate/100
 *   slotLosing   = (slotBet - slotWin)     × slotLosingRate/100
 *   baseLosingAmount = casinoLosing + slotLosing
 *
 * 두 방식이 개념적으로 같지만 카지노/슬롯 별도 루징률이 있을 때는 분리 계산
 */
function calcLosing(
  casinoBet: number, casinoWin: number,
  slotBet: number, slotWin: number,
  casinoLosingRate: number, slotLosingRate: number,
  totalRolling: number
): { casinoLosing: number; slotLosing: number; totalLosing: number; baseLosingAmount: number } {
  // 카지노/슬롯 별도 루징률 있으면 분리 계산
  if (casinoLosingRate > 0 || slotLosingRate > 0) {
    const casinoGGR = Math.max(0, casinoBet - casinoWin);
    const slotGGR = Math.max(0, slotBet - slotWin);
    const casinoLosing = casinoGGR * (casinoLosingRate / 100);
    const slotLosing = slotGGR * (slotLosingRate / 100);
    const totalLosing = casinoLosing + slotLosing;
    return { casinoLosing, slotLosing, totalLosing, baseLosingAmount: totalLosing };
  }
  // fallback: (GGR - totalRolling) × 루징률 (rooling_shave.md 방식)
  return { casinoLosing: 0, slotLosing: 0, totalLosing: 0, baseLosingAmount: 0 };
}

// 레벨별 색상
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

// Supabase에서 현재 사용자의 일별 정산 데이터 조회
async function fetchDailySettlements(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ rows: SettlementRow[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('total_settlement')
      .select('*')
      .eq('target_user_id', userId)
      .eq('period_type', 'daily')
      .gte('settlement_date', startDate)
      .lte('settlement_date', endDate)
      .order('settlement_date', { ascending: false });

    if (error) {
      console.error('일일 정산 조회 실패:', error);
      return { rows: [], error: error.message || '데이터 조회 실패' };
    }

    // 사용자 정보 조회 (username 등)
    const { data: userData } = await supabase
      .from('users')
      .select('id, username, role, level')
      .eq('id', userId)
      .maybeSingle();

    const mappedRows = (data || []).map((row: any) => {
      const casinoRollingRate = row.casino_rolling_rate ?? 0;
      const slotRollingRate = row.slot_rolling_rate ?? 0;
      const losingRate = row.losing_rate ?? 0;

      const gongBetEnabled = row.rolling_shave_enabled ?? false;
      const gongBetRate = row.rolling_shave_rate ?? 0;
      const gongBetCutRolling = (row.casino_shaved_rolling ?? 0) + (row.slot_shaved_rolling ?? 0);
      const totalRolling = row.total_rolling ?? 0;
      const totalLosing = row.total_losing ?? 0;
      const individualRolling = row.final_rolling ?? totalRolling;
      const individualLosing = row.final_losing ?? totalLosing;

      return {
        date: row.settlement_date,
        level: userData?.level ?? 0,
        levelName: userData?.role ?? '',
        username: userData?.username ?? row.target_user_id,
        casinoRollingRate,
        slotRollingRate,
        casinoLosingRate: 0,
        slotLosingRate: 0,
        losingRate,
        gongBetEnabled,
        gongBetRate,
        balance: row.balance ?? 0,
        points: row.points ?? 0,
        onlineDeposit: row.online_deposit ?? 0,
        onlineWithdrawal: row.online_withdrawal ?? 0,
        manualDeposit: row.manual_deposit ?? 0,
        manualWithdrawal: row.manual_withdrawal ?? 0,
        pointGiven: row.points_granted ?? 0,
        pointRecovered: row.points_deducted ?? 0,
        casinoBet: row.casino_bet ?? 0,
        casinoWin: row.casino_win ?? 0,
        slotBet: row.slot_bet ?? 0,
        slotWin: row.slot_win ?? 0,
        totalRolling,
        totalLosing,
        individualRolling,
        individualLosing,
        gongBetCutRolling,
      } as SettlementRow;
    });
    return { rows: mappedRows, error: null };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('fetchDailySettlements 오류:', err);
    return { rows: [], error: msg };
  }
}

export default function DailySettlement() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showSettingColumns, setShowSettingColumns] = useState(true);

  // 공배팅 컬럼: 시스템관리자·운영사만 볼 수 있고, 활성화된 데이터가 있을 때만 표시
  const canSeeGongBet = user?.role === 'system_admin' || user?.role === 'operator';
  const hasGongBetActive = rows.some(r => r.gongBetEnabled);
  const showGongBetColumn = canSeeGongBet && hasGongBetActive;
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // 오늘 날짜 기준
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

  // 입출차액: (온라인입금 + 수동입금) - (온라인출금 + 수동출금)
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
          {/* 시작일 */}
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

          {/* 종료일 */}
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

          {/* 빠른 선택 버튼 */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { const d = new Date(); setStartDate(d); setEndDate(d); }}
            >
              오늘
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                setStartDate(d);
                setEndDate(d);
              }}
            >
              어제
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 6);
                setStartDate(start);
                setEndDate(end);
              }}
            >
              최근 7일
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setStartDate(start);
                setEndDate(end);
              }}
            >
              이번 달
            </Button>
          </div>

          <Button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2"
          >
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
          <p className="text-xs text-red-400 mt-1">
            테이블이 존재하지 않거나 네트워크 연결을 확인하세요.
          </p>
        </div>
      )}

      <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <p className="text-sm text-blue-300">
          💡 <span className="font-bold">루징 계산 원칙:</span>{' '}
          NetGGR = GGR − 정상롤링금 → 루징정산액 = NetGGR × 루징률 (rooling_shave.md 기준).
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
                {!Array.isArray(rows) || rows.length === 0 ? (
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
                        {/* 실정산 (총): DB에서 가져온 값 */}
                        <td className="px-4 py-3 text-right text-green-400 font-bold border-l-2 border-slate-700 bg-pink-900/10">{w(row.totalRolling)}</td>
                        <td className="px-4 py-3 text-right text-purple-400 font-bold bg-pink-900/10">{w(row.totalLosing)}</td>
                        {/* 코드별 실정산: individualRolling = totalRolling - gongBetCut, individualLosing = NetGGR × rate */}
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

      {/* 계산 방식 설명 */}
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
            <h4 className="text-purple-400 font-bold mb-2">루징 계산 (rooling_shave.md 기준)</h4>
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
