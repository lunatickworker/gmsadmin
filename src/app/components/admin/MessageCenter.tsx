import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Send, Users, User, Search, Check, CheckCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../utils/api';

interface SentMessage {
  id: string;
  title: string;
  content: string;
  sender_name: string;
  recipient_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  users?: { username: string; name: string };
}

interface UserOption {
  id: string;
  username: string;
  name: string;
}

interface Stats {
  today: number;
  week: number;
  month: number;
}

export default function MessageCenter() {
  const [messageType, setMessageType] = useState<'all' | 'individual'>('all');
  const [form, setForm] = useState({ title: '', content: '' });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [stats, setStats] = useState<Stats>({ today: 0, week: 0, month: 0 });
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');

  const loadData = async () => {
    try {
      const [sentRes, statsRes] = await Promise.all([
        api.getSentMessages(),
        api.getMessageStats(),
      ]);
      setSentMessages(sentRes.data || []);
      setStats(statsRes.data || { today: 0, week: 0, month: 0 });
    } catch {
      // silent
    }
  };

  useEffect(() => { loadData(); }, []);

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 1) { setUserResults([]); return; }
    try {
      const res = await api.getUsers({ role: 'member' });
      const users: UserOption[] = (res.data || []).filter((u: any) =>
        u.username.toLowerCase().includes(q.toLowerCase()) ||
        u.name?.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 8);
      setUserResults(users);
    } catch { setUserResults([]); }
  };

  const selectUser = (u: UserOption) => {
    setSelectedUser(u);
    setUserSearch(u.username);
    setUserResults([]);
  };

  const handleSend = async () => {
    if (!form.title || !form.content) { toast.error('제목과 내용을 입력해주세요'); return; }
    if (messageType === 'individual' && !selectedUser) { toast.error('대상 사용자를 선택해주세요'); return; }
    try {
      setSending(true);
      const payload = {
        title: form.title,
        content: form.content,
        sender_name: '관리자',
        recipient_id: messageType === 'individual' ? selectedUser!.id : undefined,
      };
      const res = await api.sendMessage(payload);
      toast.success(messageType === 'all' ? `전체 발송 완료 (${res.count}명)` : '메시지가 발송되었습니다');
      setForm({ title: '', content: '' });
      setSelectedUser(null);
      setUserSearch('');
      loadData();
    } catch { toast.error('발송 실패'); }
    finally { setSending(false); }
  };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return new Date(iso).toLocaleDateString('ko-KR');
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">메시지 센터</h2>
        <p className="text-slate-400">사용자에게 메시지를 발송합니다</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="flex gap-2 mb-4">
            <Button onClick={() => setActiveTab('send')}
              className={activeTab === 'send' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}>
              메시지 발송
            </Button>
            <Button onClick={() => setActiveTab('history')}
              className={activeTab === 'history' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}>
              발송 내역
            </Button>
          </div>

          {activeTab === 'send' ? (
            <Card className="bg-slate-800 border-slate-700 p-6">
              <div className="space-y-6">
                <div>
                  <Label className="text-slate-300 mb-3 block">발송 대상</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {(['all', 'individual'] as const).map(type => (
                      <Card key={type} onClick={() => { setMessageType(type); setSelectedUser(null); setUserSearch(''); setUserResults([]); }}
                        className={`p-4 cursor-pointer transition-all ${messageType === type ? 'bg-blue-600 border-blue-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${messageType === type ? 'bg-blue-500' : 'bg-slate-800'}`}>
                            {type === 'all' ? <Users className="w-6 h-6 text-white" /> : <User className="w-6 h-6 text-white" />}
                          </div>
                          <div>
                            <p className="font-bold text-white">{type === 'all' ? '전체 발송' : '개별 발송'}</p>
                            <p className="text-xs text-slate-400">{type === 'all' ? '모든 사용자에게' : '특정 사용자에게'}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {messageType === 'individual' && (
                  <div>
                    <Label className="text-slate-300 mb-2 block">대상 사용자 검색</Label>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input value={userSearch} onChange={e => searchUsers(e.target.value)}
                          placeholder="아이디 또는 이름으로 검색"
                          className="bg-slate-900 border-slate-600 text-white pl-9" />
                        {selectedUser && (
                          <button onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {userResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {userResults.map(u => (
                            <button key={u.id} onClick={() => selectUser(u)}
                              className="w-full px-4 py-2 text-left hover:bg-slate-800 flex justify-between items-center">
                              <span className="text-white font-medium">{u.username}</span>
                              <span className="text-slate-400 text-sm">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedUser && (
                      <div className="mt-2 px-3 py-2 bg-blue-600/20 border border-blue-500/30 rounded text-blue-300 text-sm">
                        선택됨: {selectedUser.username} ({selectedUser.name})
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-slate-300 mb-2 block">메시지 제목</Label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="메시지 제목을 입력하세요" className="bg-slate-900 border-slate-600 text-white" />
                </div>

                <div>
                  <Label className="text-slate-300 mb-2 block">메시지 내용</Label>
                  <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                    placeholder="메시지 내용을 입력하세요" maxLength={1000}
                    className="w-full h-48 bg-slate-900 border border-slate-600 rounded-md p-3 text-white resize-none" />
                  <p className="text-xs text-slate-500 mt-1">{form.content.length} / 1000자</p>
                </div>

                <Button onClick={handleSend} disabled={sending} className="w-full bg-blue-600 hover:bg-blue-700 h-12">
                  <Send className="w-4 h-4 mr-2" />
                  {sending ? '발송 중...' : '메시지 발송'}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="text-lg font-bold text-white mb-4">발송 내역</h3>
              {sentMessages.length === 0 ? (
                <div className="text-center text-slate-400 py-8">발송 내역이 없습니다</div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {sentMessages.map(msg => (
                    <div key={msg.id} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-medium">{msg.title}</p>
                          <p className="text-slate-400 text-xs mt-0.5">
                            수신: {msg.users?.username || '전체 발송'} · {formatTime(msg.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={msg.is_read ? 'bg-green-700' : 'bg-slate-600'}>
                            {msg.is_read ? (
                              <><CheckCheck className="w-3 h-3 mr-1" />읽음</>
                            ) : (
                              <><Check className="w-3 h-3 mr-1" />미읽음</>
                            )}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm line-clamp-2">{msg.content}</p>
                      {msg.is_read && msg.read_at && (
                        <p className="text-xs text-green-400 mt-1">
                          {new Date(msg.read_at).toLocaleString('ko-KR')} 확인
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-slate-800 border-slate-700 p-6">
            <h3 className="text-lg font-bold text-white mb-4">발송 통계</h3>
            <div className="space-y-3">
              {[
                { label: '오늘 발송', value: stats.today },
                { label: '이번 주', value: stats.week },
                { label: '이번 달', value: stats.month },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-white font-bold">{value.toLocaleString()}건</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-slate-800 border-slate-700 p-6">
            <h3 className="text-lg font-bold text-white mb-4">메시지 템플릿</h3>
            <div className="space-y-2">
              {[
                { label: '출금 완료', title: '출금 완료 안내', content: '회원님의 출금 신청이 처리되어 출금이 완료되었습니다. 감사합니다.' },
                { label: '입금 확인', title: '입금 확인 안내', content: '회원님의 입금이 확인되었습니다. 충전이 완료되었습니다.' },
                { label: '이벤트 안내', title: '특별 이벤트 안내', content: '특별 이벤트가 진행 중입니다. 지금 참여하시면 다양한 혜택을 받으실 수 있습니다.' },
                { label: '점검 안내', title: '서비스 점검 안내', content: '시스템 점검으로 인해 일시적으로 서비스가 중단될 예정입니다. 이용에 불편을 드려 죄송합니다.' },
              ].map((tpl) => (
                <Button key={tpl.label} variant="outline"
                  className="w-full text-left text-slate-300 justify-start text-sm"
                  onClick={() => setForm({ title: tpl.title, content: tpl.content })}>
                  {tpl.label}
                </Button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
