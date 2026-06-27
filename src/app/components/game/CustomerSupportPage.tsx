import { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { toast } from 'sonner';
import { MessageSquare, Plus, Clock, CheckCircle, MessageCircle, ChevronLeft, Send, X } from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
}

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

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:     { label: '답변대기', color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30', icon: <Clock size={12} /> },
  in_progress: { label: '처리중',   color: 'text-blue-400',   bg: 'bg-blue-500/15 border-blue-500/30',   icon: <MessageCircle size={12} /> },
  answered:    { label: '답변완료', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', icon: <CheckCircle size={12} /> },
  closed:      { label: '종료',     color: 'text-slate-400',  bg: 'bg-slate-500/15 border-slate-500/30',  icon: <X size={12} /> },
};

const CATEGORIES = ['입출금', '게임문의', '계정문의', '이벤트', '기타'];

interface Props {
  user: User | null;
}

export default function CustomerSupportPage({ user }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showForm, setShowForm] = useState(false);

  // New ticket form
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_support')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setTickets(data ?? []);
    } catch {
      toast.error('문의 내역을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return; }
    if (!content.trim()) { toast.error('내용을 입력해주세요'); return; }

    setSubmitting(true);
    try {
      const ticketNo = `TK${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const { error } = await supabase.from('customer_support').insert({
        ticket_no: ticketNo,
        user_id: user.id,
        username: user.username,
        category,
        title: title.trim(),
        content: content.trim(),
        status: 'pending',
      });
      if (error) throw error;
      toast.success('문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.');
      setTitle('');
      setContent('');
      setCategory(CATEGORIES[0]);
      setShowForm(false);
      loadTickets();
    } catch {
      toast.error('문의 접수에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (!user) {
    return (
      <div className="min-h-full bg-[#080808] flex items-center justify-center">
        <p className="text-slate-500">로그인이 필요합니다</p>
      </div>
    );
  }

  /* ── 티켓 상세 뷰 ── */
  if (selectedTicket) {
    const si = STATUS_INFO[selectedTicket.status] ?? STATUS_INFO.pending;
    return (
      <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8">
        <button
          onClick={() => setSelectedTicket(null)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-white text-sm mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          목록으로
        </button>

        <div className="max-w-2xl mx-auto space-y-4">
          {/* 티켓 헤더 */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-slate-600 font-mono">{selectedTicket.ticket_no}</span>
                  <span className="text-xs px-2 py-0.5 bg-[#1a1a1a] border border-white/10 rounded text-slate-400">
                    {selectedTicket.category}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 ${si.bg} ${si.color}`}>
                    {si.icon}{si.label}
                  </span>
                </div>
                <h3 className="text-white font-semibold text-lg">{selectedTicket.title}</h3>
              </div>
            </div>
            <p className="text-slate-500 text-xs">{formatDate(selectedTicket.created_at)}</p>
          </div>

          {/* 내용 */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-2">문의 내용</p>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{selectedTicket.content}</p>
          </div>

          {/* 답변 */}
          {selectedTicket.answer ? (
            <div className="bg-[#0a1a0a] border border-emerald-900/40 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-emerald-400" />
                <p className="text-emerald-400 text-xs font-medium">관리자 답변</p>
                {selectedTicket.answered_at && (
                  <p className="text-slate-600 text-xs ml-auto">{formatDate(selectedTicket.answered_at)}</p>
                )}
              </div>
              <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{selectedTicket.answer}</p>
            </div>
          ) : (
            <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-5 text-center">
              <Clock size={24} className="text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">답변 대기 중입니다</p>
              <p className="text-slate-600 text-xs mt-1">빠른 시일 내에 답변 드리겠습니다</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── 새 문의 작성 폼 ── */
  if (showForm) {
    return (
      <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8">
        <button
          onClick={() => setShowForm(false)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-white text-sm mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          목록으로
        </button>

        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-6">문의 작성</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 카테고리 */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">카테고리</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      category === cat
                        ? 'bg-[#c9a227]/20 border-[#c9a227]/50 text-[#c9a227]'
                        : 'bg-[#111] border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* 제목 */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">제목</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="문의 제목을 입력하세요"
                maxLength={100}
                className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227]/50"
              />
            </div>

            {/* 내용 */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">내용</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="문의 내용을 상세히 입력해 주세요"
                rows={8}
                className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227]/50 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-3 border border-white/10 text-slate-400 rounded-lg text-sm hover:border-white/20 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-[#c9a227] hover:bg-[#b8911f] text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {submitting ? '접수 중...' : '문의 접수'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ── 목록 뷰 ── */
  return (
    <div className="min-h-full bg-[#080808] px-4 sm:px-8 lg:px-16 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">고객센터</h2>
          <p className="text-slate-500 text-sm mt-1">1:1 문의 내역</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#c9a227] hover:bg-[#b8911f] text-black font-bold text-sm rounded-lg transition-colors"
        >
          <Plus size={15} />
          문의 작성
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">불러오는 중...</div>
      ) : tickets.length === 0 ? (
        <div className="py-24 text-center">
          <MessageSquare size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">문의 내역이 없습니다</p>
          <p className="text-slate-600 text-xs mt-1">궁금한 점이 있으시면 문의를 남겨주세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const si = STATUS_INFO[ticket.status] ?? STATUS_INFO.pending;
            return (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="w-full text-left bg-[#0d0d0d] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs text-slate-600 font-mono">{ticket.ticket_no}</span>
                      <span className="text-xs px-2 py-0.5 bg-[#1a1a1a] border border-white/10 rounded text-slate-400">
                        {ticket.category}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 ${si.bg} ${si.color}`}>
                        {si.icon}{si.label}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium truncate">{ticket.title}</p>
                    {ticket.answer && (
                      <p className="text-emerald-400/70 text-xs mt-1 truncate">
                        답변: {ticket.answer}
                      </p>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs whitespace-nowrap flex-shrink-0 mt-1">
                    {formatDate(ticket.created_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
