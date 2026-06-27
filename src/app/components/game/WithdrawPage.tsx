import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, Clock, XCircle, RefreshCw, Wallet, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

interface User { id: string; username: string; name: string; }

interface TxRow {
  id: string;
  transaction_no: string;
  amount: number;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

const QUICK_AMOUNTS = [10000, 30000, 50000, 100000, 300000, 500000, 1000000, 3000000, 5000000, 10000000, 30000000, 100000000];

function formatQuickAmount(a: number): string {
  if (a >= 100000000) return `${a / 100000000}억`;
  return `${a / 10000}만`;
}

const BANKS = [
  '국민은행', '신한은행', '우리은행', '하나은행', 'NH농협', 'IBK기업은행',
  '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일은행', '씨티은행', '대구은행',
  '부산은행', '경남은행', '광주은행', '전북은행', '제주은행', '우체국',
];

function statusInfo(s: string) {
  if (s === 'pending' || s === 'reviewing') return { label: '대기중', color: 'text-yellow-400', Icon: Clock };
  if (s === 'approved' || s === 'completed') return { label: '완료', color: 'text-green-400', Icon: CheckCircle };
  if (s === 'rejected' || s === 'cancelled') return { label: '거부', color: 'text-red-400', Icon: XCircle };
  return { label: s, color: 'text-slate-400', Icon: Clock };
}

export default function WithdrawPage({
  user,
  balance,
  onBalanceUpdate,
}: {
  user: User | null;
  balance: number;
  onBalanceUpdate: (b: number) => void;
}) {
  const [rawAmount, setRawAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const [bankAccount, setBankAccount] = useState('');
  const [accountHolder, setAccountHolder] = useState(user?.name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<TxRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (user) {
      loadHistory();
      loadSavedBank();
    }
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadSavedBank = async () => {
    if (!user) return;
    const { data } = await supabase.from('users').select('metadata').eq('id', user.id).single();
    const bank = data?.metadata?.bank_info;
    if (bank) {
      if (bank.bank_name) setBankName(bank.bank_name);
      if (bank.bank_account) setBankAccount(bank.bank_account);
      if (bank.account_holder) setAccountHolder(bank.account_holder);
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('transactions')
      .select('id, transaction_no, amount, bank_name, bank_account, account_holder, status, reject_reason, created_at')
      .eq('user_id', user.id)
      .eq('type', 'withdrawal')
      .order('created_at', { ascending: false })
      .limit(30);
    const rows = data ?? [];
    setHistory(rows);
    setHasPending(rows.some(r => r.status === 'pending' || r.status === 'reviewing'));
    setLoadingHistory(false);
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('로그인이 필요합니다.'); return; }
    const amt = parseInt(rawAmount || '0', 10);
    if (!amt || amt <= 0) { toast.error('금액을 입력하세요.'); return; }
    if (amt < 10000) { toast.error('최소 10,000원 이상 신청 가능합니다.'); return; }
    if (amt > balance) { toast.error('보유금이 부족합니다.'); return; }
    if (!bankName.trim()) { toast.error('은행을 선택하세요.'); return; }
    if (!bankAccount.trim()) { toast.error('계좌번호를 입력하세요.'); return; }
    if (!accountHolder.trim()) { toast.error('예금주를 입력하세요.'); return; }
    if (hasPending) { toast.error('대기 중인 출금 신청이 있습니다. 처리 후 재신청하세요.'); return; }

    setSubmitting(true);
    try {
      // 출금 신청 시 잔액 선차감 (관리자 승인 시 최종 확정)
      const newBalance = balance - amt;
      const { error: balErr } = await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', user.id);
      if (balErr) throw balErr;

      const txNo = `WIT${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const { error } = await supabase.from('transactions').insert({
        transaction_no: txNo,
        user_id: user.id,
        user_role: 'member',
        type: 'withdrawal',
        method: 'online',
        amount: amt,
        status: 'pending',
        bank_name: bankName.trim(),
        bank_account: bankAccount.trim().replace(/[^0-9-]/g, ''),
        account_holder: accountHolder.trim(),
      });
      if (error) {
        // 롤백
        await supabase.from('users').update({ balance }).eq('id', user.id);
        throw error;
      }

      // 은행정보 저장
      await supabase.from('users').update({
        metadata: { bank_info: { bank_name: bankName.trim(), bank_account: bankAccount.trim(), account_holder: accountHolder.trim() } },
      }).eq('id', user.id);

      onBalanceUpdate(newBalance);
      toast.success('출금 신청이 완료되었습니다. 처리 후 계좌로 입금됩니다.');
      setRawAmount('');
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
      <h2 className="text-2xl font-bold text-white mb-1">출금 신청</h2>
      <p className="text-slate-500 text-sm mb-6">출금 신청 후 관리자 처리 시 등록된 계좌로 입금됩니다.</p>

      {/* 보유금 표시 */}
      <div className="mb-6 bg-[#0d1a0d] border border-green-500/20 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Wallet size={18} className="text-green-400" />
          <span className="text-slate-400 text-sm">출금 가능 보유금</span>
        </div>
        <span className="text-green-400 font-bold text-xl">₩{balance.toLocaleString()}</span>
      </div>

      {/* 신청 폼 */}
      <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5 mb-8">
        {/* 금액 */}
        <div className="mb-5">
          <label className="text-slate-400 text-sm mb-2 block">출금 금액</label>
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
              <button key={a} onClick={() => setRawAmount(String((parseInt(rawAmount || '0', 10)) + a))}
                className="px-3 py-1.5 text-xs bg-[#1a1500] border border-[#c9a227]/20 text-[#c9a227] rounded-md hover:bg-[#2a2500] transition-colors font-semibold">
                +{formatQuickAmount(a)}
              </button>
            ))}
            <button onClick={() => setRawAmount(String(balance))}
              className="px-3 py-1.5 text-xs bg-green-900/30 border border-green-500/20 text-green-400 rounded-md hover:bg-green-900/50 transition-colors font-semibold">
              전액
            </button>
            <button onClick={() => setRawAmount('')}
              className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-md hover:bg-white/10 transition-colors">
              초기화
            </button>
          </div>
        </div>

        {/* 은행 선택 */}
        <div className="mb-4">
          <label className="text-slate-400 text-sm mb-2 block">은행 <span className="text-red-400">*</span></label>
          <div className="relative" ref={bankDropdownRef}>
            <button
              type="button"
              onClick={() => setBankDropdownOpen(o => !o)}
              className={`w-full bg-black/40 border rounded-lg px-4 py-3 text-left flex items-center justify-between transition-colors focus:outline-none ${bankName ? 'text-white border-[#c9a227]/60' : 'text-slate-500 border-[#c9a227]/20'} ${bankDropdownOpen ? 'border-[#c9a227]/60' : 'hover:border-[#c9a227]/40'}`}
            >
              <span className="text-sm">{bankName || '은행 선택'}</span>
              <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${bankDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {bankDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-[#c9a227]/30 rounded-lg overflow-hidden shadow-2xl">
                <div className="max-h-56 overflow-y-auto">
                  {BANKS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => { setBankName(b); setBankDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${bankName === b ? 'bg-[#c9a227]/20 text-[#c9a227]' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 계좌번호 */}
        <div className="mb-4">
          <label className="text-slate-400 text-sm mb-2 block">계좌번호 <span className="text-red-400">*</span></label>
          <input
            type="text"
            inputMode="numeric"
            value={bankAccount}
            onChange={e => setBankAccount(e.target.value.replace(/[^0-9-]/g, ''))}
            placeholder="계좌번호 입력 (숫자만)"
            className="w-full bg-black/40 border border-[#c9a227]/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#c9a227]/60 placeholder-slate-600"
          />
        </div>

        {/* 예금주 */}
        <div className="mb-5">
          <label className="text-slate-400 text-sm mb-2 block">예금주 <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={accountHolder}
            onChange={e => setAccountHolder(e.target.value)}
            placeholder="예금주명 입력"
            className="w-full bg-black/40 border border-[#c9a227]/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#c9a227]/60 placeholder-slate-600"
          />
        </div>

        {hasPending && (
          <div className="mb-4 flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-4 py-2.5 text-yellow-400 text-sm">
            <Clock size={14} />
            대기 중인 출금 신청이 있습니다.
          </div>
        )}

        <p className="text-xs text-slate-600 mb-4">
          * 출금 신청 시 해당 금액이 보유금에서 즉시 차감됩니다. 거부 시 보유금이 복구됩니다.
        </p>

        <button
          onClick={handleSubmit}
          disabled={submitting || !rawAmount || !bankName || !bankAccount.trim() || !accountHolder.trim() || hasPending}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#c9a227] to-[#a07820] text-black font-bold text-base hover:from-[#d4b030] hover:to-[#b08828] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#c9a227]/20"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : '출금 신청하기'}
        </button>
      </div>

      {/* 내역 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">출금 내역</h3>
        <button onClick={loadHistory} className="text-slate-500 hover:text-[#c9a227] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {loadingHistory ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="text-[#c9a227] animate-spin" /></div>
      ) : history.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm">출금 내역이 없습니다.</div>
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
                    {tx.bank_name} {tx.bank_account} ({tx.account_holder}) ·{' '}
                    {new Date(tx.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
