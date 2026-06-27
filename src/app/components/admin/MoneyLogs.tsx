import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle,
  Activity, DollarSign, Zap,
} from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────
type ApiTab = 'api' | 'money' | 'diff';

const VENDOR_TABLE_MAP: Record<string, string> = {
  invest: 'betting_history_invest',
  honor:  'betting_history_honor',
  ace:    'betting_history_ace',
};

const API_COLORS: Record<string, string> = {
  invest: 'bg-blue-900/40 text-blue-300 border-blue-800/40',
  honor:  'bg-sky-900/40 text-sky-300 border-sky-800/40',
  ace:    'bg-orange-900/40 text-orange-300 border-orange-800/40',
};

function fmtTime(t: string | null | undefined) {
  if (!t) return '-';
  return new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}
function fmtMoney(n: unknown) {
  if (n === null || n === undefined || n === '') return '-';
  return `₩${Number(n).toLocaleString()}`;
}

// ── API 호출 로그 탭 ─────────────────────────────────────────────
interface ApiLogRow {
  id: string;
  api_type: string;
  username: string;
  provider_name: string;
  game_name: string;
  game_type: string | null;
  bet_amount: number;
  win_amount: number;
  round_status: string | null;
  bet_time: string | null;
  settle_time: string | null;
  raw_data: Record<string, unknown> | null;
}

function ApiCallLogs() {
  const [rows, setRows] = useState<ApiLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [apiFilter, setApiFilter] = useState<'all' | 'invest' | 'honor' | 'ace'>('all');
  const [page, setPage] = useState(0);
  const PAGE = 100;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const vendors = apiFilter === 'all'
      ? Object.keys(VENDOR_TABLE_MAP)
      : [apiFilter].filter(v => v in VENDOR_TABLE_MAP);

    const queries = vendors.map(vk => {
      let q = supabase
        .from(VENDOR_TABLE_MAP[vk])
        .select('id, username, provider_name, game_name, game_type, bet_amount, win_amount, round_status, bet_time, settle_time, raw_data')
        .order('bet_time', { ascending: false })
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (search) q = q.ilike('username', `%${search}%`);
      return q.then(res => (res.data ?? []).map((r: any) => ({ ...r, api_type: vk })));
    });

    const results = await Promise.all(queries);
    const merged = results.flat()
      .sort((a, b) => new Date(b.bet_time ?? 0).getTime() - new Date(a.bet_time ?? 0).getTime())
      .slice(0, PAGE);

    setRows(prev => p === 0 ? merged : [...prev, ...merged]);
    setLoading(false);
  }, [apiFilter, search]);

  useEffect(() => { setPage(0); load(0); }, [apiFilter]);

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="사용자명 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(0)}
          className="bg-slate-900 border-slate-600 text-white w-44 h-8 text-sm"
        />
        <div className="flex gap-1">
          {(['all', 'invest', 'ace', 'honor'] as const).map(v => (
            <button
              key={v}
              onClick={() => setApiFilter(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                apiFilter === v ? 'bg-slate-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {v === 'all' ? '전체' : v.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(0)}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          조회
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              {['API', '사용자', '게임사', '게임명', '이전보유금', '베팅금', '당첨금', '현재보유금', '잔액변화', '상태', '베팅시간', '정산시간'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={12} className="text-center py-10 text-slate-500"><Loader2 size={18} className="animate-spin inline" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={12} className="text-center py-10 text-slate-500">데이터가 없습니다</td></tr>
            )}
            {rows.map(row => {
              const raw = row.raw_data ?? {};
              const before = raw.beforeCash as number | undefined;
              const after  = raw.afterCash  as number | undefined;
              const delta  = before !== undefined && after !== undefined ? after - before : null;
              return (
                <tr key={`${row.api_type}-${row.id}`} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${API_COLORS[row.api_type] ?? ''}`}>
                      {row.api_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white font-medium">{row.username}</td>
                  <td className="px-3 py-2 text-slate-300">{row.provider_name || '-'}</td>
                  <td className="px-3 py-2 text-slate-300 max-w-[120px] truncate">{row.game_name || '-'}</td>
                  <td className="px-3 py-2 text-yellow-300">{before !== undefined ? Number(before).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2 text-white">{Number(row.bet_amount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-green-400">{Number(row.win_amount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-emerald-300">{after !== undefined ? Number(after).toLocaleString() : '-'}</td>
                  <td className={`px-3 py-2 font-mono font-medium ${delta === null ? 'text-slate-500' : delta >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {delta === null ? '-' : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      row.round_status === 'win' ? 'bg-green-900/40 text-green-300' :
                      row.round_status === 'lose' ? 'bg-red-900/40 text-red-300' :
                      row.round_status === 'betting' ? 'bg-yellow-900/40 text-yellow-300' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {row.round_status ?? '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtTime(row.bet_time)}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtTime(row.settle_time)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => { const next = page + 1; setPage(next); load(next); }}
            disabled={loading}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
            더 보기
          </button>
        </div>
      )}
    </div>
  );
}

// ── 머니 로그 (통합) 탭 ─────────────────────────────────────────
interface MoneyEvent {
  id: string;
  source: '게임베팅' | '게임정산' | '입금' | '출금' | '관리자조정' | '포인트';
  username: string;
  amount: number;
  balance_before?: number;
  balance_after?: number;
  memo?: string;
  status?: string;
  created_at: string;
  api_type?: string;
}

function MoneyLog() {
  const [events, setEvents] = useState<MoneyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [srcFilter, setSrcFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const results: MoneyEvent[] = [];

    // 1. 베팅 이력 (ACE/Invest/Honor)
    for (const [vk, tbl] of Object.entries(VENDOR_TABLE_MAP)) {
      let q = supabase
        .from(tbl)
        .select('id, username, bet_amount, win_amount, round_status, bet_time, settle_time, raw_data')
        .order('bet_time', { ascending: false })
        .limit(200);
      if (search) q = q.ilike('username', `%${search}%`);
      const { data } = await q;
      for (const r of data ?? []) {
        const raw = (r.raw_data ?? {}) as Record<string, unknown>;
        const before = raw.beforeCash as number | undefined;
        const after  = raw.afterCash  as number | undefined;
        results.push({
          id: `bet-${vk}-${r.id}`,
          source: '게임베팅',
          username: r.username,
          amount: -Number(r.bet_amount),
          balance_before: before,
          balance_after: after !== undefined && before !== undefined ? undefined : after,
          memo: r.game_name ?? undefined,
          status: r.round_status ?? undefined,
          created_at: r.bet_time ?? '',
          api_type: vk,
        });
        if (r.win_amount > 0 && r.settle_time) {
          results.push({
            id: `win-${vk}-${r.id}`,
            source: '게임정산',
            username: r.username,
            amount: Number(r.win_amount),
            balance_before: after,
            memo: `${r.game_name ?? ''} 당첨`,
            status: r.round_status ?? undefined,
            created_at: r.settle_time ?? r.bet_time ?? '',
            api_type: vk,
          });
        }
      }
    }

    // 2. 입출금 신청 내역
    {
      let q = supabase
        .from('transactions')
        .select('id, type, amount, status, memo, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data } = await q;

      // username 조회
      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u.username]));

      for (const r of data ?? []) {
        const username = userMap[r.user_id] ?? r.user_id;
        if (search && !username.toLowerCase().includes(search.toLowerCase())) continue;
        results.push({
          id: `tx-${r.id}`,
          source: r.type === 'deposit' ? '입금' : '출금',
          username,
          amount: r.type === 'deposit' ? Number(r.amount) : -Number(r.amount),
          memo: r.memo ?? undefined,
          status: r.status,
          created_at: r.created_at,
        });
      }
    }

    // 3. 관리자 수동 조정
    {
      const { data } = await supabase
        .from('transaction_manual')
        .select('id, type, amount, reason, memo, created_at, target_user_id, processed_by')
        .order('created_at', { ascending: false })
        .limit(200);

      const userIds = [...new Set((data ?? []).map((r: any) => r.target_user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u.username]));

      for (const r of data ?? []) {
        const username = userMap[r.target_user_id] ?? r.target_user_id;
        if (search && !username.toLowerCase().includes(search.toLowerCase())) continue;
        results.push({
          id: `manual-${r.id}`,
          source: '관리자조정',
          username,
          amount: r.type === 'deposit' ? Number(r.amount) : -Number(r.amount),
          memo: r.reason ?? r.memo ?? undefined,
          created_at: r.created_at,
        });
      }
    }

    // 4. 포인트 내역
    {
      const { data } = await supabase
        .from('point_history')
        .select('id, type, amount, balance_after, memo, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(200);

      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u.username]));

      for (const r of data ?? []) {
        const username = userMap[r.user_id] ?? r.user_id;
        if (search && !username.toLowerCase().includes(search.toLowerCase())) continue;
        results.push({
          id: `pt-${r.id}`,
          source: '포인트',
          username,
          amount: Number(r.amount),
          balance_after: Number(r.balance_after),
          memo: r.memo ?? undefined,
          created_at: r.created_at,
        });
      }
    }

    // 시간순 정렬
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEvents(results);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, []);

  const SOURCE_COLORS: Record<string, string> = {
    '게임베팅':   'bg-purple-900/40 text-purple-300 border-purple-800/40',
    '게임정산':   'bg-green-900/40 text-green-300 border-green-800/40',
    '입금':       'bg-blue-900/40 text-blue-300 border-blue-800/40',
    '출금':       'bg-orange-900/40 text-orange-300 border-orange-800/40',
    '관리자조정': 'bg-red-900/40 text-red-300 border-red-800/40',
    '포인트':     'bg-emerald-900/40 text-emerald-300 border-emerald-800/40',
  };

  const SOURCES = ['all', '게임베팅', '게임정산', '입금', '출금', '관리자조정', '포인트'];
  const filtered = srcFilter === 'all' ? events : events.filter(e => e.source === srcFilter);

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="사용자명 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          className="bg-slate-900 border-slate-600 text-white w-44 h-8 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => setSrcFilter(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                srcFilter === s ? 'bg-slate-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {s === 'all' ? '전체' : s}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          조회
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: '총 건수', val: filtered.length.toLocaleString() + '건', cls: 'text-white' },
          { label: '총 유입', val: fmtMoney(filtered.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)), cls: 'text-blue-400' },
          { label: '총 유출', val: fmtMoney(Math.abs(filtered.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0))), cls: 'text-red-400' },
        ] as const).map(c => (
          <div key={c.label} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.cls}`}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* 이벤트 리스트 */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              {['시간', '구분', '사용자', '금액', '이전잔액', '이후잔액', '상태/메모'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-slate-500"><Loader2 size={18} className="animate-spin inline" /></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-slate-500">데이터가 없습니다</td></tr>
            )}
            {filtered.slice(0, 500).map(ev => (
              <tr key={ev.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtTime(ev.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${SOURCE_COLORS[ev.source] ?? 'bg-slate-700 text-slate-400'}`}>
                    {ev.source}
                    {ev.api_type ? ` (${ev.api_type.toUpperCase()})` : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-white font-medium">{ev.username}</td>
                <td className={`px-3 py-2 font-mono font-semibold ${ev.amount >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {ev.amount >= 0 ? '+' : ''}{ev.amount.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-yellow-300">
                  {ev.balance_before !== undefined ? Number(ev.balance_before).toLocaleString() : '-'}
                </td>
                <td className="px-3 py-2 text-emerald-300">
                  {ev.balance_after !== undefined ? Number(ev.balance_after).toLocaleString() : '-'}
                </td>
                <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">
                  {ev.status ? <span className={`mr-2 px-1 py-0.5 rounded text-[10px] ${
                    ev.status === 'approved' ? 'bg-green-900/40 text-green-300' :
                    ev.status === 'rejected' ? 'bg-red-900/40 text-red-300' :
                    ev.status === 'pending'  ? 'bg-yellow-900/40 text-yellow-300' :
                    'bg-slate-700 text-slate-400'
                  }`}>{ev.status}</span> : null}
                  {ev.memo ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 잔액 불일치 탭 ─────────────────────────────────────────────
interface DiffRow {
  username: string;
  db_balance: number;
  last_api_after: number;
  diff: number;
  last_bet_time: string | null;
  api_type: string;
}

function BalanceDiff() {
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllOnly, setShowAllOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // 1. 모든 사용자 보유금
    const { data: users } = await supabase
      .from('users')
      .select('username, balance')
      .eq('role', 'member');

    const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.username, Number(u.balance ?? 0)]));

    // 2. 각 API별로 사용자당 마지막 afterCash 조회
    const apiBalances: Record<string, { amount: number; time: string | null; api: string }> = {};

    for (const [vk, tbl] of Object.entries(VENDOR_TABLE_MAP)) {
      const { data } = await supabase
        .from(tbl)
        .select('username, raw_data, bet_time, settle_time')
        .not('raw_data', 'is', null)
        .or('bet_time.not.is.null,settle_time.not.is.null')
        .limit(5000);

      for (const r of data ?? []) {
        const raw = (r.raw_data ?? {}) as Record<string, unknown>;
        const after = raw.afterCash;
        if (after === null || after === undefined) continue;
        // bet_time과 settle_time 중 더 최신 시간 사용 (당첨 레코드는 settle_time만 있을 수 있음)
        const rowTime = r.settle_time ?? r.bet_time;
        const existing = apiBalances[r.username];
        if (!existing || new Date(rowTime ?? 0) > new Date(existing.time ?? 0)) {
          apiBalances[r.username] = { amount: Number(after), time: rowTime, api: vk };
        }
      }
    }

    // 3. 불일치 계산
    const diffs: DiffRow[] = [];
    for (const [username, apiBal] of Object.entries(apiBalances)) {
      const dbBal = userMap[username];
      if (dbBal === undefined) continue;
      const diff = dbBal - apiBal.amount;
      diffs.push({
        username,
        db_balance: dbBal,
        last_api_after: apiBal.amount,
        diff,
        last_bet_time: apiBal.time,
        api_type: apiBal.api,
      });
    }

    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    setRows(diffs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = showAllOnly ? rows : rows.filter(r => Math.abs(r.diff) > 0);
  const mismatchCount = rows.filter(r => Math.abs(r.diff) > 0).length;

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">API 잔액 추적 사용자</p>
          <p className="text-xl font-bold text-white">{rows.length}명</p>
        </div>
        <div className={`rounded-lg px-4 py-3 border ${mismatchCount > 0 ? 'bg-red-900/20 border-red-700/40' : 'bg-green-900/20 border-green-700/40'}`}>
          <p className="text-xs text-slate-500 mb-1">잔액 불일치</p>
          <p className={`text-xl font-bold ${mismatchCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {mismatchCount > 0 ? `${mismatchCount}건` : '없음 ✓'}
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">총 불일치 금액</p>
          <p className="text-xl font-bold text-orange-400">
            {fmtMoney(rows.filter(r => Math.abs(r.diff) > 0).reduce((s, r) => s + Math.abs(r.diff), 0))}
          </p>
        </div>
      </div>

      {/* 필터 토글 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAllOnly(false)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!showAllOnly ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
        >
          불일치만 보기 ({mismatchCount})
        </button>
        <button
          onClick={() => setShowAllOnly(true)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${showAllOnly ? 'bg-slate-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
        >
          전체 보기 ({rows.length})
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs ml-auto"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          새로고침
        </button>
      </div>

      {loading && rows.length === 0 && (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">잔액 비교 분석 중...</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <CheckCircle size={40} className="text-green-500/60" />
          <p className="text-sm">잔액 불일치가 없습니다. 모든 사용자 잔액이 일치합니다.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                {['사용자', 'DB 보유금', '게임 API 마지막 잔액', '차이', '불일치', '마지막 베팅', 'API'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isMatch = Math.abs(r.diff) === 0;
                return (
                  <tr key={r.username} className={`border-b border-slate-800 transition-colors ${
                    isMatch ? 'hover:bg-slate-800/30' : 'bg-red-900/10 hover:bg-red-900/20'
                  }`}>
                    <td className="px-3 py-2.5 text-white font-semibold">{r.username}</td>
                    <td className="px-3 py-2.5 text-yellow-300 font-mono">{r.db_balance.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-emerald-300 font-mono">{r.last_api_after.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${isMatch ? 'text-slate-500' : r.diff > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {r.diff >= 0 ? '+' : ''}{r.diff.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      {isMatch
                        ? <span className="flex items-center gap-1 text-green-400"><CheckCircle size={12} />일치</span>
                        : <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={12} />불일치</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtTime(r.last_bet_time)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${API_COLORS[r.api_type] ?? ''}`}>
                        {r.api_type.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
const TABS: { id: ApiTab; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: 'api',
    label: 'API 호출 로그',
    icon: <Zap size={14} />,
    desc: '게임 API 전체 호출 이력 및 보유금 변화',
  },
  {
    id: 'money',
    label: '머니 로그',
    icon: <DollarSign size={14} />,
    desc: '베팅·입출금·포인트·관리자 조정 통합 타임라인',
  },
  {
    id: 'diff',
    label: '잔액 불일치',
    icon: <AlertTriangle size={14} />,
    desc: 'DB 보유금 vs 게임 API 마지막 잔액 비교',
  },
];

export default function MoneyLogs() {
  const [tab, setTab] = useState<ApiTab>('diff');

  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500/10 rounded-lg">
          <Activity className="text-emerald-400" size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">머니 로그 관리</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            API 호출 이력·자금 흐름·잔액 불일치를 한 곳에서 추적합니다
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-slate-700">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 설명 */}
      <div className="text-xs text-slate-500 -mt-2">
        {TABS.find(t => t.id === tab)?.desc}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'api'   && <ApiCallLogs />}
      {tab === 'money' && <MoneyLog />}
      {tab === 'diff'  && <BalanceDiff />}
    </div>
  );
}
