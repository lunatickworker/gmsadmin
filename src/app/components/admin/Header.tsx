import { useState, useEffect, useRef } from 'react';
import { Bell, LogOut, KeyRound, Clock, ArrowDownCircle, ArrowUpCircle, X, Search, ChevronDown, MessageSquare, UserCheck, Coins, History, Send, RotateCcw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '../ui/card';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase/client';
import { toast } from 'sonner';
import { api } from '../../../utils/api';
import { useNavigate } from 'react-router';

interface HeaderProps {
  title: string;
}

interface NotifCounts {
  pendingRegistrations: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  pendingSupport: number;
  pendingPartnerRequests: number;
  unreadMessages: number;
  total: number;
}

interface SubPartner {
  id: string;
  username: string;
  name: string | null;
  role: string;
  balance: number;
  depth: number;
}

interface ParentPartner {
  id: string;
  username: string;
  name: string | null;
  role: string;
}

interface CommissionWallet {
  casinoRolling: number;
  slotRolling: number;
  losing: number;
}

interface CommissionConversion {
  id: string;
  type: 'casino_rolling' | 'slot_rolling' | 'losing' | 'all';
  amount: number;
  converted_at: string;
}

interface PartnerTransferRequest {
  id: string;
  requester_id: string;
  target_id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  memo: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  processed_at: string | null;
  requester?: { username: string; name: string | null; role: string };
}

const ROLE_LABEL: Record<string, string> = {
  system_admin: '시스템관리자',
  operator:     '운영사',
  head_office:  '본사',
  sub_office:   '부본사',
  distributor:  '총판',
  store:        '매장',
  member:       '회원',
};

const COMMISSION_TYPE_LABEL: Record<string, string> = {
  casino_rolling: '카지노 롤링',
  slot_rolling:   '슬롯 롤링',
  losing:         '루징',
  all:            '전체',
};

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 파트너 지급/회수 모달 상태 (상위→하위)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payType, setPayType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [subPartners, setSubPartners] = useState<SubPartner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<SubPartner | null>(null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerDropOpen, setPartnerDropOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMemo, setPayMemo] = useState('');
  const [paying, setPaying] = useState(false);
  const [myBalance, setMyBalance] = useState(0);
  const [operatorTotalBalance, setOperatorTotalBalance] = useState(0);
  const partnerDropRef = useRef<HTMLDivElement>(null);

  // 상위 파트너 정보
  const [parentPartner, setParentPartner] = useState<ParentPartner | null>(null);

  // 커미션 지갑
  const [commissionWallet, setCommissionWallet] = useState<CommissionWallet>({ casinoRolling: 0, slotRolling: 0, losing: 0 });
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [commissionHistory, setCommissionHistory] = useState<CommissionConversion[]>([]);
  const [commissionTab, setCommissionTab] = useState<'wallet' | 'history'>('wallet');
  const [convertingType, setConvertingType] = useState<'casino_rolling' | 'slot_rolling' | 'losing' | 'all' | null>(null);

  // 지급신청/회수신청 (하위→상위)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMemo, setRequestMemo] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // 하위 파트너로부터 받은 요청 처리 (상위 파트너 입장)
  const [showIncomingRequests, setShowIncomingRequests] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<PartnerTransferRequest[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // 비밀번호 변경 모달
  const [showPwModal, setShowPwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [notifCounts, setNotifCounts] = useState<NotifCounts>({
    pendingRegistrations: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    pendingSupport: 0,
    pendingPartnerRequests: 0,
    unreadMessages: 0,
    total: 0,
  });

  const fetchNotifications = async () => {
    try {
      const res = await api.getAdminNotifications();
      if (res.success) {
        // 파트너 요청 카운트 병합
        const partnerReqCount = await fetchPendingRequestCount();
        setNotifCounts({ ...res.data, pendingPartnerRequests: partnerReqCount, total: res.data.total + partnerReqCount });
      }
    } catch (e) {
      console.warn('[알림] fetchNotifications 실패:', e);
    }
  };

  const fetchPendingRequestCount = async (): Promise<number> => {
    if (!user) return 0;
    try {
      const { count } = await supabase
        .from('partner_transfer_requests')
        .select('id', { count: 'exact', head: true })
        .eq('target_id', user.id)
        .eq('status', 'pending');
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  // 커미션 지갑 로드
  const loadCommissionWallet = async () => {
    if (!user) return;
    try {
      // total_settlement에서 개인 정산 합산
      const { data: settlements } = await supabase
        .from('total_settlement')
        .select('casino_bet, casino_win, slot_bet, slot_win, casino_rolling_rate, slot_rolling_rate, losing_rate, final_rolling, final_losing')
        .eq('target_user_id', user.id)
        .eq('period_type', 'daily');

      if (!settlements) return;

      let totalCasinoRolling = 0;
      let totalSlotRolling = 0;
      let totalLosing = 0;

      for (const s of settlements) {
        const casinoRate = s.casino_rolling_rate ?? 0;
        const slotRate = s.slot_rolling_rate ?? 0;
        totalCasinoRolling += (s.casino_bet ?? 0) * (casinoRate / 100);
        totalSlotRolling += (s.slot_bet ?? 0) * (slotRate / 100);
        totalLosing += s.final_losing ?? 0;
      }

      // 이미 전환된 금액 차감
      try {
        const { data: conversions } = await supabase
          .from('commission_conversions')
          .select('type, amount')
          .eq('user_id', user.id);

        if (conversions) {
          for (const c of conversions) {
            if (c.type === 'casino_rolling') totalCasinoRolling -= c.amount;
            else if (c.type === 'slot_rolling') totalSlotRolling -= c.amount;
            else if (c.type === 'losing') totalLosing -= c.amount;
            else if (c.type === 'all') {
              // 비례 차감 (단순 처리: 비율에 따라)
            }
          }
        }
      } catch {
        // commission_conversions 테이블 없으면 무시
      }

      setCommissionWallet({
        casinoRolling: Math.max(0, totalCasinoRolling),
        slotRolling: Math.max(0, totalSlotRolling),
        losing: Math.max(0, totalLosing),
      });
    } catch (e) {
      console.warn('[커미션] 로드 실패:', e);
    }
  };

  // 커미션 전환 히스토리 로드
  const loadCommissionHistory = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('commission_conversions')
        .select('*')
        .eq('user_id', user.id)
        .order('converted_at', { ascending: false })
        .limit(50);
      setCommissionHistory((data ?? []) as CommissionConversion[]);
    } catch {
      setCommissionHistory([]);
    }
  };

  // 커미션 전환 실행
  const handleConvertCommission = async (type: 'casino_rolling' | 'slot_rolling' | 'losing' | 'all') => {
    if (!user) return;
    const amountMap = {
      casino_rolling: commissionWallet.casinoRolling,
      slot_rolling: commissionWallet.slotRolling,
      losing: commissionWallet.losing,
      all: commissionWallet.casinoRolling + commissionWallet.slotRolling + commissionWallet.losing,
    };
    const amount = Math.floor(amountMap[type]);
    if (amount <= 0) { toast.error('전환할 커미션이 없습니다.'); return; }

    setConvertingType(type);
    try {
      // 전환 기록 저장
      const { error: convErr } = await supabase.from('commission_conversions').insert({
        user_id: user.id,
        type,
        amount,
        converted_at: new Date().toISOString(),
      });
      if (convErr) throw new Error(convErr.message);

      // 보유금 증가
      await supabase.from('users').update({ balance: myBalance + amount }).eq('id', user.id);

      toast.success(`₩${amount.toLocaleString()} 보유머니로 전환되었습니다.`);
      setMyBalance(prev => prev + amount);
      await loadCommissionWallet();
      await loadCommissionHistory();
    } catch (e: any) {
      toast.error('전환 실패: ' + e.message);
    } finally {
      setConvertingType(null);
    }
  };

  // 상위 파트너 정보 로드
  const loadParentPartner = async () => {
    if (!user || !user.hierarchyPath || user.hierarchyPath.length < 2) return;
    const parentId = user.hierarchyPath[user.hierarchyPath.length - 2];
    if (!parentId) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('id, username, name, role')
        .eq('id', parentId)
        .single();
      if (data) setParentPartner(data as ParentPartner);
    } catch {
      // 없으면 무시
    }
  };

  // 하위→상위 지급/회수 신청
  const handleSubmitRequest = async () => {
    if (!user || !parentPartner) { toast.error('상위 파트너 정보가 없습니다.'); return; }
    const amount = parseInt(requestAmount.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('금액을 올바르게 입력해주세요.'); return; }

    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from('partner_transfer_requests').insert({
        requester_id: user.id,
        target_id: parentPartner.id,
        type: requestType,
        amount,
        memo: requestMemo || null,
        status: 'pending',
      });
      if (error) throw new Error(error.message);
      toast.success(`${requestType === 'deposit' ? '지급' : '회수'} 신청이 완료되었습니다.`);
      setShowRequestModal(false);
      setRequestAmount('');
      setRequestMemo('');
    } catch (e: any) {
      toast.error('신청 실패: ' + e.message);
    } finally {
      setSubmittingRequest(false);
    }
  };

  // 하위 파트너 요청 목록 로드
  const loadIncomingRequests = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('partner_transfer_requests')
        .select('*, requester:requester_id(username, name, role)')
        .eq('target_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setIncomingRequests((data ?? []) as PartnerTransferRequest[]);
    } catch {
      setIncomingRequests([]);
    }
  };

  // 요청 처리 (승인/거절)
  const handleProcessRequest = async (req: PartnerTransferRequest, action: 'approved' | 'rejected') => {
    if (!user) return;
    setProcessingRequestId(req.id);
    try {
      if (action === 'approved') {
        // 보유금 처리
        const { data: requesterData } = await supabase.from('users').select('balance').eq('id', req.requester_id).single();
        const requesterBalance = Number(requesterData?.balance ?? 0);

        if (req.type === 'deposit') {
          // 상위(나)가 하위에게 지급
          if (user.role !== 'operator' && user.role !== 'system_admin' && req.amount > myBalance) {
            toast.error('보유금이 부족합니다.'); return;
          }
          await supabase.from('users').update({ balance: requesterBalance + req.amount }).eq('id', req.requester_id);
          if (user.role !== 'operator' && user.role !== 'system_admin') {
            await supabase.from('users').update({ balance: myBalance - req.amount }).eq('id', user.id);
            setMyBalance(prev => prev - req.amount);
          }
        } else {
          // 상위(나)가 하위로부터 회수
          if (req.amount > requesterBalance) { toast.error('하위 파트너 보유금이 부족합니다.'); return; }
          await supabase.from('users').update({ balance: requesterBalance - req.amount }).eq('id', req.requester_id);
          if (user.role !== 'operator' && user.role !== 'system_admin') {
            await supabase.from('users').update({ balance: myBalance + req.amount }).eq('id', user.id);
            setMyBalance(prev => prev + req.amount);
          }
        }

        // partner_transactions에 기록
        await supabase.from('partner_transactions').insert({
          transaction_no: `PR${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          parent_partner_id: user.id,
          child_partner_id: req.requester_id,
          type: req.type,
          amount: req.amount,
          memo: `[신청처리] ${req.memo ?? ''}`,
        });
      }

      // 요청 상태 업데이트
      await supabase.from('partner_transfer_requests')
        .update({ status: action, processed_at: new Date().toISOString() })
        .eq('id', req.id);

      toast.success(action === 'approved' ? '신청이 승인되었습니다.' : '신청이 거절되었습니다.');
      await loadIncomingRequests();
      await fetchNotifications();
    } catch (e: any) {
      toast.error('처리 실패: ' + e.message);
    } finally {
      setProcessingRequestId(null);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, []);

  useEffect(() => {
    if (!user) return;
    loadParentPartner();
    loadCommissionWallet();
  }, [user?.id]);

  // 현재 사용자 보유금 실시간
  useEffect(() => {
    if (!user) return;
    supabase.from('users').select('balance').eq('id', user.id).single().then(({ data }) => {
      if (data) setMyBalance(Number(data.balance ?? 0));
    });
    const ch = supabase.channel('header-my-balance')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        payload => setMyBalance(Number((payload.new as any).balance ?? 0)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // 시스템 관리자: 하위 운영사 총 보유금 합산
  useEffect(() => {
    if (!user || user.role !== 'system_admin') return;
    const fetchOperatorTotal = async () => {
      const { data: operatorData } = await supabase
        .from('users')
        .select('balance')
        .eq('role', 'operator')
        .eq('status', 'active');
      const operatorTotal = (operatorData ?? []).reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
      setOperatorTotalBalance(operatorTotal);
    };
    fetchOperatorTotal();
    const ch = supabase.channel('header-operator-balance')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, () => fetchOperatorTotal())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, user?.role]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (partnerDropRef.current && !partnerDropRef.current.contains(e.target as Node)) setPartnerDropOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadSubPartners = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('id, username, name, role, balance, depth')
      .in('role', ['operator', 'head_office', 'sub_office', 'distributor', 'store'])
      .contains('hierarchy_path', [user.id])
      .neq('id', user.id)
      .order('depth');
    setSubPartners((data ?? []).map(d => ({ ...d, balance: Number(d.balance ?? 0) })));
  };

  const openPayModal = (type: 'deposit' | 'withdrawal') => {
    setPayType(type);
    setSelectedPartner(null);
    setPayAmount('');
    setPayMemo('');
    setPartnerSearch('');
    setShowPayModal(true);
    setShowUserMenu(false);
    loadSubPartners();
  };

  const openRequestModal = (type: 'deposit' | 'withdrawal') => {
    setRequestType(type);
    setRequestAmount('');
    setRequestMemo('');
    setShowRequestModal(true);
    setShowUserMenu(false);
  };

  const openIncomingRequests = () => {
    setShowIncomingRequests(true);
    setShowUserMenu(false);
    loadIncomingRequests();
  };

  const openCommissionModal = () => {
    setShowCommissionModal(true);
    setShowUserMenu(false);
    setCommissionTab('wallet');
    loadCommissionWallet();
    loadCommissionHistory();
  };

  const handlePayConfirm = async () => {
    if (!user || !selectedPartner) { toast.error('지급할 파트너를 선택해주세요.'); return; }
    const amount = parseInt(payAmount.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('금액을 올바르게 입력해주세요.'); return; }
    if (payType === 'deposit' && user.role !== 'operator' && user.role !== 'system_admin' && amount > myBalance) {
      toast.error('보유금이 부족합니다.'); return;
    }
    if (payType === 'withdrawal' && amount > selectedPartner.balance) {
      toast.error('파트너 보유금보다 많은 금액을 회수할 수 없습니다.'); return;
    }

    setPaying(true);
    try {
      const txNo = `PT${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const { error: ptErr } = await supabase.from('partner_transactions').insert({
        transaction_no: txNo,
        parent_partner_id: user.id,
        child_partner_id: selectedPartner.id,
        type: payType,
        amount,
        memo: payMemo || null,
      });
      if (ptErr) throw new Error(ptErr.message);

      const childDelta = payType === 'deposit' ? amount : -amount;
      await supabase.from('users').update({ balance: selectedPartner.balance + childDelta }).eq('id', selectedPartner.id);

      if (user.role !== 'operator' && user.role !== 'system_admin') {
        const parentDelta = payType === 'deposit' ? -amount : amount;
        await supabase.from('users').update({ balance: myBalance + parentDelta }).eq('id', user.id);
      }

      toast.success(`${selectedPartner.username}에게 ₩${amount.toLocaleString()} ${payType === 'deposit' ? '지급' : '회수'} 완료`);
      setShowPayModal(false);
    } catch (e: any) {
      toast.error('처리 실패: ' + e.message);
    } finally {
      setPaying(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if (!oldPw || !newPw || !newPwConfirm) { toast.error('모든 항목을 입력해주세요.'); return; }
    if (newPw !== newPwConfirm) { toast.error('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPw.length < 6) { toast.error('비밀번호는 6자 이상이어야 합니다.'); return; }
    setChangingPw(true);
    try {
      const res = await api.changePassword(user.id, oldPw, newPw);
      if (res.success) {
        toast.success('비밀번호가 변경되었습니다.');
        setShowPwModal(false);
        setOldPw(''); setNewPw(''); setNewPwConfirm('');
      } else throw new Error(res.message ?? '변경 실패');
    } catch (e: any) {
      toast.error('변경 실패: ' + e.message);
    } finally {
      setChangingPw(false);
    }
  };

  const userInitial = user?.username?.charAt(0).toUpperCase() ?? 'A';
  const formatTime = (d: Date) => d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const formatDate = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filteredSubPartners = subPartners.filter(p => {
    if (!partnerSearch) return true;
    const q = partnerSearch.toLowerCase();
    return p.username.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q);
  });

  const isPartnerRole = user && !['system_admin', 'member'].includes(user.role);
  const hasParent = parentPartner !== null && user?.role !== 'operator' && user?.role !== 'system_admin';
  const totalCommission = commissionWallet.casinoRolling + commissionWallet.slotRolling + commissionWallet.losing;
  const pendingIncoming = incomingRequests.filter(r => r.status === 'pending');

  return (
    <>
      <header className="h-16 bg-slate-800 border-b border-slate-700 px-6 flex items-center justify-between relative z-30">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* 빠른 통계 */}
          <div className="flex items-center gap-1 mr-2">
            {user?.role === 'system_admin' ? (
              <div className="px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-center min-w-[110px]">
                <div className="text-xs text-yellow-500/80">운영사 총 보유금</div>
                <div className="text-sm font-bold text-yellow-300">₩{operatorTotalBalance.toLocaleString()}</div>
              </div>
            ) : user && !['member'].includes(user.role) ? (
              <div className="px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-center min-w-[100px]">
                <div className="text-xs text-yellow-500/80">내 보유금</div>
                <div className="text-sm font-bold text-yellow-300">₩{myBalance.toLocaleString()}</div>
              </div>
            ) : null}
            <button
              onClick={() => navigate('/admin/members/list')}
              className={`px-3 py-1.5 rounded-lg text-center min-w-[72px] transition-colors ${notifCounts.pendingRegistrations > 0 ? 'bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25' : 'bg-slate-700/60 hover:bg-slate-700'}`}
            >
              <div className={`text-xs ${notifCounts.pendingRegistrations > 0 ? 'text-blue-400' : 'text-slate-400'}`}>가입승인</div>
              <div className={`text-sm font-bold ${notifCounts.pendingRegistrations > 0 ? 'text-blue-300' : 'text-slate-100'}`}>{notifCounts.pendingRegistrations}</div>
            </button>
            <button
              onClick={() => navigate('/admin/customer/support')}
              className={`px-3 py-1.5 rounded-lg text-center min-w-[72px] transition-colors ${notifCounts.pendingSupport > 0 ? 'bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25' : 'bg-slate-700/60 hover:bg-slate-700'}`}
            >
              <div className={`text-xs ${notifCounts.pendingSupport > 0 ? 'text-purple-400' : 'text-slate-400'}`}>고객문의</div>
              <div className={`text-sm font-bold ${notifCounts.pendingSupport > 0 ? 'text-purple-300' : 'text-slate-100'}`}>{notifCounts.pendingSupport}</div>
            </button>
          </div>

          {/* 알림 */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
              className="relative p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Bell size={20} className="text-slate-300" />
              {notifCounts.total > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                  {notifCounts.total > 99 ? '99+' : notifCounts.total}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <Card className="absolute right-0 top-12 w-80 bg-slate-800 border-slate-700 shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-bold text-white text-sm">처리 대기 현황</h3>
                    <button onClick={() => { fetchNotifications(); }} className="text-xs text-blue-400 hover:text-blue-300">새로고침</button>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    <button onClick={() => { navigate('/admin/members/list'); setShowNotifications(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                        <UserCheck size={15} className="text-blue-400" />
                      </div>
                      <div className="flex-1"><p className="text-sm text-slate-200">가입 승인 대기</p><p className="text-xs text-slate-500">회원 관리로 이동</p></div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.pendingRegistrations > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.pendingRegistrations}</span>
                    </button>
                    <button onClick={() => { navigate('/admin/transactions/manage'); setShowNotifications(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                        <ArrowDownCircle size={15} className="text-emerald-400" />
                      </div>
                      <div className="flex-1"><p className="text-sm text-slate-200">입금 승인 대기</p><p className="text-xs text-slate-500">입출금 관리로 이동</p></div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.pendingDeposits > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.pendingDeposits}</span>
                    </button>
                    <button onClick={() => { navigate('/admin/transactions/manage'); setShowNotifications(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <ArrowUpCircle size={15} className="text-amber-400" />
                      </div>
                      <div className="flex-1"><p className="text-sm text-slate-200">출금 승인 대기</p><p className="text-xs text-slate-500">입출금 관리로 이동</p></div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.pendingWithdrawals > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.pendingWithdrawals}</span>
                    </button>
                    <button onClick={() => { navigate('/admin/customer/support'); setShowNotifications(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                        <MessageSquare size={15} className="text-purple-400" />
                      </div>
                      <div className="flex-1"><p className="text-sm text-slate-200">고객 문의 대기</p><p className="text-xs text-slate-500">고객센터로 이동</p></div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.pendingSupport > 0 ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.pendingSupport}</span>
                    </button>
                    <button onClick={() => { navigate('/admin/customer/message'); setShowNotifications(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                        <Send size={15} className="text-teal-400" />
                      </div>
                      <div className="flex-1"><p className="text-sm text-slate-200">읽지 않은 쪽지</p><p className="text-xs text-slate-500">메시지 센터로 이동</p></div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.unreadMessages > 0 ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.unreadMessages}</span>
                    </button>
                    {/* 파트너 신청 대기 */}
                    {isPartnerRole && (
                      <button onClick={() => { openIncomingRequests(); setShowNotifications(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left">
                        <div className="w-9 h-9 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                          <Send size={15} className="text-orange-400" />
                        </div>
                        <div className="flex-1"><p className="text-sm text-slate-200">파트너 신청 대기</p><p className="text-xs text-slate-500">하위 파트너 지급/회수 요청</p></div>
                        <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${notifCounts.pendingPartnerRequests > 0 ? 'bg-orange-500/20 text-orange-300' : 'bg-slate-700 text-slate-500'}`}>{notifCounts.pendingPartnerRequests}</span>
                      </button>
                    )}
                  </div>
                  {notifCounts.total === 0 && (
                    <div className="px-4 py-3 border-t border-slate-700 text-center">
                      <p className="text-xs text-slate-500">모든 항목이 처리되었습니다 ✓</p>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>

          {/* 유저 아이콘 */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
              className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white font-bold text-sm transition-colors"
            >
              {userInitial}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-12 w-[320px] bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                {/* 유저 정보 헤더 */}
                <div className="p-4 flex items-center gap-3 border-b border-slate-700/60">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {userInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/30 text-blue-300 rounded font-medium">{user?.levelName ?? '관리자'}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">{user?.username}</div>
                    {user?.name && user.name !== user.username && (
                      <div className="text-xs text-slate-400 truncate">{user.name}</div>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors flex-shrink-0"
                  >
                    <LogOut size={13} />
                    로그아웃
                  </button>
                </div>


                {/* 보유금 표시 */}
                <div className="mx-3 mt-2 bg-slate-900/70 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">내 보유금</span>
                  <span className="text-sm font-bold text-yellow-300">₩{myBalance.toLocaleString()}</span>
                </div>

                {/* 커미션 지갑 */}
                {isPartnerRole && (
                  <div className="mx-3 mt-2 bg-gradient-to-r from-violet-900/30 to-purple-900/20 border border-violet-700/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Coins size={13} className="text-violet-400" />
                      <span className="text-xs text-violet-300 font-medium">커미션 적립금</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleConvertCommission('casino_rolling')}
                        disabled={commissionWallet.casinoRolling <= 0 || convertingType !== null}
                        className="bg-slate-900/60 hover:bg-emerald-900/40 rounded px-2 py-1.5 text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed group"
                        title="클릭하여 보유머니로 전환"
                      >
                        <div className="text-[9px] text-slate-500 mb-0.5">카지노롤링</div>
                        <div className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                          {convertingType === 'casino_rolling' ? <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : `₩${Math.floor(commissionWallet.casinoRolling).toLocaleString()}`}
                        </div>
                      </button>
                      <button
                        onClick={() => handleConvertCommission('slot_rolling')}
                        disabled={commissionWallet.slotRolling <= 0 || convertingType !== null}
                        className="bg-slate-900/60 hover:bg-blue-900/40 rounded px-2 py-1.5 text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed group"
                        title="클릭하여 보유머니로 전환"
                      >
                        <div className="text-[9px] text-slate-500 mb-0.5">슬롯롤링</div>
                        <div className="text-xs font-bold text-blue-400 group-hover:text-blue-300">
                          {convertingType === 'slot_rolling' ? <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /> : `₩${Math.floor(commissionWallet.slotRolling).toLocaleString()}`}
                        </div>
                      </button>
                      <button
                        onClick={() => handleConvertCommission('losing')}
                        disabled={commissionWallet.losing <= 0 || convertingType !== null}
                        className="bg-slate-900/60 hover:bg-amber-900/40 rounded px-2 py-1.5 text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed group"
                        title="클릭하여 보유머니로 전환"
                      >
                        <div className="text-[9px] text-slate-500 mb-0.5">루징</div>
                        <div className="text-xs font-bold text-amber-400 group-hover:text-amber-300">
                          {convertingType === 'losing' ? <span className="inline-block w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> : `₩${Math.floor(commissionWallet.losing).toLocaleString()}`}
                        </div>
                      </button>
                    </div>
                    {totalCommission > 0 && (
                      <button
                        onClick={() => { handleConvertCommission('all'); }}
                        disabled={convertingType !== null}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 bg-violet-600/40 hover:bg-violet-600/60 border border-violet-600/50 text-violet-200 text-xs rounded transition-colors disabled:opacity-50"
                      >
                        <RotateCcw size={11} className={convertingType ? 'animate-spin' : ''} />
                        전체 전환 (₩{Math.floor(totalCommission).toLocaleString()})
                      </button>
                    )}
                  </div>
                )}

                {/* 지급/회수 버튼 섹션 */}
                {isPartnerRole && (
                  <div className="px-3 mt-2 space-y-2">
                    {/* 파트너 지급/회수 (상위→하위) */}
                    <div>
                      <div className="text-[10px] text-slate-500 mb-1 px-0.5">파트너 지급/회수 (하위에게)</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => openPayModal('deposit')}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 hover:text-emerald-300 rounded-lg text-xs transition-colors">
                          <ArrowDownCircle size={12} />파트너 지급
                        </button>
                        <button onClick={() => openPayModal('withdrawal')}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 text-amber-400 hover:text-amber-300 rounded-lg text-xs transition-colors">
                          <ArrowUpCircle size={12} />파트너 회수
                        </button>
                      </div>
                    </div>

                    {/* 신청 (하위→상위) */}
                    {hasParent && (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-1 px-0.5">신청 (상위에게)</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={() => openRequestModal('deposit')}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-600/40 text-sky-400 hover:text-sky-300 rounded-lg text-xs transition-colors">
                            <Send size={12} />지급신청
                          </button>
                          <button onClick={() => openRequestModal('withdrawal')}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-400 hover:text-rose-300 rounded-lg text-xs transition-colors">
                            <Send size={12} />회수신청
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 신청 처리 (하위로부터 받은 요청) */}
                    <button onClick={openIncomingRequests}
                      className="w-full flex items-center justify-between px-3 py-2 bg-orange-600/15 hover:bg-orange-600/25 border border-orange-600/30 text-orange-400 rounded-lg text-xs transition-colors">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle size={12} />
                        신청 처리 (받은 요청)
                      </div>
                      {notifCounts.pendingPartnerRequests > 0 && (
                        <span className="bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {notifCounts.pendingPartnerRequests}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                <div className="border-t border-slate-700 mx-3 mt-2" />

                {/* 비밀번호 변경 */}
                <button
                  onClick={() => { setShowUserMenu(false); setShowPwModal(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700/60 transition-colors"
                >
                  <KeyRound size={15} className="text-slate-400" />
                  비밀번호 변경
                </button>

                <div className="border-t border-slate-700 mx-3" />

                <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-slate-500">
                  <Clock size={12} />
                  {formatTime(currentTime)}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 파트너 지급/회수 모달 (상위→하위) ── */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                {payType === 'deposit' ? <ArrowDownCircle size={18} className="text-emerald-400" /> : <ArrowUpCircle size={18} className="text-amber-400" />}
                <h3 className="text-slate-100">파트너 {payType === 'deposit' ? '지급' : '회수'}</h3>
              </div>
              <button onClick={() => setShowPayModal(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-slate-900/60 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">내 보유금</span>
                <span className="text-sm font-bold text-yellow-300">₩{myBalance.toLocaleString()}</span>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">대상 파트너 선택</label>
                <div ref={partnerDropRef} className="relative">
                  <button type="button" onClick={() => setPartnerDropOpen(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm focus:outline-none hover:border-slate-500">
                    <span className={selectedPartner ? 'text-slate-100' : 'text-slate-500'}>
                      {selectedPartner
                        ? `[${ROLE_LABEL[selectedPartner.role] ?? selectedPartner.role}] ${selectedPartner.username}${selectedPartner.name ? ` (${selectedPartner.name})` : ''}`
                        : '파트너를 선택하세요'}
                    </span>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${partnerDropOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {partnerDropOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-700">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input autoFocus value={partnerSearch} onChange={e => setPartnerSearch(e.target.value)}
                            placeholder="파트너 검색..." className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredSubPartners.length === 0
                          ? <p className="text-xs text-slate-500 px-3 py-3 text-center">하위 파트너가 없습니다</p>
                          : filteredSubPartners.map(p => (
                            <button key={p.id} type="button"
                              onClick={() => { setSelectedPartner(p); setPartnerDropOpen(false); setPartnerSearch(''); }}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 border-b border-slate-800/60 last:border-0 transition-colors ${selectedPartner?.id === p.id ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                              <span className="flex items-center gap-2">
                                <span className="text-slate-500 text-[10px] px-1.5 py-0.5 bg-slate-700 rounded">{ROLE_LABEL[p.role] ?? p.role}</span>
                                <span className="font-medium">{p.username}</span>
                                {p.name && <span className="text-slate-500">({p.name})</span>}
                              </span>
                              <span className="text-yellow-400 text-[10px] flex-shrink-0">₩{p.balance.toLocaleString()}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                {selectedPartner && (
                  <div className="mt-1.5 text-xs text-slate-500">
                    파트너 현재 보유금: <span className="text-yellow-400">₩{selectedPartner.balance.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">{payType === 'deposit' ? '지급' : '회수'} 금액</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₩</span>
                  <input type="text" inputMode="numeric" value={payAmount}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setPayAmount(raw ? parseInt(raw).toLocaleString() : ''); }}
                    placeholder="0" className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[100000, 500000, 1000000, 5000000].map(v => (
                    <button key={v} type="button"
                      onClick={() => setPayAmount(((parseInt(payAmount.replace(/,/g, ''), 10) || 0) + v).toLocaleString())}
                      className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors">
                      +{v >= 1000000 ? `${v / 1000000}백만` : `${v / 10000}만`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
                <input value={payMemo} onChange={e => setPayMemo(e.target.value)} placeholder="처리 사유 메모"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowPayModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
              <button onClick={handlePayConfirm} disabled={paying || !selectedPartner || !payAmount}
                className={`px-5 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${payType === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                {paying ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : payType === 'deposit' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                {payType === 'deposit' ? '지급 확정' : '회수 확정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 지급/회수 신청 모달 (하위→상위) ── */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-sky-400" />
                <h3 className="text-slate-100">{requestType === 'deposit' ? '지급' : '회수'} 신청</h3>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {parentPartner && (
                <div className="bg-slate-900/60 rounded-lg px-4 py-3">
                  <div className="text-xs text-slate-500 mb-1">신청 대상 (상위 파트너)</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">{ROLE_LABEL[parentPartner.role] ?? parentPartner.role}</span>
                    <span className="text-sm font-semibold text-slate-100">{parentPartner.username}</span>
                    {parentPartner.name && <span className="text-sm text-slate-400">({parentPartner.name})</span>}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">신청 유형</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setRequestType('deposit')}
                    className={`py-2.5 text-sm rounded-lg border transition-colors ${requestType === 'deposit' ? 'bg-sky-600/30 border-sky-500/60 text-sky-300' : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    지급 신청
                  </button>
                  <button type="button" onClick={() => setRequestType('withdrawal')}
                    className={`py-2.5 text-sm rounded-lg border transition-colors ${requestType === 'withdrawal' ? 'bg-rose-600/30 border-rose-500/60 text-rose-300' : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
                    회수 신청
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">신청 금액</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₩</span>
                  <input type="text" inputMode="numeric" value={requestAmount}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setRequestAmount(raw ? parseInt(raw).toLocaleString() : ''); }}
                    placeholder="0" className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[100000, 500000, 1000000, 5000000].map(v => (
                    <button key={v} type="button"
                      onClick={() => setRequestAmount(((parseInt(requestAmount.replace(/,/g, ''), 10) || 0) + v).toLocaleString())}
                      className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors">
                      +{v >= 1000000 ? `${v / 1000000}백만` : `${v / 10000}만`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
                <input value={requestMemo} onChange={e => setRequestMemo(e.target.value)} placeholder="신청 사유"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowRequestModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
              <button onClick={handleSubmitRequest} disabled={submittingRequest || !requestAmount}
                className="px-5 py-2 text-sm text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {submittingRequest ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={14} />}
                신청하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 하위 파트너 신청 처리 모달 ── */}
      {showIncomingRequests && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-orange-400" />
                <h3 className="text-slate-100">파트너 신청 처리</h3>
                {pendingIncoming.length > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">{pendingIncoming.length}</span>
                )}
              </div>
              <button onClick={() => setShowIncomingRequests(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {incomingRequests.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-500 text-sm">받은 신청이 없습니다</div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {incomingRequests.map(req => (
                    <div key={req.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${req.type === 'deposit' ? 'bg-sky-600/30 text-sky-300' : 'bg-rose-600/30 text-rose-300'}`}>
                              {req.type === 'deposit' ? '지급신청' : '회수신청'}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              req.status === 'pending' ? 'bg-orange-600/30 text-orange-300' :
                              req.status === 'approved' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-red-600/30 text-red-300'
                            }`}>
                              {req.status === 'pending' ? '대기중' : req.status === 'approved' ? '승인됨' : '거절됨'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
                            {req.requester && (
                              <>
                                <span className="text-[10px] bg-slate-700 px-1 py-0.5 rounded">{ROLE_LABEL[req.requester.role] ?? req.requester.role}</span>
                                <span className="font-medium text-slate-200">{req.requester.username}</span>
                                {req.requester.name && <span className="text-slate-500">({req.requester.name})</span>}
                              </>
                            )}
                          </div>
                          <div className="text-sm font-bold text-yellow-300">₩{req.amount.toLocaleString()}</div>
                          {req.memo && <div className="text-xs text-slate-500 mt-0.5 truncate">{req.memo}</div>}
                          <div className="text-[10px] text-slate-600 mt-1">{formatDate(req.created_at)}</div>
                        </div>
                        {req.status === 'pending' && (
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleProcessRequest(req, 'approved')}
                              disabled={processingRequestId === req.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-600/50 text-emerald-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                            >
                              {processingRequestId === req.id
                                ? <span className="inline-block w-3 h-3 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
                                : <CheckCircle size={12} />}
                              승인
                            </button>
                            <button
                              onClick={() => handleProcessRequest(req, 'rejected')}
                              disabled={processingRequestId === req.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 border border-red-600/50 text-red-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                            >
                              <XCircle size={12} />거절
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 커미션 상세 모달 ── */}
      {showCommissionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-violet-400" />
                <h3 className="text-slate-100">커미션 지갑</h3>
              </div>
              <button onClick={() => setShowCommissionModal(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
              <button
                onClick={() => setCommissionTab('wallet')}
                className={`flex-1 py-3 text-sm transition-colors ${commissionTab === 'wallet' ? 'text-violet-300 border-b-2 border-violet-500 font-medium' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <Coins size={14} className="inline mr-1.5" />커미션 현황
              </button>
              <button
                onClick={() => setCommissionTab('history')}
                className={`flex-1 py-3 text-sm transition-colors ${commissionTab === 'history' ? 'text-violet-300 border-b-2 border-violet-500 font-medium' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <History size={14} className="inline mr-1.5" />전환 히스토리
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {commissionTab === 'wallet' ? (
                <div className="p-5 space-y-4">
                  {/* 카지노 롤링 */}
                  <div className="bg-slate-900/70 rounded-xl border border-slate-700/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-500">카지노 롤링 커미션</div>
                        <div className="text-lg font-bold text-emerald-400 mt-0.5">₩{Math.floor(commissionWallet.casinoRolling).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => handleConvertCommission('casino_rolling')}
                        disabled={commissionWallet.casinoRolling <= 0 || convertingType !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-600/50 text-emerald-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >
                        {convertingType === 'casino_rolling'
                          ? <span className="inline-block w-3 h-3 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
                          : <RotateCcw size={11} />}
                        보유머니 전환
                      </button>
                    </div>
                  </div>

                  {/* 슬롯 롤링 */}
                  <div className="bg-slate-900/70 rounded-xl border border-slate-700/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-500">슬롯 롤링 커미션</div>
                        <div className="text-lg font-bold text-blue-400 mt-0.5">₩{Math.floor(commissionWallet.slotRolling).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => handleConvertCommission('slot_rolling')}
                        disabled={commissionWallet.slotRolling <= 0 || convertingType !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-600/50 text-blue-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >
                        {convertingType === 'slot_rolling'
                          ? <span className="inline-block w-3 h-3 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
                          : <RotateCcw size={11} />}
                        보유머니 전환
                      </button>
                    </div>
                  </div>

                  {/* 루징 */}
                  <div className="bg-slate-900/70 rounded-xl border border-slate-700/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-500">루징 커미션</div>
                        <div className="text-lg font-bold text-amber-400 mt-0.5">₩{Math.floor(commissionWallet.losing).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => handleConvertCommission('losing')}
                        disabled={commissionWallet.losing <= 0 || convertingType !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/50 text-amber-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >
                        {convertingType === 'losing'
                          ? <span className="inline-block w-3 h-3 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
                          : <RotateCcw size={11} />}
                        보유머니 전환
                      </button>
                    </div>
                  </div>

                  {/* 전체 전환 */}
                  <div className="bg-gradient-to-r from-violet-900/40 to-purple-900/30 border border-violet-700/40 rounded-xl px-4 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-violet-400/80">전체 커미션 합계</div>
                      <div className="text-xl font-bold text-violet-200 mt-0.5">₩{Math.floor(totalCommission).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => handleConvertCommission('all')}
                      disabled={totalCommission <= 0 || convertingType !== null}
                      className="flex items-center gap-1.5 px-4 py-2 bg-violet-600/40 hover:bg-violet-600/60 border border-violet-600/60 text-violet-200 text-sm rounded-lg transition-colors disabled:opacity-40 font-medium"
                    >
                      {convertingType === 'all'
                        ? <span className="inline-block w-3.5 h-3.5 border-2 border-violet-300/30 border-t-violet-300 rounded-full animate-spin" />
                        : <RotateCcw size={13} />}
                      전체 전환
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {commissionHistory.length === 0 ? (
                    <div className="px-5 py-10 text-center text-slate-500 text-sm">전환 내역이 없습니다</div>
                  ) : (
                    <div className="divide-y divide-slate-700/40">
                      {commissionHistory.map(c => (
                        <div key={c.id} className="px-5 py-3.5 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                c.type === 'casino_rolling' ? 'bg-emerald-600/30 text-emerald-300' :
                                c.type === 'slot_rolling' ? 'bg-blue-600/30 text-blue-300' :
                                c.type === 'losing' ? 'bg-amber-600/30 text-amber-300' :
                                'bg-violet-600/30 text-violet-300'
                              }`}>
                                {COMMISSION_TYPE_LABEL[c.type] ?? c.type}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">{formatDate(c.converted_at)}</div>
                          </div>
                          <div className="text-sm font-bold text-yellow-300">+₩{c.amount.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 비밀번호 변경 모달 ── */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-slate-400" />
                <h3 className="text-slate-100">비밀번호 변경</h3>
              </div>
              <button onClick={() => setShowPwModal(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">현재 비밀번호</label>
                <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="현재 비밀번호"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">새 비밀번호</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호 (6자 이상)"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">새 비밀번호 확인</label>
                <input type="password" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} placeholder="비밀번호 재입력"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowPwModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
              <button onClick={handleChangePassword} disabled={changingPw}
                className="px-5 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {changingPw ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <KeyRound size={14} />}
                변경하기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
