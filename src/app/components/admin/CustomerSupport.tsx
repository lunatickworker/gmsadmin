import { useState, useEffect } from 'react';
import { Badge } from '../ui/badge';
import { MessageSquare, Clock, CheckCircle, AlertCircle, RefreshCw, Send, X, Search } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  ticket_no: string;
  user_id: string;
  username: string;
  category: string;
  title: string;
  content: string;
  status: 'pending' | 'in_progress' | 'answered' | 'closed';
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PartnerNode {
  id: string;
  username: string;
  name: string | null;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  system_admin: '시스템관리자',
  operator:     '운영사',
  head_office:  '본사',
  sub_office:   '부본사',
  distributor:  '총판',
  store:        '매장',
  member:       '회원',
};

const ROLE_COLOR: Record<string, string> = {
  system_admin: 'bg-red-600/20 text-red-300 border-red-600/30',
  operator:     'bg-purple-600/20 text-purple-300 border-purple-600/30',
  head_office:  'bg-blue-600/20 text-blue-300 border-blue-600/30',
  sub_office:   'bg-cyan-600/20 text-cyan-300 border-cyan-600/30',
  distributor:  'bg-amber-600/20 text-amber-300 border-amber-600/30',
  store:        'bg-green-600/20 text-green-300 border-green-600/30',
  member:       'bg-slate-600/20 text-slate-300 border-slate-600/30',
};

const STATUS_CONFIG = {
  pending:     { label: '대기중',   badge: 'bg-yellow-600', icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: '처리중',   badge: 'bg-blue-600',   icon: <AlertCircle className="w-3 h-3" /> },
  answered:    { label: '답변완료', badge: 'bg-green-600',  icon: <CheckCircle className="w-3 h-3" /> },
  closed:      { label: '종료',     badge: 'bg-slate-600',  icon: <X className="w-3 h-3" /> },
} as const;

const CATEGORIES = ['전체', '입출금', '게임문의', '계정문의', '이벤트', '기타'];

export default function CustomerSupport() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [partnerChain, setPartnerChain] = useState<PartnerNode[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);

  const isOperator = user ? user.level <= 2 : false;

  const loadTickets = async () => {
    setLoading(true);
    try {
      let data: Ticket[] = [];

      if (isOperator) {
        // 운영사/시스템관리자: 전체 티켓 조회
        const { data: all, error } = await supabase
          .from('customer_support')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        data = all ?? [];
      } else if (user) {
        // 본사/부본사/총판/매장: 직속 하위 회원(parent_id = 본인)의 티켓만 노출
        const { data: directChildren } = await supabase
          .from('users')
          .select('id')
          .eq('parent_id', user.id);
        const childIds = (directChildren ?? []).map((c: any) => c.id);
        if (childIds.length > 0) {
          const { data: tickets, error } = await supabase
            .from('customer_support')
            .select('*')
            .in('user_id', childIds)
            .order('created_at', { ascending: false })
            .limit(200);
          if (error) throw error;
          data = tickets ?? [];
        }
      }

      setTickets(data);
    } catch {
      toast.error('문의 내역 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  const loadPartnerChain = async (userId: string) => {
    setPartnerChain([]);
    setPartnerLoading(true);
    try {
      // 직속 상위 파트너(parent)만 조회
      const { data: userData } = await supabase
        .from('users')
        .select('id, username, name, role, parent:parent_id(id, username, name, role)')
        .eq('id', userId)
        .single();

      if (!userData?.parent) return;

      const parent = userData.parent as PartnerNode;
      setPartnerChain([parent]);
    } catch {
      // 파트너 정보 로드 실패 시 무시
    } finally {
      setPartnerLoading(false);
    }
  };

  const handleSendReply = async (newStatus?: string) => {
    if (!selectedTicket) return;
    if (!reply.trim() && !newStatus) { toast.error('답변 내용을 입력해주세요'); return; }

    setSubmitting(true);
    try {
      const updateData: any = {};
      if (reply.trim()) {
        updateData.answer = reply.trim();
        updateData.answered_by = user?.id;
      }
      if (newStatus) updateData.status = newStatus;
      else if (reply.trim()) updateData.status = 'answered';

      if (updateData.answer) updateData.answered_at = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from('customer_support')
        .update(updateData)
        .eq('id', selectedTicket.id)
        .select()
        .single();
      if (error) { toast.error('처리 실패'); return; }

      toast.success(reply.trim() ? '답변이 전송되었습니다' : '상태가 변경되었습니다');
      setReply('');
      await loadTickets();
      setSelectedTicket(prev => prev ? { ...prev, ...updated } : null);
    } catch {
      toast.error('처리 중 오류가 발생했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter !== '전체' && t.category !== categoryFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!t.username.toLowerCase().includes(q) && !t.title.toLowerCase().includes(q) && !t.ticket_no.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    pending:     tickets.filter(t => t.status === 'pending').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    answered:    tickets.filter(t => t.status === 'answered').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
  };

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
    return (
      <Badge className={`${cfg.badge} flex items-center gap-1 text-xs`}>
        {cfg.icon}{cfg.label}
      </Badge>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">고객센터</h2>
          <p className="text-slate-400 text-sm">사용자 1:1 문의사항을 관리합니다</p>
        </div>
        <button
          onClick={loadTickets}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { key: 'pending',     label: '대기중',   color: 'from-yellow-900/40 border-yellow-500/30', icon: <Clock className="w-5 h-5 text-yellow-400" /> },
          { key: 'in_progress', label: '처리중',   color: 'from-blue-900/40 border-blue-500/30',    icon: <AlertCircle className="w-5 h-5 text-blue-400" /> },
          { key: 'answered',    label: '답변완료', color: 'from-green-900/40 border-green-500/30',  icon: <CheckCircle className="w-5 h-5 text-green-400" /> },
          { key: 'closed',      label: '종료',     color: 'from-slate-700/40 border-slate-500/30', icon: <X className="w-5 h-5 text-slate-400" /> },
        ].map(({ key, label, color, icon }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={`bg-gradient-to-br ${color} border p-4 rounded-xl text-left transition-all ${statusFilter === key ? 'ring-2 ring-white/20' : 'hover:brightness-110'}`}
          >
            <div className="flex items-center gap-2 mb-2">{icon}<p className="text-slate-400 text-sm">{label}</p></div>
            <p className="text-3xl font-bold text-white">{counts[key as keyof typeof counts]}</p>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-5">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="아이디, 제목, 티켓번호 검색..."
              className="w-full bg-slate-900 border border-slate-600 text-white pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all">전체 상태</option>
            <option value="pending">대기중</option>
            <option value="in_progress">처리중</option>
            <option value="answered">답변완료</option>
            <option value="closed">종료</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ colorScheme: 'dark' }}
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-5">
        {/* 티켓 목록 */}
        <div className="md:col-span-3 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">문의가 없습니다</p>
            </div>
          ) : filtered.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => { setSelectedTicket(ticket); setReply(''); loadPartnerChain(ticket.user_id); }}
              className={`bg-slate-800 border rounded-xl p-4 cursor-pointer transition-all hover:border-slate-500 ${
                selectedTicket?.id === ticket.id ? 'border-blue-500 bg-blue-500/5' : 'border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono">{ticket.ticket_no}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-purple-600/30 text-purple-300 rounded">{ticket.category}</span>
                    {getStatusBadge(ticket.status)}
                  </div>
                  <p className="font-medium text-white text-sm truncate">{ticket.title}</p>
                  <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
                    <span>{ticket.username}</span>
                    <span>•</span>
                    <span>{formatDate(ticket.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 상세 패널 */}
        <div className="md:col-span-2">
          {selectedTicket ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 sticky top-6 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-white">티켓 상세</h3>
                <button onClick={() => setSelectedTicket(null)} className="text-slate-500 hover:text-slate-300">
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 font-mono">{selectedTicket.ticket_no}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-purple-600/30 text-purple-300 rounded">{selectedTicket.category}</span>
                  {getStatusBadge(selectedTicket.status)}
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-0.5">작성자</p>
                  <p className="text-white font-medium">{selectedTicket.username}</p>
                </div>

                {/* 파트너 소속 */}
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">소속</p>
                  {partnerLoading ? (
                    <span className="text-xs text-slate-500">조회 중...</span>
                  ) : partnerChain.length === 0 ? (
                    <span className="text-xs text-slate-500">-</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-medium">
                        {partnerChain[0].name ? `${partnerChain[0].name} (${partnerChain[0].username})` : partnerChain[0].username}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_COLOR[partnerChain[0].role] ?? 'bg-slate-600/20 text-slate-300 border-slate-600/30'}`}>
                        {ROLE_LABEL[partnerChain[0].role] ?? partnerChain[0].role}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-0.5">제목</p>
                  <p className="text-white">{selectedTicket.title}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">접수일시</p>
                  <p className="text-slate-300">{formatDate(selectedTicket.created_at)}</p>
                </div>

                {/* 문의 내용 */}
                <div className="bg-slate-900/60 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1.5">문의 내용</p>
                  <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{selectedTicket.content}</p>
                </div>

                {/* 기존 답변 */}
                {selectedTicket.answer && (
                  <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-3">
                    <p className="text-xs text-emerald-400 mb-1.5">기존 답변 ({selectedTicket.answered_at ? formatDate(selectedTicket.answered_at) : ''})</p>
                    <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">{selectedTicket.answer}</p>
                  </div>
                )}

                {/* 답변 작성 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">답변 작성</p>
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="답변 내용을 입력하세요"
                    rows={5}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* 액션 버튼들 */}
                <div className="space-y-2">
                  <button
                    onClick={() => handleSendReply()}
                    disabled={submitting || !reply.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                  >
                    {submitting ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={13} />}
                    답변 전송
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSendReply('in_progress')}
                      disabled={submitting}
                      className="py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      처리중으로 변경
                    </button>
                    <button
                      onClick={() => handleSendReply('closed')}
                      disabled={submitting}
                      className="py-2 bg-slate-600/40 hover:bg-slate-600/60 border border-slate-500/40 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      티켓 종료
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
              <div className="text-center text-slate-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">티켓을 선택하세요</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
