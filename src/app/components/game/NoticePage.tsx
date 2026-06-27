import { useState, useEffect } from 'react';
import { Bell, Pin, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { api } from '../../../utils/api';

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  is_pinned: boolean;
  author_name: string;
  author_id: string | null;
  view_count: number;
  created_at: string;
  metadata?: { author_role?: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  general: '일반',
  event: '이벤트',
  maintenance: '점검',
  update: '업데이트',
  important: '중요',
};

const TYPE_COLORS: Record<string, string> = {
  general: 'bg-slate-600/80',
  event: 'bg-green-700/80',
  maintenance: 'bg-red-700/80',
  update: 'bg-blue-700/80',
  important: 'bg-yellow-600/80',
};

const OPERATOR_ROLES = ['system_admin', 'operator'];

interface Props {
  userId?: string;
  parentId?: string;
}

export default function NoticePage({ userId, parentId }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getNotices(true);
        const all: Notice[] = res.data || [];
        // 운영사/시스템관리자 공지 → 전체 노출
        // 그 외 어드민 공지 → 작성자가 회원의 직속 파트너인 경우만 노출
        const visible = all.filter(n => {
          const authorRole = n.metadata?.author_role;
          if (!authorRole || OPERATOR_ROLES.includes(authorRole)) return true;
          return parentId ? n.author_id === parentId : false;
        });
        setNotices(visible);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExpand = async (notice: Notice) => {
    if (expandedId === notice.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(notice.id);
    try { await api.incrementNoticeView(notice.id); } catch { /* silent */ }
  };

  const filtered = notices.filter(n => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || n.type === filter;
    return matchSearch && matchFilter;
  });

  const pinned = filtered.filter(n => n.is_pinned);
  const regular = filtered.filter(n => !n.is_pinned);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" /> 공지사항
        </h2>
        <p className="text-slate-400 text-sm">운영 공지 및 이벤트 소식을 확인하세요</p>
      </div>

      {/* 검색 & 필터 */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="공지사항 검색..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
          <option value="all">전체</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-16">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>공지사항이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 고정 공지 */}
          {pinned.map(notice => (
            <NoticeCard key={notice.id} notice={notice} expanded={expandedId === notice.id} onToggle={() => handleExpand(notice)} />
          ))}
          {/* 일반 공지 */}
          {regular.map(notice => (
            <NoticeCard key={notice.id} notice={notice} expanded={expandedId === notice.id} onToggle={() => handleExpand(notice)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeCard({ notice, expanded, onToggle }: { notice: Notice; expanded: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle}
      className={`bg-slate-800 rounded-xl border transition-all cursor-pointer ${
        notice.is_pinned ? 'border-yellow-500/40' : 'border-slate-700'
      } ${expanded ? 'border-blue-500/50' : 'hover:border-slate-600'}`}>
      <div className="flex items-center gap-3 p-4">
        {notice.is_pinned && <Pin className="w-4 h-4 text-yellow-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[notice.type] || 'bg-slate-600'}`}>
              {TYPE_LABELS[notice.type] || notice.type}
            </span>
            {notice.is_pinned && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600/80 font-medium">📌 고정</span>}
            <span className="text-white font-medium text-sm truncate">{notice.title}</span>
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <span>{notice.author_name}</span>
            <span>·</span>
            <span>{new Date(notice.created_at).toLocaleDateString('ko-KR')}</span>
            <span>·</span>
            <span>조회 {notice.view_count}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700 pt-4">
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{notice.content}</p>
        </div>
      )}
    </div>
  );
}
