import { useState, useEffect } from 'react';
import { Search, Coins, TrendingUp, TrendingDown, Plus, Minus, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { supabase } from '../../../utils/supabase/client';
import { toast } from 'sonner';

interface PointTransaction {
  id: string;
  transaction_no: string;
  user_id: string;
  username: string;
  name: string;
  type: 'earn' | 'grant' | 'deduct' | 'convert_to_money';
  amount: number;
  balance_before: number;
  balance_after: number;
  processed_by?: string;
  converted_money_amount?: number;
  reason?: string;
  memo?: string;
  created_at: string;
}

export default function PointManage() {
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'earn' | 'grant' | 'deduct' | 'convert_to_money'>('all');
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('points_history')
        .select(`
          id,
          transaction_no,
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          processed_by,
          converted_money_amount,
          reason,
          memo,
          created_at,
          users!points_history_user_id_fkey(username, name)
        `)
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped: PointTransaction[] = (data ?? []).map((row: any) => ({
        id: row.id,
        transaction_no: row.transaction_no,
        user_id: row.user_id,
        username: row.users?.username ?? row.user_id,
        name: row.users?.name ?? '',
        type: row.type,
        amount: row.amount,
        balance_before: row.balance_before,
        balance_after: row.balance_after,
        processed_by: row.processed_by,
        converted_money_amount: row.converted_money_amount,
        reason: row.reason,
        memo: row.memo,
        created_at: row.created_at,
      }));

      setTransactions(mapped);
    } catch (e: any) {
      toast.error('포인트 내역 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [startDate, endDate]);

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.transaction_no.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || txn.type === filterType;

    const txDate = new Date(txn.created_at);
    const matchesDate = txDate >= startOfDay(startDate) && txDate <= endOfDay(endDate);

    return matchesSearch && matchesType && matchesDate;
  });

  const formatNumber = (num: number) => {
    return num.toLocaleString('ko-KR');
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR');
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      earn: '적립',
      grant: '지급',
      deduct: '차감',
      convert_to_money: '머니전환',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      earn: 'bg-blue-500/20 text-blue-400',
      grant: 'bg-green-500/20 text-green-400',
      deduct: 'bg-red-500/20 text-red-400',
      convert_to_money: 'bg-purple-500/20 text-purple-400',
    };
    return colors[type] || 'bg-slate-500/20 text-slate-400';
  };

  const totalEarned = transactions.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.amount, 0);
  const totalGranted = transactions.filter((t) => t.type === 'grant').reduce((sum, t) => sum + t.amount, 0);
  const totalDeducted = transactions.filter((t) => t.type === 'deduct').reduce((sum, t) => sum + t.amount, 0);
  const totalConverted = transactions.filter((t) => t.type === 'convert_to_money').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <Coins className="text-yellow-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">포인트 관리</h2>
            <p className="text-sm text-slate-400">포인트 지급/차감 이력 관리</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGrantModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Plus size={16} />
            포인트 지급
          </button>
          <button
            onClick={() => setShowGrantModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <Minus size={16} />
            포인트 차감
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">총 적립</p>
              <p className="text-2xl font-bold text-slate-100">{formatNumber(totalEarned)}P</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Plus className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">총 지급</p>
              <p className="text-2xl font-bold text-slate-100">{formatNumber(totalGranted)}P</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Minus className="text-red-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">총 차감</p>
              <p className="text-2xl font-bold text-slate-100">{formatNumber(totalDeducted)}P</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <TrendingDown className="text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">총 전환</p>
              <p className="text-2xl font-bold text-slate-100">{formatNumber(totalConverted)}P</p>
            </div>
          </div>
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

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setFilterType('earn')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'earn'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            적립
          </button>
          <button
            onClick={() => setFilterType('grant')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'grant'
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            지급
          </button>
          <button
            onClick={() => setFilterType('deduct')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'deduct'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            차감
          </button>
          <button
            onClick={() => setFilterType('convert_to_money')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'convert_to_money'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            머니전환
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="회원명, 거래번호로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-sm border-b border-slate-700">
            <Loader2 size={16} className="animate-spin" />
            데이터 로딩 중...
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  거래번호
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  회원정보
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  유형
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  금액
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  이전 잔액
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  이후 잔액
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  처리자/사유
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  처리일시
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredTransactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-300">{txn.transaction_no}</td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-slate-100">{txn.username}</div>
                      <div className="text-sm text-slate-400">{txn.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(txn.type)}`}>
                      {getTypeLabel(txn.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-medium ${
                        txn.type === 'deduct' || txn.type === 'convert_to_money'
                          ? 'text-red-400'
                          : 'text-green-400'
                      }`}
                    >
                      {txn.type === 'deduct' || txn.type === 'convert_to_money' ? '-' : '+'}
                      {formatNumber(txn.amount)}P
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {formatNumber(txn.balance_before)}P
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {formatNumber(txn.balance_after)}P
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      {txn.processed_by && (
                        <div className="text-slate-300">{txn.processed_by}</div>
                      )}
                      {txn.reason && <div className="text-slate-400">{txn.reason}</div>}
                      {txn.memo && <div className="text-xs text-slate-500">{txn.memo}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{formatDate(txn.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <Coins className="mx-auto text-slate-600 mb-3" size={48} />
            <p className="text-slate-400">거래 내역이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
