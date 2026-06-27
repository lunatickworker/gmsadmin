import { useState, useEffect, useCallback } from 'react';
import { Search, FileText, AlertCircle, LogIn, LogOut, Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../../../../utils/supabase/client';

interface AccessLog {
  id: string;
  user_id?: string;
  username?: string;
  name?: string;
  log_type: 'login' | 'logout' | 'action' | 'error' | 'security';
  action?: string;
  description?: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export default function AccessLogs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'login' | 'logout' | 'action' | 'error' | 'security'>('all');

  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select(`
          id,
          user_id,
          log_type,
          action,
          description,
          ip_address,
          user_agent,
          success,
          error_message,
          created_at,
          users (username, name)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const mapped: AccessLog[] = (data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        username: row.users?.username,
        name: row.users?.name,
        log_type: row.log_type,
        action: row.action,
        description: row.description,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        success: row.success,
        error_message: row.error_message,
        created_at: row.created_at,
      }));
      setLogs(mapped);
    } catch (err) {
      console.error('access_logs fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || log.log_type === filterType;

    return matchesSearch && matchesType;
  });

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('ko-KR');
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, any> = {
      login: LogIn,
      logout: LogOut,
      action: Activity,
      error: AlertCircle,
      security: AlertCircle,
    };
    return icons[type] || FileText;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      login: '로그인',
      logout: '로그아웃',
      action: '작업',
      error: '오류',
      security: '보안',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      login: 'bg-green-500/20 text-green-400',
      logout: 'bg-slate-500/20 text-slate-400',
      action: 'bg-blue-500/20 text-blue-400',
      error: 'bg-red-500/20 text-red-400',
      security: 'bg-orange-500/20 text-orange-400',
    };
    return colors[type] || 'bg-slate-500/20 text-slate-400';
  };

  const totalLogs = logs.length;
  const errorCount = logs.filter((l) => l.log_type === 'error' || l.log_type === 'security').length;
  const loginCount = logs.filter((l) => l.log_type === 'login').length;

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-500/10 rounded-lg">
            <FileText className="text-slate-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">접속 및 사용 기록</h2>
            <p className="text-sm text-slate-400">시스템 접속 및 작업 이력 조회</p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-600/20 rounded-lg">
              <FileText className="text-slate-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">전체 로그</p>
              <p className="text-2xl font-bold text-slate-100">{totalLogs}건</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <LogIn className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">로그인</p>
              <p className="text-2xl font-bold text-slate-100">{loginCount}건</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertCircle className="text-red-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">오류/보안</p>
              <p className="text-2xl font-bold text-slate-100">{errorCount}건</p>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'all'
                ? 'bg-slate-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setFilterType('login')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'login'
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            로그인
          </button>
          <button
            onClick={() => setFilterType('logout')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'logout'
                ? 'bg-slate-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            로그아웃
          </button>
          <button
            onClick={() => setFilterType('action')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'action'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            작업
          </button>
          <button
            onClick={() => setFilterType('error')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            오류
          </button>
          <button
            onClick={() => setFilterType('security')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'security'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            보안
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="사용자명, 작업명으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  시간
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  사용자
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  유형
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  작업
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  설명
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  IP 주소
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  결과
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredLogs.map((log) => {
                const Icon = getTypeIcon(log.log_type);
                return (
                  <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3">
                      {log.username ? (
                        <div>
                          <div className="font-medium text-slate-100">{log.username}</div>
                          {log.name && <div className="text-sm text-slate-400">{log.name}</div>}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${getTypeColor(log.log_type)}`}>
                        <Icon size={12} />
                        {getTypeLabel(log.log_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{log.action || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs">
                        <p className="text-sm text-slate-300">{log.description}</p>
                        {log.error_message && (
                          <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{log.ip_address || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          log.success
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {log.success ? '성공' : '실패'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto text-slate-600 mb-3" size={48} />
            <p className="text-slate-400">기록이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
