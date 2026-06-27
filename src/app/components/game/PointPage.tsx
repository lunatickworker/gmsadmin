import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ArrowRightLeft, Star, TrendingUp, Gift, Minus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

interface User { id: string; username: string; name: string; }

interface PointRow {
  id: string;
  transaction_no: string;
  type: 'earn' | 'grant' | 'deduct' | 'convert_to_money';
  amount: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  converted_money_amount: number | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, { label: string; color: string; Icon: any }> = {
  earn:             { label: '적립',    color: 'text-blue-400',   Icon: TrendingUp },
  grant:            { label: '지급',    color: 'text-green-400',  Icon: Gift },
  deduct:           { label: '차감',    color: 'text-red-400',    Icon: Minus },
  convert_to_money: { label: '전환',    color: 'text-[#c9a227]',  Icon: ArrowRightLeft },
};

export default function PointPage({
  user,
  points,
  onPointsUpdate,
  onBalanceUpdate,
}: {
  user: User | null;
  points: number;
  onPointsUpdate: (p: number) => void;
  onBalanceUpdate: (b: number) => void;
}) {
  const [history, setHistory] = useState<PointRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('points_history')
      .select('id, transaction_no, type, amount, balance_before, balance_after, reason, converted_money_amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory(data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleConvert = async () => {
    if (!user) return;
    if (points <= 0) { toast.error('전환할 포인트가 없습니다.'); return; }
    if (!confirm(`보유 포인트 ${points.toLocaleString()}P 전체를 보유금으로 전환하시겠습니까?`)) return;

    setConverting(true);
    try {
      // 현재 잔액/포인트 재조회 (동시 요청 방어)
      const { data: userRow } = await supabase
        .from('users')
        .select('balance, points')
        .eq('id', user.id)
        .single();
      if (!userRow) throw new Error('사용자 정보를 불러올 수 없습니다.');
      const currentPoints = Number(userRow.points);
      if (currentPoints <= 0) { toast.error('전환할 포인트가 없습니다.'); return; }

      const newBalance = Number(userRow.balance) + currentPoints;
      const txNo = `PNT${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      // points_history 기록
      const { error: histErr } = await supabase.from('points_history').insert({
        transaction_no: txNo,
        user_id: user.id,
        type: 'convert_to_money',
        amount: currentPoints,
        balance_before: currentPoints,
        balance_after: 0,
        processed_by: user.id,
        converted_money_amount: currentPoints,
        reason: '사용자 보유금 전환',
      });
      if (histErr) throw histErr;

      // 유저 포인트 차감 + 잔액 증가
      const { error: updateErr } = await supabase
        .from('users')
        .update({ points: 0, balance: newBalance })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      onPointsUpdate(0);
      onBalanceUpdate(newBalance);
      toast.success(`${currentPoints.toLocaleString()}P가 보유금으로 전환되었습니다.`);
      await loadHistory();
    } catch (e: any) {
      toast.error('전환 실패: ' + e.message);
    } finally {
      setConverting(false);
    }
  };

  const filtered = typeFilter === 'all' ? history : history.filter(r => r.type === typeFilter);

  const totalGranted = history.filter(r => r.type === 'grant').reduce((s, r) => s + Number(r.amount), 0);
  const totalConverted = history.filter(r => r.type === 'convert_to_money').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-6">포인트</h2>

      {/* 포인트 현황 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-slate-500 text-xs mb-1">보유 포인트</p>
          <p className="text-[#c9a227] font-black text-2xl">{points.toLocaleString()}<span className="text-sm ml-1">P</span></p>
        </div>
        <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-slate-500 text-xs mb-1">누적 지급</p>
          <p className="text-green-400 font-bold text-xl">{totalGranted.toLocaleString()}<span className="text-sm ml-1">P</span></p>
        </div>
        <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-slate-500 text-xs mb-1">누적 전환</p>
          <p className="text-blue-400 font-bold text-xl">{totalConverted.toLocaleString()}<span className="text-sm ml-1">P</span></p>
        </div>
      </div>

      {/* 전환 버튼 */}
      <div className="mb-8 bg-gradient-to-r from-[#1a1500] to-[#0d0a00] border border-[#c9a227]/30 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-white font-bold text-base mb-1">포인트 → 보유금 전환</p>
          <p className="text-slate-500 text-sm">보유 포인트 전체를 보유금으로 즉시 전환합니다. (1P = ₩1)</p>
        </div>
        <button
          onClick={handleConvert}
          disabled={converting || points <= 0}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#c9a227] to-[#a07820] text-black font-bold text-sm hover:from-[#d4b030] hover:to-[#b08828] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#c9a227]/20"
        >
          {converting ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
          전환하기
        </button>
      </div>

      {/* 내역 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'grant', 'earn', 'deduct', 'convert_to_money'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-xs rounded-full transition-colors font-semibold ${
                typeFilter === t
                  ? 'bg-[#c9a227] text-black'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {t === 'all' ? '전체' : TYPE_LABEL[t]?.label ?? t}
            </button>
          ))}
        </div>
        <button onClick={loadHistory} className="text-slate-500 hover:text-[#c9a227] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="text-[#c9a227] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-600 text-sm">포인트 내역이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const info = TYPE_LABEL[row.type] ?? { label: row.type, color: 'text-slate-400', Icon: Star };
            const Icon = info.Icon;
            const isPositive = row.type === 'earn' || row.type === 'grant';
            const isNegative = row.type === 'deduct' || row.type === 'convert_to_money';
            return (
              <div key={row.id} className="bg-[#0d0d0d] border border-white/5 rounded-lg px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/5 ${info.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm">{info.label}
                      {row.reason && <span className="text-slate-500 font-normal ml-1.5 text-xs">{row.reason}</span>}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {row.balance_before.toLocaleString()}P → {row.balance_after.toLocaleString()}P ·{' '}
                      {new Date(row.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 font-bold text-base ${isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-300'}`}>
                  {isPositive ? '+' : '-'}{Number(row.amount).toLocaleString()}P
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
