import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Clock, Gamepad2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { aceVendorService, type GameVendor } from '../../../utils/game-management';

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
    const bet_amount = bet    ? Number(bet.bet_amount)    : 0;
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

const PAGE_SIZE = 20;

export default function BettingHistoryPage({ user }: { user: User | null }) {
  const [activeVendors, setActiveVendors] = useState<string[]>([]);
  const [rows, setRows]         = useState<MergedRound[]>([]);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState('');
  const [page, setPage]         = useState(0);
  const [hasMore, setHasMore]   = useState(false);
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
  const load = useCallback(async (vendors: string[], p: number) => {
    if (!user || vendors.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const todayStart = getTodayStart();
    const from = p * PAGE_SIZE;
    const queries = vendors.map(vk => {
      const table = VENDOR_TABLE_MAP[vk];
      return supabase
        .from(table)
        .select('id, txid, round_id, provider_name, game_name, game_type, game_category, bet_amount, win_amount, ggr, bet_time, settle_time, round_status, is_bonus, is_jackpot, raw_data')
        .eq('user_id', user.id)
        .or(`bet_time.gte.${todayStart},settle_time.gte.${todayStart}`)
        .order('bet_time', { ascending: false, nullsFirst: false })
        .range(from, from + PAGE_SIZE * 2 - 1)
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
    const merged = mergeRounds(allRaw).slice(0, PAGE_SIZE);

    setRows(prev => p === 0 ? merged : [...prev, ...merged]);
    setHasMore(results.some(r => r.length === PAGE_SIZE));
    setLoading(false);
  }, [user?.id]);

  // 1단계: 초기화되면 즉시 기존 데이터 표시
  useEffect(() => {
    if (!initialized) return;
    load(activeVendors, 0);
  }, [activeVendors, initialized, load]);

  // 2단계: 초기 로드 후 백그라운드 ACE 동기화 → 완료 후 목록 갱신
  useEffect(() => {
    if (!user || !initialized || syncedOnce.current) return;
    syncedOnce.current = true;

    supabase
      .from('game_vendors')
      .select('*')
      .eq('vendor_key', 'ace')
      .eq('is_active', true)
      .then(async ({ data: vendors }) => {
        if (!vendors || vendors.length === 0) return;

        setSyncing(true);
        setSyncMsg('새 베팅 내역 동기화 중...');

        const sdate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        let totalNew = 0;

        for (const vendor of vendors) {
          try {
            const r = await aceVendorService.syncBettingHistory(vendor as GameVendor, {
              sdate,
              limit: 500,
            });
            totalNew += r.inserted + r.updated;
          } catch {
            // 실패 시 조용히 무시
          }
        }

        setSyncing(false);
        if (totalNew > 0) {
          setSyncMsg(`${totalNew}건 업데이트됨`);
          // 새 데이터 있을 때만 목록 갱신
          setPage(0);
          load(activeVendors, 0);
        } else {
          setSyncMsg('최신 상태');
        }
        setTimeout(() => setSyncMsg(''), 4000);
      })
      .catch(() => {
        setSyncing(false);
        setSyncMsg('');
      });
  }, [user?.id, initialized, activeVendors, load]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(activeVendors, next);
  };

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
          <div className="space-y-2">
            {rows.filter(row => row.bet_time !== null || row.settle_time !== null).map(row => {
              const ggr      = row.ggr;
              const won      = Number(row.win_amount) > 0;
              const expanded = expandedRows.has(row.key);
              const before   = row.beforeCash;
              const after    = row.afterCash;

              return (
                <div
                  key={row.key}
                  className="bg-[#0d0d0d] border border-white/5 rounded-xl overflow-hidden"
                >
                  {/* 메인 행 */}
                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      {/* 좌측 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-white font-semibold text-sm truncate">{row.game_name || '-'}</span>
                          {row.is_jackpot && (
                            <span className="text-[10px] text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded font-bold">JACKPOT</span>
                          )}
                          {row.is_bonus && (
                            <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded font-bold">BONUS</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {row.provider_name && (
                            <span className="text-[11px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
                              {row.provider_name}
                            </span>
                          )}
                          {row.game_type && (
                            <span className="text-[11px] text-slate-600">{row.game_type}</span>
                          )}
                        </div>
                      </div>

                      {/* 우측 */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-1.5 mb-1">
                          {won
                            ? <TrendingUp size={13} className="text-green-400" />
                            : <TrendingDown size={13} className="text-red-400" />
                          }
                          <span className={`text-sm font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>
                            {won ? '+' : '-'}{fmtMoney(Math.abs(ggr))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 보유금 흐름 - 한 줄 표시 */}
                    <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px] font-mono">
                      {before !== null && (
                        <>
                          <span className="text-slate-500 font-sans">이전</span>
                          <span className="text-yellow-300">{Number(before).toLocaleString()}</span>
                        </>
                      )}
                      {row.bet_amount > 0 && (
                        <>
                          <span className="text-slate-500 font-sans">베팅</span>
                          <span className="text-red-300">-{Number(row.bet_amount).toLocaleString()}</span>
                        </>
                      )}
                      {(row.win_amount > 0 || row.round_status === 'settled' || row.round_status === 'turn_lose') && (
                        <>
                          <span className="text-slate-500 font-sans">당첨</span>
                          <span className={Number(row.win_amount) > 0 ? 'text-green-300' : 'text-slate-500'}>
                            {Number(row.win_amount) > 0 ? '+' : ''}{Number(row.win_amount).toLocaleString()}
                          </span>
                        </>
                      )}
                      {after !== null && (
                        <>
                          <span className="text-slate-500 font-sans">현재</span>
                          <span className="text-emerald-300">{Number(after).toLocaleString()}</span>
                        </>
                      )}
                    </div>

                    {/* 시간 + 펼치기 */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Clock size={11} />
                        <span className="text-[11px]">{fmtDate(row.bet_time ?? row.settle_time)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {won && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded text-green-400 bg-green-400/10">
                            당첨
                          </span>
                        )}
                        <button
                          onClick={() => toggleExpand(row.key)}
                          className="text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>
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

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full mt-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : '더 보기'}
            </button>
          )}
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
