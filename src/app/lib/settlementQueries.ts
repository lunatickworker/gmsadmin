/**
 * 통합 정산 조회 유틸리티
 *
 * 조직 격리 구조를 활용한 정산 데이터 조회 함수들
 */

import { supabase } from '../../../utils/supabase/client';

/**
 * 정산 데이터 인터페이스
 */
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

/**
 * 통합 정산 상세 데이터 인터페이스
 */
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

/**
 * 조회 옵션
 */
export interface SettlementQueryOptions {
  startDate?: string;
  endDate?: string;
  periodType?: 'daily' | 'weekly' | 'monthly';
  targetRole?: string;
}

/**
 * 하위 계층 통합 정산 조회 (RPC 함수 사용 - 권장)
 *
 * @param viewerId - 조회자 사용자 ID
 * @param options - 조회 옵션
 * @returns 정산 데이터 배열
 */
export async function getSubordinateSettlements(
  viewerId: string,
  options: SettlementQueryOptions = {}
): Promise<Settlement[]> {
  const {
    startDate = null,
    endDate = null,
    periodType = 'daily'
  } = options;

  try {
    const { data, error } = await supabase.rpc('get_subordinate_settlements', {
      p_viewer_id: viewerId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_period_type: periodType
    });

    if (error) {
      console.error('정산 데이터 조회 실패:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('getSubordinateSettlements 오류:', error);
    return [];
  }
}

/**
 * 하위 계층 통합 정산 조회 (RLS 활용)
 *
 * Supabase RLS가 자동으로 조직 격리를 적용합니다.
 * 현재 로그인한 사용자는 자신의 권한 범위 내 데이터만 조회 가능합니다.
 *
 * @param options - 조회 옵션
 * @returns 정산 데이터 배열
 */
export async function getSettlementsWithRLS(
  options: SettlementQueryOptions = {}
): Promise<Settlement[]> {
  const {
    startDate,
    endDate,
    periodType = 'daily',
    targetRole
  } = options;

  try {
    let query = supabase
      .from('total_settlement')
      .select(`
        id,
        target_user_id,
        target_role,
        settlement_date,
        final_settlement,
        total_rolling,
        total_losing,
        total_ggr,
        deposit_withdrawal_diff,
        casino_bet,
        casino_win,
        slot_bet,
        slot_win,
        balance,
        points,
        users!target_user_id(username)
      `)
      .eq('period_type', periodType)
      .order('settlement_date', { ascending: false });

    if (startDate) {
      query = query.gte('settlement_date', startDate);
    }

    if (endDate) {
      query = query.lte('settlement_date', endDate);
    }

    if (targetRole) {
      query = query.eq('target_role', targetRole);
    }

    const { data, error } = await query;

    if (error) {
      console.error('정산 데이터 조회 실패:', error);
      throw error;
    }

    // 데이터 변환
    return (data || []).map((row: any) => ({
      ...row,
      target_username: row.users?.username || 'Unknown'
    }));
  } catch (error) {
    console.error('getSettlementsWithRLS 오류:', error);
    return [];
  }
}

/**
 * 통합 정산 상세 데이터 조회
 *
 * @param settlementId - 정산 ID
 * @returns 상세 정산 데이터
 */
export async function getSettlementDetail(
  settlementId: string
): Promise<DetailedSettlement | null> {
  try {
    const { data, error } = await supabase
      .from('total_settlement')
      .select(`
        *,
        users!target_user_id(username)
      `)
      .eq('id', settlementId)
      .maybeSingle();

    if (error) {
      console.error('정산 상세 데이터 조회 실패:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      target_username: data.users?.username || 'Unknown'
    };
  } catch (error) {
    console.error('getSettlementDetail 오류:', error);
    return null;
  }
}

/**
 * 특정 사용자의 정산 데이터 조회
 *
 * @param userId - 사용자 ID
 * @param startDate - 시작 날짜
 * @param endDate - 종료 날짜
 * @param periodType - 기간 타입
 * @returns 정산 데이터 배열
 */
export async function getUserSettlements(
  userId: string,
  startDate?: string,
  endDate?: string,
  periodType: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<Settlement[]> {
  try {
    let query = supabase
      .from('total_settlement')
      .select(`
        id,
        target_user_id,
        target_role,
        settlement_date,
        final_settlement,
        total_rolling,
        total_losing,
        total_ggr,
        deposit_withdrawal_diff,
        users!target_user_id(username)
      `)
      .eq('target_user_id', userId)
      .eq('period_type', periodType)
      .order('settlement_date', { ascending: false });

    if (startDate) {
      query = query.gte('settlement_date', startDate);
    }

    if (endDate) {
      query = query.lte('settlement_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('사용자 정산 데이터 조회 실패:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      ...row,
      target_username: row.users?.username || 'Unknown'
    }));
  } catch (error) {
    console.error('getUserSettlements 오류:', error);
    return [];
  }
}

/**
 * 정산 데이터 요약 통계 조회
 *
 * @param viewerId - 조회자 사용자 ID
 * @param startDate - 시작 날짜
 * @param endDate - 종료 날짜
 * @returns 요약 통계
 */
export async function getSettlementSummary(
  viewerId: string,
  startDate?: string,
  endDate?: string
) {
  try {
    const settlements = await getSubordinateSettlements(viewerId, {
      startDate,
      endDate,
      periodType: 'daily'
    });

    const summary = settlements.reduce(
      (acc, settlement) => ({
        totalSettlement: acc.totalSettlement + (settlement.final_settlement || 0),
        totalRolling: acc.totalRolling + (settlement.total_rolling || 0),
        totalLosing: acc.totalLosing + (settlement.total_losing || 0),
        totalGGR: acc.totalGGR + (settlement.total_ggr || 0),
        totalDepositWithdrawalDiff: acc.totalDepositWithdrawalDiff + (settlement.deposit_withdrawal_diff || 0),
        count: acc.count + 1
      }),
      {
        totalSettlement: 0,
        totalRolling: 0,
        totalLosing: 0,
        totalGGR: 0,
        totalDepositWithdrawalDiff: 0,
        count: 0
      }
    );

    return summary;
  } catch (error) {
    console.error('getSettlementSummary 오류:', error);
    return {
      totalSettlement: 0,
      totalRolling: 0,
      totalLosing: 0,
      totalGGR: 0,
      totalDepositWithdrawalDiff: 0,
      count: 0
    };
  }
}

/**
 * 역할별 정산 데이터 집계
 *
 * @param viewerId - 조회자 사용자 ID
 * @param startDate - 시작 날짜
 * @param endDate - 종료 날짜
 * @returns 역할별 집계 데이터
 */
export async function getSettlementsByRole(
  viewerId: string,
  startDate?: string,
  endDate?: string
) {
  try {
    const settlements = await getSubordinateSettlements(viewerId, {
      startDate,
      endDate,
      periodType: 'daily'
    });

    const byRole: Record<string, {
      totalSettlement: number;
      totalRolling: number;
      totalLosing: number;
      totalGGR: number;
      count: number;
    }> = {};

    settlements.forEach(settlement => {
      const role = settlement.target_role;
      if (!byRole[role]) {
        byRole[role] = {
          totalSettlement: 0,
          totalRolling: 0,
          totalLosing: 0,
          totalGGR: 0,
          count: 0
        };
      }

      byRole[role].totalSettlement += settlement.final_settlement || 0;
      byRole[role].totalRolling += settlement.total_rolling || 0;
      byRole[role].totalLosing += settlement.total_losing || 0;
      byRole[role].totalGGR += settlement.total_ggr || 0;
      byRole[role].count += 1;
    });

    return byRole;
  } catch (error) {
    console.error('getSettlementsByRole 오류:', error);
    return {};
  }
}

/**
 * 트리 구조 정산 노드
 */
export interface SettlementTreeNode extends Settlement {
  children: SettlementTreeNode[];
  parent_id: string | null;
  depth: number;
  isExpanded?: boolean;
  rolling_shave_enabled?: boolean;
  rolling_shave_rate?: number;
  // 정산기준설정
  casino_rolling_rate?: number;
  slot_rolling_rate?: number;
  losing_rate?: number;
  // 상세 입출금
  online_deposit?: number;
  online_withdrawal?: number;
  manual_deposit?: number;
  manual_withdrawal?: number;
  partner_deposit?: number;
  partner_withdrawal?: number;
  points_granted?: number;
  points_deducted?: number;
  // 공배팅 롤링 상세
  casino_normal_rolling?: number;  // 공배팅 전 카지노 정상 롤링
  slot_normal_rolling?: number;    // 공배팅 전 슬롯 정상 롤링
  casino_shaved_rolling?: number;  // 카지노 공배팅 절삭액
  slot_shaved_rolling?: number;    // 슬롯 공배팅 절삭액
  // NetGGR = GGR - 정상롤링금 (루징 계산 기준)
  net_ggr?: number;
  // 코드별 실정산 (= final_rolling / final_losing from DB)
  // final_rolling: 직속 자식 롤링 차감 후 개인 실정산 롤링
  // final_losing: 두 번째 패스 후 개인 실정산 루징
  code_rolling?: number;
  code_losing?: number;
}

/**
 * 하위 계층 정산을 트리 구조로 변환
 *
 * @param viewerId - 조회자 사용자 ID
 * @param options - 조회 옵션
 * @returns 트리 구조 정산 데이터
 */
export async function getSettlementTree(
  viewerId: string,
  options: SettlementQueryOptions = {}
): Promise<SettlementTreeNode[]> {
  try {
    // 1. 사용자 계층 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username, role, parent_id, hierarchy_path, depth')
      .eq('id', viewerId)
      .maybeSingle();

    if (userError) {
      console.error('사용자 정보 조회 실패:', userError);
      return [];
    }

    // userData가 없으면 system_admin으로 간주하여 전체 조회
    const effectiveUser = userData ?? { id: viewerId, role: 'system_admin', hierarchy_path: [], depth: 0 };

    // 2. 하위 계층 사용자 모두 조회
    let usersQuery = supabase
      .from('users')
      .select('id, username, role, parent_id, hierarchy_path, depth')
      .order('depth', { ascending: true })
      .order('username', { ascending: true });

    // 조직 격리: 시스템 관리자가 아니면 자신의 하위만
    if (effectiveUser.role !== 'system_admin') {
      usersQuery = usersQuery.or(`id.eq.${viewerId},hierarchy_path.cs.{${viewerId}}`);
    }

    const { data: users, error: usersError } = await usersQuery;

    if (usersError) {
      console.error('하위 사용자 조회 실패:', usersError);
      return [];
    }

    if (!users || users.length === 0) {
      return [];
    }

    // 3. 각 사용자의 정산 데이터 조회
    const userIds = users.map(u => u.id);
    const {
      startDate,
      endDate,
      periodType = 'daily'
    } = options;

    let settlementsQuery = supabase
      .from('total_settlement')
      .select('*')
      .in('target_user_id', userIds)
      .eq('period_type', periodType)
      .order('settlement_date', { ascending: false });

    if (startDate) {
      settlementsQuery = settlementsQuery.gte('settlement_date', startDate);
    }

    if (endDate) {
      settlementsQuery = settlementsQuery.lte('settlement_date', endDate);
    }

    const { data: settlements, error: settlementsError } = await settlementsQuery;

    if (settlementsError) {
      console.error('정산 데이터 조회 실패:', settlementsError);
      return [];
    }

    // 4. 사용자별 정산 데이터 집계 (같은 사용자의 여러 날짜 데이터 합산)
    const settlementByUser: Record<string, any> = {};

    (settlements || []).forEach((s: any) => {
      const userId = s.target_user_id;
      if (!settlementByUser[userId]) {
        settlementByUser[userId] = {
          target_user_id: userId,
          final_settlement: 0,
          total_rolling: 0,
          total_losing: 0,
          total_ggr: 0,
          net_ggr: 0,
          deposit_withdrawal_diff: 0,
          casino_bet: 0,
          casino_win: 0,
          slot_bet: 0,
          slot_win: 0,
          balance: 0,
          points: 0,
          online_deposit: 0,
          online_withdrawal: 0,
          manual_deposit: 0,
          manual_withdrawal: 0,
          partner_deposit: 0,
          partner_withdrawal: 0,
          points_granted: 0,
          points_deducted: 0,
          casino_normal_rolling: 0,
          slot_normal_rolling: 0,
          casino_shaved_rolling: 0,
          slot_shaved_rolling: 0,
          final_rolling: 0,
          final_losing: 0,
          casino_rolling_rate: 0,
          slot_rolling_rate: 0,
          losing_rate: 0,
          rolling_shave_enabled: false,
          rolling_shave_rate: 0,
          count: 0
        };
      }

      settlementByUser[userId].final_settlement += s.final_settlement || 0;
      settlementByUser[userId].total_rolling += s.total_rolling || 0;
      settlementByUser[userId].total_losing += s.total_losing || 0;
      settlementByUser[userId].total_ggr += s.total_ggr || 0;
      settlementByUser[userId].net_ggr += s.net_ggr || 0;
      settlementByUser[userId].deposit_withdrawal_diff += s.deposit_withdrawal_diff || 0;
      settlementByUser[userId].casino_bet += s.casino_bet || 0;
      settlementByUser[userId].casino_win += s.casino_win || 0;
      settlementByUser[userId].slot_bet += s.slot_bet || 0;
      settlementByUser[userId].slot_win += s.slot_win || 0;
      settlementByUser[userId].online_deposit += s.online_deposit || 0;
      settlementByUser[userId].online_withdrawal += s.online_withdrawal || 0;
      settlementByUser[userId].manual_deposit += s.manual_deposit || 0;
      settlementByUser[userId].manual_withdrawal += s.manual_withdrawal || 0;
      settlementByUser[userId].partner_deposit += s.partner_deposit || 0;
      settlementByUser[userId].partner_withdrawal += s.partner_withdrawal || 0;
      settlementByUser[userId].points_granted += s.points_granted || 0;
      settlementByUser[userId].points_deducted += s.points_deducted || 0;
      settlementByUser[userId].casino_normal_rolling += s.casino_normal_rolling || 0;
      settlementByUser[userId].slot_normal_rolling += s.slot_normal_rolling || 0;
      settlementByUser[userId].casino_shaved_rolling += s.casino_shaved_rolling || 0;
      settlementByUser[userId].slot_shaved_rolling += s.slot_shaved_rolling || 0;
      // final_rolling / final_losing: DB가 이미 직속 자식 차감 후 계산된 값
      settlementByUser[userId].final_rolling += s.final_rolling || 0;
      settlementByUser[userId].final_losing += s.final_losing || 0;
      settlementByUser[userId].balance = s.balance || 0;
      settlementByUser[userId].points = s.points || 0;
      settlementByUser[userId].casino_rolling_rate = s.casino_rolling_rate || 0;
      settlementByUser[userId].slot_rolling_rate = s.slot_rolling_rate || 0;
      settlementByUser[userId].losing_rate = s.losing_rate || 0;
      settlementByUser[userId].rolling_shave_enabled = s.rolling_shave_enabled ?? false;
      settlementByUser[userId].rolling_shave_rate = s.rolling_shave_rate || 0;
      settlementByUser[userId].count += 1;
    });

    // 5. 트리 노드 생성
    const nodeMap: Record<string, SettlementTreeNode> = {};

    users.forEach(user => {
      const s = settlementByUser[user.id];
      nodeMap[user.id] = {
        id: user.id,
        target_user_id: user.id,
        target_username: user.username,
        target_role: user.role,
        settlement_date: '',
        final_settlement: s?.final_settlement || 0,
        total_rolling: s?.total_rolling || 0,
        total_losing: s?.total_losing || 0,
        total_ggr: s?.total_ggr || 0,
        deposit_withdrawal_diff: s?.deposit_withdrawal_diff || 0,
        casino_bet: s?.casino_bet || 0,
        casino_win: s?.casino_win || 0,
        slot_bet: s?.slot_bet || 0,
        slot_win: s?.slot_win || 0,
        balance: s?.balance || 0,
        points: s?.points || 0,
        online_deposit: s?.online_deposit || 0,
        online_withdrawal: s?.online_withdrawal || 0,
        manual_deposit: s?.manual_deposit || 0,
        manual_withdrawal: s?.manual_withdrawal || 0,
        partner_deposit: s?.partner_deposit || 0,
        partner_withdrawal: s?.partner_withdrawal || 0,
        points_granted: s?.points_granted || 0,
        points_deducted: s?.points_deducted || 0,
        casino_rolling_rate: s?.casino_rolling_rate || 0,
        slot_rolling_rate: s?.slot_rolling_rate || 0,
        losing_rate: s?.losing_rate || 0,
        rolling_shave_enabled: s?.rolling_shave_enabled ?? false,
        rolling_shave_rate: s?.rolling_shave_rate || 0,
        casino_normal_rolling: s?.casino_normal_rolling || 0,
        slot_normal_rolling: s?.slot_normal_rolling || 0,
        casino_shaved_rolling: s?.casino_shaved_rolling || 0,
        slot_shaved_rolling: s?.slot_shaved_rolling || 0,
        net_ggr: s?.net_ggr || 0,
        // code_rolling = final_rolling: DB가 직속 자식 차감 후 계산한 개인 실정산 롤링
        // code_losing  = final_losing:  DB가 두 번째 패스 후 계산한 개인 실정산 루징
        code_rolling: s?.final_rolling || 0,
        code_losing: s?.final_losing || 0,
        children: [],
        parent_id: user.parent_id,
        depth: user.depth,
        isExpanded: false
      };
    });

    // 6. 트리 구조 구성
    const rootNodes: SettlementTreeNode[] = [];

    Object.values(nodeMap).forEach(node => {
      if (node.parent_id && nodeMap[node.parent_id]) {
        nodeMap[node.parent_id].children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  } catch (error) {
    console.error('getSettlementTree 오류:', error);
    return [];
  }
}
