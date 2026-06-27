import { useState } from 'react';
import { Menu, ChevronRight, Eye, EyeOff, Edit2, Trash2 } from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  path?: string;
  icon: string;
  order: number;
  visible: boolean;
  parent_id?: string;
  children?: MenuItem[];
}

export default function MenuManage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    {
      id: '1',
      label: '대시보드',
      path: '/admin',
      icon: 'LayoutDashboard',
      order: 1,
      visible: true,
    },
    {
      id: '2',
      label: '온라인현황',
      icon: 'UserCheck',
      order: 2,
      visible: true,
      children: [
        {
          id: '2-1',
          label: '온라인 접속현황',
          path: '/admin/online/users',
          icon: 'Users',
          order: 1,
          visible: true,
          parent_id: '2',
        },
        {
          id: '2-2',
          label: '관리자 접속현황',
          path: '/admin/online/admins',
          icon: 'Users',
          order: 2,
          visible: true,
          parent_id: '2',
        },
      ],
    },
    {
      id: '3',
      label: '회원관리',
      icon: 'Users',
      order: 3,
      visible: true,
      children: [
        {
          id: '3-1',
          label: '회원리스트',
          path: '/admin/members/list',
          icon: 'Users',
          order: 1,
          visible: true,
          parent_id: '3',
        },
        {
          id: '3-2',
          label: '블랙회원관리',
          path: '/admin/members/black',
          icon: 'Users',
          order: 2,
          visible: true,
          parent_id: '3',
        },
      ],
    },
  ]);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleVisibility = (id: string) => {
    const updateVisibility = (items: MenuItem[]): MenuItem[] => {
      return items.map((item) => {
        if (item.id === id) {
          return { ...item, visible: !item.visible };
        }
        if (item.children) {
          return { ...item, children: updateVisibility(item.children) };
        }
        return item;
      });
    };
    setMenuItems(updateVisibility(menuItems));
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.id);

    return (
      <div key={item.id} className={level > 0 ? 'ml-8' : ''}>
        <div
          className={`flex items-center justify-between p-3 rounded-lg ${
            level === 0 ? 'bg-slate-700/30' : 'bg-slate-700/20'
          } mb-2`}
        >
          <div className="flex items-center gap-3 flex-1">
            {hasChildren && (
              <button
                onClick={() => toggleExpand(item.id)}
                className="p-1 hover:bg-slate-600/30 rounded transition-colors"
              >
                <ChevronRight
                  size={16}
                  className={`text-slate-400 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              </button>
            )}
            {!hasChildren && <div className="w-6" />}

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-100">{item.label}</span>
                {!item.visible && (
                  <span className="px-2 py-0.5 bg-slate-600/50 text-slate-400 text-xs rounded">
                    숨김
                  </span>
                )}
              </div>
              {item.path && <div className="text-xs text-slate-500 mt-0.5">{item.path}</div>}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">순서: {item.order}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => toggleVisibility(item.id)}
              className={`p-2 rounded transition-colors ${
                item.visible
                  ? 'text-green-400 hover:bg-green-500/10'
                  : 'text-slate-500 hover:bg-slate-600/30'
              }`}
              title={item.visible ? '메뉴 숨기기' : '메뉴 표시'}
            >
              {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              className="p-2 text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
              title="편집"
            >
              <Edit2 size={16} />
            </button>
            <button
              className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="삭제"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4 space-y-2">
            {item.children!.map((child) => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 rounded-lg">
            <Menu className="text-teal-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">메뉴 관리</h2>
            <p className="text-sm text-slate-400">사이드바 메뉴 구성 및 순서 관리</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
          <Menu size={16} />
          메뉴 추가
        </button>
      </div>

      {/* 안내 */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 mt-0.5">ℹ️</div>
          <div className="flex-1">
            <h3 className="font-medium text-blue-400 mb-1">메뉴 관리 안내</h3>
            <p className="text-sm text-slate-300">
              메뉴의 표시/숨김, 순서, 구조를 관리할 수 있습니다. 변경사항은 즉시 사이드바에 반영됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* 메뉴 트리 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="space-y-2">{menuItems.map((item) => renderMenuItem(item))}</div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 rounded-lg">
              <Menu className="text-teal-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">전체 메뉴</p>
              <p className="text-2xl font-bold text-slate-100">
                {menuItems.reduce(
                  (sum, item) => sum + 1 + (item.children?.length || 0),
                  0
                )}개
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Eye className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">표시 중</p>
              <p className="text-2xl font-bold text-slate-100">
                {menuItems.reduce((sum, item) => {
                  const visible = item.visible ? 1 : 0;
                  const childVisible =
                    item.children?.filter((c) => c.visible).length || 0;
                  return sum + visible + childVisible;
                }, 0)}개
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-600/20 rounded-lg">
              <EyeOff className="text-slate-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">숨김</p>
              <p className="text-2xl font-bold text-slate-100">
                {menuItems.reduce((sum, item) => {
                  const hidden = !item.visible ? 1 : 0;
                  const childHidden =
                    item.children?.filter((c) => !c.visible).length || 0;
                  return sum + hidden + childHidden;
                }, 0)}개
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
