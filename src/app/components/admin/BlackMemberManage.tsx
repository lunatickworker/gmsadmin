import { useState, useEffect } from 'react';
import { Search, UserX, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = {
  system_admin: '시스템관리자',
  operator:     '운영사',
  head_office:  '본사',
  sub_office:   '부본사',
  distributor:  '총판',
  store:        '매장',
  member:       '회원',
};

export default function BlackMemberManage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const loadBlackMembers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('id, username, name, role, balance, points, block_reason, created_at, last_login_at, parent_id, parent:parent_id(username, name, role)', { count: 'exact' })
        .eq('status', 'blocked')
        .order('created_at', { ascending: false });

      if (user && user.level > 1 && user.hierarchyPath?.length) {
        query = query.contains('hierarchy_path', [user.id]);
      }

      const { data, error } = await query;
      if (error) {
        toast.error('블랙회원 조회 실패: ' + error.message);
      } else {
        setMembers(data ?? []);
      }
    } catch {
      toast.error('서버 연결 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBlackMembers(); }, []);

  const handleUnblock = async (id: string, username: string) => {
    setUnblocking(id);
    try {
      const { error } = await supabase.from('users').update({ status: 'active', block_reason: null }).eq('id', id);
      if (error) {
        toast.error('차단 해제 실패: ' + error.message);
      } else {
        setMembers((prev) => prev.filter((m) => m.id !== id));
        toast.success(`"${username}" 차단이 해제되어 회원 리스트로 복귀되었습니다.`);
      }
    } catch {
      toast.error('서버 오류');
    } finally {
      setUnblocking(null);
    }
  };

  const filtered = members.filter((m) => {
    const q = searchTerm.toLowerCase();
    return !q || m.username?.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <UserX className="text-red-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">블랙회원 관리</h2>
            <p className="text-sm text-slate-400">차단된 회원 목록 — 차단 해제 시 회원 리스트로 복귀됩니다</p>
          </div>
        </div>
        <button
          onClick={loadBlackMembers}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <AlertTriangle className="text-red-400" size={20} />
          </div>
          <div>
            <p className="text-sm text-slate-400">차단 중인 회원</p>
            <p className="text-2xl font-bold text-slate-100">{members.length}명</p>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <CheckCircle className="text-green-400" size={20} />
          </div>
          <div>
            <p className="text-sm text-slate-400">차단 해제 방법</p>
            <p className="text-sm text-slate-300">차단 해제 버튼 클릭 → 즉시 활성 복귀</p>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="회원 아이디, 닉네임 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-700 text-slate-200 placeholder:text-slate-400 pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">로딩 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/50">
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">아이디</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">닉네임</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">소속 파트너</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">차단 사유</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">보유금액</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">포인트</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">가입일</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">최근 접속</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-300">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                    <td className="px-6 py-4 text-sm text-slate-200 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-red-900/40 text-red-400 text-xs rounded border border-red-800/50">차단</span>
                        {member.username}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">{member.name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">
                      {member.parent ? (
                        <span>
                          <span className="text-slate-400 text-xs mr-1">[{ROLE_LABEL[member.parent.role] ?? member.parent.role}]</span>
                          {member.parent.username}{member.parent.name ? ` (${member.parent.name})` : ''}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {member.block_reason ? (
                        <span className="px-2 py-1 bg-red-900/30 text-red-300 text-xs rounded border border-red-800/40 max-w-[180px] inline-block truncate" title={member.block_reason}>
                          {member.block_reason}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-200">₩{Number(member.balance ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-200">{Number(member.points ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{member.created_at ? new Date(member.created_at).toLocaleDateString('ko-KR') : '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{member.last_login_at ? new Date(member.last_login_at).toLocaleDateString('ko-KR') : '-'}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleUnblock(member.id, member.username)}
                        disabled={unblocking === member.id}
                        className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs rounded border border-green-600/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {unblocking === member.id ? (
                          <span className="inline-block w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        차단 해제
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <UserX className="mx-auto text-slate-600 mb-3" size={40} />
                      <p className="text-slate-500">차단된 회원이 없습니다</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
