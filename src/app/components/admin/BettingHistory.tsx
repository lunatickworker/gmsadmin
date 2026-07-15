import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, RefreshCw, FileText, X, Copy, Check, Info, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { aceVendorService, honorVendorService, type GameVendor } from '../../../utils/game-management';
import { toast } from 'sonner';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { useAuth } from '../../context/AuthContext';

interface BetRow {
  id: string;
  txid: string;
  round_id: string | null;
  username: string;
  user_id: string;
  store_id: string | null;
  distributor_id: string | null;
  sub_office_id: string | null;
  head_office_id: string | null;
  operator_id: string | null;
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
  before_amount: number | null;
  after_amount: number | null;
  is_bonus: boolean;
  is_jackpot: boolean;
  api_type: 'invest' | 'honor' | 'ace';
  raw_data: Record<string, unknown> | null;
}

interface MergedRound {
  key: string;
  id: string;
  txid: string;
  round_id: string | null;
  username: string;
  user_id: string;
  store_id: string | null;
  distributor_id: string | null;
  sub_office_id: string | null;
  head_office_id: string | null;
  operator_id: string | null;
  parentId: string | null;
  storeName: string | null;
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
  before_amount: number | null;
  after_amount: number | null;
  is_bonus: boolean;
  is_jackpot: boolean;
  api_type: 'invest' | 'honor' | 'ace';
  beforeCash: number | null;
  afterCash: number | null;
  raw_data: Record<string, unknown> | null;
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
    // bet 행이 없으면 settle 또는 primary에서 bet_amount 가져오기
    const bet_amount = Number(bet?.bet_amount ?? settle?.bet_amount ?? primary.bet_amount ?? 0);
    const win_amount = settle ? Number(settle.win_amount) : 0;

    // honor: DB 컬럼 우선, 없으면 raw_data.before / before+amount 로 fallback
    // ace/invest: raw_data의 beforeCash/afterCash 사용
    const isHonor = primary.api_type === 'honor';
    let beforeCash: number | null = null;
    if (isHonor) {
      const srcBefore = bet ?? settle ?? primary;
      const srcBeforeRaw = srcBefore.raw_data ?? {};
      beforeCash = srcBefore.before_amount != null
        ? Number(srcBefore.before_amount)
        : (srcBeforeRaw.before != null ? Number(srcBeforeRaw.before) : null);
    } else {
      beforeCash = (betRaw.beforeCash ?? settleRaw.beforeCash ?? null) as number | null;
    }
    // afterCash = beforeCash + (win - bet): API가 반환하는 after 값은 베팅 차감 후 잔액이므로
    // 실제 정산 후 잔액을 직접 계산한다
    const afterCash: number | null = beforeCash !== null
      ? beforeCash + (win_amount - bet_amount)
      : null;

    // user_id와 다른 첫 번째 계층 ID = 직속 소속파트너(상위)
    const uid = primary.user_id;
    const parentId =
      (primary.store_id       && primary.store_id       !== uid ? primary.store_id       : null) ??
      (primary.distributor_id && primary.distributor_id !== uid ? primary.distributor_id : null) ??
      (primary.sub_office_id  && primary.sub_office_id  !== uid ? primary.sub_office_id  : null) ??
      (primary.head_office_id && primary.head_office_id !== uid ? primary.head_office_id : null) ??
      (primary.operator_id    && primary.operator_id    !== uid ? primary.operator_id    : null) ??
      null;

    merged.push({
      key,
      id: primary.id,
      txid: primary.txid,
      round_id: primary.round_id,
      username: primary.username,
      user_id: primary.user_id,
      store_id: primary.store_id ?? null,
      distributor_id: primary.distributor_id ?? null,
      sub_office_id: primary.sub_office_id ?? null,
      head_office_id: primary.head_office_id ?? null,
      operator_id: primary.operator_id ?? null,
      parentId,
      storeName: null,
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
      before_amount: bet?.before_amount ?? null,
      after_amount: settle?.after_amount ?? bet?.after_amount ?? null,
      is_bonus: primary.is_bonus,
      is_jackpot: primary.is_jackpot,
      api_type: primary.api_type,
      beforeCash,
      afterCash,
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

// 각 벤더 테이블의 실제 컬럼 차이를 반영한 SELECT 문
// betting_history_invest: game_category, is_bonus, is_jackpot 없음
// betting_history_honor:  is_bonus, is_jackpot 없음
// betting_history_ace:    모든 컬럼 있음
const HIERARCHY_COLS = 'user_id, store_id, distributor_id, sub_office_id, head_office_id, operator_id';
const VENDOR_SELECT_MAP: Record<string, string> = {
  invest: `id, txid, round_id, username, ${HIERARCHY_COLS}, provider_name, game_name, game_type, bet_amount, win_amount, ggr, round_status, bet_time, settle_time, raw_data`,
  honor:  `id, txid, round_id, username, ${HIERARCHY_COLS}, provider_name, game_name, game_type, game_category, bet_amount, win_amount, ggr, round_status, bet_time, settle_time, before_amount, after_amount, raw_data`,
  ace:    `id, txid, round_id, username, ${HIERARCHY_COLS}, provider_name, game_name, game_type, game_category, bet_amount, win_amount, ggr, round_status, bet_time, settle_time, is_bonus, is_jackpot, raw_data`,
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 100] as const;

type DrawerTab = 'game' | 'bet' | 'raw';

const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'game', label: '게임정보' },
  { id: 'bet',  label: '베팅 상세정보' },
  { id: 'raw',  label: '결과 상세정보' },
];

// ── 상세 드로어 ─────────────────────────────────────────────────
function DetailDrawer({ row, onClose }: { row: MergedRound; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>('game');
  const [copied, setCopied] = useState(false);

  const raw = row.raw_data ?? {};
  const fmtTime = (t: string | null | undefined) => {
    if (!t) return '-';
    return new Date(t as string).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };
  const fmtMoney = (n: unknown) =>
    n !== null && n !== undefined ? `₩${Number(n).toLocaleString()}` : '-';

  function copyRaw() {
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const gameFields = [
    { label: 'API', value: row.api_type.toUpperCase() },
    { label: '사용자명', value: row.username },
    { label: '게임사', value: row.provider_name || '-' },
    { label: '게임명', value: row.game_name || '-' },
    { label: '게임유형', value: row.game_type || '-' },
    { label: '게임카테고리', value: row.game_category || (raw.gameCategory as string) || '-' },
    { label: '상태', value: row.round_status || '-' },
    { label: '베팅시간', value: fmtTime(row.bet_time) },
    { label: '정산시간', value: fmtTime(row.settle_time) },
    { label: '라운드 ID', value: row.round_id || '-', mono: true },
    { label: '트랜잭션 ID', value: row.txid || '-', mono: true },
    { label: 'JACKPOT', value: row.is_jackpot ? '예' : '아니오' },
    { label: 'BONUS', value: row.is_bonus ? '예' : '아니오' },
  ];

  const betFields = [
    { label: '통화', value: (raw.currency as string) || 'KRW' },
    { label: '이전 보유금', value: fmtMoney(row.beforeCash) },
    { label: '현재 보유금', value: fmtMoney(row.afterCash) },
    { label: '베팅 금액 (cash)', value: fmtMoney(raw.cash), highlight: true },
    { label: '보너스 캐시', value: fmtMoney(raw.updepositCash) },
    { label: '총 베팅', value: fmtMoney(row.bet_amount) },
    { label: '총 당첨', value: fmtMoney(row.win_amount) },
    { label: 'GGR', value: `${Number(row.ggr) >= 0 ? '+' : ''}${Number(row.ggr).toLocaleString()}`, ggrClass: Number(row.ggr) >= 0 ? 'text-blue-400' : 'text-red-400' },
    { label: 'TX 타입', value: (raw.type as string) || '-' },
    { label: 'TX 카테고리', value: (raw.category as string) || '-' },
  ];

  return createPortal(
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* 드로어 패널 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-slate-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{row.username}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                <span>이전보유금 <span className="text-yellow-300">{row.beforeCash !== null ? Number(row.beforeCash).toLocaleString() : '-'}</span></span>
                <span>현재보유금 <span className="text-emerald-300">{row.afterCash !== null ? Number(row.afterCash).toLocaleString() : '-'}</span></span>
                <span className="text-slate-600">{fmtTime(row.bet_time)}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        {/* 안내 문구 */}
        <div className="px-5 py-2 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0">
          <p className="text-xs text-slate-500">
            게임데이터에 표시된 시간은 게임사 시간으로 설정한 시간과 다를 수 있습니다
          </p>
        </div>

        {/* 탭 바 */}
        <div className="flex border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
          {DRAWER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">

          {/* 게임정보 탭 */}
          {tab === 'game' && (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {gameFields.map(f => (
                  <div key={f.label} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">{f.label}</p>
                    <p className={`text-sm font-medium ${f.mono ? 'font-mono text-xs break-all text-slate-300' : 'text-slate-200'}`}>
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 베팅 상세정보 탭 */}
          {tab === 'bet' && (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {betFields.map(f => (
                  <div
                    key={f.label}
                    className={`bg-slate-800 rounded-lg p-3 border border-slate-700 ${f.highlight ? 'col-span-2 border-blue-700/40 bg-blue-900/10' : ''}`}
                  >
                    <p className="text-xs text-slate-500 mb-1">{f.label}</p>
                    <p className={`text-sm font-semibold ${f.ggrClass ?? (f.highlight ? 'text-white text-base' : 'text-slate-200')}`}>
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 결과 상세정보 탭 (raw JSON) */}
          {tab === 'raw' && (
            <div className="relative h-full">
              <button
                onClick={copyRaw}
                className="absolute top-4 right-5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded text-xs transition-colors"
                title="복사"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                {copied ? '복사됨' : '복사'}
              </button>
              <pre className="bg-[#0d0d0d] text-[#8be08b] text-xs font-mono p-5 m-0 min-h-full overflow-auto leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function BettingHistory() {
  const { user: authUser } = useAuth();
  const isSystemAdmin = authUser?.role === 'system_admin';

  const [rows, setRows]           = useState<MergedRound[]>([]);
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [page, setPage]           = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [pageSize, setPageSize]   = useState<number>(20);
  const [search, setSearch]       = useState('');
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate]     = useState<Date>(endOfDay(new Date()));
  const [activeVendors, setActiveVendors] = useState<string[]>([]);
  const [detailRow, setDetailRow] = useState<MergedRound | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

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
      });
  }, []);

  const load = useCallback(async (p: number, size: number = pageSize) => {
    setLoading(true);
    const pageFrom = p * size;
    const dateFrom = startOfDay(startDate).toISOString();
    const dateTo = endOfDay(endDate).toISOString();

    const queries = activeVendors.map(vk => {
      const selectCols = VENDOR_SELECT_MAP[vk] ?? VENDOR_SELECT_MAP['ace'];
      let q = supabase
        .from(VENDOR_TABLE_MAP[vk])
        .select(selectCols)
        .or(`and(bet_time.gte.${dateFrom},bet_time.lte.${dateTo}),and(settle_time.gte.${dateFrom},settle_time.lte.${dateTo})`)
        .order('bet_time', { ascending: false, nullsFirst: false })
        .range(pageFrom, pageFrom + size * 2 - 1);

      if (search) q = q.ilike('username', `%${search}%`);

      return q.then(res => (res.data ?? []).map((row: any) => ({
        ...row,
        game_category: row.game_category ?? null,
        is_bonus:   row.is_bonus   ?? false,
        is_jackpot: row.is_jackpot ?? false,
        api_type: vk as BetRow['api_type'],
      })));
    });

    const results = await Promise.all(queries);
    const allRaw = results
      .flat()
      .sort((a, b) => {
        const ta = new Date((a.bet_time ?? a.settle_time) ?? 0).getTime();
        const tb = new Date((b.bet_time ?? b.settle_time) ?? 0).getTime();
        return tb - ta;
      });
    const merged = mergeRounds(allRaw).slice(0, size);

    // 직속 상위 파트너 이름 일괄 조회
    const parentIds = [...new Set(merged.map(r => r.parentId).filter(Boolean))] as string[];
    if (parentIds.length > 0) {
      const { data: parentUsers } = await supabase
        .from('users')
        .select('id, username, name')
        .in('id', parentIds);
      const nameMap = new Map((parentUsers ?? []).map((u: any) => [u.id, u.name || u.username]));
      for (const r of merged) {
        r.storeName = r.parentId ? (nameMap.get(r.parentId) ?? null) : null;
      }
    }

    setRows(merged);
    setHasMore(results.some(r => r.length >= size));
    setLoading(false);
  }, [activeVendors, search, startDate, endDate, pageSize]);

  useEffect(() => {
    if (activeVendors.length > 0) {
      setPage(0);
      load(0);
    }
  }, [activeVendors, search, startDate, endDate, load]);

  async function handleSyncAll() {
    const { data: allVendors } = await supabase
      .from('game_vendors')
      .select('*')
      .eq('is_active', true);

    if (!allVendors || allVendors.length === 0) {
      toast.error('활성화된 벤더가 없습니다.');
      return;
    }

    setSyncing(true);
    toast.info('베팅 내역 동기화 중...');

    let totalInserted = 0;
    let totalUpdated  = 0;
    const allErrors: string[] = [];

    for (const vendorRow of allVendors) {
      const vk = vendorRow.vendor_key as string;
      if (!(vk in VENDOR_TABLE_MAP)) continue;

      if (vk === 'ace') {
        try {
          const r = await aceVendorService.syncBettingHistory(vendorRow as GameVendor, {
            sdate: startOfDay(startDate).toISOString(),
            edate: endOfDay(endDate).toISOString(),
            limit: 2000,
          });
          totalInserted += r.inserted;
          totalUpdated  += r.updated;
          allErrors.push(...r.errors);
        } catch (e: any) {
          allErrors.push(`${vk} 동기화 실패: ${e.message}`);
        }
      }

      if (vk === 'honor') {
        try {
          const r = await honorVendorService.syncBettingHistory(vendorRow as GameVendor, {
            startDate: startOfDay(startDate),
            endDate:   endOfDay(endDate),
            direct: true,
          });
          totalInserted += r.inserted;
          totalUpdated  += r.updated;
          allErrors.push(...r.errors);
        } catch (e: any) {
          allErrors.push(`${vk} 동기화 실패: ${(e as any).message ?? String(e)}`);
        }
      }
    }

    const msg = `베팅 동기화 완료: ${totalInserted}건 저장, ${totalUpdated}건 갱신`;
    if (allErrors.length > 0) {
      toast.warning(`${msg} (오류 ${allErrors.length}건)`);
      console.warn('베팅 동기화 오류:', allErrors);
    } else {
      toast.success(msg);
    }

    setLastSyncTime(new Date());
    setSyncing(false);
    setPage(0);
    load(0);
  }

  const totalBet = rows.reduce((s, r) => s + Number(r.bet_amount), 0);
  const totalWin = rows.reduce((s, r) => s + Number(r.win_amount), 0);
  const totalGgr = rows.reduce((s, r) => s + Number(r.ggr), 0);

  function fmtTime(t: string | null) {
    if (!t) return '-';
    return new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function fmtMoney(n: unknown) {
    return n !== null && n !== undefined ? Number(n).toLocaleString() : '-';
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">베팅 내역</h2>
        <Button
          onClick={handleSyncAll}
          disabled={syncing}
          className="bg-orange-600 hover:bg-orange-700 text-white text-sm"
        >
          {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          베팅 동기화
        </Button>
      </div>

      {/* 안내 배너 */}
      <div className="flex items-start gap-3 bg-blue-950/40 border border-blue-800/40 rounded-lg px-4 py-3 mb-5">
        <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-300 leading-relaxed">
          <span className="font-semibold">최신 베팅 내역을 확인하려면 우측 상단의 <span className="text-orange-400">베팅 동기화</span> 버튼을 눌러주세요.</span>
          <span className="text-blue-400 ml-2 text-xs">
            {lastSyncTime
              ? `마지막 동기화: ${lastSyncTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
              : ''}
          </span>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-slate-800 border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">조회 건수</p>
          <p className="text-xl font-bold text-white">{rows.length.toLocaleString()}건</p>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">총 베팅</p>
          <p className="text-xl font-bold text-white">{totalBet.toLocaleString()}</p>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">총 당첨</p>
          <p className="text-xl font-bold text-green-400">{totalWin.toLocaleString()}</p>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4">
          <p className="text-slate-400 text-xs mb-1">GGR (수익)</p>
          <p className={`text-xl font-bold ${totalGgr >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {totalGgr >= 0 ? '+' : ''}{totalGgr.toLocaleString()}
          </p>
        </Card>
      </div>

      {/* 날짜 필터 */}
      <Card className="bg-slate-800 border-slate-700 p-4 mb-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm">시작일:</span>
            <Popover open={startOpen} onOpenChange={setStartOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 hover:border-slate-500 transition-colors">
                  <CalendarIcon size={14} className="text-slate-400" />
                  {format(startDate, 'yyyy-MM-dd')}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                <Calendar mode="single" selected={startDate} onSelect={d => { if (d) { setStartDate(startOfDay(d)); setStartOpen(false); } }} className="bg-slate-800" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm">종료일:</span>
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 hover:border-slate-500 transition-colors">
                  <CalendarIcon size={14} className="text-slate-400" />
                  {format(endDate, 'yyyy-MM-dd')}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                <Calendar mode="single" selected={endDate} onSelect={d => { if (d) { setEndDate(endOfDay(d)); setEndOpen(false); } }} className="bg-slate-800" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-2">
            {[
              { label: '오늘', action: () => { const t = new Date(); setStartDate(startOfDay(t)); setEndDate(endOfDay(t)); } },
              { label: '어제', action: () => { const y = subDays(new Date(), 1); setStartDate(startOfDay(y)); setEndDate(endOfDay(y)); } },
              { label: '최근 7일', action: () => { setStartDate(startOfDay(subDays(new Date(), 6))); setEndDate(endOfDay(new Date())); } },
            ].map(({ label, action }) => (
              <button key={label} onClick={action} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 text-sm rounded-lg transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Input
              placeholder="사용자명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(0)}
              className="bg-slate-900 border-slate-600 text-white w-40"
            />
            <Button
              onClick={() => { setPage(0); load(0); }}
              disabled={loading}
              size="sm"
              className="bg-slate-600 hover:bg-slate-500"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '검색'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 테이블 */}
      <Card className="bg-slate-800 border-slate-700">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left p-3 text-slate-400 font-medium">사용자</th>
                <th className="text-left p-3 text-slate-400 font-medium">상위</th>
                {isSystemAdmin && <th className="text-left p-3 text-slate-400 font-medium">API</th>}
                <th className="text-left p-3 text-slate-400 font-medium">게임사</th>
                <th className="text-left p-3 text-slate-400 font-medium">게임명</th>
                <th className="text-left p-3 text-slate-400 font-medium">베팅</th>
                <th className="text-left p-3 text-slate-400 font-medium">결과</th>
                <th className="text-left p-3 text-slate-400 font-medium">이전금액 → 현재금액</th>
                <th className="text-right p-3 text-slate-400 font-medium">GGR</th>
                <th className="text-left p-3 text-slate-400 font-medium">상태</th>
                <th className="text-left p-3 text-slate-400 font-medium">시간</th>
                <th className="text-center p-3 text-slate-400 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={isSystemAdmin ? 12 : 11} className="text-center text-slate-500 py-12">
                    베팅 내역이 없습니다.{' '}
                    <button onClick={handleSyncAll} className="text-orange-400 hover:underline font-medium">
                      베팅 동기화
                    </button>
                    를 눌러 최신 데이터를 가져오세요.
                  </td>
                </tr>
              )}
              {rows.filter(row => row.bet_time !== null || row.settle_time !== null).map(row => {
                const isWin = row.win_amount > 0;
                const isSettled = row.round_status === 'settled' || row.round_status === 'turn_lose';
                const statusLabel = isSettled ? (isWin ? '당첨' : '낙첨') : '진행중';
                const statusColor = isWin ? 'bg-green-900/40 text-green-300' : isSettled ? 'bg-slate-700 text-slate-400' : 'bg-yellow-900/30 text-yellow-400';
                const apiColors: Record<string, string> = {
                  honor:  'text-purple-400 bg-purple-900/30',
                  ace:    'text-blue-400 bg-blue-900/30',
                  invest: 'text-green-400 bg-green-900/30',
                };
                return (
                  <tr key={row.key} className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                    <td className="p-3 text-white font-medium">{row.username}</td>
                    <td className="p-3 text-slate-400 text-xs">{row.storeName || '-'}</td>
                    {isSystemAdmin && (
                      <td className="p-3">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded uppercase ${apiColors[row.api_type] ?? 'text-slate-400 bg-slate-700'}`}>
                          {row.api_type}
                        </span>
                      </td>
                    )}
                    <td className="p-3 text-slate-300">{row.provider_name || '-'}</td>
                    <td className="p-3 text-slate-200">{row.game_name || '-'}</td>
                    <td className="p-3 text-red-300 font-mono text-sm">
                      {row.bet_amount > 0 ? `-${Number(row.bet_amount).toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 font-mono text-sm">
                      {isSettled
                        ? <span className={isWin ? 'text-green-300' : 'text-slate-500'}>
                            {isWin ? `+${Number(row.win_amount).toLocaleString()}` : '0'}
                          </span>
                        : <span className="text-yellow-400 text-xs">대기</span>
                      }
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-xs font-mono whitespace-nowrap">
                        {row.beforeCash !== null
                          ? <span className="text-yellow-300">{Number(row.beforeCash).toLocaleString()}</span>
                          : <span className="text-slate-600">-</span>
                        }
                        <span className="text-slate-600">→</span>
                        {row.afterCash !== null
                          ? <span className={Number(row.afterCash) >= Number(row.beforeCash ?? 0) ? 'text-emerald-300' : 'text-orange-300'}>
                              {Number(row.afterCash).toLocaleString()}
                            </span>
                          : <span className="text-slate-600">-</span>
                        }
                      </div>
                    </td>
                    <td className={`p-3 text-right font-medium ${row.ggr >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {row.ggr >= 0 ? '+' : ''}{row.ggr.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-xs">{fmtTime(row.bet_time ?? row.settle_time)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setDetailRow(row)}
                        className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-600"
                        title="상세 보기"
                      >
                        <FileText size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 페이지 내비게이션 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
          {/* 페이지 크기 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">페이지당</span>
            <div className="flex gap-1">
              {PAGE_SIZE_OPTIONS.map(size => (
                <button
                  key={size}
                  onClick={() => { setPageSize(size); setPage(0); load(0, size); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    pageSize === size
                      ? 'bg-slate-500 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <span className="text-slate-500 text-xs">개</span>
          </div>

          {/* 페이지 이동 */}
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            <button
              onClick={() => { const prev = page - 1; setPage(prev); load(prev); }}
              disabled={page === 0 || loading}
              className="px-3 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            <span className="text-slate-300 text-sm font-medium px-2">
              {page + 1} 페이지
            </span>
            <button
              onClick={() => { const next = page + 1; setPage(next); load(next); }}
              disabled={!hasMore || loading}
              className="px-3 py-1.5 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        </div>
      </Card>

      {/* 상세 드로어 */}
      {detailRow && (
        <DetailDrawer row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}
