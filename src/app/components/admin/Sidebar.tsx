import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Network,
  DollarSign,
  Receipt,
  Calculator,
  MessageSquare,
  Gamepad2,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase/client';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  path?: string;
  children?: MenuItem[];
  // 이 레벨 이하(숫자 작을수록 상위)만 볼 수 있는 메뉴. 미설정 시 전체 허용
  maxLevel?: number;
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    icon: LayoutDashboard,
    path: '/admin',
  },
  {
    id: 'online',
    label: '온라인현황',
    icon: UserCheck,
    children: [
      { id: 'online-users', label: '온라인 접속현황', icon: Users, path: '/admin/online/users' },
      { id: 'online-admins', label: '관리자 접속현황', icon: Users, path: '/admin/online/admins', maxLevel: 4 },
    ],
  },
  {
    id: 'members',
    label: '회원관리',
    icon: Users,
    // 모든 레벨이 접근 가능 (본인 회원과 하위 회원만 관리)
    children: [
      { id: 'member-list', label: '회원리스트', icon: Users, path: '/admin/members/list' },
      { id: 'member-black', label: '블랙회원관리', icon: Users, path: '/admin/members/black' },
    ],
  },
  {
    id: 'partners',
    label: '파트너 관리',
    icon: Network,
    // 매장(6)은 파트너 관리 불필요 (하위 조직 없음)
    maxLevel: 5,
    children: [
      { id: 'partner-hierarchy', label: '파트너 계층관리', icon: Network, path: '/admin/partners/hierarchy', maxLevel: 5 },
    ],
  },
  {
    id: 'transactions',
    label: '입출금관리',
    icon: DollarSign,
    children: [
      { id: 'transaction-manage', label: '입출금관리', icon: DollarSign, path: '/admin/transactions/manage' },
      { id: 'point-manage', label: '포인트 관리', icon: DollarSign, path: '/admin/transactions/points' },
    ],
  },
  {
    id: 'betting',
    label: '베팅내역',
    icon: Receipt,
    path: '/admin/betting',
  },
  {
    id: 'settlement',
    label: '정산관리',
    icon: Calculator,
    children: [
      { id: 'daily-settlement', label: '일일 정산', icon: Calculator, path: '/admin/settlement/daily' },
      { id: 'total-settlement', label: '통합정산', icon: Calculator, path: '/admin/settlement/total' },
    ],
  },
  {
    id: 'customer',
    label: '고객관리',
    icon: MessageSquare,
    children: [
      { id: 'notice', label: '공지사항', icon: MessageSquare, path: '/admin/customer/notice' },
      { id: 'support', label: '고객센터', icon: MessageSquare, path: '/admin/customer/support' },
      { id: 'message', label: '메시지 센터', icon: MessageSquare, path: '/admin/customer/message' },
      { id: 'banner', label: '배너관리', icon: MessageSquare, path: '/admin/customer/banner', maxLevel: 3 },
    ],
  },
  {
    id: 'game',
    label: '게임설정',
    icon: Gamepad2,
    maxLevel: 2,
    children: [
      { id: 'game-vendor', label: '게임사 API 등록', icon: Settings, path: '/admin/game/vendor', maxLevel: 1 },
      { id: 'game-provider', label: '게임 제공사 관리', icon: Gamepad2, path: '/admin/game/provider', maxLevel: 1 },
      { id: 'game-list', label: '게임 목록 관리', icon: Gamepad2, path: '/admin/game/list', maxLevel: 2 },
    ],
  },
  {
    id: 'system',
    label: '시스템 설정',
    icon: Settings,
    maxLevel: 1,
    children: [
      { id: 'access-log', label: '접속 및 사용 기록', icon: Settings, path: '/admin/system/logs', maxLevel: 1 },
      { id: 'money-logs', label: '머니 로그 관리', icon: DollarSign, path: '/admin/system/money-logs', maxLevel: 1 },
      { id: 'menu-manage', label: '메뉴관리', icon: Settings, path: '/admin/system/menu', maxLevel: 1 },
      { id: 'settings', label: '설정', icon: Settings, path: '/admin/system/settings', maxLevel: 1 },
    ],
  },
];

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const [expandedItems, setExpandedItems] = useState<string[]>(['dashboard']);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const myLevel = user?.level ?? 1;

  useEffect(() => {
    const fetchCounts = async () => {
      const [txResult, msgResult] = await Promise.all([
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('is_read', false),
      ]);
      setPendingCount(txResult.count ?? 0);
      setUnreadMessageCount(msgResult.count ?? 0);
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // maxLevel이 설정되어 있으면 내 레벨이 그 이하여야 접근 가능
  const isVisible = (item: MenuItem): boolean => {
    if (item.maxLevel === undefined) return true;
    return myLevel <= item.maxLevel;
  };

  // 자식 중에 보이는 항목이 하나라도 있으면 부모도 표시
  const hasVisibleChildren = (item: MenuItem): boolean => {
    if (!item.children) return false;
    return item.children.some((child) => isVisible(child));
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    // 부모 메뉴 자체가 보이지 않으면 렌더링 안 함
    if (!isVisible(item) && !hasVisibleChildren(item)) return null;

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);
    const isActive = item.path === currentPath;
    const Icon = item.icon;

    // 자식이 있을 경우, 접근 가능한 자식만 필터링
    const visibleChildren = item.children?.filter((c) => isVisible(c)) ?? [];

    // 자식이 있는데 보이는 자식이 없으면 숨김
    if (hasChildren && visibleChildren.length === 0) return null;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id);
            } else if (item.path) {
              onNavigate(item.path);
            }
          }}
          className={`
            w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
            ${level > 0 ? 'pl-11' : ''}
            ${isActive
              ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
              : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
            }
          `}
        >
          <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
          <span className="flex-1 text-left">{item.label}</span>
          {(item.id === 'transactions' || item.id === 'transaction-manage') && pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
          {item.id === 'message' && unreadMessageCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-teal-500 text-white rounded-full leading-none">
              {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
            </span>
          )}
          {hasChildren && (
            isExpanded
              ? <ChevronDown size={14} className="text-slate-500" />
              : <ChevronRight size={14} className="text-slate-500" />
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="bg-slate-900/30">
            {visibleChildren.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 h-screen border-r border-slate-700 flex flex-col" style={{ backgroundColor: '#0f0f0f' }}>
      <div className="px-1 py-(-1) border-b border-slate-700/60 flex items-center justify-center">
        <img
          src="https://iqkgwsdgxmxxvpydrlrm.supabase.co/storage/v1/object/public/casino/images/gms_logo_v1.png"
          alt="GMS Logo"
          className="h-25 w-auto object-contain"
        />
      </div>

      {/* 현재 로그인 계정 조직 정보 */}
      {user && (
        <div className="px-4 py-3 border-b border-slate-700/40 bg-slate-900/30">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${
              user.level === 1 ? 'bg-purple-600/30 text-purple-300' :
              user.level === 2 ? 'bg-blue-600/30 text-blue-300' :
              user.level === 3 ? 'bg-cyan-600/30 text-cyan-300' :
              user.level === 4 ? 'bg-green-600/30 text-green-300' :
              user.level === 5 ? 'bg-yellow-600/30 text-yellow-300' :
              'bg-orange-600/30 text-orange-300'
            }`}>
              {user.levelName}
            </span>
            <span className="text-xs text-slate-400 truncate">{user.username}</span>
          </div>
          {user.level < 6 && (
            <p className="text-xs text-slate-500 mt-1">
              파트너: Lv.{user.level + 1}~5 / 회원: 본인+하위
            </p>
          )}
          {user.level === 6 && (
            <p className="text-xs text-slate-500 mt-1">회원: 본인+하위 회원만 관리</p>
          )}
        </div>
      )}

      <nav
        className="flex-1 py-2 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
      >
        <style>{`
          .sidebar-nav::-webkit-scrollbar { width: 4px; }
          .sidebar-nav::-webkit-scrollbar-track { background: transparent; }
          .sidebar-nav::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 4px; }
          .sidebar-nav::-webkit-scrollbar-thumb:hover { background-color: #475569; }
        `}</style>
        <div
          className="sidebar-nav h-full overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
        >
          {menuItems.map((item) => renderMenuItem(item))}
        </div>
      </nav>
    </div>
  );
}
