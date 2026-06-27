import { useState, useEffect } from 'react';
import { Copy, Loader2, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

interface User { id: string; username: string; name: string; }

interface SiteBank {
  bank_name: string;
  bank_account: string;
  account_holder: string;
}

interface TxRow {
  id: string;
  transaction_no: string;
  amount: number;
  account_holder: string;
  status: string;
  request_memo: string | null;
  reject_reason: string | null;
  created_at: string;
}

const QUICK_AMOUNTS = [10000, 30000, 50000, 100000, 300000, 500000, 1000000, 3000000, 5000000, 10000000, 30000000, 100000000];

function formatQuickAmount(a: number): string {
  if (a >= 100000000) return `${a / 100000000}억`;
  return `${a / 10000}만`;
}

function statusInfo(s: string) {
  if (s === 'pending' || s === 'reviewing') return { label: '대기중', color: 'text-yellow-400', Icon: Clock };
  if (s === 'approved' || s === 'completed') return { label: '완료', color: 'text-green-400', Icon: CheckCircle };
  if (s === 'rejected' || s === 'cancelled') return { label: '거부', color: 'text-red-400', Icon: XCircle };
  return { label: s, color: 'text-slate-400', Icon: Clock };
}

export default function DepositPage({ user }: { user: User | null }) {
  const [rawAmount, setRawAmount] = useState('');
  const [accountHolder, setAccountHolder] = useState(user?.name ?? '');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [siteBank, setSiteBank] = useState<SiteBank | null>(null);
  const [history, setHistory] = useState<TxRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    loadSiteBank();
    if (user) loadHistory();
  }, [user?.id]);

  const loadSiteBank = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['deposit_bank_name', 'deposit_bank_account', 'deposit_account_holder']);
    if (data && data.length > 0) {
      const m = Object.fromEntries(data.map((d: any) => [d.setting_key, d.setting_value ?? '']));
      setSiteBank({
        bank_name: m['deposit_bank_name'] ?? '',
        bank_account: m['deposit_bank_account'] ?? '',
        account_holder: m['deposit_account_holder'] ?? '',
      });
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('transactions')
      .select('id, transaction_no, amount, account_holder, status, request_memo, reject_reason, created_at')
      .eq('user_id', user.id)
      .eq('type', 'deposit')
      .order('created_at', { ascending: false })
      .limit(30);
    const rows = data ?? [];
    setHistory(rows);
    setHasPending(rows.some(r => r.status === 'pending' || r.status === 'reviewing'));
    setLoadingHistory(false);
  };

  const addQuick = (a: number) => {
    setRawAmount(prev => String((parseInt(prev || '0', 10)) + a));
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); return; }
    const amt = parseInt(rawAmount || '0', 10);
    if (!amt || amt <= 0) { toast.error('금액을 입력하세요.'); return; }
    if (amt < 10000) { toast.error('최소 10,000원 이상 신청 가능합니다.'); return; }
    if (!accountHolder.trim()) { toast.error('입금자명을 입력하세요.'); return; }
    if (hasPending) { toast.error('대기 중인 입금 신청이 있습니다. 처리 후 재신청하세요.'); return; }

    setSubmitting(true);
    try {
      const txNo = `DEP${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const { error } = await supabase.from('transactions').insert({
        transaction_no: txNo,
        user_id: user.id,
        user_role: 'member',
        type: 'deposit',
        method: 'online',
        amount: amt,
        status: 'pending',
        account_holder: accountHolder.trim(),
        request_memo: memo.trim() || null,
      });
      if (error) throw error;
      toast.success('입금 신청이 완료되었습니다. 관리자 확인 후 처리됩니다.');
      setRawAmount('');
      setMemo('');
      await loadHistory();
    } catch (e: any) {
      toast.error('신청 실패: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const displayAmount = rawAmount ? parseInt(rawAmount, 10).toLocaleString() : '';

  return (
    <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-1">입금 신청</h2>
      <p className="text-slate-500 text-sm mb-6">아래 계좌로 이체 후 신청하시면 관리자 확인 후 보유금에 반영됩니다.</p>

      {/* 입금 계좌 */}
      {siteBank && (siteBank.bank_name || siteBank.bank_account) ? (
        <div className="mb-6 bg-[#1a1500] border border-[#c9a227]/40 rounded-xl p-5">
          <p className="text-[#c9a227] text-xs font-bold uppercase tracking-wider mb-3">입금 계좌 정보</p>
          {[
            { label: '은행', value: siteBank.bank_name },
            { label: '계좌번호', value: siteBank.bank_account },
            { label: '예금주', value: siteBank.account_holder },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <span className="text-slate-500 text-sm w-20 shrink-0">{label}</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white font-semibold truncate">{value || '-'}</span>
                {value && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(value); toast.success('복사되었습니다.'); }}
                    className="shrink-0 text-slate-600 hover:text-[#c9a227] transition-colors"
                  >
                    <Copy size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-6 bg-[#111]/60 border border-white/5 rounded-xl p-5 text-center text-slate-600 text-sm">
          입금 계좌 정보가 설정되지 않았습니다. 관리자에게 문의하세요.
        </div>
      )}

      {/* 신청 폼 */}
      <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5 mb-8">
        {/* 금액 */}
        <div className="mb-5">
          <label className="text-slate-400 text-sm mb-2 block">입금 금액</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">₩</span>
            <input
              type="text"
              inputMode="numeric"
              value={displayAmount}
              onChange={e => setRawAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              className="w-full bg-black/40 border border-[#c9a227]/20 rounded-lg pl-8 pr-4 py-3 text-white text-xl font-bold focus:outline-none focus:border-[#c9a227]/60 placeholder-slate-700"
            />
          </div>
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {QUICK_AMOUNTS.map(a => (
              <button key={a} onClick={() => addQuick(a)}
                className="px-3 py-1.5 text-xs bg-[#1a1500] border border-[#c9a227]/20 text-[#c9a227] rounded-md hover:bg-[#2a2500] transition-colors font-semibold">
                +{formatQuickAmount(a)}
              </button>
            ))}
            <button onClick={() => setRawAmount('')}
              className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-md hover:bg-white/10 transition-colors">
              초기화
            </button>
          </div>
        </div>

        {/* 입금자명 */}
        <div className="mb-4">
          <label className="text-slate-400 text-sm mb-2 block">입금자명 <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={accountHolder}
            onChange={e => setAccountHolder(e.target.value)}
            placeholder="실제 이체하실 이름을 입력하세요"
            className="w-full bg-black/40 border border-[#c9a227]/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#c9a227]/60 placeholder-slate-600"
          />
        </div>

        {/* 메모 */}
        <div className="mb-5">
          <label className="text-slate-400 text-sm mb-2 block">메모 <span className="text-slate-600 text-xs">(선택)</span></label>
          <input
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="전달할 내용이 있으면 입력하세요"
            className="w-full bg-black/40 border border-[#c9a227]/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#c9a227]/60 placeholder-slate-600"
          />
        </div>

        {hasPending && (
          <div className="mb-4 flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-4 py-2.5 text-yellow-400 text-sm">
            <Clock size={14} />
            대기 중인 입금 신청이 있습니다.
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !rawAmount || !accountHolder.trim() || hasPending}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#c9a227] to-[#a07820] text-black font-bold text-base hover:from-[#d4b030] hover:to-[#b08828] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#c9a227]/20"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : '입금 신청하기'}
        </button>
      </div>

      {/* 내역 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">입금 내역</h3>
        <button onClick={loadHistory} className="text-slate-500 hover:text-[#c9a227] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {loadingHistory ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="text-[#c9a227] animate-spin" /></div>
      ) : history.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm">입금 내역이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {history.map(tx => {
            const { label, color, Icon } = statusInfo(tx.status);
            return (
              <div key={tx.id} className="bg-[#0d0d0d] border border-white/5 rounded-lg px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-600 font-mono mb-0.5">{tx.transaction_no}</p>
                  <p className="text-white font-bold text-lg">₩{Number(tx.amount).toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tx.account_holder} · {new Date(tx.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {tx.reject_reason && (
                    <p className="text-xs text-red-400 mt-1">거부 사유: {tx.reject_reason}</p>
                  )}
                </div>
                <div className={`shrink-0 flex items-center gap-1.5 ${color}`}>
                  <Icon size={14} />
                  <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
