import { useState, useEffect } from 'react';
import { Search, RefreshCw, Shield, Monitor, Clock } from 'lucide-react';

interface OnlineAdmin {
  id: string;
  username: string;
  name: string;
  role: string;
  ip_address: string;
  device_info: {
    browser?: string;
    os?: string;
  };
  login_at: string;
  last_activity_at: string;
  current_page?: string;
}

export default function OnlineAdmins() {
  const [admins, setAdmins] = useState<OnlineAdmin[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchOnlineAdmins = async () => {
    setIsLoading(true);
    // TODO: Supabase API 연동
    setTimeout(() => {
      const mockData: OnlineAdmin[] = [
        {
          id: '1',
          username: 'admin',
          name: '시스템관리자',
          role: 'system_admin',
          ip_address: '192.168.1.100',
          device_info: { browser: 'Chrome', os: 'Windows' },
          login_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          last_activity_at: new Date(Date.now() - 1000 * 30).toISOString(),
          current_page: '대시보드',
        },
        {
          id: '2',
          username: 'operator01',
          name: '운영사 관리자',
          role: 'operator',
          ip_address: '192.168.1.101',
          device_info: { browser: 'Firefox', os: 'Linux' },
          login_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          last_activity_at: new Date(Date.now() - 1000 * 60).toISOString(),
          current_page: '입출금 관리',
        },
      ];
      setAdmins(mockData);
      setIsLoading(false);
    }, 500);
  };

  useEffect(() => {
    fetchOnlineAdmins();
  }, []);

  const filteredAdmins = admins.filter(
    (admin) =>
      admin.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      admin.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR');
  };

  const getTimeDiff = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    return `${hours}시간 전`;
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      system_admin: '시스템관리자',
      operator: '운영사',
      head_office: '본사',
      sub_office: '부본사',
      distributor: '총판',
      store: '매장',
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      system_admin: 'bg-red-500/20 text-red-400',
      operator: 'bg-purple-500/20 text-purple-400',
      head_office: 'bg-blue-500/20 text-blue-400',
      sub_office: 'bg-cyan-500/20 text-cyan-400',
      distributor: 'bg-green-500/20 text-green-400',
      store: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[role] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Shield className="text-purple-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">관리자 접속 현황</h2>
            <p className="text-sm text-slate-400">현재 접속 중인 관리자 목록</p>
          </div>
        </div>
        <button
          onClick={fetchOnlineAdmins}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Shield className="text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">전체 관리자</p>
              <p className="text-2xl font-bold text-slate-100">{admins.length}명</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Monitor className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">활성 세션</p>
              <p className="text-2xl font-bold text-slate-100">
                {admins.filter((a) => Date.now() - new Date(a.last_activity_at).getTime() < 5 * 60 * 1000).length}명
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Clock className="text-yellow-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">유휴 관리자</p>
              <p className="text-2xl font-bold text-slate-100">
                {admins.filter((a) => Date.now() - new Date(a.last_activity_at).getTime() >= 5 * 60 * 1000).length}명
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="관리자명 또는 이름으로 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  관리자
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  권한
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  IP 주소
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  디바이스
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  현재 페이지
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  로그인 시간
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  마지막 활동
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredAdmins.map((admin) => {
                const isActive = Date.now() - new Date(admin.last_activity_at).getTime() < 5 * 60 * 1000;
                return (
                  <tr key={admin.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-100">{admin.username}</div>
                        <div className="text-sm text-slate-400">{admin.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${getRoleColor(admin.role)}`}>
                        {getRoleLabel(admin.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{admin.ip_address}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {admin.device_info.browser} / {admin.device_info.os}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{admin.current_page || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatTime(admin.login_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{getTimeDiff(admin.last_activity_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        {isActive ? '활성' : '유휴'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredAdmins.length === 0 && (
          <div className="text-center py-12">
            <Shield className="mx-auto text-slate-600 mb-3" size={48} />
            <p className="text-slate-400">접속 중인 관리자가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
