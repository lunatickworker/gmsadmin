import { Search, Download, RefreshCw, Check, X, ArrowDownCircle, ArrowUpCircle, Users, CreditCard, ArrowLeftRight, Calendar as CalendarIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

type Tab = 'all' | 'online' | 'manual' | 'partner';

interface TxRow {
  id: string;
  txNo: string;
  kind: 'online' | 'manual' | 'partner' | 'partner_request';
  type: 'deposit' | 'withdrawal';
  amount: number;
  status: string;
  userId: string;
  targetUser: string;
  targetName: string;
  processedBy?: string;
  memo?: string;
  createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  대기:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  검토중: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  완료:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  거부:   'bg-red-500/20 text-red-400 border border-red-500/30',
  취소:   'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  처리완료: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  승인:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  거절:   'bg-red-500/20 text-red-400 border border-red-500/30',
};

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  online:          { label: '온라인',  color: 'bg-blue-500/20 text-blue-400' },
  manual:          { label: '수동',    color: 'bg-violet-500/20 text-violet-400' },
  partner:         { label: '파트너',  color: 'bg-orange-500/20 text-orange-400' },
  partner_request: { label: '파트너신청', color: 'bg-sky-500/20 text-sky-400' },
};

export default function TransactionManage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'deposit' | 'withdrawal'>('');
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));

  useEffect(() => { loadAll(); }, [startDate, endDate]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const from = startOfDay(startDate).toISOString();
      const to = endOfDay(endDate).toISOString();

      const [onlineRes, manualRes, partnerRes, partnerReqRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, transaction_no, type, amount, status, created_at, request_memo, admin_memo, user_id, users!transactions_user_id_fkey(username, name), reviewed_by, processed_by')
          .gte('created_at', from).lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('transaction_manual')
          .select('id, transaction_no, type, amount, memo, created_at, target_user_id, target:target_user_id(username, name), processor:processed_by(username)')
          .gte('created_at', from).lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('partner_transactions')
          .select('id, transaction_no, type, amount, memo, created_at, parent_partner_id, child_partner_id, parent:parent_partner_id(username), child:child_partner_id(username, name)')
          .gte('created_at', from).lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('partner_transfer_requests')
          .select('id, type, amount, memo, status, created_at, processed_at, requester_id, target_id, requester:requester_id(username, name), target:target_id(username)')
          .gte('created_at', from).lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const onlineRows: TxRow[] = (onlineRes.data ?? []).map((t: any) => {
        const u = t['users!transactions_user_id_fkey'];
        const statusMap: Record<string, string> = { pending: '대기', reviewing: '검토중', approved: '완료', completed: '완료', rejected: '거부', cancelled: '취소' };
        return {
          id: t.id,
          txNo: t.transaction_no,
          kind: 'online',
          type: t.type,
          amount: Number(t.amount),
          status: statusMap[t.status] ?? t.status,
          userId: t.user_id ?? '',
          targetUser: u?.username ?? '-',
          targetName: u?.name ?? '',
          memo: t.request_memo || t.admin_memo || '',
          createdAt: t.created_at,
        };
      });

      const manualRows: TxRow[] = (manualRes.data ?? []).map((t: any) => ({
        id: t.id,
        txNo: t.transaction_no,
        kind: 'manual',
        type: t.type,
        amount: Number(t.amount),
        status: '처리완료',
        userId: t.target_user_id ?? '',
        targetUser: (t.target as any)?.username ?? '-',
        targetName: (t.target as any)?.name ?? '',
        processedBy: (t.processor as any)?.username ?? '-',
        memo: t.memo ?? '',
        createdAt: t.created_at,
      }));

      const partnerRows: TxRow[] = (partnerRes.data ?? []).map((t: any) => ({
        id: t.id,
        txNo: t.transaction_no,
        kind: 'partner',
        type: t.type,
        amount: Number(t.amount),
        status: '처리완료',
        userId: t.child_partner_id ?? '',
        targetUser: (t.child as any)?.username ?? '-',
        targetName: (t.parent as any)?.username ? `← ${(t.parent as any).username}` : '',
        processedBy: (t.parent as any)?.username ?? '-',
        memo: t.memo ?? '',
        createdAt: t.created_at,
      }));

      const statusMapReq: Record<string, string> = { pending: '대기', approved: '승인', rejected: '거절' };
      const partnerReqRows: TxRow[] = (partnerReqRes.data ?? []).map((t: any) => ({
        id: t.id,
        txNo: `REQ-${t.id.slice(0, 8)}`,
        kind: 'partner_request' as const,
        type: t.type,
        amount: Number(t.amount),
        status: statusMapReq[t.status] ?? t.status,
        userId: t.requester_id ?? '',
        targetUser: (t.requester as any)?.username ?? '-',
        targetName: (t.requester as any)?.name ?? '',
        processedBy: (t.target as any)?.username ?? '-',
        memo: t.memo ?? '',
        createdAt: t.created_at,
      }));

      setRows([...onlineRows, ...manualRows, ...partnerRows, ...partnerReqRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e: any) {
      toast.error('데이터 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (row: TxRow) => {
    if (row.kind !== 'online') return;

    // 사용자 현재 잔액 조회
    const { data: userRow } = await supabase
      .from('users').select('balance').eq('id', row.userId).single();
    if (!userRow) { toast.error('사용자 정보를 불러올 수 없습니다.'); return; }

    const currentBalance = Number(userRow.balance);
    const amount = Number(row.amount);

    if (row.type === 'withdrawal') {
      // 출금: 이미 신청 시 선차감 처리됨 → 추가 차감 없이 상태만 변경
    }

    // 입금 승인 시 잔액 증가
    if (row.type === 'deposit') {
      const { error: balErr } = await supabase
        .from('users').update({ balance: currentBalance + amount }).eq('id', row.userId);
      if (balErr) { toast.error('잔액 업데이트 실패: ' + balErr.message); return; }
    }

    const { error } = await supabase
      .from('transactions')
      .update({ status: 'approved', processed_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { toast.error('승인 실패: ' + error.message); return; }
    toast.success('승인 처리되었습니다.');
    loadAll();
  };

  const handleReject = async (row: TxRow) => {
    if (row.kind !== 'online') return;
    if (!confirm('거부하시겠습니까?')) return;

    // 출금 거부 시 선차감된 잔액 복구
    if (row.type === 'withdrawal') {
      const { data: userRow } = await supabase
        .from('users').select('balance').eq('id', row.userId).single();
      if (userRow) {
        await supabase
          .from('users').update({ balance: Number(userRow.balance) + Number(row.amount) }).eq('id', row.userId);
      }
    }

    const { error } = await supabase
      .from('transactions')
      .update({ status: 'rejected', processed_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) { toast.error('거부 실패: ' + error.message); return; }
    toast.success('거부 처리되었습니다.');
    loadAll();
  };

  const filtered = rows.filter(r => {
    if (tab === 'online'  && r.kind !== 'online')  return false;
    if (tab === 'manual'  && r.kind !== 'manual')  return false;
    if (tab === 'partner' && r.kind !== 'partner' && r.kind !== 'partner_request') return false;
    if (typeFilter && r.type !== typeFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!r.targetUser.toLowerCase().includes(q) && !r.targetName.toLowerCase().includes(q) && !r.txNo.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendingCount  = rows.filter(r => r.kind === 'online' && r.status === '대기').length;
  const totalDeposit  = filtered.filter(r => r.type === 'deposit').reduce((s, r) => s + r.amount, 0);
  const totalWithdraw = filtered.filter(r => r.type === 'withdrawal').reduce((s, r) => s + r.amount, 0);

  const TABS = [
    { key: 'all',     label: '전체', icon: <ArrowLeftRight size={14} /> },
    { key: 'online',  label: '회원 충환전', icon: <CreditCard size={14} /> },
    { key: 'manual',  label: '수동 충환전', icon: <Users size={14} /> },
    { key: 'partner', label: '파트너 지급/회수', icon: <ArrowLeftRight size={14} /> },
  ] as const;

  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">입출금 관리</h2>
          <p className="text-slate-400 text-sm mt-1">회원 충환전 · 수동 처리 · 파트너 지급/회수 통합 내역</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors border border-slate-600">
            <RefreshCw size={16} />
            새로고침
          </button>
          <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors border border-slate-600">
            <Download size={16} />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 날짜 필터 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 text-sm">시작일:</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 hover:border-slate-500 transition-colors">
                <CalendarIcon size={14} className="text-slate-400" />
                {format(startDate, 'yyyy-MM-dd')}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
              <Calendar mode="single" selected={startDate} onSelect={d => d && setStartDate(startOfDay(d))} className="bg-slate-800" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300 text-sm">종료일:</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 hover:border-slate-500 transition-colors">
                <CalendarIcon size={14} className="text-slate-400" />
                {format(endDate, 'yyyy-MM-dd')}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
              <Calendar mode="single" selected={endDate} onSelect={d => d && setEndDate(endOfDay(d))} className="bg-slate-800" />
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
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-yellow-600/30 to-yellow-700/20 border border-yellow-600/30 rounded-xl p-4">
          <p className="text-yellow-300/80 text-xs mb-1">온라인 대기</p>
          <p className="text-2xl font-bold text-yellow-300">{pendingCount}</p>
          <p className="text-yellow-300/60 text-xs mt-1">승인 대기 건</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-600/30 to-emerald-700/20 border border-emerald-600/30 rounded-xl p-4">
          <p className="text-emerald-300/80 text-xs mb-1">조회 충전 합계</p>
          <p className="text-2xl font-bold text-emerald-300">₩{totalDeposit.toLocaleString()}</p>
          <p className="text-emerald-300/60 text-xs mt-1">필터 기준</p>
        </div>
        <div className="bg-gradient-to-br from-amber-600/30 to-amber-700/20 border border-amber-600/30 rounded-xl p-4">
          <p className="text-amber-300/80 text-xs mb-1">조회 환전 합계</p>
          <p className="text-2xl font-bold text-amber-300">₩{totalWithdraw.toLocaleString()}</p>
          <p className="text-amber-300/60 text-xs mt-1">필터 기준</p>
        </div>
        <div className="bg-gradient-to-br from-blue-600/30 to-blue-700/20 border border-blue-600/30 rounded-xl p-4">
          <p className="text-blue-300/80 text-xs mb-1">입출차액</p>
          <p className={`text-2xl font-bold ${totalDeposit - totalWithdraw >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
            ₩{(totalDeposit - totalWithdraw).toLocaleString()}
          </p>
          <p className="text-blue-300/60 text-xs mt-1">충전 - 환전</p>
        </div>
      </div>

      {/* 탭 + 필터 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {/* 탭 바 */}
        <div className="flex border-b border-slate-700">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              }`}
            >
              {t.icon}
              {t.label}
              {t.key === 'online' && pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-yellow-950 text-[10px] font-bold rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* 검색 + 유형 필터 */}
        <div className="flex gap-3 p-4 border-b border-slate-700">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="아이디, 닉네임, 거래번호 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-700 text-slate-200 placeholder:text-slate-500 pl-9 pr-4 py-2 rounded-lg border border-slate-600 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg border border-slate-600 text-sm focus:outline-none focus:border-blue-500"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">전체 유형</option>
            <option value="deposit">충전/지급</option>
            <option value="withdrawal">환전/회수</option>
          </select>
        </div>

        {/* 테이블 */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">로딩 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/40">
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">구분</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">거래번호</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">유형</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">대상</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">금액</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">상태</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">처리자/메모</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">일시</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">처리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={`${row.kind}-${row.id}`} className="border-t border-slate-700/60 hover:bg-slate-700/20 transition-colors">
                    {/* 구분 */}
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${KIND_LABEL[row.kind].color}`}>
                        {KIND_LABEL[row.kind].label}
                      </span>
                    </td>
                    {/* 거래번호 */}
                    <td className="px-4 py-3.5 text-xs text-slate-500 font-mono">{row.txNo}</td>
                    {/* 유형 */}
                    <td className="px-4 py-3.5">
                      <span className={`flex items-center gap-1 text-xs font-medium ${row.type === 'deposit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {row.type === 'deposit' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                        {row.type === 'deposit' ? (row.kind === 'partner' || row.kind === 'partner_request' ? '지급' : '충전') : (row.kind === 'partner' || row.kind === 'partner_request' ? '회수' : '환전')}
                      </span>
                    </td>
                    {/* 대상 */}
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-slate-200 font-medium">{row.targetUser}</div>
                      {row.targetName && <div className="text-xs text-slate-500">{row.targetName}</div>}
                    </td>
                    {/* 금액 */}
                    <td className="px-4 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${row.type === 'deposit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {row.type === 'deposit' ? '+' : '-'}₩{row.amount.toLocaleString()}
                      </span>
                    </td>
                    {/* 상태 */}
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[row.status] ?? 'text-slate-400'}`}>
                        {row.status}
                      </span>
                    </td>
                    {/* 처리자/메모 */}
                    <td className="px-4 py-3.5 text-xs text-slate-500 max-w-[160px]">
                      {row.processedBy && <div className="text-slate-400">{row.processedBy}</div>}
                      {row.memo && <div className="truncate" title={row.memo}>{row.memo}</div>}
                    </td>
                    {/* 일시 */}
                    <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {/* 처리 */}
                    <td className="px-4 py-3.5">
                      {row.kind === 'online' && row.status === '대기' ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleApprove(row)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/40 text-emerald-400 rounded text-xs transition-colors"
                          >
                            <Check size={11} />
                            승인
                          </button>
                          <button
                            onClick={() => handleReject(row)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-600/40 text-red-400 rounded text-xs transition-colors"
                          >
                            <X size={11} />
                            거부
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      조회된 내역이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
