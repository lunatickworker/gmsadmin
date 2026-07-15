import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Clock, Gamepad2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { aceVendorService, honorVendorService, type GameVendor } from '../../../utils/game-management';

interface User { id: string; username: string; name: string; }

interface BetRow {
  id: string;
  txid: string;
  round_id: string | null;
  provider_name: string;
  game_name: string;
  game_type: string | null;
  game_category: string | null;
  bet_amount: number;
  win_amount: number;
  ggr: number;
  bet_time: string | null;
  settle_time: string | null;
  round_status: string | null;
  is_bonus: boolean;
  is_jackpot: boolean;
  api_type: 'invest' | 'honor' | 'ace';
  raw_data?: Record<string, unknown> | null;
}

interface MergedRound {
  key: string;
  id: string;
  round_id: string | null;
  provider_name: string;
  game_name: string;
  game_type: string | null;
  game_category: string | null;
  bet_amount: number;
  win_amount: number;
  ggr: number;
  round_status: string | null;
  bet_time: string | null;
  settle_time: string | null;
  is_bonus: boolean;
  is_jackpot: boolean;
  api_type: 'invest' | 'honor' | 'ace';
  beforeCash: number | null;
  afterCash: number | null;
  raw_data?: Record<string, unknown> | null;
}

function mergeRounds(rawRows: BetRow[]): MergedRound[] {
  const groups = new Map<string, { bet?: BetRow; settle?: BetRow; primary: BetRow }>();
  for (const row of rawRows) {
    const gkey = row.round_id ? `${row.api_type}:${row.round_id}` : `solo:${row.id}`;
    if (!groups.has(gkey)) groups.set(gkey, { primary: row });
    const g = groups.get(gkey)!;
    if (row.round_status === 'betting') {
      g.bet = row;
      g.primary = row;
    } else {
      g.settle = row;
      if (!g.bet) g.primary = row;
    }
  }
  const merged: MergedRound[] = [];
  for (const [key, g] of groups) {
    const { bet, settle, primary } = g;
    const betRaw    = (bet?.raw_data    ?? {}) as Record<string, unknown>;
    const settleRaw = (settle?.raw_data ?? {}) as Record<string, unknown>;
    const bet_amount = bet    ? Number(bet.bet_amount)    : (settle ? Number(settle.bet_amount) : 0);
    const win_amount = settle ? Number(settle.win_amount) : 0;
    merged.push({
      key,
      id: primary.id,
      round_id: primary.round_id,
      provider_name: primary.provider_name,
      game_name: primary.game_name,
      game_type: primary.game_type,
      game_category: primary.game_category,
      bet_amount,
      win_amount,
      ggr: bet_amount - win_amount,
      round_status: settle?.round_status ?? bet?.round_status ?? null,
      bet_time: bet?.bet_time ?? primary.bet_time,
      settle_time: settle?.settle_time ?? null,
      is_bonus: primary.is_bonus,
      is_jackpot: primary.is_jackpot,
      api_type: primary.api_type,
      beforeCash: (betRaw.beforeCash ?? settleRaw.beforeCash ?? null) as number | null,
      afterCash:  (settleRaw.afterCash ?? betRaw.afterCash ?? null) as number | null,
      raw_data: settle?.raw_data ?? bet?.raw_data ?? null,
    });
  }
  return merged.sort((a, b) => {
    const ta = (a.bet_time ?? a.settle_time) ? new Date((a.bet_time ?? a.settle_time)!).getTime() : 0;
    const tb = (b.bet_time ?? b.settle_time) ? new Date((b.bet_time ?? b.settle_time)!).getTime() : 0;
    return tb - ta;
  });
}

const VENDOR_TABLE_MAP: Record<string, string> = {
  invest: 'betting_history_invest',
  honor:  'betting_history_honor',
  ace:    'betting_history_ace',
};

// honor: is_bonus, is_jackpot 컬럼 없음 / invest: game_category, is_bonus, is_jackpot 없음
const VENDOR_SELECT_MAP: Record<string, string> = {
  invest: 'id, txid, round_id, provider_name, game_name, game_type, bet_amount, win_amount, ggr, bet_time, settle_time, round_status, raw_data',
  honor:  'id, txid, round_id, provider_name, game_name, game_type, game_category, bet_amount, win_amount, ggr, bet_time, settle_time, round_status, raw_data',
  ace:    'id, txid, round_id, provider_name, game_name, game_type, game_category, bet_amount, win_amount, ggr, bet_time, settle_time, round_status, is_bonus, is_jackpot, raw_data',
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 100] as const;

export default function BettingHistoryPage({ user }: { user: User | null }) {
  const [activeVendors, setActiveVendors] = useState<string[]>([]);
  const [rows, setRows]         = useState<MergedRound[]>([]);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');
  const [page, setPage]         = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const [pageSize, setPageSize] = useState<number>(20);
  const [initialized, setInitialized] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const syncedOnce = useRef(false);

  // 활성 vendor 목록 조회
  useEffect(() => {
    supabase
      .from('game_vendors')
      .select('vendor_key')
      .eq('is_active', true)
      .then(({ data }) => {
        const keys = (data ?? [])
          .map((r: { vendor_key: string }) => r.vendor_key)
          .filter((k: string) => k in VENDOR_TABLE_MAP);
        setActiveVendors(keys);
        setInitialized(true);
      });
  }, []);

  // 오늘(한국시간) 시작 ISO 문자열 계산
  const getTodayStart = () => {
    const now = new Date();
    const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    kst.setHours(0, 0, 0, 0);
    // KST → UTC 변환 (KST = UTC+9)
    return new Date(kst.getTime() - 9 * 60 * 60 * 1000).toISOString();
  };

  // 오늘 베팅 내역만 조회
  const load = useCallback(async (vendors: string[], p: number, size: number = pageSize) => {
    if (!user || vendors.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const todayStart = getTodayStart();
    const from = p * size;
    const queries = vendors.map(vk => {
      const table = VENDOR_TABLE_MAP[vk];
      const selectCols = VENDOR_SELECT_MAP[vk] ?? VENDOR_SELECT_MAP['ace'];
      return supabase
        .from(table)
        .select(selectCols)
        .eq('user_id', user.id)
        .gte('bet_time', todayStart)
        .order('bet_time', { ascending: false, nullsFirst: false })
        .range(from, from + size * 2 - 1)
        .then(res =>
          (res.data ?? []).map((row: Omit<BetRow, 'api_type'>) => ({
            ...row,
            api_type: vk as BetRow['api_type'],
          }))
        );
    });

    const results = await Promise.all(queries);
    const allRaw = results
      .flat()
      .sort((a, b) => {
        const ta = a.bet_time ? new Date(a.bet_time).getTime() : 0;
        const tb = b.bet_time ? new Date(b.bet_time).getTime() : 0;
        return tb - ta;
      });
    const merged = mergeRounds(allRaw).slice(0, size);

    setRows(merged);
    setHasMore(results.some(r => r.length >= size));
    setLoading(false);
  }, [user?.id, pageSize]);

  // 1단계: 초기화되면 즉시 기존 데이터 표시
  useEffect(() => {
    if (!initialized) return;
    load(activeVendors, 0);
  }, [activeVendors, initialized, load]);

  // 2단계: 초기 로드 후 백그라운드 ACE + Honor 동기화 → 완료 후 목록 갱신
  useEffect(() => {
    if (!user || !initialized || syncedOnce.current) return;
    syncedOnce.current = true;

    (async () => {
      setSyncing(true);
      setSyncMsg('새 베팅 내역 동기화 중...');
      let totalNew = 0;

      // ACE 동기화
      try {
        const { data: aceVendors } = await supabase
          .from('game_vendors')
          .select('*')
          .eq('vendor_key', 'ace')
          .eq('is_active', true);
        if (aceVendors && aceVendors.length > 0) {
          const sdate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          for (const vendor of aceVendors) {
            try {
              const r = await aceVendorService.syncBettingHistory(vendor as GameVendor, { sdate, limit: 500 });
              totalNew += r.inserted + r.updated;
            } catch { /* 조용히 무시 */ }
          }
        }
      } catch { /* 조용히 무시 */ }

      // Honor 동기화 (최근 2시간, 1시간씩 청크)
      try {
        const { data: honorVendors } = await supabase
          .from('game_vendors')
          .select('*')
          .eq('vendor_key', 'honor')
          .eq('is_active', true);
        if (honorVendors && honorVendors.length > 0) {
          for (const vendor of honorVendors) {
            try {
              const r = await honorVendorService.syncBettingHistory(vendor as GameVendor, { hours: 2 });
              totalNew += r.inserted + r.updated;
            } catch { /* 조용히 무시 */ }
          }
        }
      } catch { /* 조용히 무시 */ }

      setSyncing(false);
      if (totalNew > 0) {
        setSyncMsg(`${totalNew}건 업데이트됨`);
        setPage(0);
        load(activeVendors, 0);
      } else {
        setSyncMsg('최신 상태');
      }
      setTimeout(() => setSyncMsg(''), 4000);
    })().catch(() => {
      setSyncing(false);
      setSyncMsg('');
    });
  }, [user?.id, initialized, activeVendors, load]);

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // raw_data에서 잔액 정보 추출 (ACE API: beforeCash / afterCash)
  const getBalanceInfo = (raw: Record<string, unknown> | null | undefined) => {
    if (!raw) return { before: null, after: null, currency: 'KRW' };
    const before   = (raw.beforeCash   ?? raw.beforeBalance ?? null) as number | null;
    const after    = (raw.afterCash    ?? raw.afterBalance  ?? null) as number | null;
    const currency = (raw.currency     ?? 'KRW') as string;
    return { before, after, currency };
  };

  const totalBet = rows.reduce((s, r) => s + Number(r.bet_amount), 0);
  const totalWin = rows.reduce((s, r) => s + Number(r.win_amount), 0);
  const totalGgr = totalBet - totalWin;

  const fmtDate = (t: string | null) => {
    if (!t) return '-';
    return new Date(t).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Seoul',
    });
  };
  const fmtMoney = (n: number) => `₩${n.toLocaleString()}`;

  return (
    <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">베팅 내역</h2>
        <div className="flex items-center gap-2">
          {syncing && (
            <span className="text-xs text-[#c9a227] flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {syncMsg}
            </span>
          )}
          {!syncing && syncMsg && (
            <span className="text-xs text-green-400">{syncMsg}</span>
          )}
          <button
            onClick={() => { setPage(0); load(activeVendors, 0); }}
            disabled={loading || syncing}
            className="text-slate-500 hover:text-[#c9a227] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-700 mb-5">
        오늘 베팅 내역입니다. 베팅과 정산이 한 줄로 표시됩니다.
      </p>

      {/* 요약 카드 */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
            <p className="text-slate-500 text-xs mb-1">총 베팅</p>
            <p className="text-white font-bold text-lg">{fmtMoney(totalBet)}</p>
          </div>
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
            <p className="text-slate-500 text-xs mb-1">총 당첨</p>
            <p className="text-green-400 font-bold text-lg">{fmtMoney(totalWin)}</p>
          </div>
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
            <p className="text-slate-500 text-xs mb-1">손익</p>
            <p className={`font-bold text-lg ${totalGgr >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalGgr >= 0 ? '-' : '+'}{fmtMoney(Math.abs(totalGgr))}
            </p>
          </div>
        </div>
      )}

      {/* 목록 */}
      {!initialized ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="text-[#c9a227] animate-spin" />
        </div>
      ) : activeVendors.length === 0 ? (
        <div className="text-center py-16 text-slate-600 text-sm">활성화된 게임 서비스가 없습니다.</div>
      ) : loading && rows.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="text-[#c9a227] animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <Gamepad2 size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-600 text-sm">오늘 베팅 내역이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 테이블 헤더 */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-x-3 px-3 py-2 text-[11px] text-slate-600 border-b border-white/5 mb-1">
            <span>게임명</span>
            <span className="text-right">베팅액</span>
            <span className="text-right">당첨액</span>
            <span className="text-right">손익</span>
            <span className="text-center">상태</span>
            <span className="text-right">베팅 시간</span>
            <span></span>
          </div>

          <div className="space-y-px">
            {rows.filter(row => row.bet_time !== null || row.settle_time !== null).map(row => {
              const ggr      = row.ggr;
              const won      = Number(row.win_amount) > 0;
              const expanded = expandedRows.has(row.key);
              const before   = row.beforeCash;
              const after    = row.afterCash;

              return (
                <div
                  key={row.key}
                  className="bg-[#0d0d0d] border border-white/5 rounded-lg overflow-hidden"
                >
                  {/* 한 줄 메인 행 */}
                  <div
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-x-3 items-center px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => toggleExpand(row.key)}
                  >
                    {/* 게임명 + 태그 */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-white text-[13px] font-medium truncate">{row.game_name || '-'}</span>
                      {row.provider_name && (
                        <span className="hidden sm:inline text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded shrink-0">{row.provider_name}</span>
                      )}
                      {row.game_type && (
                        <span className="hidden md:inline text-[10px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded shrink-0">{row.game_type}</span>
                      )}
                      {row.is_jackpot && <span className="text-[9px] text-yellow-400 bg-yellow-900/30 px-1 py-0.5 rounded font-bold shrink-0">JP</span>}
                      {row.is_bonus   && <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1 py-0.5 rounded font-bold shrink-0">B</span>}
                    </div>

                    {/* 베팅액 */}
                    <span className="text-right text-[13px] text-slate-300 font-mono tabular-nums">
                      {fmtMoney(Number(row.bet_amount))}
                    </span>

                    {/* 당첨액 */}
                    <span className={`text-right text-[13px] font-mono tabular-nums ${Number(row.win_amount) > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                      {fmtMoney(Number(row.win_amount))}
                    </span>

                    {/* 손익 */}
                    <div className="flex items-center justify-end gap-1">
                      {won
                        ? <TrendingUp size={11} className="text-green-400 shrink-0" />
                        : <TrendingDown size={11} className="text-red-400 shrink-0" />
                      }
                      <span className={`text-[13px] font-bold font-mono tabular-nums ${won ? 'text-green-400' : 'text-red-400'}`}>
                        {won ? '+' : '-'}{fmtMoney(Math.abs(ggr))}
                      </span>
                    </div>

                    {/* 상태 */}
                    <div className="flex justify-center">
                      {won
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded text-green-400 bg-green-400/10">당첨</span>
                        : <span className="text-[11px] text-slate-600">-</span>
                      }
                    </div>

                    {/* 베팅 시간 */}
                    <div className="flex items-center justify-end gap-1 text-slate-600">
                      <Clock size={10} className="shrink-0" />
                      <span className="text-[11px]">{fmtDate(row.bet_time ?? row.settle_time)}</span>
                    </div>

                    {/* 펼치기 버튼 */}
                    <button className="text-slate-600 hover:text-slate-400 transition-colors pl-1">
                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {/* 확장 상세 정보 */}
                  {expanded && (
                    <div className="border-t border-white/5 bg-black/30 px-4 py-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <DRow label="베팅 금액" value={fmtMoney(Number(row.bet_amount))} />
                        <DRow
                          label="당첨 금액"
                          value={fmtMoney(Number(row.win_amount))}
                          cls={Number(row.win_amount) > 0 ? 'text-green-400' : undefined}
                        />
                        <DRow
                          label="손익"
                          value={`${ggr >= 0 ? '-' : '+'}${fmtMoney(Math.abs(ggr))}`}
                          cls={ggr >= 0 ? 'text-red-400' : 'text-green-400'}
                        />
                        <DRow label="게임 시작 시간" value={fmtDate(row.bet_time)} />
                        {row.settle_time && (
                          <DRow label="정산 시간" value={fmtDate(row.settle_time)} />
                        )}
                        {before !== null && (
                          <DRow label="이전 보유금" value={fmtMoney(Number(before))} />
                        )}
                        {after !== null && (
                          <DRow label="현재 보유금" value={fmtMoney(Number(after))} />
                        )}
                        <DRow label="게임사" value={row.provider_name || '-'} />
                        <DRow label="게임 유형" value={row.game_type || '-'} />
                        {row.round_id && (
                          <DRow label="라운드 ID" value={row.round_id} mono />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 페이지 내비게이션 */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
            {/* 페이지 크기 선택 */}
            <div className="flex items-center gap-2">
              <span className="text-slate-600 text-xs">페이지당</span>
              <div className="flex gap-1">
                {PAGE_SIZE_OPTIONS.map(size => (
                  <button
                    key={size}
                    onClick={() => { setPageSize(size); setPage(0); load(activeVendors, 0, size); }}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      pageSize === size
                        ? 'bg-[#c9a227]/20 text-[#c9a227] border border-[#c9a227]/40'
                        : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <span className="text-slate-600 text-xs">개</span>
            </div>

            {/* 이전/다음 */}
            <div className="flex items-center gap-2">
              {loading && <Loader2 size={13} className="animate-spin text-[#c9a227]" />}
              <button
                onClick={() => { const prev = page - 1; setPage(prev); load(activeVendors, prev); }}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 rounded text-xs bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                이전
              </button>
              <span className="text-slate-400 text-sm font-medium px-1">{page + 1} 페이지</span>
              <button
                onClick={() => { const next = page + 1; setPage(next); load(activeVendors, next); }}
                disabled={!hasMore || loading}
                className="px-3 py-1.5 rounded text-xs bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                다음
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DRow({ label, value, cls, mono }: { label: string; value: string; cls?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-600">{label}</span>
      <span className={`text-[12px] ${cls ?? 'text-slate-300'} ${mono ? 'font-mono text-[10px] break-all' : ''}`}>
        {value}
      </span>
    </div>
  );
}
