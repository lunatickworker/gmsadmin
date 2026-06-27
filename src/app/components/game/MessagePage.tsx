import { useState, useEffect } from 'react';
import { Mail, MailOpen, ArrowLeft, Inbox } from 'lucide-react';
import { api } from '../../../utils/api';

interface Message {
  id: string;
  title: string;
  content: string;
  sender_name: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

interface Props {
  userId: string;
  onUnreadCountChange?: (count: number) => void;
}

export default function MessagePage({ userId, onUnreadCountChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Message | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    try {
      const res = await api.getMessages(userId);
      const data: Message[] = res.data || [];
      setMessages(data);
      const unread = data.filter(m => !m.is_read).length;
      onUnreadCountChange?.(unread);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const openMessage = async (msg: Message) => {
    setSelected(msg);
    if (!msg.is_read) {
      try {
        await api.markMessageRead(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true, read_at: new Date().toISOString() } : m));
        onUnreadCountChange?.(messages.filter(m => !m.is_read && m.id !== msg.id).length);
      } catch { /* silent */ }
    }
  };

  const filtered = filter === 'unread' ? messages.filter(m => !m.is_read) : messages;
  const unreadCount = messages.filter(m => !m.is_read).length;

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}일 전`;
    return new Date(iso).toLocaleDateString('ko-KR');
  };

  if (selected) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 쪽지함으로 돌아가기
        </button>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-5 border-b border-slate-700">
            <h3 className="text-white font-bold text-lg mb-2">{selected.title}</h3>
            <div className="flex gap-4 text-sm text-slate-400">
              <span>보낸 사람: <span className="text-slate-300">{selected.sender_name}</span></span>
              <span>·</span>
              <span>{new Date(selected.created_at).toLocaleString('ko-KR')}</span>
            </div>
          </div>
          <div className="p-5">
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-400" /> 쪽지함
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {unreadCount}
            </span>
          )}
        </h2>
        <p className="text-slate-400 text-sm">관리자로부터 받은 쪽지를 확인하세요</p>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 mb-4 w-fit">
        {[
          { key: 'all', label: `전체 (${messages.length})` },
          { key: 'unread', label: `읽지 않음 (${unreadCount})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-16">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>{filter === 'unread' ? '읽지 않은 쪽지가 없습니다' : '받은 쪽지가 없습니다'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(msg => (
            <div key={msg.id} onClick={() => openMessage(msg)}
              className={`bg-slate-800 rounded-xl border p-4 cursor-pointer transition-all flex gap-3 items-start ${
                !msg.is_read
                  ? 'border-blue-500/40 hover:border-blue-500/60'
                  : 'border-slate-700 hover:border-slate-600'
              }`}>
              <div className={`mt-0.5 shrink-0 ${!msg.is_read ? 'text-blue-400' : 'text-slate-500'}`}>
                {msg.is_read ? <MailOpen className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <p className={`font-medium text-sm truncate ${!msg.is_read ? 'text-white' : 'text-slate-300'}`}>
                    {msg.title}
                  </p>
                  <span className="text-xs text-slate-500 shrink-0">{formatTime(msg.created_at)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-slate-500">{msg.sender_name}</span>
                  {!msg.is_read && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
