import {
  Search, Download, RefreshCw, UserPlus, X, Eye, EyeOff, ChevronDown, ShieldOff,
  StickyNote, Users, ChevronRight, ArrowDownCircle, ArrowUpCircle,
  Pencil, Gift, History, LogIn, CreditCard, Settings2, Info,
  Loader2, AlertCircle, Coins, Copy, CheckCircle2, ListPlus,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../../utils/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

// ─── Memo helpers ─────────────────────────────────────────────────────────────

interface MemoEntry { content: string; at: string; by: string; }

function parseMemos(notes: string | null | undefined): MemoEntry[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) return parsed as MemoEntry[];
  } catch {}
  // 구형 plain-string 메모를 단일 항목으로 래핑
  return [{ content: notes, at: '', by: '' }];
}

function serializeMemos(memos: MemoEntry[]): string {
  return JSON.stringify(memos.slice(0, 10));
}

// ─── Constants / Helpers ──────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  suspended: { label: '정지',   className: 'bg-red-600/20 text-red-400 border border-red-600/30' },
  blocked:   { label: '차단',   className: 'bg-red-800/20 text-red-600 border border-red-800/30' },
  inactive:  { label: '비활성', className: 'bg-slate-600/20 text-slate-400 border border-slate-600/30' },
};

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

function isOnline(member: any): boolean {
  // is_online이 명시적으로 false이면 heartbeat와 무관하게 오프라인
  if (!member.is_online) return false;
  if (member.last_heartbeat_at) {
    return Date.now() - new Date(member.last_heartbeat_at).getTime() < ONLINE_THRESHOLD_MS;
  }
  // heartbeat가 없으면 last_login_at 기준으로 판단
  if (member.last_login_at) {
    return Date.now() - new Date(member.last_login_at).getTime() < ONLINE_THRESHOLD_MS;
  }
  return false;
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

interface Partner {
  id: string;
  username: string;
  name: string | null;
  role: string;
  depth: number;
}

// ─── MemoTooltip ─────────────────────────────────────────────────────────────

function MemoTooltip({ memo }: { memo: string | null | undefined }) {
  const latest = parseMemos(memo)[0];
  const [visible, setVisible] = useState(false);
  if (!latest) return null;
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.top + window.scrollY - 8, left: rect.left + window.scrollX + rect.width / 2 });
    setVisible(true);
  };
  const hide = () => { hideTimer.current = setTimeout(() => setVisible(false), 80); };

  return (
    <>
      <button ref={triggerRef} onMouseEnter={show} onMouseLeave={hide}
        className="inline-flex items-center justify-center w-4 h-4 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors flex-shrink-0"
        aria-label="메모 보기">
        <StickyNote size={11} />
      </button>
      {visible && createPortal(
        <div onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }} onMouseLeave={hide}
          style={{ position: 'absolute', top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
          className="pointer-events-auto">
          <div className="relative max-w-[260px] min-w-[120px] bg-slate-700 border border-slate-500/70 rounded-lg px-3 py-2.5 shadow-2xl">
            <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-slate-600">
              <StickyNote size={10} className="text-amber-400 flex-shrink-0" />
              <span className="text-amber-400 text-[10px] font-semibold tracking-wider uppercase">메모</span>
            </div>
            <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap break-words">{latest?.content ?? ''}</p>
            {latest?.at && (
              <p className="text-slate-500 text-[10px] mt-1">{new Date(latest.at).toLocaleString('ko-KR')}{latest.by ? ` · ${latest.by}` : ''}</p>
            )}
            <div className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-700 border-r border-b border-slate-500/70 rotate-45"
              style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── MemberDetailDrawer ───────────────────────────────────────────────────────

interface MergedBet {
  key: string;
  id: string;
  round_id: string | null;
  provider_name: string;
  game_name: string;
  game_type: string | null;
  bet_amount: number;
  win_amount: number;
  ggr: number;
  round_status: string | null;
  bet_time: string | null;
  settle_time: string | null;
  is_bonus: boolean;
  is_jackpot: boolean;
  api_type: string;
  beforeCash: number | null;
  afterCash: number | null;
}

function mergeBetRows(rawRows: any[]): MergedBet[] {
  const groups = new Map<string, { bet?: any; settle?: any; primary: any }>();
  for (const row of rawRows) {
    const gkey = row.round_id ? `${row.api_type}:${row.round_id}` : `solo:${row.id}`;
    if (!groups.has(gkey)) groups.set(gkey, { primary: row });
    const g = groups.get(gkey)!;
    if (row.round_status === 'betting') { g.bet = row; g.primary = row; }
    else { g.settle = row; if (!g.bet) g.primary = row; }
  }
  const merged: MergedBet[] = [];
  for (const [key, { bet, settle, primary }] of groups) {
    const betRaw    = ((bet?.raw_data    ?? {}) as Record<string, unknown>);
    const settleRaw = ((settle?.raw_data ?? {}) as Record<string, unknown>);
    const bet_amount = bet    ? Number(bet.bet_amount)    : 0;
    const win_amount = settle ? Number(settle.win_amount) : 0;
    merged.push({
      key,
      id: primary.id,
      round_id: primary.round_id,
      provider_name: primary.provider_name ?? '',
      game_name: primary.game_name ?? '-',
      game_type: primary.game_type ?? null,
      bet_amount,
      win_amount,
      ggr: bet_amount - win_amount,
      round_status: settle?.round_status ?? bet?.round_status ?? null,
      bet_time: bet?.bet_time ?? primary.bet_time,
      settle_time: settle?.settle_time ?? null,
      is_bonus: !!primary.is_bonus,
      is_jackpot: !!primary.is_jackpot,
      api_type: primary.api_type,
      beforeCash: (betRaw.beforeCash ?? settleRaw.beforeCash ?? null) as number | null,
      afterCash:  (settleRaw.afterCash ?? betRaw.afterCash ?? null) as number | null,
    });
  }
  return merged.sort((a, b) => {
    const ta = new Date((a.bet_time ?? a.settle_time) ?? 0).getTime();
    const tb = new Date((b.bet_time ?? b.settle_time) ?? 0).getTime();
    return tb - ta;
  });
}

type DrawerTab = 'info' | 'edit' | 'point' | 'bets' | 'transactions' | 'logs';

const DRAWER_TABS: { id: DrawerTab; label: string; icon: React.ReactNode }[] = [
  { id: 'info',         label: '기본정보',  icon: <Info size={13} /> },
  { id: 'edit',         label: '정보수정',  icon: <Pencil size={13} /> },
  { id: 'point',        label: '포인트',    icon: <Coins size={13} /> },
  { id: 'bets',         label: '베팅내역',  icon: <History size={13} /> },
  { id: 'transactions', label: '입출금',    icon: <CreditCard size={13} /> },
  { id: 'logs',         label: '접속로그',  icon: <LogIn size={13} /> },
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
      <AlertCircle size={24} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-10 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">불러오는 중...</span>
    </div>
  );
}

function MemberDetailDrawer({
  member, onClose, onMemberUpdated, currentUser,
}: {
  member: any;
  onClose: () => void;
  onMemberUpdated: (updated: any) => void;
  currentUser: any;
}) {
  const [tab, setTab] = useState<DrawerTab>('info');

  // 정보수정 state
  const [editName, setEditName] = useState(member.name ?? '');
  const [editPhone, setEditPhone] = useState(member.phone ?? '');
  const [editBankName, setEditBankName] = useState(member.metadata?.bank_name ?? '');
  const [editBankAccount, setEditBankAccount] = useState(member.metadata?.bank_account ?? '');
  const [newMemo, setNewMemo] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const [localMemos, setLocalMemos] = useState<MemoEntry[]>(() => parseMemos(member.notes));
  const [editPassword, setEditPassword] = useState('');
  const [editCasino, setEditCasino] = useState('');
  const [editSlot, setEditSlot] = useState('');
  const [editLosing, setEditLosing] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [showEditPw, setShowEditPw] = useState(false);
  const [memberSettings, setMemberSettings] = useState<any>(null);

  // 포인트 state
  const [pointType, setPointType] = useState<'give' | 'take'>('give');
  const [pointAmount, setPointAmount] = useState('');
  const [pointMemo, setPointMemo] = useState('');
  const [pointSaving, setPointSaving] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number>(Number(member.points ?? 0));

  // 베팅내역 state
  const [bets, setBets] = useState<MergedBet[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [betsLoaded, setBetsLoaded] = useState(false);

  // 입출금 state
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txLoaded, setTxLoaded] = useState(false);

  // 접속로그 state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  // 초기 로드: 커미션 설정
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from('partner_settings')
        .select('casino_rolling_rate, slot_rolling_rate, losing_rate')
        .eq('user_id', member.id)
        .maybeSingle();
      if (data) {
        setMemberSettings(data);
        setEditCasino(String(data.casino_rolling_rate ?? 0));
        setEditSlot(String(data.slot_rolling_rate ?? 0));
        setEditLosing(String(data.losing_rate ?? 0));
      } else {
        setEditCasino('0');
        setEditSlot('0');
        setEditLosing('0');
      }
    }
    loadSettings();
  }, [member.id]);

  // 탭 전환 시 데이터 로드
  useEffect(() => {
    if (tab === 'bets' && !betsLoaded) loadBets();
    if (tab === 'transactions' && !txLoaded) loadTransactions();
    if (tab === 'logs' && !logsLoaded) loadLogs();
  }, [tab]);

  const loadBets = async () => {
    setBetsLoading(true);
    try {
      const VENDOR_TABLES = [
        { table: 'betting_history_ace',    key: 'ace' },
        { table: 'betting_history_invest', key: 'invest' },
        { table: 'betting_history_honor',  key: 'honor' },
      ];

      const results = await Promise.all(
        VENDOR_TABLES.map(({ table, key }) =>
          supabase
            .from(table)
            .select('id, round_id, provider_name, game_name, game_type, bet_amount, win_amount, ggr, round_status, bet_time, settle_time, is_bonus, is_jackpot, raw_data')
            .eq('username', member.username)
            .or(`bet_time.not.is.null,settle_time.not.is.null`)
            .order('bet_time', { ascending: false, nullsFirst: false })
            .limit(100)
            .then(({ data }) => (data ?? []).map((r: any) => ({ ...r, api_type: key })))
        )
      );

      const allRaw = results.flat().sort((a, b) => {
        const ta = new Date((a.bet_time ?? a.settle_time) ?? 0).getTime();
        const tb = new Date((b.bet_time ?? b.settle_time) ?? 0).getTime();
        return tb - ta;
      });

      setBets(mergeBetRows(allRaw).slice(0, 50));
      setBetsLoaded(true);
    } catch {
      setBets([]);
    } finally {
      setBetsLoading(false);
    }
  };

  const loadTransactions = async () => {
    setTxLoading(true);
    try {
      // 수동 처리 내역
      const { data: manual } = await supabase
        .from('transaction_manual')
        .select('id, type, amount, reason, memo, created_at, processed_by')
        .eq('target_user_id', member.id)
        .order('created_at', { ascending: false })
        .limit(30);

      // 회원 신청 입출금 내역
      const { data: requested } = await supabase
        .from('transactions')
        .select('id, type, amount, status, memo, created_at')
        .eq('user_id', member.id)
        .order('created_at', { ascending: false })
        .limit(30);

      const combined = [
        ...(manual ?? []).map((r: any) => ({ ...r, source: '관리자' })),
        ...(requested ?? []).map((r: any) => ({ ...r, source: '회원신청' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);

      setTxHistory(combined);
      setTxLoaded(true);
    } catch {
      setTxHistory([]);
    } finally {
      setTxLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const { data } = await supabase
        .from('access_logs')
        .select('id, action, ip_address, user_agent, created_at, extra')
        .eq('user_id', member.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setLogs(data ?? []);
      setLogsLoaded(true);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleAddMemo = async () => {
    if (!newMemo.trim()) { toast.error('메모 내용을 입력해주세요'); return; }
    setMemoSaving(true);
    try {
      const entry: MemoEntry = {
        content: newMemo.trim(),
        at: new Date().toISOString(),
        by: currentUser?.username ?? currentUser?.name ?? '',
      };
      const updated = [entry, ...localMemos].slice(0, 10);
      const serialized = serializeMemos(updated);
      const { error } = await supabase.from('users').update({ notes: serialized }).eq('id', member.id);
      if (error) { toast.error('메모 저장 실패: ' + error.message); return; }
      setLocalMemos(updated);
      setNewMemo('');
      onMemberUpdated({ ...member, notes: serialized });
      toast.success('메모가 추가되었습니다');
    } finally {
      setMemoSaving(false);
    }
  };

  const handleDeleteMemo = async (idx: number) => {
    const updated = localMemos.filter((_, i) => i !== idx);
    const serialized = updated.length > 0 ? serializeMemos(updated) : null;
    const { error } = await supabase.from('users').update({ notes: serialized }).eq('id', member.id);
    if (error) { toast.error('삭제 실패: ' + error.message); return; }
    setLocalMemos(updated);
    onMemberUpdated({ ...member, notes: serialized });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) { toast.error('닉네임을 입력해주세요'); return; }
    setEditSaving(true);
    try {
      // 기본 정보 업데이트
      const { error: userErr } = await supabase.from('users').update({
        name: editName.trim() || null,
        phone: editPhone.trim() || null,
        metadata: {
          ...(member.metadata ?? {}),
          bank_name: editBankName.trim() || '',
          bank_account: editBankAccount.trim() || '',
        },
      }).eq('id', member.id);
      if (userErr) { toast.error('수정 실패: ' + userErr.message); return; }

      // 비밀번호 변경
      if (editPassword) {
        const { error: pwErr } = await supabase.rpc('admin_set_password', {
          p_user_id: member.id,
          p_new_password: editPassword,
        });
        if (pwErr) { toast.error('비밀번호 변경 실패: ' + pwErr.message); return; }
      }

      // 커미션 설정
      await supabase.from('partner_settings').upsert({
        user_id: member.id,
        casino_rolling_rate: parseFloat(editCasino) || 0,
        slot_rolling_rate: parseFloat(editSlot) || 0,
        losing_rate: parseFloat(editLosing) || 0,
      }, { onConflict: 'user_id' });

      onMemberUpdated({
        ...member,
        name: editName.trim() || null,
        phone: editPhone.trim() || null,
        metadata: {
          ...(member.metadata ?? {}),
          bank_name: editBankName.trim() || '',
          bank_account: editBankAccount.trim() || '',
        },
      });
      toast.success('회원 정보가 수정되었습니다');
      setEditPassword('');
    } finally {
      setEditSaving(false);
    }
  };

  const handlePointAction = async () => {
    const amount = parseInt(pointAmount.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('올바른 금액을 입력하세요'); return; }
    if (pointType === 'take' && amount > currentPoints) { toast.error('보유 포인트보다 많습니다'); return; }
    setPointSaving(true);
    try {
      const delta = pointType === 'give' ? amount : -amount;
      const newPoints = currentPoints + delta;
      const { error } = await supabase.from('users').update({ points: newPoints }).eq('id', member.id);
      if (error) { toast.error('포인트 처리 실패: ' + error.message); return; }

      // 포인트 내역 기록
      await supabase.from('point_history').insert({
        user_id: member.id,
        type: pointType === 'give' ? 'admin_give' : 'admin_take',
        amount: pointType === 'give' ? amount : -amount,
        balance_after: newPoints,
        memo: pointMemo || null,
        processed_by: currentUser?.id,
      }).select();

      setCurrentPoints(newPoints);
      onMemberUpdated({ ...member, points: newPoints });
      toast.success(`포인트 ${pointType === 'give' ? '지급' : '회수'} 완료: ${amount.toLocaleString()}P`);
      setPointAmount('');
      setPointMemo('');
    } finally {
      setPointSaving(false);
    }
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDateFull = (d: string) => d ? new Date(d).toLocaleString('ko-KR') : '-';

  return createPortal(
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* 드로어 패널 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${member.status === 'active' && isOnline(member) ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{member.username}</span>
                {member.name && <span className="text-slate-400 text-sm">({member.name})</span>}
                {member.notes && <MemoTooltip memo={member.notes} />}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                <span>보유금 <span className="text-yellow-300">₩{Number(member.balance ?? 0).toLocaleString()}</span></span>
                <span>포인트 <span className="text-emerald-300">{currentPoints.toLocaleString()}P</span></span>
                {member.parent && (
                  <span>소속 <span className="text-blue-300">[{ROLE_LABEL[member.parent.role] ?? member.parent.role}] {member.parent.username}</span></span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        {/* 탭 바 */}
        <div className="flex border-b border-slate-700 bg-slate-800/50 flex-shrink-0 overflow-x-auto">
          {DRAWER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">

          {/* ── 기본정보 ── */}
          {tab === 'info' && (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['아이디', member.username],
                  ['이름', member.name || '-'],
                  ['연락처', member.phone || '-'],
                  ['상태', member.status === 'active' ? '활성' : (STATUS_MAP[member.status]?.label ?? member.status)],
                  ['접속', member.status === 'active' ? (isOnline(member) ? '온라인' : '오프라인') : '-'],
                  ['보유금', `₩${Number(member.balance ?? 0).toLocaleString()}`],
                  ['포인트', `${currentPoints.toLocaleString()}P`],
                  ['은행명', member.metadata?.bank_name || '-'],
                  ['계좌번호', member.metadata?.bank_account || '-'],
                  ['가입일', fmtDateFull(member.created_at)],
                  ['최근 접속', fmtDateFull(member.last_login_at)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">{k}</p>
                    <p className="text-sm text-slate-200 font-medium">{v}</p>
                  </div>
                ))}
              </div>
              {memberSettings && (
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Settings2 size={11} />커미션 설정</p>
                  <div className="flex gap-4 text-sm">
                    <span>카지노 <span className="text-blue-300">{memberSettings.casino_rolling_rate ?? 0}%</span></span>
                    <span>슬롯 <span className="text-purple-300">{memberSettings.slot_rolling_rate ?? 0}%</span></span>
                    <span>루징 <span className="text-green-300">{memberSettings.losing_rate ?? 0}%</span></span>
                  </div>
                </div>
              )}
              {(() => {
                const memos = parseMemos(member.notes);
                if (memos.length === 0) return null;
                return (
                  <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-amber-500 flex items-center gap-1"><StickyNote size={11} />메모 이력</p>
                    {memos.slice(0, 10).map((m, i) => (
                      <div key={i} className={`${i === 0 ? '' : 'border-t border-amber-800/30 pt-2'}`}>
                        <p className="text-sm text-amber-200 whitespace-pre-wrap">{m.content}</p>
                        {(m.at || m.by) && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            {m.by && <span>{m.by}</span>}
                            {m.by && m.at && <span> · </span>}
                            {m.at && <span>{new Date(m.at).toLocaleString('ko-KR')}</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── 정보수정 ── */}
          {tab === 'edit' && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">이름</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    placeholder="실명"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">연락처</label>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">은행명</label>
                  <input value={editBankName} onChange={e => setEditBankName(e.target.value)}
                    placeholder="예) 국민은행"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">계좌번호</label>
                  <input value={editBankAccount} onChange={e => setEditBankAccount(e.target.value)}
                    placeholder="예) 123-456-789012"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <p className="text-xs text-slate-500 mb-3 flex items-center gap-1"><Settings2 size={11} />커미션 설정</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '카지노 롤링(%)', val: editCasino, set: setEditCasino },
                    { label: '슬롯 롤링(%)',   val: editSlot,   set: setEditSlot },
                    { label: '루징률(%)',       val: editLosing, set: setEditLosing },
                  ].map(({ label, val, set }) => (
                    <div key={label}>
                      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                      <input type="number" min="0" max="100" step="0.1" value={val}
                        onChange={e => set(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <label className="block text-xs text-slate-400 mb-1.5">새 비밀번호 <span className="text-slate-600">(변경 시만 입력)</span></label>
                <div className="relative">
                  <input type={showEditPw ? 'text' : 'password'} value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="변경하지 않으면 비워두세요"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 pr-9 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => setShowEditPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showEditPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4 space-y-3">
                <p className="text-xs text-slate-400 flex items-center gap-1"><StickyNote size={11} />메모 관리</p>
                <div className="flex gap-2">
                  <textarea
                    value={newMemo}
                    onChange={e => setNewMemo(e.target.value)}
                    rows={2}
                    placeholder="새 메모 입력..."
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                  />
                  <button
                    onClick={handleAddMemo}
                    disabled={memoSaving || !newMemo.trim()}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 self-start mt-0.5"
                  >
                    {memoSaving ? <Loader2 size={12} className="animate-spin" /> : <StickyNote size={12} />}
                    추가
                  </button>
                </div>
                {localMemos.length > 0 && (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {localMemos.map((m, i) => (
                      <div key={i} className="flex items-start gap-2 bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-amber-200 whitespace-pre-wrap break-words">{m.content}</p>
                          {(m.by || m.at) && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {m.by && <span>{m.by}</span>}
                              {m.by && m.at && <span> · </span>}
                              {m.at && <span>{new Date(m.at).toLocaleString('ko-KR')}</span>}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteMemo(i)}
                          className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {localMemos.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-2">메모 없음</p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={handleEditSave} disabled={editSaving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                  {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                  {editSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}

          {/* ── 포인트 ── */}
          {tab === 'point' && (
            <div className="p-5 space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">현재 보유 포인트</p>
                  <p className="text-2xl font-bold text-emerald-300">{currentPoints.toLocaleString()}<span className="text-base font-normal ml-1 text-emerald-500">P</span></p>
                </div>
                <Coins size={36} className="text-emerald-700/50" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPointType('give')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm transition-colors ${
                    pointType === 'give' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}>
                  <Gift size={15} />포인트 지급
                </button>
                <button onClick={() => setPointType('take')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm transition-colors ${
                    pointType === 'take' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}>
                  <ArrowUpCircle size={15} />포인트 회수
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">금액 (포인트)</label>
                <input type="text" inputMode="numeric" value={pointAmount}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setPointAmount(raw ? parseInt(raw).toLocaleString() : '');
                  }}
                  placeholder="0"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                <div className="flex gap-1.5 mt-2">
                  {[1000, 5000, 10000, 50000].map(v => (
                    <button key={v} type="button"
                      onClick={() => setPointAmount(((parseInt(pointAmount.replace(/,/g, ''), 10) || 0) + v).toLocaleString())}
                      className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors">
                      +{v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {pointAmount && (
                <div className={`rounded-lg p-3 text-sm ${pointType === 'give' ? 'bg-emerald-900/20 border border-emerald-700/30' : 'bg-orange-900/20 border border-orange-700/30'}`}>
                  <span className="text-slate-400">처리 후 포인트: </span>
                  <span className={`font-mono font-medium ${pointType === 'give' ? 'text-emerald-300' : 'text-orange-300'}`}>
                    {(currentPoints + (pointType === 'give' ? 1 : -1) * (parseInt(pointAmount.replace(/,/g, '') || '0', 10))).toLocaleString()}P
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
                <input value={pointMemo} onChange={e => setPointMemo(e.target.value)}
                  placeholder="처리 사유"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="flex justify-end">
                <button onClick={handlePointAction} disabled={pointSaving || !pointAmount}
                  className={`flex items-center gap-2 px-5 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ${pointType === 'give' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-orange-600 hover:bg-orange-500'}`}>
                  {pointSaving ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
                  {pointType === 'give' ? '지급' : '회수'} 확정
                </button>
              </div>
            </div>
          )}

          {/* ── 베팅내역 ── */}
          {tab === 'bets' && (
            <div className="p-4">
              {betsLoading ? <LoadingState /> : bets.length === 0 ? <EmptyState message="베팅 내역이 없습니다" /> : (
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700">
                        {['게임사', '게임명', '게임유형', '보유금 흐름', 'GGR', '상태', '시간'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[11px] text-slate-500 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map(b => {
                        const won = b.win_amount > 0;
                        const isSettled = b.round_status !== 'betting' && b.round_status !== null;
                        return (
                          <tr key={b.key} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{b.provider_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-200 max-w-[130px]">
                              <div className="truncate">{b.game_name}</div>
                              {b.is_jackpot && <span className="text-[9px] text-yellow-400 bg-yellow-900/30 px-1 py-0.5 rounded mr-0.5">JP</span>}
                              {b.is_bonus   && <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1 py-0.5 rounded">B</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{b.game_type || '-'}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
                                {b.beforeCash !== null && (
                                  <span className="text-slate-400">이전 <span className="text-yellow-300">{Number(b.beforeCash).toLocaleString()}</span></span>
                                )}
                                {b.bet_amount > 0 && (
                                  <span className="text-slate-500">베팅 <span className="text-red-300">-{b.bet_amount.toLocaleString()}</span></span>
                                )}
                                {(b.win_amount > 0 || isSettled) && (
                                  <span className="text-slate-500">당첨 <span className={b.win_amount > 0 ? 'text-green-300' : 'text-slate-600'}>
                                    {b.win_amount > 0 ? `+${b.win_amount.toLocaleString()}` : '0'}
                                  </span></span>
                                )}
                                {b.afterCash !== null && (
                                  <span className="text-slate-500">현재 <span className="text-emerald-300">{Number(b.afterCash).toLocaleString()}</span></span>
                                )}
                              </div>
                            </td>
                            <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${b.ggr < 0 ? 'text-red-400' : b.ggr > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                              {isSettled ? (b.ggr === 0 ? '0' : `${b.ggr > 0 ? '+' : ''}${b.ggr.toLocaleString()}`) : '-'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {won
                                ? <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-900/40 text-green-300">당첨</span>
                                : isSettled
                                  ? <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-900/20 text-red-400">패</span>
                                  : <span className="text-slate-600">-</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-[11px]">
                              {fmtDate(b.bet_time ?? b.settle_time ?? '')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── 입출금 내역 ── */}
          {tab === 'transactions' && (
            <div className="p-4">
              {txLoading ? <LoadingState /> : txHistory.length === 0 ? <EmptyState message="입출금 내역이 없습니다" /> : (
                <div className="space-y-1">
                  <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
                    <span>일시</span>
                    <span>구분</span>
                    <span className="text-right">금액</span>
                    <span>출처</span>
                    <span>상태/메모</span>
                  </div>
                  {txHistory.map(tx => (
                    <div key={tx.id} className="grid grid-cols-5 gap-2 px-3 py-2.5 text-xs border-b border-slate-800 hover:bg-slate-800/50">
                      <span className="text-slate-500">{fmtDate(tx.created_at)}</span>
                      <span className={`font-medium ${tx.type === 'deposit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {tx.type === 'deposit' ? '충전' : '환전'}
                      </span>
                      <span className="text-right text-slate-200">₩{Number(tx.amount ?? 0).toLocaleString()}</span>
                      <span className="text-slate-400">{tx.source ?? '-'}</span>
                      <span className="text-slate-500 truncate">{tx.status ?? tx.memo ?? tx.reason ?? '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 접속 로그 ── */}
          {tab === 'logs' && (
            <div className="p-4">
              {logsLoading ? <LoadingState /> : logs.length === 0 ? (
                <EmptyState message="접속 로그가 없습니다" />
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-slate-500 border-b border-slate-700">
                    <span>일시</span>
                    <span>액션</span>
                    <span>IP</span>
                    <span>기기/기타</span>
                  </div>
                  {logs.map(log => (
                    <div key={log.id} className="grid grid-cols-4 gap-2 px-3 py-2.5 text-xs border-b border-slate-800 hover:bg-slate-800/50">
                      <span className="text-slate-500">{fmtDate(log.created_at)}</span>
                      <span className={`font-medium ${log.action === 'login' ? 'text-blue-400' : log.action === 'logout' ? 'text-slate-400' : 'text-slate-300'}`}>
                        {log.action ?? '-'}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{log.ip_address ?? '-'}</span>
                      <span className="text-slate-500 truncate" title={log.user_agent ?? ''}>
                        {log.user_agent ? log.user_agent.slice(0, 30) + (log.user_agent.length > 30 ? '…' : '') : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Default form ─────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
  username: '', nickname: '', phone: '', password: '', passwordConfirm: '',
  parentId: '', bankName: '', bankAccount: '',
  casinoRolling: '0.0', slotRolling: '0.0', losingRate: '0.0', notes: '',
};

// ─── MemberList ───────────────────────────────────────────────────────────────

export default function MemberList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // 상세 드로어
  const [detailMember, setDetailMember] = useState<any | null>(null);

  // 충전/환전 모달
  const [txModal, setTxModal] = useState<{ member: any; type: 'deposit' | 'withdrawal' } | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txMemo, setTxMemo] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  // 차단 사유 모달
  const BLOCK_REASONS = ['불법 환전 의심', '다중 계정 사용', '부정 게임 행위', '욕설 / 민원 유발', '사기 의심'];
  const [blockTarget, setBlockTarget] = useState<{ id: string; username: string } | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockCustom, setBlockCustom] = useState('');
  const [blocking, setBlocking] = useState(false);

  // 회원 생성 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'single' | 'bulk'>('single');
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  // 벌크 생성 state
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkStart, setBulkStart] = useState('001');
  const [bulkEnd, setBulkEnd] = useState('100');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkShowPw, setBulkShowPw] = useState(false);
  const [bulkParentId, setBulkParentId] = useState('');
  const [bulkCasino, setBulkCasino] = useState('0.0');
  const [bulkSlot, setBulkSlot] = useState('0.0');
  const [bulkLosing, setBulkLosing] = useState('0.0');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [bulkParentSearch, setBulkParentSearch] = useState('');
  const [bulkParentOpen, setBulkParentOpen] = useState(false);
  const bulkParentRef = useRef<HTMLDivElement>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPwC, setShowPwC] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const partnerRef = useRef<HTMLDivElement>(null);

  // 파트너 필터
  const [partnerFilter, setPartnerFilter] = useState('');
  const [filterPartners, setFilterPartners] = useState<Partner[]>([]);
  const [filterPartnerOpen, setFilterPartnerOpen] = useState(false);
  const [filterPartnerSearch, setFilterPartnerSearch] = useState('');
  const filterPartnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadMembers(); }, [page, statusFilter, partnerFilter]);

  useEffect(() => { loadFilterPartners(); }, []);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      // heartbeat가 2분 이상 없는 온라인 회원 → DB is_online false로 정리
      setMembers(prev => {
        const stale = prev.filter(m => {
          if (!m.is_online) return false;
          if (m.last_heartbeat_at) {
            return Date.now() - new Date(m.last_heartbeat_at).getTime() >= ONLINE_THRESHOLD_MS;
          }
          // heartbeat가 null인 경우: last_login_at 기준으로 스탈 판단
          if (m.last_login_at) {
            return Date.now() - new Date(m.last_login_at).getTime() >= ONLINE_THRESHOLD_MS;
          }
          return true; // 시간 정보가 아예 없는데 is_online=true면 정리 대상
        });
        if (stale.length > 0) {
          // RLS 우회를 위해 service role 기반 edge function으로 오프라인 처리
          // sendBeacon은 커스텀 헤더 불가 → fetch로 apikey 헤더 포함하여 호출
          stale.forEach(m => {
            fetch(`${supabaseUrl}/functions/v1/set-user-offline`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
              },
              body: JSON.stringify({ userId: m.id }),
            }).catch(() => {});
          });
        }
        return prev.map(m => stale.some(s => s.id === m.id) ? { ...m, is_online: false } : m);
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('member-online-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: 'role=eq.member' }, (payload) => {
        setMembers((prev) => prev.map((m) => m.id === payload.new.id
          ? { ...m, is_online: payload.new.is_online, last_heartbeat_at: payload.new.last_heartbeat_at, status: payload.new.status }
          : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (partnerRef.current && !partnerRef.current.contains(e.target as Node)) setPartnerOpen(false);
      if (filterPartnerRef.current && !filterPartnerRef.current.contains(e.target as Node)) setFilterPartnerOpen(false);
      if (bulkParentRef.current && !bulkParentRef.current.contains(e.target as Node)) setBulkParentOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadMembers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('id, username, name, phone, notes, role, status, is_online, last_heartbeat_at, balance, points, created_at, last_login_at, hierarchy_path, parent_id, metadata, parent:parent_id(username, name, role)', { count: 'exact' })
        .eq('role', 'member')
        .neq('status', 'blocked')
        .order('created_at', { ascending: false })
        .range((page - 1) * LIMIT, page * LIMIT - 1);

      if (statusFilter) query = query.eq('status', statusFilter);
      if (partnerFilter) {
        query = query.eq('parent_id', partnerFilter);
      } else if (user && user.level > 1 && user.hierarchyPath?.length) {
        query = query.contains('hierarchy_path', [user.id]);
      }

      const { data, error, count } = await query;
      if (error) {
        toast.error('회원 목록 조회 실패: ' + error.message);
      } else {
        setMembers(data ?? []);
        setTotal(count ?? 0);
      }
    } catch {
      toast.error('서버 연결 오류');
    } finally {
      setLoading(false);
    }
  };

  const loadFilterPartners = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, username, name, role, depth')
        .in('role', ['system_admin', 'operator', 'head_office', 'sub_office', 'distributor', 'store'])
        .order('depth', { ascending: true })
        .order('username', { ascending: true });
      if (user && user.level > 1 && user.hierarchyPath?.length) {
        query = query.contains('hierarchy_path', [user.id]);
      }
      const { data } = await query;
      const list = data ?? [];
      if (user && !list.find((p: any) => p.id === user.id)) {
        list.unshift({ id: user.id, username: user.username, name: user.name ?? null, role: user.role, depth: user.level - 1 });
      }
      setFilterPartners(list);
    } catch { }
  };

  const loadPartners = async () => {
    setLoadingPartners(true);
    try {
      let query = supabase
        .from('users')
        .select('id, username, name, role, depth')
        .in('role', ['system_admin', 'operator', 'head_office', 'sub_office', 'distributor', 'store'])
        .eq('status', 'active')
        .order('depth', { ascending: true })
        .order('username', { ascending: true });
      if (user && user.level > 1 && user.hierarchyPath?.length) {
        query = query.contains('hierarchy_path', [user.id]);
      }
      const { data, error } = await query;
      if (error) { toast.error('파트너 목록 조회 실패: ' + error.message); }
      else {
        const list = data ?? [];
        if (user && !list.find((p: any) => p.id === user.id)) {
          list.unshift({ id: user.id, username: user.username, name: user.name ?? null, role: user.role, depth: user.level - 1 });
        }
        setPartners(list);
      }
    } catch { toast.error('서버 연결 오류'); }
    finally { setLoadingPartners(false); }
  };

  const openCreateModal = () => {
    setForm({ ...DEFAULT_FORM });
    setPartnerSearch('');
    setShowPw(false);
    setShowPwC(false);
    setCreateMode('single');
    setBulkPrefix('');
    setBulkStart('001');
    setBulkEnd('100');
    setBulkPassword('');
    setBulkParentId('');
    setBulkCasino('0.0');
    setBulkSlot('0.0');
    setBulkLosing('0.0');
    setBulkProgress(null);
    setBulkParentSearch('');
    setShowCreateModal(true);
    loadPartners();
  };

  // 벌크 생성용 아이디 목록 계산
  const getBulkIds = (): string[] => {
    const prefix = bulkPrefix.trim();
    const startN = parseInt(bulkStart, 10);
    const endN = parseInt(bulkEnd, 10);
    if (!prefix || isNaN(startN) || isNaN(endN) || startN > endN || endN - startN > 999) return [];
    const pad = bulkStart.length; // 앞 자리 수
    const ids: string[] = [];
    for (let i = startN; i <= endN; i++) {
      ids.push(prefix + String(i).padStart(pad, '0'));
    }
    return ids;
  };

  const handleBulkCreate = async () => {
    const ids = getBulkIds();
    if (ids.length === 0) { toast.error('생성할 아이디 목록이 없습니다.'); return; }
    if (!bulkPassword || bulkPassword.length < 6) { toast.error('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (!bulkParentId) { toast.error('소속 파트너를 선택해주세요.'); return; }
    setBulkSaving(true);
    setBulkProgress({ done: 0, total: ids.length, errors: [] });
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const username = ids[i];
      const { error } = await supabase.rpc('create_member_with_details', {
        p_username:       username,
        p_password:       bulkPassword,
        p_name:           null,
        p_parent_id:      bulkParentId,
        p_bank_name:      null,
        p_bank_account:   null,
        p_casino_rolling: parseFloat(bulkCasino) || 0,
        p_slot_rolling:   parseFloat(bulkSlot) || 0,
        p_losing_rate:    parseFloat(bulkLosing) || 0,
        p_notes:          null,
      });
      if (error) {
        const msg = error.message.includes('duplicate') || error.message.includes('unique')
          ? `${username}: 이미 존재하는 아이디`
          : `${username}: ${error.message}`;
        errors.push(msg);
      }
      setBulkProgress({ done: i + 1, total: ids.length, errors: [...errors] });
    }
    setBulkSaving(false);
    const success = ids.length - errors.length;
    if (errors.length === 0) {
      toast.success(`${success}개 회원이 생성되었습니다.`);
      setShowCreateModal(false);
    } else {
      toast.success(`${success}개 생성 완료 (${errors.length}개 실패)`);
    }
    loadMembers();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (newStatus === 'blocked') {
      const member = members.find((m) => m.id === id);
      setBlockTarget({ id, username: member?.username ?? id });
      setBlockReason('');
      setBlockCustom('');
      return;
    }
    try {
      const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', id);
      if (error) { toast.error('상태 변경 실패: ' + error.message); }
      else {
        setMembers((prev) => prev.map((m) => m.id === id ? { ...m, status: newStatus } : m));
        toast.success('상태가 변경되었습니다');
      }
    } catch { toast.error('서버 오류'); }
  };

  const handleBlockConfirm = async () => {
    if (!blockTarget) return;
    const finalReason = blockReason === '__custom__' ? blockCustom.trim() : blockReason;
    if (!finalReason) { toast.error('차단 사유를 선택하거나 입력해주세요.'); return; }
    setBlocking(true);
    try {
      const { error } = await supabase.from('users').update({ status: 'blocked', block_reason: finalReason }).eq('id', blockTarget.id);
      if (error) { toast.error('차단 실패: ' + error.message); }
      else {
        setMembers((prev) => prev.filter((m) => m.id !== blockTarget.id));
        setTotal((t) => t - 1);
        toast.success(`"${blockTarget.username}" 차단 처리되었습니다.`);
        setBlockTarget(null);
        setTimeout(() => navigate('/admin/members/black'), 800);
      }
    } catch { toast.error('서버 오류'); }
    finally { setBlocking(false); }
  };

  const validateForm = () => {
    if (!form.username.trim())       { toast.error('아이디를 입력해주세요.'); return false; }
    if (form.username.length < 4)    { toast.error('아이디는 4자 이상이어야 합니다.'); return false; }
    if (!form.password)              { toast.error('비밀번호를 입력해주세요.'); return false; }
    if (form.password.length < 6)   { toast.error('비밀번호는 6자 이상이어야 합니다.'); return false; }
    if (form.password !== form.passwordConfirm) { toast.error('비밀번호가 일치하지 않습니다.'); return false; }
    if (!form.parentId)              { toast.error('파트너 소속을 선택해주세요.'); return false; }
    for (const [key, label] of [['casinoRolling', '카지노 롤링'], ['slotRolling', '슬롯 롤링'], ['losingRate', '루징률']] as [keyof typeof form, string][]) {
      const v = parseFloat(form[key]);
      if (isNaN(v) || v < 0 || v > 100) { toast.error(`${label}은 0~100 사이의 숫자여야 합니다.`); return false; }
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('create_member_with_details', {
        p_username:       form.username.trim(),
        p_password:       form.password,
        p_name:           form.nickname.trim() || null,
        p_parent_id:      form.parentId,
        p_bank_name:      form.bankName.trim()    || null,
        p_bank_account:   form.bankAccount.trim() || null,
        p_casino_rolling: parseFloat(form.casinoRolling) || 0,
        p_slot_rolling:   parseFloat(form.slotRolling)   || 0,
        p_losing_rate:    parseFloat(form.losingRate)    || 0,
        p_notes:          form.notes.trim()
          ? serializeMemos([{ content: form.notes.trim(), at: new Date().toISOString(), by: currentUser?.username ?? '' }])
          : null,
      });
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('이미 사용 중인 아이디입니다.');
        } else {
          toast.error('회원 생성 실패: ' + error.message);
        }
        return;
      }
      // phone은 RPC에 없으므로 별도 업데이트
      if (form.phone.trim()) {
        await supabase.from('users').update({ phone: form.phone.trim() }).eq('username', form.username.trim()).eq('role', 'member');
      }
      toast.success(`회원 "${form.username}"이(가) 생성되었습니다.`);
      setShowCreateModal(false);
      loadMembers();
    } catch (e: any) {
      toast.error('서버 오류: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openTxModal = (member: any, type: 'deposit' | 'withdrawal') => {
    setTxModal({ member, type });
    setTxAmount('');
    setTxMemo('');
  };

  const handleTxConfirm = async () => {
    if (!txModal || !user) return;
    const amount = parseInt(txAmount.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) { toast.error('금액을 올바르게 입력해주세요.'); return; }
    if (txModal.type === 'withdrawal' && amount > Number(txModal.member.balance ?? 0)) {
      toast.error('회원 보유금액보다 많은 금액은 환전할 수 없습니다.'); return;
    }
    // 충전 시: 회원 직속 파트너(매장) 보유금 확인
    if (txModal.type === 'deposit' && txModal.member.parent_id) {
      const { data: directPartner } = await supabase
        .from('users').select('username, balance').eq('id', txModal.member.parent_id).single();
      if (directPartner && amount > Number(directPartner.balance ?? 0)) {
        toast.error(`직속 파트너(${directPartner.username})의 보유금이 부족합니다. 현재 보유금: ₩${Number(directPartner.balance ?? 0).toLocaleString()}`);
        return;
      }
    }
    setTxSaving(true);
    try {
      const txNo = `MN${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const delta = txModal.type === 'deposit' ? amount : -amount;
      const newBalance = Number(txModal.member.balance ?? 0) + delta;

      const { error: txErr } = await supabase.from('transaction_manual').insert({
        transaction_no: txNo,
        target_user_id: txModal.member.id,
        target_role: 'member',
        processed_by: user.id,
        processor_role: user.role,
        type: txModal.type,
        amount,
        affects_settlement: true,
        reason: txModal.type === 'deposit' ? '관리자 충전' : '관리자 환전',
        memo: txMemo || null,
      });
      if (txErr) throw new Error(txErr.message);

      const { error: balErr } = await supabase.from('users').update({ balance: newBalance }).eq('id', txModal.member.id);
      if (balErr) throw new Error(balErr.message);

      // 직속 파트너 보유금 조정: 충전이면 파트너에서 차감, 환전이면 파트너에게 지급
      if (txModal.member.parent_id) {
        const partnerDelta = txModal.type === 'deposit' ? -amount : amount;
        const { data: partnerData } = await supabase.from('users').select('balance').eq('id', txModal.member.parent_id).single();
        if (partnerData) {
          await supabase.from('users').update({ balance: Number(partnerData.balance ?? 0) + partnerDelta }).eq('id', txModal.member.parent_id);
        }
      }

      setMembers(prev => prev.map(m => m.id === txModal.member.id ? { ...m, balance: newBalance } : m));
      toast.success(`${txModal.member.username} 회원 ${txModal.type === 'deposit' ? '충전' : '환전'} 완료: ₩${amount.toLocaleString()}`);
      setTxModal(null);
    } catch (e: any) {
      toast.error('처리 실패: ' + e.message);
    } finally {
      setTxSaving(false);
    }
  };

  const displayMembers = members.filter((m) => {
    const term = searchTerm.toLowerCase();
    return !term || m.username?.toLowerCase().includes(term) || m.name?.toLowerCase().includes(term);
  });

  const totalPages = Math.ceil(total / LIMIT);
  const selectedPartner = partners.find(p => p.id === form.parentId);
  const filteredPartners = partners.filter(p => {
    if (!partnerSearch) return true;
    const q = partnerSearch.toLowerCase();
    return p.username.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q) || ROLE_LABEL[p.role]?.includes(q);
  });
  const indentPrefix = (depth: number) => ' '.repeat(depth * 3);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">회원 리스트</h2>
          <p className="text-slate-400 text-sm mt-1">
            {(() => {
              if (partnerFilter === user?.id) return '내 직속 회원만 표시됩니다';
              if (partnerFilter) {
                const fp = filterPartners.find(p => p.id === partnerFilter);
                return fp ? `[${ROLE_LABEL[fp.role] ?? fp.role}] ${fp.username} 직속 회원만 표시됩니다` : '파트너 필터 적용 중';
              }
              return user?.level === 1 ? '전체 회원 목록' : `내 하위 조직(${user?.levelName} 기준) 소속 회원만 표시됩니다`;
            })()}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadMembers} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors">
            <RefreshCw size={16} />새로고침
          </button>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition-colors">
            <UserPlus size={16} />회원 생성
          </button>
          {user?.role === 'system_admin' && (
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              <Download size={18} />엑셀 다운로드
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="회원명, 아이디 검색..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-700 text-slate-200 placeholder:text-slate-400 pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500">
            <option value="">전체 상태</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="inactive">비활성</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
            <Users size={13} /><span>소속 파트너</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setPartnerFilter(''); setPage(1); }}
              className={`px-3 py-1 rounded-md text-xs border transition-colors ${partnerFilter === '' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
              전체
            </button>
            {user && user.level > 1 && (
              <button onClick={() => { setPartnerFilter(user.id); setPage(1); }}
                className={`px-3 py-1 rounded-md text-xs border transition-colors ${partnerFilter === user.id ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
                내 직속 회원
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-600 flex-shrink-0">또는</span>
          <div ref={filterPartnerRef} className="relative flex-1 max-w-xs">
            {(() => {
              const selected = filterPartners.find(p => p.id === partnerFilter);
              const isCustom = partnerFilter && partnerFilter !== user?.id;
              return (
                <button type="button" onClick={() => setFilterPartnerOpen(v => !v)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${isCustom ? 'bg-violet-600/20 border-violet-500/60 text-violet-300' : 'bg-slate-800/50 border-slate-700 text-slate-600 hover:border-slate-600 hover:text-slate-400'}`}>
                  <span className="truncate">
                    {isCustom && selected ? `[${ROLE_LABEL[selected.role] ?? selected.role}] ${selected.username}${selected.name ? ` (${selected.name})` : ''}` : '파트너 직접 선택...'}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isCustom && (
                      <span role="button" onClick={(e) => { e.stopPropagation(); setPartnerFilter(''); setPage(1); }} className="text-violet-400 hover:text-white transition-colors">
                        <X size={12} />
                      </span>
                    )}
                    <ChevronDown size={12} className={`transition-transform ${filterPartnerOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              );
            })()}
            {filterPartnerOpen && (
              <div className="absolute z-30 top-full mt-1 w-full min-w-[260px] bg-slate-900 border border-slate-600 rounded-lg shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-slate-700">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input autoFocus value={filterPartnerSearch} onChange={e => setFilterPartnerSearch(e.target.value)}
                      placeholder="파트너 검색..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filterPartners.filter(p => {
                    if (!filterPartnerSearch) return true;
                    const q = filterPartnerSearch.toLowerCase();
                    return p.username.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q) || ROLE_LABEL[p.role]?.includes(q);
                  }).map(p => {
                    const isMe = p.id === user?.id;
                    const isSelected = p.id === partnerFilter;
                    return (
                      <button key={p.id} type="button"
                        onClick={() => { setPartnerFilter(p.id); setPage(1); setFilterPartnerOpen(false); setFilterPartnerSearch(''); }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors border-b border-slate-800/60 last:border-0 ${isSelected ? 'bg-violet-600/20 text-violet-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                        <ChevronRight size={10} className="text-slate-600 flex-shrink-0" style={{ marginLeft: `${p.depth * 10}px` }} />
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${isMe ? 'bg-emerald-700 text-emerald-200' : 'bg-slate-700 text-slate-400'}`}>
                          {isMe ? '나' : (ROLE_LABEL[p.role] ?? p.role)}
                        </span>
                        <span className="font-medium truncate">{p.username}</span>
                        {p.name && <span className="text-slate-500 truncate">({p.name})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {partnerFilter && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
              <span>필터 적용 중</span>
              <button onClick={() => { setPartnerFilter(''); setPage(1); }} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">로딩 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/50">
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">아이디</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">이름</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">연락처</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">은행명</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">계좌번호</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">소속 파트너</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">보유금</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">포인트</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">상태</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">가입일</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">충전/환전</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">상태변경</th>
                  <th className="px-4 py-4 text-left text-sm font-medium text-slate-300 whitespace-nowrap">상세관리</th>
                </tr>
              </thead>
              <tbody>
                {displayMembers.map((member) => (
                  <tr key={member.id} className="border-t border-slate-700 hover:bg-slate-700/20 cursor-default">
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{member.username}</span>
                        {member.notes && <MemoTooltip memo={member.notes} />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200">{member.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono whitespace-nowrap">{member.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{member.metadata?.bank_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono whitespace-nowrap">{member.metadata?.bank_account || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                      {member.parent ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-300 font-medium">{member.parent.username}</span>
                          {member.parent.name && member.parent.name !== member.parent.username && (
                            <span className="text-xs text-slate-500">({member.parent.name})</span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-yellow-300 whitespace-nowrap font-mono">₩{Number(member.balance ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-emerald-300 whitespace-nowrap font-mono">{Number(member.points ?? 0).toLocaleString()}P</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {member.status === 'active' ? (
                        (() => {
                          const online = isOnline(member);
                          return (
                            <span className="flex items-center gap-1.5">
                              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                              <span className={`text-xs ${online ? 'text-green-400' : 'text-slate-500'}`}>{online ? '온라인' : '오프라인'}</span>
                            </span>
                          );
                        })()
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs ${STATUS_MAP[member.status]?.className ?? 'bg-slate-600/20 text-slate-400'}`}>
                          {STATUS_MAP[member.status]?.label ?? member.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {member.created_at ? new Date(member.created_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openTxModal(member, 'deposit')}
                          className="flex items-center gap-1 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/40 text-emerald-400 hover:text-emerald-300 rounded text-xs transition-colors">
                          <ArrowDownCircle size={11} />충전
                        </button>
                        <button onClick={() => openTxModal(member, 'withdrawal')}
                          className="flex items-center gap-1 px-2 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 text-amber-400 hover:text-amber-300 rounded text-xs transition-colors">
                          <ArrowUpCircle size={11} />환전
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={member.status ?? 'active'} onChange={(e) => handleStatusChange(member.id, e.target.value)}
                        style={{ colorScheme: 'dark' }}
                        className={`text-xs rounded px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer bg-slate-900 ${
                          member.status === 'active' || !member.status ? 'text-green-400 border-green-600/50' : member.status === 'suspended' ? 'text-red-400 border-red-600/50' : 'text-red-500 border-red-800/50'
                        }`}>
                        <option value="active" className="bg-slate-900 text-slate-200">활성</option>
                        <option value="suspended" className="bg-slate-900 text-slate-200">정지</option>
                        <option value="blocked" className="bg-slate-900 text-slate-200">차단</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetailMember(member)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/40 text-blue-400 hover:text-blue-300 rounded text-xs transition-colors whitespace-nowrap"
                      >
                        <Settings2 size={11} />상세관리
                      </button>
                    </td>
                  </tr>
                ))}
                {displayMembers.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-slate-500">표시할 회원이 없습니다</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          <div className="text-sm text-slate-400">총 <span className="text-slate-200 font-medium">{total}</span>명</div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 rounded border border-slate-600 text-sm">이전</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-3 py-1 rounded text-sm ${page === p ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600'}`}>
                {p}
              </button>
            ))}
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 rounded border border-slate-600 text-sm">다음</button>
          </div>
        </div>
      </div>

      {/* ── 회원 상세 관리 드로어 ── */}
      {detailMember && (
        <MemberDetailDrawer
          member={detailMember}
          currentUser={user}
          onClose={() => setDetailMember(null)}
          onMemberUpdated={(updated) => {
            setMembers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
            setDetailMember(updated);
          }}
        />
      )}

      {/* ── 충전/환전 모달 ── */}
      {txModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                {txModal.type === 'deposit' ? <ArrowDownCircle size={18} className="text-emerald-400" /> : <ArrowUpCircle size={18} className="text-amber-400" />}
                <h3 className="text-slate-100">{txModal.type === 'deposit' ? '회원 충전' : '회원 환전'}</h3>
              </div>
              <button onClick={() => setTxModal(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-slate-900/60 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">대상 회원</span>
                <span className="text-sm font-semibold text-slate-100">{txModal.member.username}</span>
              </div>
              <div className="bg-slate-900/60 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">현재 보유금</span>
                <span className="text-sm font-semibold text-yellow-300">₩{Number(txModal.member.balance ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">{txModal.type === 'deposit' ? '충전' : '환전'} 금액</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₩</span>
                  <input autoFocus type="text" inputMode="numeric" value={txAmount}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setTxAmount(raw ? parseInt(raw).toLocaleString() : '');
                    }}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                {txModal.type === 'withdrawal' && (
                  <div className="flex gap-1.5 mt-2">
                    {[100, 500, 1000, 5000].map(v => (
                      <button key={v} type="button"
                        onClick={() => setTxAmount(((parseInt(txAmount.replace(/,/g, ''), 10) || 0) + v).toLocaleString())}
                        className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors">
                        +{v >= 1000 ? `${v / 1000}천` : `${v}백`}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 mt-2">
                  {[10000, 50000, 100000, 500000].map(v => (
                    <button key={v} type="button"
                      onClick={() => setTxAmount(((parseInt(txAmount.replace(/,/g, ''), 10) || 0) + v).toLocaleString())}
                      className="flex-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors">
                      +{(v / 10000).toLocaleString()}만
                    </button>
                  ))}
                </div>
                {txModal.type === 'withdrawal' && (
                  <button type="button"
                    onClick={() => setTxAmount(Number(txModal.member.balance ?? 0).toLocaleString())}
                    className="w-full mt-1.5 text-xs px-2 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 hover:text-amber-300 rounded border border-amber-600/40 transition-colors">
                    전액 환전 (₩{Number(txModal.member.balance ?? 0).toLocaleString()})
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">메모 (선택)</label>
                <input value={txMemo} onChange={e => setTxMemo(e.target.value)} placeholder="처리 사유 메모"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setTxModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
              <button onClick={handleTxConfirm} disabled={txSaving || !txAmount}
                className={`px-5 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${txModal.type === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                {txSaving ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : txModal.type === 'deposit' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                {txModal.type === 'deposit' ? '충전 확정' : '환전 확정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 차단 사유 모달 ── */}
      {blockTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <ShieldOff size={18} className="text-red-400" />
                <h3 className="text-slate-100">차단 사유 입력</h3>
              </div>
              <button onClick={() => setBlockTarget(null)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-400"><span className="text-slate-200 font-medium">{blockTarget.username}</span> 회원을 차단합니다.</p>
              <div className="grid grid-cols-1 gap-2">
                {BLOCK_REASONS.map((r) => (
                  <button key={r} onClick={() => { setBlockReason(r); setBlockCustom(''); }}
                    className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${blockReason === r ? 'bg-red-600/20 border-red-600/50 text-red-300' : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'}`}>
                    {r}
                  </button>
                ))}
                <button onClick={() => setBlockReason('__custom__')}
                  className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${blockReason === '__custom__' ? 'bg-red-600/20 border-red-600/50 text-red-300' : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500'}`}>
                  직접 입력...
                </button>
              </div>
              {blockReason === '__custom__' && (
                <input autoFocus value={blockCustom} onChange={(e) => setBlockCustom(e.target.value)}
                  placeholder="차단 사유를 직접 입력하세요"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-red-500" />
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setBlockTarget(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
              <button onClick={handleBlockConfirm} disabled={blocking || !blockReason || (blockReason === '__custom__' && !blockCustom.trim())}
                className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {blocking ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldOff size={14} />}
                차단 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 회원 생성 모달 ── */}
      {showCreateModal && (() => {
        const bulkIds = getBulkIds();
        const bulkSelectedPartner = partners.find(p => p.id === bulkParentId);
        const filteredBulkPartners = partners.filter(p => {
          if (!bulkParentSearch) return true;
          const q = bulkParentSearch.toLowerCase();
          return p.username.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q) || ROLE_LABEL[p.role]?.includes(q);
        });
        return (
          <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 py-6 px-4 overflow-y-auto">
            <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl">
              {/* 헤더 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-green-400" />
                  <h3 className="text-slate-100 text-lg">회원 생성</h3>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={20} /></button>
              </div>

              {/* 모드 탭 */}
              <div className="flex border-b border-slate-700 bg-slate-800/70">
                <button
                  onClick={() => setCreateMode('single')}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${createMode === 'single' ? 'border-green-500 text-green-400 bg-green-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                  <UserPlus size={14} />단건 생성
                </button>
                <button
                  onClick={() => setCreateMode('bulk')}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${createMode === 'bulk' ? 'border-violet-500 text-violet-400 bg-violet-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                  <ListPlus size={14} />벌크 생성
                </button>
              </div>

              {/* ── 단건 생성 폼 ── */}
              {createMode === 'single' && (
                <>
                  <div className="px-6 py-5 space-y-5">
                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">계정 정보</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">아이디 <span className="text-red-400">*</span></label>
                          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="영문/숫자 4자 이상"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">이름</label>
                          <input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="실명 (선택)"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">연락처</label>
                          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="01012345678 (선택)"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">비밀번호 <span className="text-red-400">*</span></label>
                          <div className="relative">
                            <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="6자 이상"
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 pr-9 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">비밀번호 확인 <span className="text-red-400">*</span></label>
                          <div className="relative">
                            <input type={showPwC ? 'text' : 'password'} value={form.passwordConfirm} onChange={e => setForm(f => ({ ...f, passwordConfirm: e.target.value }))} placeholder="비밀번호 재입력"
                              className={`w-full bg-slate-900 border rounded-lg px-3 py-2 pr-9 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 ${form.passwordConfirm && form.password !== form.passwordConfirm ? 'border-red-500' : 'border-slate-600'}`} />
                            <button type="button" onClick={() => setShowPwC(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                              {showPwC ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          {form.passwordConfirm && form.password !== form.passwordConfirm && (
                            <p className="text-red-400 text-xs mt-1">비밀번호가 일치하지 않습니다.</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 bg-slate-900/60 border border-slate-700/50 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-slate-400">
                        <span className="text-yellow-400">💡</span>
                        출금 비밀번호는 <span className="text-slate-200 mx-1">1234</span>로 자동 설정되며, 회원 마이페이지에서 변경할 수 있습니다.
                      </div>
                    </section>

                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">파트너 소속</p>
                      <div ref={partnerRef} className="relative">
                        <label className="block text-xs text-slate-400 mb-1.5">소속 파트너 <span className="text-red-400">*</span></label>
                        <button type="button" onClick={() => setPartnerOpen(v => !v)}
                          className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm flex items-center justify-between ${form.parentId ? 'text-slate-100' : 'text-slate-600'} ${!form.parentId ? 'border-slate-600' : 'border-blue-500/60'} focus:outline-none`}>
                          <span>
                            {selectedPartner ? `${ROLE_LABEL[selectedPartner.role] ?? selectedPartner.role} · ${selectedPartner.username}${selectedPartner.name ? ` (${selectedPartner.name})` : ''}` : '파트너를 선택하세요'}
                          </span>
                          <ChevronDown size={14} className={`text-slate-500 transition-transform ${partnerOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {partnerOpen && (
                          <div className="absolute z-20 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                              <div className="relative">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input autoFocus value={partnerSearch} onChange={e => setPartnerSearch(e.target.value)} placeholder="파트너 검색..."
                                  className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
                              </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto">
                              {loadingPartners ? (
                                <p className="text-xs text-slate-500 px-3 py-3">불러오는 중...</p>
                              ) : filteredPartners.length === 0 ? (
                                <p className="text-xs text-slate-500 px-3 py-3">검색 결과 없음</p>
                              ) : (
                                filteredPartners.map(p => (
                                  <button key={p.id} type="button"
                                    onClick={() => { setForm(f => ({ ...f, parentId: p.id })); setPartnerOpen(false); setPartnerSearch(''); }}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${form.parentId === p.id ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                                    <span className="text-slate-500 text-xs min-w-[56px]">{indentPrefix(p.depth)}{ROLE_LABEL[p.role] ?? p.role}</span>
                                    <span className="font-medium">{p.username}</span>
                                    {p.name && <span className="text-slate-500 text-xs">({p.name})</span>}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">은행 정보</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">은행명</label>
                          <input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="예) 국민은행"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">계좌번호</label>
                          <input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} placeholder="예) 123-456-789012"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    </section>

                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">커미션 설정</p>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: '카지노 롤링 (%)', key: 'casinoRolling' as const },
                          { label: '슬롯 롤링 (%)', key: 'slotRolling' as const },
                          { label: '루징률 (%)', key: 'losingRate' as const },
                        ].map(({ label, key }) => (
                          <div key={key}>
                            <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                            <input type="number" min="0" max="100" step="0.1" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">메모</p>
                      <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="회원에 대한 간단한 메모 (선택 사항)" rows={3}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
                    </section>
                  </div>

                  <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
                    <button onClick={() => setShowCreateModal(false)} className="px-5 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">취소</button>
                    <button onClick={handleCreate} disabled={saving}
                      className="px-6 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                      {saving ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />생성 중...</> : <><UserPlus size={14} />회원 생성</>}
                    </button>
                  </div>
                </>
              )}

              {/* ── 벌크 생성 폼 ── */}
              {createMode === 'bulk' && (
                <>
                  <div className="px-6 py-5 space-y-5">
                    {/* 아이디 범위 설정 */}
                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">아이디 범위 설정</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <label className="block text-xs text-slate-400 mb-1.5">아이디 접두어 <span className="text-red-400">*</span></label>
                          <input value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value.replace(/\s/g, ''))} placeholder="예) aaa"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">시작 번호 <span className="text-red-400">*</span></label>
                          <input value={bulkStart} onChange={e => setBulkStart(e.target.value.replace(/[^0-9]/g, ''))} placeholder="001"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-violet-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1.5">끝 번호 <span className="text-red-400">*</span></label>
                          <input value={bulkEnd} onChange={e => setBulkEnd(e.target.value.replace(/[^0-9]/g, ''))} placeholder="100"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-violet-500" />
                        </div>
                      </div>

                      {/* 미리보기 */}
                      {bulkIds.length > 0 && (
                        <div className="mt-3 bg-violet-900/20 border border-violet-600/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-violet-400 font-medium flex items-center gap-1.5">
                              <Copy size={11} />생성 예정 아이디 미리보기
                            </p>
                            <span className="text-xs font-bold text-violet-300 bg-violet-700/30 px-2 py-0.5 rounded-full">
                              총 {bulkIds.length}개
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {bulkIds.slice(0, 30).map(id => (
                              <span key={id} className="text-[11px] font-mono text-violet-200 bg-violet-800/30 border border-violet-700/40 px-1.5 py-0.5 rounded">
                                {id}
                              </span>
                            ))}
                            {bulkIds.length > 30 && (
                              <span className="text-[11px] text-violet-500 px-1.5 py-0.5">
                                ... 외 {bulkIds.length - 30}개
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {bulkPrefix && (parseInt(bulkEnd, 10) - parseInt(bulkStart, 10) > 999) && (
                        <p className="text-xs text-red-400 mt-2">한 번에 최대 1,000개까지 생성할 수 있습니다.</p>
                      )}
                    </section>

                    {/* 공통 비밀번호 */}
                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">공통 비밀번호</p>
                      <div className="relative">
                        <input type={bulkShowPw ? 'text' : 'password'} value={bulkPassword}
                          onChange={e => setBulkPassword(e.target.value)} placeholder="전체 회원에게 동일하게 적용 (6자 이상)"
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 pr-9 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500" />
                        <button type="button" onClick={() => setBulkShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                          {bulkShowPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <div className="mt-2 bg-slate-900/60 border border-slate-700/50 rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-slate-400">
                        <span className="text-yellow-400">💡</span>
                        출금 비밀번호는 <span className="text-slate-200 mx-1">1234</span>로 자동 설정됩니다.
                      </div>
                    </section>

                    {/* 소속 파트너 */}
                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">소속 파트너</p>
                      <div ref={bulkParentRef} className="relative">
                        <label className="block text-xs text-slate-400 mb-1.5">소속 파트너 <span className="text-red-400">*</span></label>
                        <button type="button" onClick={() => setBulkParentOpen(v => !v)}
                          className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm flex items-center justify-between ${bulkParentId ? 'text-slate-100 border-violet-500/60' : 'text-slate-600 border-slate-600'} focus:outline-none`}>
                          <span>
                            {bulkSelectedPartner ? `${ROLE_LABEL[bulkSelectedPartner.role] ?? bulkSelectedPartner.role} · ${bulkSelectedPartner.username}${bulkSelectedPartner.name ? ` (${bulkSelectedPartner.name})` : ''}` : '파트너를 선택하세요'}
                          </span>
                          <ChevronDown size={14} className={`text-slate-500 transition-transform ${bulkParentOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {bulkParentOpen && (
                          <div className="absolute z-20 w-full mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                              <div className="relative">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input autoFocus value={bulkParentSearch} onChange={e => setBulkParentSearch(e.target.value)} placeholder="파트너 검색..."
                                  className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
                              </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto">
                              {loadingPartners ? (
                                <p className="text-xs text-slate-500 px-3 py-3">불러오는 중...</p>
                              ) : filteredBulkPartners.length === 0 ? (
                                <p className="text-xs text-slate-500 px-3 py-3">검색 결과 없음</p>
                              ) : (
                                filteredBulkPartners.map(p => (
                                  <button key={p.id} type="button"
                                    onClick={() => { setBulkParentId(p.id); setBulkParentOpen(false); setBulkParentSearch(''); }}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${bulkParentId === p.id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                                    <span className="text-slate-500 text-xs min-w-[56px]">{indentPrefix(p.depth)}{ROLE_LABEL[p.role] ?? p.role}</span>
                                    <span className="font-medium">{p.username}</span>
                                    {p.name && <span className="text-slate-500 text-xs">({p.name})</span>}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* 커미션 설정 */}
                    <section>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">커미션 설정 (공통 적용)</p>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: '카지노 롤링 (%)', val: bulkCasino, set: setBulkCasino },
                          { label: '슬롯 롤링 (%)',   val: bulkSlot,   set: setBulkSlot },
                          { label: '루징률 (%)',       val: bulkLosing, set: setBulkLosing },
                        ].map(({ label, val, set }) => (
                          <div key={label}>
                            <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                            <input type="number" min="0" max="100" step="0.1" value={val} onChange={e => set(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-violet-500" />
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* 진행 상황 */}
                    {bulkProgress && (
                      <section>
                        <div className="bg-slate-900/70 border border-slate-700 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1.5">
                              {bulkSaving ? <Loader2 size={12} className="animate-spin text-violet-400" /> : <CheckCircle2 size={12} className="text-green-400" />}
                              {bulkSaving ? '생성 중...' : '완료'}
                            </span>
                            <span className="text-slate-300 font-mono">{bulkProgress.done} / {bulkProgress.total}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-300"
                              style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                            />
                          </div>
                          {bulkProgress.errors.length > 0 && (
                            <div className="mt-2 max-h-24 overflow-y-auto space-y-0.5">
                              {bulkProgress.errors.map((e, i) => (
                                <p key={i} className="text-[11px] text-red-400">{e}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>

                  <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {bulkIds.length > 0 && !bulkSaving && (
                        <span><span className="text-violet-300 font-semibold">{bulkIds.length}개</span> 회원을 일괄 생성합니다</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setShowCreateModal(false)} className="px-5 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">취소</button>
                      <button onClick={handleBulkCreate} disabled={bulkSaving || bulkIds.length === 0}
                        className="px-6 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                        {bulkSaving
                          ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />생성 중...</>
                          : <><ListPlus size={14} />{bulkIds.length > 0 ? `${bulkIds.length}개 일괄 생성` : '일괄 생성'}</>
                        }
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
