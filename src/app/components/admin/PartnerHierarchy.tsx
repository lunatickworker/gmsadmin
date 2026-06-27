import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  ChevronRight, ChevronDown, Settings,
  Percent, ScissorsLineDashed, Search, Plus, Eye, Pencil, X,
  Server, ChevronUp, Wallet, ArrowDownCircle, ArrowUpCircle, Loader2,
} from 'lucide-react';
import { useAuth, LEVEL_NAMES, ROLE_TO_LEVEL } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettlementRates {
  casinoRate: number;
  slotRate: number;
  losingRate: number;
}

interface VendorBalance {
  key: string;
  label: string;
  balance: number;
}

interface OrgNode {
  id: string;
  orgPath: string;
  name: string;
  username: string;
  level: number;
  levelName: string;
  children?: OrgNode[];
  userCount: number;
  revenue: number;
  balance?: number;
  vendorBalances?: VendorBalance[]; // 운영사 레벨: API별 개별 보유금
  status?: '정상' | '정지';
  settlement?: SettlementRates;
  rollingShaveEnabled?: boolean;
  rollingShaveRate?: number;
  gameApis?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface VendorApi { id: string; label: string; }

async function fetchVendorApis(): Promise<VendorApi[]> {
  const { data, error } = await supabase
    .from('game_vendors')
    .select('id, vendor_key, vendor_name, opcode')
    .eq('is_active', true)
    .order('vendor_name');
  if (error || !data) return [];
  return data.map((v: any) => ({
    id: v.vendor_key,
    label: v.opcode ? `${v.vendor_key}(${v.opcode})` : v.vendor_key,
  }));
}

const LEVEL_COLORS: Record<number, { bg: string; text: string; border: string; badge: string }> = {
  1: { bg: 'bg-purple-900/20',  text: 'text-purple-300',  border: 'border-l-purple-500', badge: 'bg-purple-600' },
  2: { bg: 'bg-blue-900/20',    text: 'text-blue-300',    border: 'border-l-blue-500',   badge: 'bg-blue-600' },
  3: { bg: 'bg-cyan-900/20',    text: 'text-cyan-300',    border: 'border-l-cyan-500',   badge: 'bg-cyan-700' },
  4: { bg: 'bg-green-900/20',   text: 'text-green-300',   border: 'border-l-green-500',  badge: 'bg-green-700' },
  5: { bg: 'bg-yellow-900/20',  text: 'text-yellow-300',  border: 'border-l-yellow-500', badge: 'bg-yellow-700' },
  6: { bg: 'bg-orange-900/20',  text: 'text-orange-300',  border: 'border-l-orange-500', badge: 'bg-orange-700' },
};

const CHILD_LEVEL_NAMES: Record<number, string> = {
  1: '운영사', 2: '본사', 3: '부본사', 4: '총판', 5: '매장',
};

const LEVEL_TO_ROLE: Record<number, string> = {
  2: 'operator',
  3: 'head_office',
  4: 'sub_office',
  5: 'distributor',
  6: 'store',
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const FULL_ORG_TREE: OrgNode = {
  id: 'org-1', orgPath: 'org-1', name: '시스템 관리자', username: 'admin',
  level: 1, levelName: '시스템 관리자', userCount: 1, revenue: 0,
  children: [
    {
      id: 'org-2', orgPath: 'org-1/org-2', name: '운영사 A', username: 'operator_a',
      level: 2, levelName: '운영사', userCount: 5, revenue: 15000000, balance: 3500000, status: '정상',
      settlement: { casinoRate: 1.5, slotRate: 4.5, losingRate: 40 },
      rollingShaveEnabled: true, rollingShaveRate: 5,
      gameApis: ['evolution', 'pragmatic_live', 'pragmatic_slot'],
      vendorBalances: [
        { key: 'evolution', label: 'evolution', balance: 1200000 },
        { key: 'pragmatic_live', label: 'pragmatic_live', balance: 1800000 },
        { key: 'pragmatic_slot', label: 'pragmatic_slot', balance: 500000 },
      ],
      children: [
        {
          id: 'org-3', orgPath: 'org-1/org-2/org-3', name: '본사 A1', username: 'hq_a1',
          level: 3, levelName: '본사', userCount: 10, revenue: 8000000, balance: 1200000, status: '정상',
          settlement: { casinoRate: 1.2, slotRate: 4.3, losingRate: 35 },
          rollingShaveEnabled: false, rollingShaveRate: 0,
          children: [
            {
              id: 'org-4', orgPath: 'org-1/org-2/org-3/org-4', name: '부본사 A1-1', username: 'sub_a11',
              level: 4, levelName: '부본사', userCount: 20, revenue: 4000000, balance: 850000, status: '정상',
              settlement: { casinoRate: 1.0, slotRate: 4.0, losingRate: 30 },
              rollingShaveEnabled: false, rollingShaveRate: 0,
              children: [
                {
                  id: 'org-5', orgPath: 'org-1/org-2/org-3/org-4/org-5', name: '총판 A1-1-1', username: 'dist_a111',
                  level: 5, levelName: '총판', userCount: 30, revenue: 2000000, balance: 430000, status: '정상',
                  settlement: { casinoRate: 0.8, slotRate: 3.8, losingRate: 25 },
                  rollingShaveEnabled: false, rollingShaveRate: 0,
                  children: [
                    {
                      id: 'org-6', orgPath: 'org-1/org-2/org-3/org-4/org-5/org-6', name: '매장 A1-1-1-1', username: 'store_a1111',
                      level: 6, levelName: '매장', userCount: 150, revenue: 1000000, balance: 210000, status: '정지',
                      settlement: { casinoRate: 0.5, slotRate: 3.5, losingRate: 20 },
                      rollingShaveEnabled: false, rollingShaveRate: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'org-7', orgPath: 'org-1/org-7', name: '운영사 B', username: 'operator_b',
      level: 2, levelName: '운영사', userCount: 3, revenue: 12000000, balance: 2800000, status: '정상',
      settlement: { casinoRate: 1.5, slotRate: 4.5, losingRate: 40 },
      rollingShaveEnabled: true, rollingShaveRate: 7,
      gameApis: ['playtech', 'microgaming'],
      vendorBalances: [
        { key: 'playtech', label: 'playtech', balance: 1500000 },
        { key: 'microgaming', label: 'microgaming', balance: 1300000 },
      ],
      children: [
        {
          id: 'org-8', orgPath: 'org-1/org-7/org-8', name: '본사 B1', username: 'hq_b1',
          level: 3, levelName: '본사', userCount: 8, revenue: 6000000, balance: 950000, status: '정상',
          settlement: { casinoRate: 1.2, slotRate: 4.3, losingRate: 35 },
          rollingShaveEnabled: false, rollingShaveRate: 0,
        },
      ],
    },
  ],
};

// ─── DB Fetch ─────────────────────────────────────────────────────────────────

async function fetchPartnersFromDB(): Promise<OrgNode | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, username, name, role, status, parent_id, balance, hierarchy_path, depth
      `)
      .neq('role', 'member')
      .order('depth');

    if (error || !data || data.length === 0) return null;

    // Fetch partner_settings separately
    const userIds = data.map((u: any) => u.id);
    const { data: settingsData } = await supabase
      .from('partner_settings')
      .select('user_id, casino_rolling_rate, slot_rolling_rate, losing_rate, rolling_shave_enabled, rolling_shave_rate, game_vendor_keys')
      .in('user_id', userIds);

    const settingsMap = new Map<string, any>();
    for (const s of settingsData ?? []) {
      settingsMap.set(s.user_id, s);
    }

    // 모든 운영사가 사용하는 vendor_key 수집 후 game_vendors 조회
    const allVendorKeys = new Set<string>();
    for (const s of settingsData ?? []) {
      for (const k of s.game_vendor_keys ?? []) allVendorKeys.add(k);
    }
    const vendorInfoMap = new Map<string, { label: string; balance: number }>();
    if (allVendorKeys.size > 0) {
      const { data: vendorData } = await supabase
        .from('game_vendors')
        .select('vendor_key, vendor_name, opcode, total_balance')
        .in('vendor_key', Array.from(allVendorKeys));
      for (const v of vendorData ?? []) {
        vendorInfoMap.set(v.vendor_key, {
          label: v.opcode ? `${v.vendor_key}(${v.opcode})` : v.vendor_key,
          balance: Number(v.total_balance ?? 0),
        });
      }
    }

    const nodeMap = new Map<string, OrgNode>();
    for (const u of data) {
      const level = ROLE_TO_LEVEL[u.role as UserRole] ?? 7;
      const ps = settingsMap.get(u.id);
      const vendorKeys: string[] = ps?.game_vendor_keys ?? [];
      const vendorBalancesArr: VendorBalance[] = vendorKeys.map((k) => ({
        key: k,
        label: vendorInfoMap.get(k)?.label ?? k,
        balance: vendorInfoMap.get(k)?.balance ?? 0,
      }));
      const vendorTotalBalance = vendorBalancesArr.reduce((sum, vb) => sum + vb.balance, 0);
      nodeMap.set(u.id, {
        id: u.id,
        orgPath: (u.hierarchy_path ?? []).join('/'),
        name: u.name || u.username,
        username: u.username,
        level,
        levelName: LEVEL_NAMES[level] ?? u.role,
        userCount: 0,
        revenue: 0,
        balance: vendorKeys.length > 0 ? vendorTotalBalance : Number(u.balance ?? 0),
        vendorBalances: vendorKeys.length > 0 ? vendorBalancesArr : undefined,
        status: u.status === 'active' ? '정상' : '정지',
        settlement: ps ? {
          casinoRate: Number(ps.casino_rolling_rate ?? 0),
          slotRate: Number(ps.slot_rolling_rate ?? 0),
          losingRate: Number(ps.losing_rate ?? 0),
        } : undefined,
        rollingShaveEnabled: ps?.rolling_shave_enabled ?? false,
        rollingShaveRate: Number(ps?.rolling_shave_rate ?? 0),
        gameApis: ps?.game_vendor_keys ?? [],
        children: [],
      });
    }

    // 회원(member) 수 집계: parent_id 기준으로 카운트
    const { data: memberData } = await supabase
      .from('users')
      .select('parent_id')
      .eq('role', 'member');

    const memberCountMap = new Map<string, number>();
    for (const m of memberData ?? []) {
      if (!m.parent_id) continue;
      memberCountMap.set(m.parent_id, (memberCountMap.get(m.parent_id) ?? 0) + 1);
    }

    for (const [id, node] of nodeMap) {
      node.userCount = memberCountMap.get(id) ?? 0;
    }

    let root: OrgNode | null = null;
    for (const u of data) {
      const node = nodeMap.get(u.id);
      if (!node) continue;
      if (u.parent_id && nodeMap.has(u.parent_id)) {
        const parent = nodeMap.get(u.parent_id)!;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else if (!u.parent_id) {
        root = node;
      }
    }

    return root;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findSubtree(node: OrgNode, targetPath: string): OrgNode | null {
  if (node.orgPath === targetPath) return node;
  for (const child of node.children ?? []) {
    const found = findSubtree(child, targetPath);
    if (found) return found;
  }
  return null;
}

function findAndUpdate(tree: OrgNode, id: string, updater: (n: OrgNode) => OrgNode): OrgNode {
  if (tree.id === id) return updater(tree);
  return { ...tree, children: tree.children?.map((c) => findAndUpdate(c, id, updater)) };
}

function matchesSearch(node: OrgNode, term: string): boolean {
  const t = term.toLowerCase();
  if (node.name.toLowerCase().includes(t) || node.username.toLowerCase().includes(t)) return true;
  return (node.children ?? []).some((c) => matchesSearch(c, t));
}

// ─── Settlement Dialog ────────────────────────────────────────────────────────

function CommissionDialog({
  node, open, onClose, onSave, childSettlement,
}: {
  node: OrgNode; open: boolean; onClose: () => void;
  onSave: (rates: SettlementRates, rsEnabled: boolean, rsRate: number) => void;
  childSettlement?: SettlementRates;
}) {
  const [casinoRate, setCasinoRate] = useState(node.settlement?.casinoRate ?? 1.0);
  const [slotRate, setSlotRate]     = useState(node.settlement?.slotRate ?? 4.0);
  const [losingRate, setLosingRate] = useState(node.settlement?.losingRate ?? 30);
  const [rsEnabled, setRsEnabled]   = useState(node.rollingShaveEnabled ?? false);
  const [rsRate, setRsRate]         = useState(node.rollingShaveRate ?? 5);

  const handleSave = () => {
    if (childSettlement) {
      if (casinoRate < childSettlement.casinoRate) { toast.error('카지노율이 하위보다 낮습니다'); return; }
      if (slotRate   < childSettlement.slotRate)   { toast.error('슬롯율이 하위보다 낮습니다');   return; }
      if (losingRate < childSettlement.losingRate) { toast.error('루징율이 하위보다 낮습니다');   return; }
    }
    if (rsEnabled && (rsRate < 0 || rsRate > 100)) { toast.error('공배팅 요율은 0~100% 사이여야 합니다'); return; }
    onSave({ casinoRate, slotRate, losingRate }, rsEnabled, rsRate);
    toast.success('커미션 설정이 저장되었습니다');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-green-400" />
            커미션 설정
            <span className="font-bold text-white">{node.name}</span>
            <span className="text-xs text-slate-400 font-normal">({node.levelName})</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-2">
          <TabsList className="bg-slate-900 border border-slate-700 w-full">
            <TabsTrigger value="basic" className="flex-1 text-xs"><Percent className="w-3 h-3 mr-1" />롤링 / 루징</TabsTrigger>
            {node.level === 2 && (
              <TabsTrigger value="shave" className="flex-1 text-xs"><ScissorsLineDashed className="w-3 h-3 mr-1" />공배팅</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="basic" className="space-y-4 pt-4">
            {childSettlement && (
              <div className="bg-slate-900 rounded p-3 text-xs text-slate-400 flex gap-4">
                <span>하위 기준 →</span>
                <span>카지노 {childSettlement.casinoRate}%</span>
                <span>슬롯 {childSettlement.slotRate}%</span>
                <span>루징 {childSettlement.losingRate}%</span>
              </div>
            )}
            {([
              { label: '카지노 롤링률 (%)', val: casinoRate, set: setCasinoRate, step: '0.1', minChild: childSettlement?.casinoRate },
              { label: '슬롯 롤링률 (%)',   val: slotRate,   set: setSlotRate,   step: '0.1', minChild: childSettlement?.slotRate },
              { label: '루징률 (%)',         val: losingRate, set: setLosingRate, step: '1',   minChild: childSettlement?.losingRate },
            ] as { label: string; val: number; set: (v: number) => void; step: string; minChild?: number }[]).map(({ label, val, set, step, minChild }) => (
              <div key={label}>
                <Label className="text-slate-300 mb-1 block text-sm">{label}</Label>
                <Input type="number" step={step} min="0" max="100" value={val}
                  onChange={(e) => set(parseFloat(e.target.value) || 0)}
                  className="bg-slate-900 border-slate-600 text-white h-9" />
                {minChild !== undefined && val < minChild && (
                  <p className="text-xs text-red-400 mt-1">⚠️ 하위({minChild}%)보다 낮습니다</p>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="shave" className="space-y-4 pt-4">
            <div className="flex items-center justify-between bg-slate-900 rounded p-3">
              <div>
                <p className="text-sm text-slate-200 font-medium">공배팅 활성화</p>
                <p className="text-xs text-slate-500 mt-0.5">롤링금에서 일정 비율 절삭</p>
              </div>
              <Switch checked={rsEnabled} onCheckedChange={setRsEnabled} />
            </div>
            {rsEnabled && (
              <div>
                <Label className="text-slate-300 mb-1 block text-sm">공배팅 요율 (%)</Label>
                <Input type="number" step="0.5" min="0" max="100" value={rsRate}
                  onChange={(e) => setRsRate(parseFloat(e.target.value) || 0)}
                  className="bg-slate-900 border-slate-600 text-white h-9" />
                <div className="mt-2 p-3 bg-slate-900/60 rounded text-xs text-slate-400 space-y-1">
                  <p>베팅 1억 / 롤링률 1.5% 예시</p>
                  <p>정상 롤링금: 1,500,000원</p>
                  <p className="text-orange-300 font-medium">
                    실지급: {(1500000 * (1 - rsRate / 100)).toLocaleString()}원 ({rsRate}% 절삭)
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="text-slate-300">취소</Button>
          <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function DetailDialog({
  node, open, onClose, onEditCommission, isAdmin,
}: {
  node: OrgNode; open: boolean; onClose: () => void;
  onEditCommission: (n: OrgNode) => void;
  isAdmin: boolean;
}) {
  const c = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[1];
  const [vendorList, setVendorList] = useState<VendorApi[]>([]);

  useEffect(() => {
    if (open && isAdmin && node.level === 2 && (node.gameApis ?? []).length > 0) {
      fetchVendorApis().then(setVendorList);
    }
  }, [open, isAdmin, node.level, node.gameApis]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-blue-400" />상세 정보
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className={`flex items-center gap-2 p-3 rounded ${c.bg}`}>
            <span className={`px-2 py-0.5 rounded text-xs text-white ${c.badge}`}>{node.levelName}</span>
            <span className="font-bold text-white">{node.name}</span>
            <span className="text-slate-400 text-xs">{node.username}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['관리 인원', `${node.userCount}명`],
              ['매출', `₩${node.revenue.toLocaleString()}`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-slate-900 rounded p-3">
                <p className="text-xs text-slate-500 mb-1">{k}</p>
                <p className="text-white font-medium">{v}</p>
              </div>
            ))}
            <div className="bg-slate-900 rounded p-3 col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3 h-3 text-yellow-400" />
                <p className="text-xs text-slate-500">보유금</p>
              </div>
              <p className="text-yellow-300 font-medium">₩{(node.balance ?? 0).toLocaleString()}</p>
            </div>
            {node.settlement && (
              <div className="bg-slate-900 rounded p-3 col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500">커미션</p>
                  <button
                    onClick={() => { onClose(); onEditCommission(node); }}
                    className="text-xs px-2 py-0.5 rounded border border-green-700 text-green-300 hover:bg-green-900/30 transition-colors flex items-center gap-1"
                  >
                    <Settings className="w-3 h-3" />수정
                  </button>
                </div>
                <div className="flex gap-3">
                  <span className="text-blue-300">카지노 {node.settlement.casinoRate}%</span>
                  <span className="text-purple-300">슬롯 {node.settlement.slotRate}%</span>
                  <span className="text-green-300">루징 {node.settlement.losingRate}%</span>
                </div>
              </div>
            )}
            {isAdmin && node.level === 2 && (node.gameApis ?? []).length > 0 && (
              <div className="bg-slate-900 rounded p-3 col-span-2">
                <p className="text-xs text-slate-500 mb-2">연동 게임사 API</p>
                <div className="flex flex-wrap gap-1">
                  {(node.gameApis ?? []).map((id) => {
                    const api = vendorList.find((a) => a.id === id);
                    return (
                      <span key={id} className="px-2 py-0.5 bg-blue-900/50 border border-blue-700/50 rounded text-xs text-blue-300">
                        {api?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {node.level === 2 && node.rollingShaveEnabled && (
              <div className="bg-orange-900/20 border border-orange-700/30 rounded p-3 col-span-2">
                <p className="text-xs text-slate-500 mb-1">공배팅</p>
                <p className="text-orange-300">활성 — {node.rollingShaveRate}% 절삭</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-slate-300">닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

function EditDialog({
  node, open, onClose, onSave, isAdmin,
}: {
  node: OrgNode; open: boolean; onClose: () => void;
  onSave: (data: Partial<OrgNode>) => void;
  isAdmin: boolean;
}) {
  const [name, setName]         = useState(node.name);
  const [username, setUsername] = useState(node.username);
  const [password, setPassword] = useState('');
  const [gameApis, setGameApis] = useState<string[]>(node.gameApis ?? []);
  const [vendorList, setVendorList] = useState<VendorApi[]>([]);

  useEffect(() => { fetchVendorApis().then(setVendorList); }, []);

  // node가 바뀔 때(다른 운영사 수정) state 초기화
  useEffect(() => {
    setName(node.name);
    setUsername(node.username);
    setPassword('');
    setGameApis(node.gameApis ?? []);
  }, [node.id]);

  const toggleApi = (id: string) =>
    setGameApis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !username.trim()) { toast.error('파트너명과 아이디를 입력하세요'); return; }
    const updatedApis = node.level === 2 ? gameApis : (node.gameApis ?? []);

    setIsSaving(true);
    try {
      // 이름/아이디 변경
      const { error: userErr } = await supabase
        .from('users')
        .update({ name: name.trim(), username: username.trim() })
        .eq('id', node.id);
      if (userErr) { toast.error(`사용자 정보 저장 실패: ${userErr.message}`); return; }

      // 비밀번호 변경 (admin이 직접 hash 업데이트)
      if (password) {
        const { error: pwErr } = await supabase.rpc('admin_set_password', {
          p_user_id: node.id,
          p_new_password: password,
        });
        if (pwErr) { toast.error(`비밀번호 변경 실패: ${pwErr.message}`); return; }
      }

      // 운영사 게임사 API 저장
      if (node.level === 2) {
        const { error: apiErr } = await supabase
          .from('partner_settings')
          .upsert(
            { user_id: node.id, game_vendor_keys: updatedApis },
            { onConflict: 'user_id' }
          );
        if (apiErr) { toast.error(`게임사 API 저장 실패: ${apiErr.message}`); return; }
      }

      onSave({ name: name.trim(), username: username.trim(), gameApis: updatedApis });
      toast.success('수정되었습니다');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4 h-4 text-yellow-400" />
            수정 — {node.name}
            <span className="text-xs text-slate-400 font-normal">({node.levelName})</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-slate-300 mb-1 block">파트너명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white h-9" />
          </div>
          <div>
            <Label className="text-slate-300 mb-1 block">아이디</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white h-9" />
          </div>
          <div>
            <Label className="text-slate-300 mb-1 block">
              새 비밀번호 <span className="text-slate-500">(변경 시만 입력)</span>
            </Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="변경하지 않으면 비워두세요"
              className="bg-slate-900 border-slate-600 text-white h-9" />
          </div>
          {isAdmin && node.level === 2 && (
            <div>
              <Label className="text-slate-300 mb-2 block">연동 게임사 API</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {vendorList.length === 0 && (
                  <p className="text-xs text-slate-500 col-span-2">등록된 제공사 API 없음</p>
                )}
                {vendorList.map((api) => (
                  <label key={api.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${
                      gameApis.includes(api.id)
                        ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}>
                    <input type="checkbox" checked={gameApis.includes(api.id)}
                      onChange={() => toggleApi(api.id)} className="accent-blue-500" />
                    <span className="text-xs">{api.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving} className="text-slate-300">취소</Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-yellow-600 hover:bg-yellow-700 flex items-center gap-2">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Child Dialog ──────────────────────────────────────────────────────

// 부모 레벨에서 생성 가능한 하위 레벨 목록 (중간 계층 건너뛰기 허용)
function getSelectableLevels(parentLevel: number): { level: number; name: string }[] {
  const result: { level: number; name: string }[] = [];
  for (let l = parentLevel + 1; l <= 6; l++) {
    result.push({ level: l, name: LEVEL_NAMES[l] ?? String(l) });
  }
  return result;
}

function CreateChildDialog({
  parent, open, onClose, onRefresh,
}: {
  parent: OrgNode; open: boolean; onClose: () => void;
  onRefresh: () => void;
}) {
  const selectableLevels = getSelectableLevels(parent.level);

  const [targetLevel, setTargetLevel] = useState(parent.level + 1);
  const childLevelName = LEVEL_NAMES[targetLevel] ?? '';

  const [name, setName]         = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gameApis, setGameApis] = useState<string[]>([]);
  const [vendorList, setVendorList] = useState<VendorApi[]>([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [casinoRate, setCasinoRate] = useState(parent.settlement?.casinoRate ?? 1.0);
  const [slotRate, setSlotRate]     = useState(parent.settlement?.slotRate ?? 4.0);
  const [losingRate, setLosingRate] = useState(parent.settlement?.losingRate ?? 30);
  const [rsEnabled, setRsEnabled]   = useState(false);
  const [rsRate, setRsRate]         = useState(5);
  const [isLoading, setIsLoading]   = useState(false);

  // 다이얼로그가 열릴 때마다 초기화
  useEffect(() => {
    if (open) {
      setTargetLevel(parent.level + 1);
      setName('');
      setUsername('');
      setPassword('');
      setGameApis([]);
      setShowSettlement(false);
    }
  }, [open, parent.level]);

  useEffect(() => { if (targetLevel === 2) fetchVendorApis().then(setVendorList); }, [targetLevel]);

  const toggleApi = (id: string) =>
    setGameApis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const parentMax = parent.settlement;

  const handleSave = async () => {
    if (!name.trim() || !username.trim() || !password.trim()) {
      toast.error('파트너명, 아이디, 비밀번호를 모두 입력하세요'); return;
    }
    if (showSettlement && parentMax) {
      if (casinoRate > parentMax.casinoRate) { toast.error(`카지노율은 상위(${parentMax.casinoRate}%) 이하여야 합니다`); return; }
      if (slotRate   > parentMax.slotRate)   { toast.error(`슬롯율은 상위(${parentMax.slotRate}%) 이하여야 합니다`);   return; }
      if (losingRate > parentMax.losingRate) { toast.error(`루징율은 상위(${parentMax.losingRate}%) 이하여야 합니다`); return; }
    }

    const role = LEVEL_TO_ROLE[targetLevel];
    if (!role) { toast.error('지원하지 않는 레벨입니다'); return; }

    setIsLoading(true);
    try {
      const { data: newUserId, error } = await supabase.rpc('create_user_with_password', {
        p_username: username.trim(),
        p_password: password,
        p_name: name.trim(),
        p_role: role,
        p_parent_id: parent.id,
      });

      if (error) {
        toast.error(`생성 실패: ${error.message}`);
        return;
      }

      if (newUserId) {
        const settingsUpdate: Record<string, unknown> = {};
        if (showSettlement) {
          settingsUpdate.casino_rolling_rate = casinoRate;
          settingsUpdate.slot_rolling_rate = slotRate;
          settingsUpdate.losing_rate = losingRate;
          settingsUpdate.rolling_shave_enabled = rsEnabled;
          settingsUpdate.rolling_shave_rate = rsRate;
        }
        // 운영사(level 2)이면 게임사 API 키도 저장
        if (targetLevel === 2) {
          settingsUpdate.game_vendor_keys = gameApis;
        }
        if (Object.keys(settingsUpdate).length > 0) {
          await supabase.from('partner_settings').update(settingsUpdate).eq('user_id', newUserId);
        }
      }

      toast.success(`${childLevelName} "${name}" 이(가) 생성되었습니다`);
      onRefresh();
      onClose();
    } catch (err) {
      console.error('Partner creation error:', err);
      toast.error('서버 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="w-4 h-4 text-blue-400" />
            하위 파트너 추가
            <span className="text-xs text-slate-400 font-normal">
              {parent.name} → <span className="text-blue-300 font-semibold">{childLevelName}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* 계층 선택 */}
          {selectableLevels.length > 1 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700 pb-1 mb-3">생성할 계층 선택</p>
              <div className="flex flex-wrap gap-2">
                {selectableLevels.map(({ level, name: lName }) => {
                  const lc = LEVEL_COLORS[level] ?? LEVEL_COLORS[1];
                  const isSelected = targetLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setTargetLevel(level)}
                      className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                        isSelected
                          ? `${lc.badge} text-white border-transparent`
                          : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      {lName}
                      {level > parent.level + 1 && (
                        <span className="ml-1 text-slate-400 font-normal">(건너뛰기)</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {targetLevel > parent.level + 1 && (
                <p className="mt-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2">
                  중간 계층({Array.from({ length: targetLevel - parent.level - 1 }, (_, i) => LEVEL_NAMES[parent.level + 1 + i]).join(', ')})을 건너뜁니다.
                  생성된 파트너는 {parent.levelName} "{parent.name}" 바로 아래에 배치됩니다.
                </p>
              )}
            </div>
          )}

          {/* 기본 정보 */}
          <div className="space-y-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700 pb-1">기본 정보</p>
            <div>
              <Label className="text-slate-300 mb-1 block">파트너명 *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder={`${childLevelName} 이름`}
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
            <div>
              <Label className="text-slate-300 mb-1 block">아이디 *</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="영문, 숫자 조합"
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
            <div>
              <Label className="text-slate-300 mb-1 block">비밀번호 *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
          </div>

          {/* 운영사 전용: 게임사 API */}
          {targetLevel === 2 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700 pb-1 mb-3">연동 게임사 API</p>
              <div className="grid grid-cols-2 gap-1.5">
                {vendorList.length === 0 && (
                  <p className="text-xs text-slate-500 col-span-2">등록된 제공사 API 없음</p>
                )}
                {vendorList.map((api) => (
                  <label key={api.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${
                      gameApis.includes(api.id)
                        ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}>
                    <input type="checkbox" checked={gameApis.includes(api.id)}
                      onChange={() => toggleApi(api.id)} className="accent-blue-500" />
                    <span className="text-xs">{api.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 정산 설정 (접이식) */}
          {targetLevel >= 2 && (
            <div className="border border-slate-700 rounded-lg overflow-hidden">
              <button type="button" onClick={() => setShowSettlement((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-700/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-slate-200">커미션 설정</span>
                  <span className="text-xs text-slate-500">(선택 — 나중에 커미션 설정에서 수정 가능)</span>
                </div>
                {showSettlement
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showSettlement && (
                <div className="px-4 py-4 space-y-3 bg-slate-900/30">
                  {parentMax && (
                    <div className="bg-slate-800 rounded p-2 text-xs text-slate-400 flex gap-3">
                      <span>상위 한도 →</span>
                      <span>카지노 {parentMax.casinoRate}%</span>
                      <span>슬롯 {parentMax.slotRate}%</span>
                      <span>루징 {parentMax.losingRate}%</span>
                    </div>
                  )}
                  {([
                    { label: '카지노 롤링률 (%)', val: casinoRate, set: setCasinoRate, step: '0.1', maxVal: parentMax?.casinoRate },
                    { label: '슬롯 롤링률 (%)',   val: slotRate,   set: setSlotRate,   step: '0.1', maxVal: parentMax?.slotRate },
                    { label: '루징률 (%)',         val: losingRate, set: setLosingRate, step: '1',   maxVal: parentMax?.losingRate },
                  ] as { label: string; val: number; set: (v: number) => void; step: string; maxVal?: number }[]).map(({ label, val, set, step, maxVal }) => (
                    <div key={label}>
                      <Label className="text-slate-400 mb-1 block text-xs">{label}</Label>
                      <Input type="number" step={step} min="0" value={val}
                        onChange={(e) => set(parseFloat(e.target.value) || 0)}
                        className="bg-slate-900 border-slate-600 text-white h-9" />
                      {maxVal !== undefined && val > maxVal && (
                        <p className="text-xs text-red-400 mt-1">⚠️ 상위({maxVal}%) 한도 초과</p>
                      )}
                    </div>
                  ))}
                  {targetLevel === 2 && (
                    <>
                      <div className="flex items-center justify-between bg-slate-800 rounded p-3">
                        <div>
                          <p className="text-xs text-slate-300 font-medium">공배팅 활성화</p>
                          <p className="text-xs text-slate-500 mt-0.5">롤링금 절삭 기능 (운영사 전용)</p>
                        </div>
                        <Switch checked={rsEnabled} onCheckedChange={setRsEnabled} />
                      </div>
                      {rsEnabled && (
                        <div>
                          <Label className="text-slate-400 mb-1 block text-xs">공배팅 요율 (%)</Label>
                          <Input type="number" step="0.5" min="0" max="100" value={rsRate}
                            onChange={(e) => setRsRate(parseFloat(e.target.value) || 0)}
                            className="bg-slate-900 border-slate-600 text-white h-9" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="text-slate-300">취소</Button>
          <Button onClick={handleSave} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? '생성 중...' : '생성'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Balance Transfer Dialog ──────────────────────────────────────────────────

function BalanceTransferDialog({
  node, open, onClose, onSave,
}: {
  node: OrgNode; open: boolean; onClose: () => void;
  onSave: (type: 'pay' | 'withdraw', amount: number) => void;
}) {
  const [type, setType] = useState<'pay' | 'withdraw'>('pay');
  const [amount, setAmount] = useState('');
  const c = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[1];

  const handleSave = () => {
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!num || num <= 0) { toast.error('올바른 금액을 입력하세요'); return; }
    if (type === 'withdraw' && num > (node.balance ?? 0)) {
      toast.error('회수 금액이 보유금보다 많습니다'); return;
    }
    onSave(type, num);
    toast.success(`${type === 'pay' ? '지급' : '회수'} 완료: ₩${num.toLocaleString()}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4 text-yellow-400" />
            보유금 관리
            <span className={`px-2 py-0.5 rounded text-xs text-white ${c.badge}`}>{node.levelName}</span>
            <span className="font-bold text-white text-sm">{node.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-slate-900 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">현재 보유금</span>
            <span className="text-yellow-300 font-mono">₩{(node.balance ?? 0).toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('pay')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors ${
                type === 'pay'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />지급
            </button>
            <button
              onClick={() => setType('withdraw')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors ${
                type === 'withdraw'
                  ? 'bg-orange-600 border-orange-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />회수
            </button>
          </div>

          <div>
            <Label className="text-slate-300 mb-1 block text-sm">금액 (원)</Label>
            <Input
              type="text"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setAmount(raw ? parseInt(raw).toLocaleString() : '');
              }}
              placeholder="0"
              className="bg-slate-900 border-slate-600 text-white h-10 text-right font-mono"
            />
            <div className="grid grid-cols-4 gap-1 mt-2">
              {[
                { label: '1백', value: 100000 },
                { label: '3백', value: 300000 },
                { label: '5백', value: 500000 },
                { label: '1천', value: 1000000 },
                { label: '3천', value: 3000000 },
                { label: '5천', value: 5000000 },
                ...(type === 'withdraw' ? [{ label: '전액', value: node.balance ?? 0 }] : []),
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => {
                    const cur = parseInt(amount.replace(/,/g, '') || '0', 10);
                    const next = label === '전액' ? value : cur + value;
                    setAmount(next > 0 ? next.toLocaleString() : '');
                  }}
                  className="py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                >
                  {label === '전액' ? '전액' : `+${label}`}
                </button>
              ))}
            </div>
          </div>

          {amount && (
            <div className={`rounded-lg p-3 text-sm ${type === 'pay' ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-orange-900/20 border border-orange-700/30'}`}>
              <span className="text-slate-400">처리 후 보유금: </span>
              <span className={`font-mono font-medium ${type === 'pay' ? 'text-blue-300' : 'text-orange-300'}`}>
                ₩{(
                  (node.balance ?? 0) +
                  (type === 'pay' ? 1 : -1) * parseInt(amount.replace(/,/g, '') || '0', 10)
                ).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} className="text-slate-300">취소</Button>
          <Button
            onClick={handleSave}
            className={type === 'pay' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}
          >
            {type === 'pay' ? '지급' : '회수'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Partner Manage Dialog (통합: 상세 / 커미션 / 수정) ──────────────────────

function PartnerManageDialog({
  node, open, onClose, isAdmin,
  onSaveSettlement, onSaveEdit,
  childSettlement,
}: {
  node: OrgNode; open: boolean; onClose: () => void; isAdmin: boolean;
  onSaveSettlement: (rates: SettlementRates, rsEnabled: boolean, rsRate: number) => void;
  onSaveEdit: (data: Partial<OrgNode>) => void;
  childSettlement?: SettlementRates;
}) {
  const c = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[1];

  // 커미션 state
  const [casinoRate, setCasinoRate] = useState(node.settlement?.casinoRate ?? 1.0);
  const [slotRate, setSlotRate]     = useState(node.settlement?.slotRate ?? 4.0);
  const [losingRate, setLosingRate] = useState(node.settlement?.losingRate ?? 30);
  const [rsEnabled, setRsEnabled]   = useState(node.rollingShaveEnabled ?? false);
  const [rsRate, setRsRate]         = useState(node.rollingShaveRate ?? 5);

  // 수정 state
  const [name, setName]         = useState(node.name);
  const [username, setUsername] = useState(node.username);
  const [password, setPassword] = useState('');
  const [gameApis, setGameApis] = useState<string[]>(node.gameApis ?? []);
  const [vendorList, setVendorList] = useState<VendorApi[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCasinoRate(node.settlement?.casinoRate ?? 1.0);
      setSlotRate(node.settlement?.slotRate ?? 4.0);
      setLosingRate(node.settlement?.losingRate ?? 30);
      setRsEnabled(node.rollingShaveEnabled ?? false);
      setRsRate(node.rollingShaveRate ?? 5);
      setName(node.name);
      setUsername(node.username);
      setPassword('');
      setGameApis(node.gameApis ?? []);
    }
  }, [open, node.id]);

  useEffect(() => {
    if (open && isAdmin && node.level === 2) fetchVendorApis().then(setVendorList);
  }, [open, isAdmin, node.level]);

  const toggleApi = (id: string) =>
    setGameApis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSaveCommission = () => {
    if (childSettlement) {
      if (casinoRate < childSettlement.casinoRate) { toast.error('카지노율이 하위보다 낮습니다'); return; }
      if (slotRate   < childSettlement.slotRate)   { toast.error('슬롯율이 하위보다 낮습니다');   return; }
      if (losingRate < childSettlement.losingRate) { toast.error('루징율이 하위보다 낮습니다');   return; }
    }
    if (rsEnabled && (rsRate < 0 || rsRate > 100)) { toast.error('공배팅 요율은 0~100% 사이여야 합니다'); return; }
    onSaveSettlement({ casinoRate, slotRate, losingRate }, rsEnabled, rsRate);
    toast.success('커미션 설정이 저장되었습니다');
  };

  const handleSaveEdit = async () => {
    if (!name.trim() || !username.trim()) { toast.error('파트너명과 아이디를 입력하세요'); return; }
    const updatedApis = node.level === 2 ? gameApis : (node.gameApis ?? []);
    setIsSaving(true);
    try {
      const { error: userErr } = await supabase
        .from('users')
        .update({ name: name.trim(), username: username.trim() })
        .eq('id', node.id);
      if (userErr) { toast.error(`사용자 정보 저장 실패: ${userErr.message}`); return; }

      if (password) {
        const { error: pwErr } = await supabase.rpc('admin_set_password', {
          p_user_id: node.id,
          p_new_password: password,
        });
        if (pwErr) { toast.error(`비밀번호 변경 실패: ${pwErr.message}`); return; }
      }

      if (node.level === 2) {
        const { error: apiErr } = await supabase
          .from('partner_settings')
          .upsert({ user_id: node.id, game_vendor_keys: updatedApis }, { onConflict: 'user_id' });
        if (apiErr) { toast.error(`게임사 API 저장 실패: ${apiErr.message}`); return; }
      }

      onSaveEdit({ name: name.trim(), username: username.trim(), gameApis: updatedApis });
      toast.success('수정되었습니다');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`px-2 py-0.5 rounded text-xs text-white ${c.badge}`}>{node.levelName}</span>
            <span className="font-bold text-white">{node.name}</span>
            <span className="text-xs text-slate-400 font-normal">({node.username})</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-1">
          <TabsList className="bg-slate-900 border border-slate-700 w-full">
            <TabsTrigger value="info" className="flex-1 text-xs gap-1.5">
              <Eye className="w-3 h-3" />상세 정보
            </TabsTrigger>
            {node.level >= 2 && (
              <TabsTrigger value="commission" className="flex-1 text-xs gap-1.5">
                <Settings className="w-3 h-3" />커미션 설정
              </TabsTrigger>
            )}
            <TabsTrigger value="edit" className="flex-1 text-xs gap-1.5">
              <Pencil className="w-3 h-3" />정보 수정
            </TabsTrigger>
          </TabsList>

          {/* ── 상세 정보 탭 ── */}
          <TabsContent value="info" className="mt-3 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 rounded p-3">
                <p className="text-xs text-slate-500 mb-1">관리 인원</p>
                <p className="text-white font-medium">{node.userCount}명</p>
              </div>
              <div className="bg-slate-900 rounded p-3">
                <p className="text-xs text-slate-500 mb-1">매출</p>
                <p className="text-white font-medium">₩{node.revenue.toLocaleString()}</p>
              </div>
              {node.level === 2 && (node.vendorBalances ?? []).length > 0 ? (
                <div className="bg-slate-900 rounded p-3 col-span-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wallet className="w-3 h-3 text-yellow-400" />
                    <p className="text-xs text-slate-500">API별 보유금</p>
                  </div>
                  <div className="space-y-1.5">
                    {(node.vendorBalances ?? []).map((vb) => (
                      <div key={vb.key} className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{vb.label}</span>
                        <span className="text-yellow-300 font-mono text-sm">₩{vb.balance.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-700 pt-1.5 flex items-center justify-between">
                      <span className="text-xs text-slate-500">합계</span>
                      <span className="text-yellow-200 font-mono font-semibold text-sm">
                        ₩{(node.vendorBalances ?? []).reduce((s, vb) => s + vb.balance, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900 rounded p-3 col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="w-3 h-3 text-yellow-400" />
                    <p className="text-xs text-slate-500">보유금</p>
                  </div>
                  <p className="text-yellow-300 font-medium">₩{(node.balance ?? 0).toLocaleString()}</p>
                </div>
              )}
              {isAdmin && node.level === 2 && (node.gameApis ?? []).length > 0 && (
                <div className="bg-slate-900 rounded p-3 col-span-2">
                  <p className="text-xs text-slate-500 mb-2">연동 게임사 API</p>
                  <div className="flex flex-wrap gap-1">
                    {(node.gameApis ?? []).map((id) => {
                      const api = vendorList.find((a) => a.id === id);
                      return (
                        <span key={id} className="px-2 py-0.5 bg-blue-900/50 border border-blue-700/50 rounded text-xs text-blue-300">
                          {api?.label ?? id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {node.level === 2 && node.rollingShaveEnabled && (
                <div className="bg-orange-900/20 border border-orange-700/30 rounded p-3 col-span-2">
                  <p className="text-xs text-slate-500 mb-1">공배팅</p>
                  <p className="text-orange-300">활성 — {node.rollingShaveRate}% 절삭</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={onClose} className="text-slate-300 text-xs h-8">닫기</Button>
            </div>
          </TabsContent>

          {/* ── 커미션 설정 탭 ── */}
          {node.level >= 2 && (
            <TabsContent value="commission" className="mt-3 space-y-3 text-sm">
              {childSettlement && (
                <div className="bg-slate-900 rounded p-2 text-xs text-slate-400 flex gap-4">
                  <span>하위 기준 →</span>
                  <span>카지노 {childSettlement.casinoRate}%</span>
                  <span>슬롯 {childSettlement.slotRate}%</span>
                  <span>루징 {childSettlement.losingRate}%</span>
                </div>
              )}
              {([
                { label: '카지노 롤링률 (%)', val: casinoRate, set: setCasinoRate, step: '0.1', minChild: childSettlement?.casinoRate },
                { label: '슬롯 롤링률 (%)',   val: slotRate,   set: setSlotRate,   step: '0.1', minChild: childSettlement?.slotRate },
                { label: '루징률 (%)',         val: losingRate, set: setLosingRate, step: '1',   minChild: childSettlement?.losingRate },
              ] as { label: string; val: number; set: (v: number) => void; step: string; minChild?: number }[]).map(({ label, val, set, step, minChild }) => (
                <div key={label}>
                  <Label className="text-slate-300 mb-1 block text-xs">{label}</Label>
                  <Input type="number" step={step} min="0" max="100" value={val}
                    onChange={(e) => set(parseFloat(e.target.value) || 0)}
                    className="bg-slate-900 border-slate-600 text-white h-9" />
                  {minChild !== undefined && val < minChild && (
                    <p className="text-xs text-red-400 mt-1">⚠️ 하위({minChild}%)보다 낮습니다</p>
                  )}
                </div>
              ))}
              {node.level === 2 && (
                <div className="space-y-3 border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between bg-slate-900 rounded p-3">
                    <div>
                      <p className="text-xs text-slate-200 font-medium">공배팅 활성화</p>
                      <p className="text-xs text-slate-500 mt-0.5">롤링금에서 일정 비율 절삭</p>
                    </div>
                    <Switch checked={rsEnabled} onCheckedChange={setRsEnabled} />
                  </div>
                  {rsEnabled && (
                    <div>
                      <Label className="text-slate-300 mb-1 block text-xs">공배팅 요율 (%)</Label>
                      <Input type="number" step="0.5" min="0" max="100" value={rsRate}
                        onChange={(e) => setRsRate(parseFloat(e.target.value) || 0)}
                        className="bg-slate-900 border-slate-600 text-white h-9" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose} className="text-slate-300 text-xs h-8">닫기</Button>
                <Button onClick={handleSaveCommission} size="sm" className="bg-green-600 hover:bg-green-700 text-xs h-8">
                  커미션 저장
                </Button>
              </div>
            </TabsContent>
          )}

          {/* ── 정보 수정 탭 ── */}
          <TabsContent value="edit" className="mt-3 space-y-3 text-sm">
            <div>
              <Label className="text-slate-300 mb-1 block text-xs">파트너명</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
            <div>
              <Label className="text-slate-300 mb-1 block text-xs">아이디</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
            <div>
              <Label className="text-slate-300 mb-1 block text-xs">
                새 비밀번호 <span className="text-slate-500">(변경 시만 입력)</span>
              </Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="변경하지 않으면 비워두세요"
                className="bg-slate-900 border-slate-600 text-white h-9" />
            </div>
            {isAdmin && node.level === 2 && (
              <div>
                <Label className="text-slate-300 mb-2 block text-xs">연동 게임사 API</Label>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {vendorList.length === 0 && (
                    <p className="text-xs text-slate-500 col-span-2">등록된 제공사 API 없음</p>
                  )}
                  {vendorList.map((api) => (
                    <label key={api.id}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${
                        gameApis.includes(api.id)
                          ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}>
                      <input type="checkbox" checked={gameApis.includes(api.id)}
                        onChange={() => toggleApi(api.id)} className="accent-blue-500" />
                      <span className="text-xs">{api.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} className="text-slate-300 text-xs h-8">닫기</Button>
              <Button onClick={handleSaveEdit} disabled={isSaving} size="sm"
                className="bg-yellow-600 hover:bg-yellow-700 text-xs h-8 flex items-center gap-1.5">
                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                {isSaving ? '저장 중...' : '수정 저장'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tree Row ─────────────────────────────────────────────────────────────────

function TreeRow({
  node, depth, myLevel, canManageLevel, searchTerm, isAdmin, expandOverride,
  onManage, onAddChild, onBalanceTransfer, onToggleStatus,
}: {
  node: OrgNode; depth: number; myLevel: number; searchTerm: string; isAdmin: boolean;
  expandOverride?: boolean | null;
  canManageLevel: (l: number) => boolean;
  onManage: (n: OrgNode) => void;
  onAddChild: (n: OrgNode) => void;
  onBalanceTransfer: (n: OrgNode) => void;
  onToggleStatus: (n: OrgNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  useEffect(() => {
    if (expandOverride !== null && expandOverride !== undefined) {
      setExpanded(expandOverride);
    }
  }, [expandOverride]);
  const hasChildren = (node.children ?? []).length > 0;
  const c = LEVEL_COLORS[node.level] ?? LEVEL_COLORS[1];
  const canEdit     = canManageLevel(node.level);
  const canAddChild = canManageLevel(node.level + 1) && node.level < 6;

  if (searchTerm && !matchesSearch(node, searchTerm)) return null;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-3 border-l-2 ${c.border} ${c.bg} hover:brightness-110 transition-all`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}>

        {/* Expand */}
        <button onClick={() => setExpanded((v) => !v)}
          className={`w-5 h-5 flex-shrink-0 flex items-center justify-center ${hasChildren ? 'text-slate-400 hover:text-white' : 'invisible'}`}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Level badge */}
        <span className={`text-xs px-2 py-0.5 rounded text-white flex-shrink-0 ${c.badge}`}>{node.levelName}</span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">{node.name}</span>
            <span className="text-xs text-slate-500">{node.username}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">인원 {node.userCount}명</span>
            <span className="text-xs text-slate-500">매출 ₩{node.revenue.toLocaleString()}</span>
            {node.level === 2 && (node.vendorBalances ?? []).length > 0 ? (
              (node.vendorBalances ?? []).map((vb) => (
                <span key={vb.key} className="text-xs text-yellow-300 flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  <span className="text-slate-400">{vb.label}:</span>
                  ₩{vb.balance.toLocaleString()}
                </span>
              ))
            ) : node.balance !== undefined ? (
              <span className="text-xs text-yellow-300 flex items-center gap-1">
                <Wallet className="w-3 h-3" />₩{node.balance.toLocaleString()}
              </span>
            ) : null}
            {node.settlement && node.level >= 2 && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Percent className="w-3 h-3" />
                <span className="text-blue-400">{node.settlement.casinoRate}%</span>
                <span className="text-purple-400">{node.settlement.slotRate}%</span>
                <span className="text-green-400">{node.settlement.losingRate}%</span>
              </span>
            )}
            {node.level === 2 && node.rollingShaveEnabled && (
              <span className="text-xs px-1.5 py-0.5 bg-orange-900/40 border border-orange-700/40 rounded text-orange-300 flex items-center gap-1">
                <ScissorsLineDashed className="w-3 h-3" />공배팅 {node.rollingShaveRate}%
              </span>
            )}
            {isAdmin && node.level === 2 && (node.gameApis ?? []).length > 0 && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Server className="w-3 h-3" />{(node.gameApis ?? []).length}개 API
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {node.status !== undefined && canEdit && (
            <button
              onClick={() => onToggleStatus(node)}
              title="클릭하여 상태 변경"
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                node.status === '정상'
                  ? 'border-green-700 text-green-300 hover:bg-green-900/30'
                  : 'border-red-700 text-red-300 hover:bg-red-900/30'
              }`}
            >
              {node.status}
            </button>
          )}
          <button onClick={() => onManage(node)}
            className="px-2 py-1 text-xs rounded border border-slate-500 text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1">
            <Settings className="w-3 h-3" />관리
          </button>
          {canEdit && node.level >= 3 && (
            <button onClick={() => onBalanceTransfer(node)}
              className="px-2 py-1 text-xs rounded border border-yellow-700 text-yellow-300 hover:bg-yellow-900/30 transition-colors flex items-center gap-1">
              <Wallet className="w-3 h-3" />지급/회수
            </button>
          )}
          {canAddChild && (
            <button onClick={() => onAddChild(node)}
              className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1">
              <Plus className="w-3 h-3" />하위 추가
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-l border-slate-700/50" style={{ marginLeft: `${20 + depth * 20}px` }}>
          {(node.children ?? []).map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} myLevel={myLevel}
              canManageLevel={canManageLevel} searchTerm={searchTerm} isAdmin={isAdmin}
              expandOverride={expandOverride}
              onManage={onManage} onAddChild={onAddChild}
              onBalanceTransfer={onBalanceTransfer} onToggleStatus={onToggleStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PartnerHierarchy() {
  const { user, canManage } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [orgTree, setOrgTree] = useState<OrgNode>(FULL_ORG_TREE);
  const [isTreeLoading, setIsTreeLoading] = useState(true);

  const [expandOverride, setExpandOverride] = useState<boolean | null>(null);

  const [manageNode,       setManageNode]       = useState<OrgNode | null>(null);
  const [createParent,     setCreateParent]     = useState<OrgNode | null>(null);
  const [balanceNode,      setBalanceNode]      = useState<OrgNode | null>(null);

  const loadTree = useCallback(async () => {
    setIsTreeLoading(true);
    const tree = await fetchPartnersFromDB();
    if (tree) {
      setOrgTree(tree);
    }
    setIsTreeLoading(false);
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  if (!user) return null;

  const subtree = findSubtree(orgTree, user.orgPath) ?? (user.level === 1 ? orgTree : null);
  const getChildSettlement = (node: OrgNode) => node.children?.[0]?.settlement;

  const handleSaveSettlement = (rates: SettlementRates, rsEnabled: boolean, rsRate: number) => {
    if (!manageNode) return;
    setOrgTree((t) => findAndUpdate(t, manageNode.id, (n) => ({ ...n, settlement: rates, rollingShaveEnabled: rsEnabled, rollingShaveRate: rsRate })));
    setManageNode((prev) => prev ? { ...prev, settlement: rates, rollingShaveEnabled: rsEnabled, rollingShaveRate: rsRate } : null);
  };

  const handleSaveEdit = (data: Partial<OrgNode>) => {
    if (!manageNode) return;
    setOrgTree((t) => findAndUpdate(t, manageNode.id, (n) => ({ ...n, ...data })));
    setManageNode((prev) => prev ? { ...prev, ...data } : null);
    // 운영사 레벨의 gameApis 변경 시 vendorBalances 재반영을 위해 리로드
    if (manageNode.level === 2 && data.gameApis !== undefined) {
      loadTree();
    }
  };

  const handleBalanceTransfer = async (type: 'pay' | 'withdraw', amount: number) => {
    if (!balanceNode) return;
    const newBalance = (balanceNode.balance ?? 0) + (type === 'pay' ? amount : -amount);

    // UI 즉시 반영
    setOrgTree((t) =>
      findAndUpdate(t, balanceNode.id, (n) => ({
        ...n,
        balance: newBalance,
      }))
    );
    setBalanceNode(null);

    try {
      const { error } = await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', balanceNode.id);

      if (error) {
        // 실패 시 UI 롤백
        setOrgTree((t) =>
          findAndUpdate(t, balanceNode.id, (n) => ({
            ...n,
            balance: balanceNode.balance ?? 0,
          }))
        );
        toast.error(`보유금 변경 실패: ${error.message}`);
        return;
      }

      // partner_transactions 이력 기록
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seq = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
      const txNo = `PTR${dateStr}${seq}`;
      await supabase.from('partner_transactions').insert({
        transaction_no: txNo,
        parent_partner_id: user!.id,
        child_partner_id: balanceNode.id,
        type: type === 'pay' ? 'deposit' : 'withdrawal',
        amount,
        memo: `관리자 ${type === 'pay' ? '지급' : '회수'}`,
      });

    } catch {
      setOrgTree((t) =>
        findAndUpdate(t, balanceNode.id, (n) => ({
          ...n,
          balance: balanceNode.balance ?? 0,
        }))
      );
      toast.error('보유금 변경 중 오류가 발생했습니다');
    }
  };

  const handleToggleStatus = async (node: OrgNode) => {
    const next = node.status === '정상' ? '정지' : '정상';
    const dbStatus = next === '정상' ? 'active' : 'suspended';

    // UI 즉시 반영
    setOrgTree((t) => findAndUpdate(t, node.id, (n) => ({ ...n, status: next })));

    try {
      const { error } = await supabase
        .from('users')
        .update({ status: dbStatus })
        .eq('id', node.id);

      if (error) {
        // 실패 시 UI 롤백
        setOrgTree((t) => findAndUpdate(t, node.id, (n) => ({ ...n, status: node.status })));
        toast.error(`상태 변경 실패: ${error.message}`);
        return;
      }

      toast.success(`${node.name} 상태가 ${next}으로 변경되었습니다`);
    } catch {
      // 실패 시 UI 롤백
      setOrgTree((t) => findAndUpdate(t, node.id, (n) => ({ ...n, status: node.status })));
      toast.error('상태 변경 중 오류가 발생했습니다');
    }
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">파트너 계층 관리</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {user.level === 1 ? '전체 파트너 구조 관리' : `${user.levelName} 하위 파트너 관리`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setExpandOverride(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg border border-slate-600 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            전체 펼치기
          </button>
          <button
            onClick={() => setExpandOverride(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg border border-slate-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            전체 접기
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="파트너명 또는 아이디 검색..."
          className="bg-slate-800 border-slate-700 text-white pl-9 h-9" />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-700/40">
        {isTreeLoading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>파트너 목록 불러오는 중...</span>
          </div>
        ) : subtree ? (
          <TreeRow node={subtree} depth={0} myLevel={user.level}
            canManageLevel={canManage} searchTerm={searchTerm} isAdmin={user.level === 1}
            expandOverride={expandOverride}
            onManage={setManageNode} onAddChild={setCreateParent}
            onBalanceTransfer={setBalanceNode} onToggleStatus={handleToggleStatus} />
        ) : (
          <div className="py-16 text-center text-slate-500">표시할 하위 조직이 없습니다</div>
        )}
      </div>

      {/* Modals */}
      {manageNode && (
        <PartnerManageDialog
          node={manageNode}
          open
          onClose={() => setManageNode(null)}
          isAdmin={user.level === 1}
          onSaveSettlement={handleSaveSettlement}
          onSaveEdit={handleSaveEdit}
          childSettlement={getChildSettlement(manageNode)}
        />
      )}
      {createParent && (
        <CreateChildDialog
          parent={createParent}
          open
          onClose={() => setCreateParent(null)}
          onRefresh={loadTree}
        />
      )}
      {balanceNode && (
        <BalanceTransferDialog node={balanceNode} open onClose={() => setBalanceNode(null)} onSave={handleBalanceTransfer} />
      )}
    </div>
  );
}
