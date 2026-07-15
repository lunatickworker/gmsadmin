/**
 * 통합 정산 조회 유틸리티
 *
 * total_settlement 테이블 대신 소스 테이블에서 직접 계산합니다:
 *   - transactions (온라인 입출금)
 *   - transaction_manual (수동 입출금)
 *   - betting_history_invest / betting_history_honor (게임 실적)
 *   - partner_settings (롤링/루징 요율)
 *   - users (잔액, 계층)
 */

import { supabase } from '../../../utils/supabase/client';

export interface Settlement {
  id: string;
  target_user_id: string;
  target_username: string;
  target_role: string;
  settlement_date: string;
  final_settlement: number;
  total_rolling: number;
  total_losing: number;
  total_ggr: number;
  deposit_withdrawal_diff: number;
  casino_bet?: number;
  casino_win?: number;
  slot_bet?: number;
  slot_win?: number;
  balance?: number;
  points?: number;
}

export interface DetailedSettlement extends Settlement {
  casino_rolling_rate: number;
  slot_rolling_rate: number;
  losing_rate: number;
  online_deposit: number;
  online_withdrawal: number;
  manual_deposit: number;
  manual_withdrawal: number;
  partner_deposit: number;
  partner_withdrawal: number;
  points_granted: number;
  points_deducted: number;
  casino_normal_rolling: number;
  slot_normal_rolling: number;
  casino_shaved_rolling: number;
  slot_shaved_rolling: number;
  net_ggr: number;
  final_rolling: number;
  final_losing: number;
}

export interface SettlementQueryOptions {
  startDate?: string;
  endDate?: string;
  periodType?: 'daily' | 'weekly' | 'monthly';
  targetRole?: string;
}

export interface SettlementTreeNode extends Settlement {
  children: SettlementTreeNode[];
  parent_id: string | null;
  depth: number;
  isExpanded?: boolean;
  rolling_shave_enabled?: boolean;
  rolling_shave_rate?: number;
  casino_rolling_rate?: number;
  slot_rolling_rate?: number;
  losing_rate?: number;
  online_deposit?: number;
  online_withdrawal?: number;
  manual_deposit?: number;
  manual_withdrawal?: number;
  partner_deposit?: number;
  partner_withdrawal?: number;
  points_granted?: number;
  points_deducted?: number;
  casino_normal_rolling?: number;
  slot_normal_rolling?: number;
  casino_shaved_rolling?: number;
  slot_shaved_rolling?: number;
  net_ggr?: number;
  code_rolling?: number;
  code_losing?: number;
}

interface UserAccum {
  onlineDeposit: number;
  onlineWithdrawal: number;
  manualDeposit: number;
  manualWithdrawal: number;
  pointsGranted: number;
  pointsDeducted: number;
  casinoBet: number;
  casinoWin: number;
  slotBet: number;
  slotWin: number;
}

function makeAccum(): UserAccum {
  return {
    onlineDeposit: 0, onlineWithdrawal: 0,
    manualDeposit: 0, manualWithdrawal: 0,
    pointsGranted: 0, pointsDeducted: 0,
    casinoBet: 0, casinoWin: 0,
    slotBet: 0, slotWin: 0,
  };
}

function isSlotGame(gameType: string | null | undefined): boolean {
  const t = (gameType || '').toLowerCase();
  return t.includes('slot') || t.includes('slots');
}

/**
 * 하위 계층 정산을 트리 구조로 반환 (소스 테이블에서 직접 계산)
 */
export async function getSettlementTree(
  viewerId: string,
  options: SettlementQueryOptions = {}
): Promise<SettlementTreeNode[]> {
  try {
    const { startDate, endDate } = options;
    const startTs = startDate ? startDate + 'T00:00:00' : undefined;
    const endTs = endDate ? endDate + 'T23:59:59' : undefined;

    // 1. 조회자 정보
    const { data: viewerData } = await supabase
      .from('users')
      .select('id, username, role, parent_id, hierarchy_path, depth')
      .eq('id', viewerId)
      .maybeSingle();

    const effectiveRole = viewerData?.role ?? 'system_admin';

    // 2. 하위 사용자 목록 조회 (조직 격리)
    let usersQuery = supabase
      .from('users')
      .select('id, username, role, parent_id, depth, balance')
      .order('depth', { ascending: true })
      .order('username', { ascending: true });

    if (effectiveRole !== 'system_admin') {
      usersQuery = usersQuery.or(`id.eq.${viewerId},hierarchy_path.cs.{${viewerId}}`);
    }

    const { data: users, error: usersError } = await usersQuery;
    if (usersError || !users || users.length === 0) return [];

    const userIds = users.map(u => u.id);

    // 3. 파트너 설정 (요율) 일괄 조회
    const { data: settingsRows } = await supabase
      .from('partner_settings')
      .select('user_id, casino_rolling_rate, slot_rolling_rate, losing_rate, rolling_shave_enabled, rolling_shave_rate')
      .in('user_id', userIds);

    const settingsMap: Record<string, any> = {};
    for (const s of (settingsRows || [])) {
      settingsMap[s.user_id] = s;
    }

    // 4. 온라인 거래 (승인된 입출금) 조회
    let txnQuery = supabase
      .from('transactions')
      .select('user_id, type, amount, updated_at')
      .in('user_id', userIds)
      .eq('status', 'approved');
    if (startTs) txnQuery = txnQuery.gte('updated_at', startTs);
    if (endTs) txnQuery = txnQuery.lte('updated_at', endTs);
    const { data: txns } = await txnQuery;

    // 5. 수동 거래 조회
    let manualQuery = supabase
      .from('transaction_manual')
      .select('target_user_id, type, amount, created_at')
      .in('target_user_id', userIds);
    if (startTs) manualQuery = manualQuery.gte('created_at', startTs);
    if (endTs) manualQuery = manualQuery.lte('created_at', endTs);
    const { data: manuals } = await manualQuery;

    // 6. 베팅 내역 (invest + honor) 병렬 조회
    let investQuery = supabase
      .from('betting_history_invest')
      .select('user_id, bet_amount, win_amount, game_type, bet_time')
      .in('user_id', userIds);
    if (startTs) investQuery = investQuery.gte('bet_time', startTs);
    if (endTs) investQuery = investQuery.lte('bet_time', endTs);

    let honorQuery = supabase
      .from('betting_history_honor')
      .select('user_id, bet_amount, win_amount, game_type, bet_time')
      .in('user_id', userIds);
    if (startTs) honorQuery = honorQuery.gte('bet_time', startTs);
    if (endTs) honorQuery = honorQuery.lte('bet_time', endTs);

    const [investRes, honorRes] = await Promise.all([investQuery, honorQuery]);

    // 7. 유저별 집계
    const accumMap: Record<string, UserAccum> = {};
    const getAccum = (uid: string) => {
      if (!accumMap[uid]) accumMap[uid] = makeAccum();
      return accumMap[uid];
    };

    for (const txn of (txns || [])) {
      const a = getAccum(txn.user_id);
      if (txn.type === 'deposit') a.onlineDeposit += Number(txn.amount);
      else if (txn.type === 'withdrawal') a.onlineWithdrawal += Number(txn.amount);
    }

    for (const txn of (manuals || [])) {
      const a = getAccum(txn.target_user_id);
      if (txn.type === 'deposit') a.manualDeposit += Number(txn.amount);
      else if (txn.type === 'withdrawal') a.manualWithdrawal += Number(txn.amount);
    }

    const processBets = (bets: any[]) => {
      for (const bet of bets) {
        const a = getAccum(bet.user_id);
        if (isSlotGame(bet.game_type)) {
          a.slotBet += Number(bet.bet_amount);
          a.slotWin += Number(bet.win_amount);
        } else {
          a.casinoBet += Number(bet.bet_amount);
          a.casinoWin += Number(bet.win_amount);
        }
      }
    };

    processBets(investRes.data || []);
    processBets(honorRes.data || []);

    // 8. 트리 노드 생성
    const nodeMap: Record<string, SettlementTreeNode> = {};

    for (const user of users) {
      const a = accumMap[user.id] ?? makeAccum();
      const s = settingsMap[user.id];

      const casinoRollingRate = Number(s?.casino_rolling_rate ?? 0);
      const slotRollingRate = Number(s?.slot_rolling_rate ?? 0);
      const losingRate = Number(s?.losing_rate ?? 0);
      const gongBetEnabled = s?.rolling_shave_enabled ?? false;
      const gongBetRate = Number(s?.rolling_shave_rate ?? 0);

      const casinoNormalRolling = a.casinoBet * (casinoRollingRate / 100);
      const slotNormalRolling = a.slotBet * (slotRollingRate / 100);
      const totalRolling = casinoNormalRolling + slotNormalRolling;

      const casinoShavedRolling = gongBetEnabled ? casinoNormalRolling * (gongBetRate / 100) : 0;
      const slotShavedRolling = gongBetEnabled ? slotNormalRolling * (gongBetRate / 100) : 0;
      const finalRolling = totalRolling - casinoShavedRolling - slotShavedRolling;

      const ggr = (a.casinoBet - a.casinoWin) + (a.slotBet - a.slotWin);
      const netGGR = ggr - totalRolling;
      const totalLosing = netGGR > 0 ? netGGR * (losingRate / 100) : 0;

      const depositDiff = (a.onlineDeposit + a.manualDeposit) - (a.onlineWithdrawal + a.manualWithdrawal);

      nodeMap[user.id] = {
        id: user.id,
        target_user_id: user.id,
        target_username: user.username,
        target_role: user.role,
        settlement_date: '',
        final_settlement: finalRolling + totalLosing,
        total_rolling: totalRolling,
        total_losing: totalLosing,
        total_ggr: ggr,
        deposit_withdrawal_diff: depositDiff,
        casino_bet: a.casinoBet,
        casino_win: a.casinoWin,
        slot_bet: a.slotBet,
        slot_win: a.slotWin,
        balance: Number(user.balance ?? 0),
        points: 0,
        // 설정
        casino_rolling_rate: casinoRollingRate,
        slot_rolling_rate: slotRollingRate,
        losing_rate: losingRate,
        rolling_shave_enabled: gongBetEnabled,
        rolling_shave_rate: gongBetRate,
        // 입출금
        online_deposit: a.onlineDeposit,
        online_withdrawal: a.onlineWithdrawal,
        manual_deposit: a.manualDeposit,
        manual_withdrawal: a.manualWithdrawal,
        partner_deposit: 0,
        partner_withdrawal: 0,
        points_granted: a.pointsGranted,
        points_deducted: a.pointsDeducted,
        // 롤링 상세
        casino_normal_rolling: casinoNormalRolling,
        slot_normal_rolling: slotNormalRolling,
        casino_shaved_rolling: casinoShavedRolling,
        slot_shaved_rolling: slotShavedRolling,
        net_ggr: netGGR,
        code_rolling: finalRolling,
        code_losing: totalLosing,
        children: [],
        parent_id: user.parent_id,
        depth: user.depth,
        isExpanded: false,
      };
    }

    // 9. 트리 구조 구성
    const rootNodes: SettlementTreeNode[] = [];
    for (const node of Object.values(nodeMap)) {
      if (node.parent_id && nodeMap[node.parent_id]) {
        nodeMap[node.parent_id].children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    return rootNodes;
  } catch (error) {
    console.error('getSettlementTree 오류:', error);
    return [];
  }
}

// 하위 호환을 위한 래퍼 함수들 (total_settlement 기반 — 레거시)
export async function getSubordinateSettlements(
  viewerId: string,
  options: SettlementQueryOptions = {}
): Promise<Settlement[]> {
  const tree = await getSettlementTree(viewerId, options);
  const flatten = (nodes: SettlementTreeNode[]): Settlement[] =>
    nodes.flatMap(n => [n as Settlement, ...flatten(n.children)]);
  return flatten(tree);
}

export async function getSettlementsWithRLS(
  options: SettlementQueryOptions = {}
): Promise<Settlement[]> {
  const { data: viewer } = await supabase.auth.getUser();
  if (!viewer?.user?.id) return [];
  return getSubordinateSettlements(viewer.user.id, options);
}

export async function getUserSettlements(
  userId: string,
  startDate?: string,
  endDate?: string,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<Settlement[]> {
  const tree = await getSettlementTree(userId, { startDate, endDate, periodType });
  const self = tree.find(n => n.target_user_id === userId);
  return self ? [self] : (tree.length > 0 ? [tree[0]] : []);
}

export async function getSettlementSummary(
  viewerId: string,
  startDate?: string,
  endDate?: string
) {
  const settlements = await getSubordinateSettlements(viewerId, { startDate, endDate });
  return settlements.reduce(
    (acc, s) => ({
      totalSettlement: acc.totalSettlement + (s.final_settlement || 0),
      totalRolling: acc.totalRolling + (s.total_rolling || 0),
      totalLosing: acc.totalLosing + (s.total_losing || 0),
      totalGGR: acc.totalGGR + (s.total_ggr || 0),
      totalDepositWithdrawalDiff: acc.totalDepositWithdrawalDiff + (s.deposit_withdrawal_diff || 0),
      count: acc.count + 1,
    }),
    { totalSettlement: 0, totalRolling: 0, totalLosing: 0, totalGGR: 0, totalDepositWithdrawalDiff: 0, count: 0 }
  );
}

export async function getSettlementDetail(settlementId: string): Promise<DetailedSettlement | null> {
  return null;
}

export async function getSettlementsByRole(viewerId: string, startDate?: string, endDate?: string) {
  const settlements = await getSubordinateSettlements(viewerId, { startDate, endDate });
  const byRole: Record<string, { totalSettlement: number; totalRolling: number; totalLosing: number; totalGGR: number; count: number }> = {};
  for (const s of settlements) {
    const role = s.target_role;
    if (!byRole[role]) byRole[role] = { totalSettlement: 0, totalRolling: 0, totalLosing: 0, totalGGR: 0, count: 0 };
    byRole[role].totalSettlement += s.final_settlement || 0;
    byRole[role].totalRolling += s.total_rolling || 0;
    byRole[role].totalLosing += s.total_losing || 0;
    byRole[role].totalGGR += s.total_ggr || 0;
    byRole[role].count += 1;
  }
  return byRole;
}
