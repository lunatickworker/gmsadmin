import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Bell, Pin, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../utils/api';

interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  is_pinned: boolean;
  is_published: boolean;
  author_name: string;
  view_count: number;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  general: '일반',
  event: '이벤트',
  maintenance: '점검',
  update: '업데이트',
  important: '중요',
};

const TYPE_COLORS: Record<string, string> = {
  general: 'bg-slate-600',
  event: 'bg-green-600',
  maintenance: 'bg-red-600',
  update: 'bg-blue-600',
  important: 'bg-yellow-600',
};

export default function Notice() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'general', is_pinned: false, is_published: true });

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.getNotices();
      setNotices(res.data || []);
    } catch {
      toast.error('공지사항 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ title: '', content: '', type: 'general', is_pinned: false, is_published: true });

  const handleCreate = async () => {
    if (!form.title || !form.content) { toast.error('제목과 내용을 입력해주세요'); return; }
    try {
      await api.createNotice(form);
      toast.success('공지사항이 등록되었습니다');
      setIsCreating(false);
      resetForm();
      load();
    } catch { toast.error('등록 실패'); }
  };

  const handleUpdate = async () => {
    if (!form.title || !form.content || !editingId) return;
    try {
      await api.updateNotice(editingId, form);
      toast.success('공지사항이 수정되었습니다');
      setEditingId(null);
      resetForm();
      load();
    } catch { toast.error('수정 실패'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('공지사항을 삭제하시겠습니까?')) return;
    try {
      await api.deleteNotice(id);
      toast.success('삭제되었습니다');
      load();
    } catch { toast.error('삭제 실패'); }
  };

  const togglePublish = async (notice: NoticeItem) => {
    try {
      await api.updateNotice(notice.id, { is_published: !notice.is_published });
      toast.success(notice.is_published ? '비공개로 변경되었습니다' : '공개로 변경되었습니다');
      load();
    } catch { toast.error('변경 실패'); }
  };

  const togglePin = async (notice: NoticeItem) => {
    try {
      await api.updateNotice(notice.id, { is_pinned: !notice.is_pinned });
      load();
    } catch { toast.error('변경 실패'); }
  };

  const startEdit = (notice: NoticeItem) => {
    setEditingId(notice.id);
    setForm({ title: notice.title, content: notice.content, type: notice.type, is_pinned: notice.is_pinned, is_published: notice.is_published });
    setIsCreating(false);
  };

  const filtered = notices.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">공지사항</h2>
          <p className="text-slate-400">중요한 공지사항을 관리합니다</p>
        </div>
        <Button onClick={() => { setIsCreating(true); setEditingId(null); resetForm(); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> 공지 작성
        </Button>
      </div>

      {(isCreating || editingId) && (
        <Card className="bg-slate-800 border-slate-700 p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-4">{editingId ? '공지사항 수정' : '새 공지사항 작성'}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 mb-2 block">제목</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="공지사항 제목을 입력하세요" className="bg-slate-900 border-slate-600 text-white" />
              </div>
              <div>
                <Label className="text-slate-300 mb-2 block">유형</Label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300 mb-2 block">내용</Label>
              <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                placeholder="공지사항 내용을 입력하세요"
                className="w-full h-36 bg-slate-900 border border-slate-600 rounded-md p-3 text-white resize-none" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_pinned} onChange={e => setForm({ ...form, is_pinned: e.target.checked })} className="w-4 h-4" />
                <span className="text-slate-300">상단 고정</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} className="w-4 h-4" />
                <span className="text-slate-300">즉시 공개</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={editingId ? handleUpdate : handleCreate} className="bg-blue-600 hover:bg-blue-700">
                {editingId ? '수정 완료' : '등록'}
              </Button>
              <Button onClick={() => { setIsCreating(false); setEditingId(null); resetForm(); }} variant="outline" className="text-slate-300">취소</Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="bg-slate-800 border-slate-700 p-4 mb-6">
        <div className="flex gap-4">
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="공지사항 검색..." className="bg-slate-900 border-slate-600 text-white" />
          <Button className="bg-blue-600 hover:bg-blue-700">검색</Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center text-slate-400 py-12">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-12">공지사항이 없습니다</div>
      ) : (
        <div className="space-y-4">
          {filtered.map(notice => (
            <Card key={notice.id}
              className={`bg-slate-800 border-slate-700 p-6 transition-all hover:border-slate-600 ${notice.is_pinned ? 'border-yellow-500/50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {notice.is_pinned && <Pin className="w-5 h-5 text-yellow-500 cursor-pointer" onClick={() => togglePin(notice)} />}
                  <Bell className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white">{notice.title}</h3>
                      <Badge className={TYPE_COLORS[notice.type] || 'bg-slate-600'}>{TYPE_LABELS[notice.type] || notice.type}</Badge>
                      {notice.is_pinned && <Badge className="bg-yellow-600">고정</Badge>}
                      {!notice.is_published && <Badge className="bg-slate-500">비공개</Badge>}
                    </div>
                    <div className="flex gap-3 mt-1 text-sm text-slate-400">
                      <span>{notice.author_name}</span>
                      <span>•</span>
                      <span>{new Date(notice.created_at).toLocaleString('ko-KR')}</span>
                      <span>•</span>
                      <span>조회 {notice.view_count}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-slate-300" onClick={() => togglePublish(notice)} title={notice.is_published ? '비공개로 전환' : '공개로 전환'}>
                    {notice.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="outline" className="text-slate-300" onClick={() => startEdit(notice)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => handleDelete(notice.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{notice.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
