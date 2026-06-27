import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Download, ChevronDown, ChevronUp, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth, LEVEL_NAMES } from '../../context/AuthContext';
import { getSettlementTree, SettlementTreeNode } from '../../lib/settlementQueries';

// 역할별 한글 이름 (DB의 role 필드용)
const ROLE_NAMES: Record<string, string> = {
  'system_admin': '시스템관리자',
  'operator': '운영사',
  'head_office': '본사',
  'sub_office': '부본사',
  'distributor': '총판',
  'store': '매장',
  'member': '회원'
};

// 역할별 색상
const ROLE_COLORS: Record<string, string> = {
  'system_admin': 'bg-purple-600/30 text-purple-300',
  'operator': 'bg-red-600/30 text-red-300',
  'head_office': 'bg-cyan-600/30 text-cyan-300',
  'sub_office': 'bg-green-600/30 text-green-300',
  'distributor': 'bg-yellow-600/30 text-yellow-300',
  'store': 'bg-orange-600/30 text-orange-300',
  'member': 'bg-blue-600/30 text-blue-300'
};

interface SettlementTreeRowProps {
  node: SettlementTreeNode;
  showSettingColumns: boolean;
  showGongBetColumn: boolean;
  onToggle: (nodeId: string) => void;
  expandedNodes: Set<string>;
}

function SettlementTreeRow({ node, showSettingColumns, showGongBetColumn, onToggle, expandedNodes }: SettlementTreeRowProps) {
  const isExpanded = expandedNodes.has(node.target_user_id);
  const hasChildren = node.children && node.children.length > 0;
  const indentLevel = node.depth;
  const isStore = node.target_role === 'store';

  const depositDiff = isStore
    ? (node.manual_deposit || 0) + (node.partner_withdrawal || 0) - (node.manual_withdrawal || 0) - (node.partner_deposit || 0)
    : (node.online_deposit || 0) + (node.manual_deposit || 0) - (node.online_withdrawal || 0) - (node.manual_withdrawal || 0);

  const w = (n?: number) => `₩${(n || 0).toLocaleString()}`;

  return (
    <>
      <tr
        className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={hasChildren ? () => onToggle(node.target_user_id) : undefined}
      >
        {/* 등급 */}
        <td className="px-4 py-3 text-center sticky left-0 bg-slate-800 z-10 border-r-2 border-slate-700 shadow-md">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${indentLevel * 16}px` }}>
            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-slate-400">
              {hasChildren ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}
            </span>
            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${ROLE_COLORS[node.target_role] || 'bg-gray-600/30 text-gray-300'}`}>
              {ROLE_NAMES[node.target_role] || node.target_role}
            </span>
          </div>
        </td>

        {/* 아이디 */}
        <td className="px-4 py-3 text-center sticky left-[200px] bg-slate-800 z-10 border-r-2 border-slate-700 shadow-md">
          <div className="text-slate-200 font-medium whitespace-nowrap">{node.target_username}</div>
          {hasChildren && <div className="text-xs text-slate-500">{node.children.length}명</div>}
        </td>

        {/* 정산 기준 설정 (카지노롤링/슬롯롤링/루징/공배팅) */}
        {showSettingColumns && (
          <>
            <td className="px-4 py-3 text-center text-blue-400 font-medium border-l-2 border-slate-700 bg-blue-900/10">
              {node.casino_rolling_rate ? `${node.casino_rolling_rate}%` : '-'}
            </td>
            <td className="px-4 py-3 text-center text-blue-400 font-medium bg-blue-900/10">
              {node.slot_rolling_rate ? `${node.slot_rolling_rate}%` : '-'}
            </td>
            <td className="px-4 py-3 text-center text-purple-400 font-medium bg-blue-900/10">
              {node.losing_rate ? `${node.losing_rate}%` : '-'}
            </td>
            {showGongBetColumn && (
              <td className="px-4 py-3 text-center bg-blue-900/10">
                {node.rolling_shave_enabled
                  ? <span className="text-orange-300 font-medium">{node.rolling_shave_rate}%</span>
                  : <span className="text-slate-600 text-xs">-</span>
                }
              </td>
            )}
          </>
        )}

        {/* 보유 자산 */}
        <td className="px-4 py-3 text-right text-slate-200 border-l-2 border-slate-700">{w(node.balance)}</td>
        <td className="px-4 py-3 text-right text-slate-400">{(node.points || 0).toLocaleString()}</td>

        {/* 온라인 입출금 */}
        <td className="px-4 py-3 text-right text-green-400 border-l-2 border-slate-700 bg-green-900/10">{w(node.online_deposit)}</td>
        <td className="px-4 py-3 text-right text-red-400 bg-green-900/10">{w(node.online_withdrawal)}</td>

        {/* 수동 입출금 */}
        <td className="px-4 py-3 text-right text-green-400 border-l-2 border-slate-700 bg-purple-900/10">{w(node.manual_deposit)}</td>
        <td className="px-4 py-3 text-right text-red-400 bg-purple-900/10">{w(node.manual_withdrawal)}</td>

        {/* 포인트 관리 */}
        <td className="px-4 py-3 text-right text-slate-400 border-l-2 border-slate-700">{(node.points_granted || 0).toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-slate-400">{(node.points_deducted || 0).toLocaleString()}</td>

        {/* 입출차액 (매장은 현금정산) */}
        <td className={`px-4 py-3 text-right font-bold border-l-2 border-slate-700 bg-yellow-900/10 ${depositDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {w(depositDiff)}
        </td>

        {/* 게임 실적 */}
        <td className="px-4 py-3 text-right text-slate-300 border-l-2 border-slate-700 bg-cyan-900/10">{w(node.casino_bet)}</td>
        <td className="px-4 py-3 text-right text-slate-400 bg-cyan-900/10">{w(node.casino_win)}</td>
        <td className="px-4 py-3 text-right text-slate-300 bg-cyan-900/10">{w(node.slot_bet)}</td>
        <td className="px-4 py-3 text-right text-slate-400 bg-cyan-900/10">{w(node.slot_win)}</td>

        {/* GGR 합산 */}
        <td className="px-4 py-3 text-right text-yellow-400 font-bold border-l-2 border-slate-700 bg-orange-900/10">
          {w(node.total_ggr)}
        </td>

        {/* 실정산 (총롤링금, 총루징) */}
        <td className="px-4 py-3 text-right text-green-400 font-bold border-l-2 border-slate-700 bg-pink-900/10">{w(node.total_rolling)}</td>
        <td className="px-4 py-3 text-right text-purple-400 font-bold bg-pink-900/10">{w(node.total_losing)}</td>

        {/* 코드별 실정산 (롤링금, 루징) */}
        <td className="px-4 py-3 text-right text-green-300 font-bold border-l-2 border-slate-700 bg-emerald-900/10">{w(node.code_rolling)}</td>
        <td className="px-4 py-3 text-right text-purple-300 font-bold bg-emerald-900/10">{w(node.code_losing)}</td>
      </tr>

      {/* 하위 노드 재귀 렌더링 */}
      {isExpanded && hasChildren && node.children.map((child) => (
        <SettlementTreeRow
          key={child.target_user_id}
          node={child}
          showSettingColumns={showSettingColumns}
          showGongBetColumn={showGongBetColumn}
          onToggle={onToggle}
          expandedNodes={expandedNodes}
        />
      ))}
    </>
  );
}

function hasGongBetActiveInTree(nodes: SettlementTreeNode[]): boolean {
  return nodes.some(n => n.rolling_shave_enabled || (n.children && hasGongBetActiveInTree(n.children)));
}

export default function TotalSettlementTree() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState<SettlementTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSettingColumns, setShowSettingColumns] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('이번 달');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // 공배팅 컬럼: 시스템관리자·운영사만 볼 수 있고, 활성화된 노드가 있을 때만 표시
  const canSeeGongBet = user?.role === 'system_admin' || user?.role === 'operator';
  const showGongBetColumn = canSeeGongBet && hasGongBetActiveInTree(treeData);

  // 날짜 범위 계산
  const getDateRange = (period: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    switch (period) {
      case '이번 달':
        return {
          startDate: new Date(year, month, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0]
        };
      case '지난 달':
        return {
          startDate: new Date(year, month - 1, 1).toISOString().split('T')[0],
          endDate: new Date(year, month, 0).toISOString().split('T')[0]
        };
      case '최근 3개월':
        return {
          startDate: new Date(year, month - 3, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0]
        };
      case '올해':
        return {
          startDate: new Date(year, 0, 1).toISOString().split('T')[0],
          endDate: new Date(year, 11, 31).toISOString().split('T')[0]
        };
      default:
        return {
          startDate: new Date(year, month, 1).toISOString().split('T')[0],
          endDate: new Date(year, month + 1, 0).toISOString().split('T')[0]
        };
    }
  };

  // 데이터 로드
  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(selectedPeriod);
      const tree = await getSettlementTree(user.id, {
        startDate,
        endDate,
        periodType: 'daily'
      });
      setTreeData(tree);
    } catch (error) {
      console.error('정산 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, selectedPeriod]);

  // 노드 확장/축소 토글
  const handleToggle = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // 모두 펼치기
  const expandAll = () => {
    const allNodeIds = new Set<string>();
    const collectNodeIds = (nodes: SettlementTreeNode[]) => {
      nodes.forEach(node => {
        allNodeIds.add(node.target_user_id);
        if (node.children && node.children.length > 0) {
          collectNodeIds(node.children);
        }
      });
    };
    collectNodeIds(treeData);
    setExpandedNodes(allNodeIds);
  };

  // 모두 접기
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">통합 정산</h2>
          <p className="text-slate-400 text-sm mt-1">
            하위 계층 정산 현황 (조직 격리 적용)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={expandAll}
            className="flex items-center gap-2"
          >
            모두 펼치기
          </Button>
          <Button
            variant="outline"
            onClick={collapseAll}
            className="flex items-center gap-2"
          >
            모두 접기
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSettingColumns(!showSettingColumns)}
            className="flex items-center gap-2"
          >
            {showSettingColumns ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            정산 기준 설정 {showSettingColumns ? '숨기기' : '보기'}
          </Button>
          <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
            <Download size={18} />
            엑셀 다운로드
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 p-4">
        <div className="flex gap-4 items-center">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-slate-700 border border-slate-600 text-slate-200 px-4 py-2 rounded-lg"
          >
            <option>이번 달</option>
            <option>지난 달</option>
            <option>최근 3개월</option>
            <option>올해</option>
          </select>
          <Button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            새로고침
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="bg-slate-800 border-slate-700 p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 size={48} className="animate-spin text-blue-500" />
            <p className="text-slate-400">정산 데이터를 불러오는 중...</p>
          </div>
        </Card>
      ) : (
        <Card className="bg-slate-800 border-slate-700 overflow-hidden">
          <div className="overflow-x-auto settlement-scroll" style={{ maxHeight: '70vh' }}>
            <style>{`
              .settlement-scroll::-webkit-scrollbar {
                height: 12px;
                width: 12px;
              }
              .settlement-scroll::-webkit-scrollbar-track {
                background: #1e293b;
                border-radius: 6px;
              }
              .settlement-scroll::-webkit-scrollbar-thumb {
                background: #475569;
                border-radius: 6px;
                border: 2px solid #1e293b;
              }
              .settlement-scroll::-webkit-scrollbar-thumb:hover {
                background: #64748b;
              }
              .settlement-scroll {
                scrollbar-width: auto;
                scrollbar-color: #475569 #1e293b;
              }
            `}</style>
            <table className="w-full text-sm" style={{ minWidth: '2600px' }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-700 border-b-2 border-slate-500">
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold sticky left-0 bg-slate-700 z-30 border-r-2 border-slate-600 shadow-lg" style={{ minWidth: '200px' }}>등급</th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold sticky left-[200px] bg-slate-700 z-30 border-r-2 border-slate-600 shadow-lg" style={{ minWidth: '150px' }}>아이디</th>

                  {showSettingColumns && (
                    <th colSpan={showGongBetColumn ? 4 : 3} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-blue-900/30">
                      정산 기준 설정
                    </th>
                  )}

                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600">
                    보유 자산
                  </th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-green-900/20">
                    온라인 입출금
                  </th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-purple-900/20">
                    수동 입출금
                  </th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600">
                    포인트 관리
                  </th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-yellow-900/30">
                    입출차액
                  </th>
                  <th colSpan={4} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-cyan-900/20">
                    게임 실적
                  </th>
                  <th className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-orange-900/30">
                    GGR 합산
                  </th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-pink-900/20">
                    실정산
                  </th>
                  <th colSpan={2} className="px-4 py-3 text-center text-slate-100 font-semibold border-l-2 border-slate-600 bg-emerald-900/20">
                    코드별 실정산
                  </th>
                </tr>
                <tr className="bg-slate-800 border-b-2 border-slate-500">
                  <th className="px-4 py-2 sticky left-0 bg-slate-800 z-30 border-r-2 border-slate-600 shadow-lg"></th>
                  <th className="px-4 py-2 sticky left-[200px] bg-slate-800 z-30 border-r-2 border-slate-600 shadow-lg"></th>

                  {showSettingColumns && (
                    <>
                      <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>카지노롤링</th>
                      <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>슬롯롤링</th>
                      <th className="px-4 py-2 text-center text-purple-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '70px' }}>루징</th>
                      {showGongBetColumn && (
                        <th className="px-4 py-2 text-center text-orange-300 text-xs font-medium bg-blue-900/30 whitespace-nowrap" style={{ minWidth: '80px' }}>공배팅</th>
                      )}
                    </>
                  )}

                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 whitespace-nowrap" style={{ minWidth: '110px' }}>보유머니</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium whitespace-nowrap" style={{ minWidth: '90px' }}>포인트</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-green-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>입금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-green-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>출금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-purple-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>수동입금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-purple-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>수동출금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 whitespace-nowrap" style={{ minWidth: '100px' }}>포인트지급</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium whitespace-nowrap" style={{ minWidth: '100px' }}>포인트회수</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-yellow-900/30 whitespace-nowrap" style={{ minWidth: '120px' }}></th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '120px' }}>카지노 베팅</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '120px' }}>카지노 당첨</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>슬롯 베팅</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-cyan-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>슬롯 당첨</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-orange-900/30 whitespace-nowrap" style={{ minWidth: '120px' }}></th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium border-l-2 border-slate-600 bg-pink-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>총 롤링금</th>
                  <th className="px-4 py-2 text-center text-slate-300 text-xs font-medium bg-pink-900/20 whitespace-nowrap" style={{ minWidth: '100px' }}>총 루징</th>
                  <th className="px-4 py-2 text-center text-green-300 text-xs font-medium border-l-2 border-slate-600 bg-emerald-900/20 whitespace-nowrap" style={{ minWidth: '110px' }}>실정산롤링</th>
                  <th className="px-4 py-2 text-center text-purple-300 text-xs font-medium bg-emerald-900/20 whitespace-nowrap" style={{ minWidth: '100px' }}>실정산루징</th>
                </tr>
              </thead>
              <tbody>
                {treeData.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-4 py-12 text-center text-slate-400">
                      정산 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  treeData.map((node) => (
                    <SettlementTreeRow
                      key={node.target_user_id}
                      node={node}
                      showSettingColumns={showSettingColumns}
                      showGongBetColumn={showGongBetColumn}
                      onToggle={handleToggle}
                      expandedNodes={expandedNodes}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
