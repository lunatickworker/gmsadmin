import { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Tv, Gamepad, Search, X, CheckSquare, Square, Loader2, Image, Check, GripVertical } from 'lucide-react';
import {
  gameVendorService, gameProviderService,
  aceProviderService, aceVendorService,
  honorVendorService,
  HONOR_VENDOR_KEY,
  type GameVendor, type GameProvider, type AceProvider, type HonorProvider,
} from '../../../utils/game-management';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

const ACE_VENDOR_KEY = 'ace';

const CATEGORIES = [
  { value: 'casino', label: '라이브카지노', icon: Tv,       color: 'text-purple-400 bg-purple-900/30' },
  { value: 'slot',   label: '슬롯',         icon: Gamepad, color: 'text-green-400 bg-green-900/30'  },
] as const;

type ApiTab = 'invest' | 'ace' | 'honor';

const API_TABS: { key: ApiTab; label: string; color: string; activeClass: string; badgeClass: string }[] = [
  { key: 'invest', label: 'INVEST', color: 'blue',   activeClass: 'bg-blue-600 text-white',   badgeClass: '' },
  { key: 'ace',    label: 'ACE',    color: 'orange', activeClass: 'bg-orange-600 text-white', badgeClass: 'text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-600/40' },
  { key: 'honor',  label: 'HONOR',  color: 'sky',    activeClass: 'bg-sky-600 text-white',    badgeClass: 'text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-600/40' },
];

type InvestFormData = {
  vendor_id: string;
  provider_id: string;
  provider_name: string;
  category: 'casino' | 'slot';
  is_active: boolean;
};

const DEFAULT_INVEST_FORM: InvestFormData = {
  vendor_id: '',
  provider_id: '',
  provider_name: '',
  category: 'slot',
  is_active: true,
};

export default function GameProviderManage() {
  const [vendors, setVendors]               = useState<GameVendor[]>([]);
  const [providers, setProviders]           = useState<GameProvider[]>([]);
  const [aceProviders, setAceProviders]     = useState<AceProvider[]>([]);
  const [honorProviders, setHonorProviders] = useState<HonorProvider[]>([]);

  const [loading, setLoading]                 = useState(true);
  const [apiTab, setApiTab]                   = useState<ApiTab>('invest');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch]                   = useState('');
  const [bulkToggling, setBulkToggling]       = useState<string | null>(null);
  const [syncingAce, setSyncingAce]           = useState<string | null>(null);
  const [syncingHonor, setSyncingHonor]       = useState<string | null>(null);

  // 드래그&드롭 순서 변경
  const dragSrcRef  = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function onDragStart(id: string) { dragSrcRef.current = id; }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function onDragEnd() { dragSrcRef.current = null; setDragOverId(null); }

  async function onProviderDrop<T extends { id: string }>(
    list: T[],
    table: string,
    targetId: string,
    getMetadata: (item: T) => Record<string, any>,
  ) {
    const srcId = dragSrcRef.current;
    onDragEnd();
    if (!srcId || srcId === targetId) return;
    const sorted = [...list].sort((a, b) => (getMetadata(a).sort_order ?? 9999) - (getMetadata(b).sort_order ?? 9999));
    const srcIdx = sorted.findIndex(p => p.id === srcId);
    const tgtIdx = sorted.findIndex(p => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    await Promise.all(reordered.map((p, idx) => {
      const meta = { ...getMetadata(p), sort_order: idx };
      return supabase.from(table).update({ metadata: meta }).eq('id', p.id);
    }));
    toast.success('순서가 저장되었습니다.');
    loadAll();
  }

  // 이미지 URL 인라인 편집
  const [editingImgId, setEditingImgId]       = useState<string | null>(null);
  const [imgUrlInput, setImgUrlInput]         = useState('');
  const [savingImg, setSavingImg]             = useState(false);

  // INVEST 제공사 모달
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<InvestFormData>(DEFAULT_INVEST_FORM);
  const [saving, setSaving]         = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      setLoading(true);
      const [v, p, ap] = await Promise.all([
        gameVendorService.getAll(),
        gameProviderService.getAll(),
        aceProviderService.getAll().catch(() => [] as AceProvider[]),
      ]);
      setVendors(v);
      setProviders(p);
      setAceProviders(ap);

      const { data: hp } = await supabase.from('game_provider_honor').select('*').order('vendor_name');
      setHonorProviders(hp || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── INVEST ──────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    const investVendors = vendors.filter(v => v.vendor_key !== ACE_VENDOR_KEY && v.vendor_key !== HONOR_VENDOR_KEY);
    setForm({ ...DEFAULT_INVEST_FORM, vendor_id: investVendors[0]?.id ?? '' });
    setShowModal(true);
  }

  function openEdit(p: GameProvider) {
    setEditingId(p.id);
    setForm({
      vendor_id: p.vendor_id,
      provider_id: String(p.provider_id),
      provider_name: p.provider_name,
      category: p.category as 'casino' | 'slot',
      is_active: p.is_active,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.vendor_id || !form.provider_id || !form.provider_name) {
      toast.error('필수 항목을 모두 입력해주세요.');
      return;
    }
    const pid = parseInt(form.provider_id);
    if (isNaN(pid)) { toast.error('제공사 ID는 숫자여야 합니다.'); return; }
    try {
      setSaving(true);
      if (editingId) {
        await gameProviderService.update(editingId, { provider_id: pid, provider_name: form.provider_name, category: form.category, is_active: form.is_active });
        toast.success('제공사 정보가 수정되었습니다.');
      } else {
        await gameProviderService.create({ vendor_id: form.vendor_id, provider_id: pid, provider_name: form.provider_name, category: form.category, is_active: form.is_active });
        toast.success('게임 제공사가 등록되었습니다.');
      }
      setShowModal(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── 이미지 URL 관리 ─────────────────────────────────────────

  function openImgEdit(id: string, currentUrl: string) {
    setEditingImgId(id);
    setImgUrlInput(currentUrl);
  }

  function closeImgEdit() {
    setEditingImgId(null);
    setImgUrlInput('');
  }

  async function saveInvestImg(p: GameProvider) {
    try {
      setSavingImg(true);
      const url = imgUrlInput.trim();
      const newMeta = { ...(p as any).metadata, image_url: url || null };
      const { error } = await supabase.from('game_provider_invest').update({ metadata: newMeta }).eq('id', p.id);
      if (error) throw new Error(error.message);
      toast.success('이미지 주소가 저장되었습니다.');
      closeImgEdit();
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingImg(false); }
  }

  async function saveAceImg(p: AceProvider) {
    try {
      setSavingImg(true);
      const url = imgUrlInput.trim();
      const newMeta = { ...p.metadata, image_url: url || null };
      const { error } = await supabase.from('game_provider_ace').update({ metadata: newMeta }).eq('id', p.id);
      if (error) throw new Error(error.message);
      toast.success('이미지 주소가 저장되었습니다.');
      closeImgEdit();
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingImg(false); }
  }

  async function saveHonorImg(p: HonorProvider) {
    try {
      setSavingImg(true);
      const url = imgUrlInput.trim();
      const newMeta = { ...p.metadata, image_url: url || null };
      const { error } = await supabase.from('game_provider_honor').update({ metadata: newMeta }).eq('id', p.id);
      if (error) throw new Error(error.message);
      toast.success('이미지 주소가 저장되었습니다.');
      closeImgEdit();
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingImg(false); }
  }

  async function handleDelete(p: GameProvider) {
    if (!confirm(`"${p.provider_name}" 제공사를 삭제하시겠습니까?\n연결된 게임 목록도 모두 삭제됩니다.`)) return;
    try {
      await gameProviderService.delete(p.id);
      toast.success('삭제되었습니다.');
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleToggleActive(p: GameProvider) {
    try {
      await gameProviderService.update(p.id, { is_active: !p.is_active });
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleBulkToggle(category: 'casino' | 'slot', activate: boolean) {
    const targets = filteredInvest.filter(p => p.category === category && p.is_active !== activate);
    if (targets.length === 0) { toast.info(activate ? '이미 모두 활성화되어 있습니다.' : '이미 모두 비활성화되어 있습니다.'); return; }
    const label = category === 'casino' ? '라이브카지노' : '슬롯';
    if (!confirm(`${label} 제공사 ${targets.length}개를 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkToggling(category);
      await Promise.all(targets.map(p => gameProviderService.update(p.id, { is_active: activate })));
      toast.success(`${label} ${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkToggling(null); }
  }

  // ─── ACE ─────────────────────────────────────────────────────

  async function handleAceToggle(p: AceProvider) {
    try { await aceProviderService.toggleActive(p.id, !p.is_active); loadAll(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function handleAceDelete(p: AceProvider) {
    if (!confirm(`"${p.vendor_name}" ACE 제공사를 삭제하시겠습니까?`)) return;
    try { await aceProviderService.delete(p.id); toast.success('삭제되었습니다.'); loadAll(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function handleAceSync(p: AceProvider) {
    const vendor = vendors.find(v => v.id === p.vendor_id);
    if (!vendor) { toast.error('게임사 정보를 찾을 수 없습니다.'); return; }
    try {
      setSyncingAce(p.id);
      toast.info(`${p.vendor_name} 동기화 중...`);
      const r = await aceVendorService.syncGamesForProvider(p, vendor);
      toast.success(`동기화 완료: ${r.added}개 추가, ${r.updated}개 업데이트`);
      loadAll();
    } catch (e: any) { toast.error(`동기화 실패: ${e.message}`); }
    finally { setSyncingAce(null); }
  }

  async function handleAceBulkToggle(category: 'casino' | 'slot', activate: boolean) {
    const targets = filteredAce.filter(p => p.category === category && p.is_active !== activate);
    if (targets.length === 0) { toast.info(activate ? '이미 모두 활성화되어 있습니다.' : '이미 모두 비활성화되어 있습니다.'); return; }
    const label = category === 'casino' ? '라이브카지노' : '슬롯';
    if (!confirm(`ACE ${label} ${targets.length}개를 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkToggling(`ace-${category}`);
      await Promise.all(targets.map(p => aceProviderService.toggleActive(p.id, activate)));
      toast.success(`${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkToggling(null); }
  }

  // ─── HONOR ───────────────────────────────────────────────────

  async function handleHonorToggle(p: HonorProvider) {
    try {
      const { error } = await supabase.from('game_provider_honor').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw new Error(error.message);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleHonorDelete(p: HonorProvider) {
    if (!confirm(`"${p.vendor_name}" Honor 제공사를 삭제하시겠습니까?\n연결된 게임 목록도 모두 삭제됩니다.`)) return;
    try {
      await honorVendorService.deleteProvider(p.id);
      toast.success('삭제되었습니다.');
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleHonorSync(p: HonorProvider) {
    const vendor = vendors.find(v => v.vendor_key === HONOR_VENDOR_KEY && v.id === p.vendor_id);
    if (!vendor) { toast.error('게임사 정보를 찾을 수 없습니다.'); return; }
    try {
      setSyncingHonor(p.id);
      toast.info(`${p.vendor_name} 동기화 중...`);
      const r = await honorVendorService.syncGamesForProvider(p, vendor);
      toast.success(`동기화 완료: ${r.added}개 추가, ${r.updated}개 업데이트`);
      loadAll();
    } catch (e: any) { toast.error(`동기화 실패: ${e.message}`); }
    finally { setSyncingHonor(null); }
  }

  async function handleHonorBulkToggle(category: 'casino' | 'slot', activate: boolean) {
    const targets = filteredHonor.filter(p => p.category === category && p.is_active !== activate);
    if (targets.length === 0) { toast.info(activate ? '이미 모두 활성화되어 있습니다.' : '이미 모두 비활성화되어 있습니다.'); return; }
    const label = category === 'casino' ? '라이브카지노' : '슬롯';
    if (!confirm(`Honor ${label} ${targets.length}개를 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkToggling(`honor-${category}`);
      await Promise.all(targets.map(p =>
        supabase.from('game_provider_honor').update({ is_active: activate }).eq('id', p.id)
      ));
      toast.success(`${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkToggling(null); }
  }

  // ─── 필터링 ──────────────────────────────────────────────────

  const investVendors = vendors.filter(v => v.vendor_key !== ACE_VENDOR_KEY && v.vendor_key !== HONOR_VENDOR_KEY);

  const filteredInvest = providers.filter(p => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.provider_name.toLowerCase().includes(q) && !String(p.provider_id).includes(q)) return false;
    }
    return true;
  });

  const filteredAce = aceProviders.filter(p => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.vendor_name.toLowerCase().includes(q) && !p.vendor_key.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredHonor = honorProviders.filter(p => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.vendor_name.toLowerCase().includes(q) && !p.vendor_key.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const investGrouped = {
    casino: filteredInvest.filter(p => p.category === 'casino'),
    slot:   filteredInvest.filter(p => p.category === 'slot'),
  };
  const aceGrouped = {
    casino: filteredAce.filter(p => p.category === 'casino'),
    slot:   filteredAce.filter(p => p.category === 'slot'),
  };
  const honorGrouped = {
    casino: filteredHonor.filter(p => p.category === 'casino'),
    slot:   filteredHonor.filter(p => p.category === 'slot'),
  };

  const currentGrouped = apiTab === 'ace' ? aceGrouped : apiTab === 'honor' ? honorGrouped : investGrouped;

  // ─── 공통 카드 렌더 헬퍼 ────────────────────────────────────

  function ImageUrlRow({
    id, imageUrl, onSave,
  }: {
    id: string;
    imageUrl: string | null | undefined;
    onSave: () => void;
  }) {
    const isEditing = editingImgId === id;
    return (
      <div className="mt-3 border-t border-slate-700/50 pt-3">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              {imgUrlInput && (
                <img src={imgUrlInput} alt="preview" className="w-8 h-8 rounded object-contain bg-slate-700 shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <input
                autoFocus
                value={imgUrlInput}
                onChange={e => setImgUrlInput(e.target.value)}
                placeholder="https://example.com/image.png"
                className="flex-1 min-w-0 bg-slate-900 border border-slate-600 focus:border-blue-500 rounded px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') closeImgEdit(); }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onSave}
                disabled={savingImg}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
              >
                {savingImg ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} 저장
              </button>
              {imgUrlInput && (
                <button
                  onClick={() => setImgUrlInput('')}
                  className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 border border-red-700/40 rounded transition-colors"
                >
                  URL 삭제
                </button>
              )}
              <button onClick={closeImgEdit} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">취소</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => openImgEdit(id, imageUrl ?? '')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full text-left group"
          >
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="img" className="w-6 h-6 rounded object-contain bg-slate-700 shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                <span className="truncate flex-1 font-mono text-[10px] text-slate-500 group-hover:text-slate-400">{imageUrl}</span>
                <Edit2 size={10} className="shrink-0 opacity-0 group-hover:opacity-100" />
              </>
            ) : (
              <>
                <Image size={11} className="shrink-0" />
                <span className="text-slate-600 group-hover:text-slate-400">이미지 URL 설정</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  function StatusBadge({ active, onToggle }: { active: boolean; onToggle: () => void }) {
    return (
      <button
        onClick={onToggle}
        className={`text-xs px-2 py-0.5 rounded transition-colors ${
          active
            ? 'bg-green-900/30 text-green-400 hover:bg-red-900/30 hover:text-red-400'
            : 'bg-slate-700 text-slate-400 hover:bg-green-900/30 hover:text-green-400'
        }`}
      >
        {active ? '활성' : '비활성'}
      </button>
    );
  }

  function BulkActions({
    category, bulkKey, list, onActivate, onDeactivate,
  }: {
    category: 'casino' | 'slot';
    bulkKey: string;
    list: { is_active: boolean }[];
    onActivate: () => void;
    onDeactivate: () => void;
  }) {
    if (list.length === 0) return null;
    return (
      <div className="flex items-center gap-2">
        {bulkToggling === bulkKey && <Loader2 size={13} className="animate-spin text-slate-400" />}
        <button
          onClick={onActivate}
          disabled={bulkToggling === bulkKey || list.every(p => p.is_active)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700/40 rounded-lg transition-colors disabled:opacity-40"
        >
          <CheckSquare size={12} /> 전체 활성화
        </button>
        <button
          onClick={onDeactivate}
          disabled={bulkToggling === bulkKey || list.every(p => !p.is_active)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600/40 rounded-lg transition-colors disabled:opacity-40"
        >
          <Square size={12} /> 전체 비활성화
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl text-slate-100">게임 제공사 관리</h2>
          <p className="text-sm text-slate-400 mt-0.5">API사별 제공사를 카테고리로 분류하여 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="p-2 text-slate-400 hover:text-slate-200 transition-colors" title="새로고침">
            <RefreshCw size={16} />
          </button>
          {apiTab === 'invest' && (
            <button
              onClick={openCreate}
              disabled={investVendors.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors disabled:opacity-40"
            >
              <Plus size={16} /> 제공사 추가
            </button>
          )}
        </div>
      </div>

      {/* API 탭 */}
      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        {API_TABS.map(tab => {
          const count = tab.key === 'invest' ? providers.length : tab.key === 'ace' ? aceProviders.length : honorProviders.length;
          const isActive = apiTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setApiTab(tab.key); setSelectedCategory('all'); setSearch(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
                isActive ? tab.activeClass : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.badgeClass && (
                <span className={tab.badgeClass}>{tab.label}</span>
              )}
              {!tab.badgeClass && tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-700 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
          {[{ value: 'all', label: '전체' }, ...CATEGORIES].map(c => (
            <button
              key={c.value}
              onClick={() => setSelectedCategory(c.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                selectedCategory === c.value ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-52">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제공사명 또는 키 검색"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500 flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── INVEST ── */}
          {apiTab === 'invest' && (
            filteredInvest.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p>등록된 INVEST 제공사가 없습니다.</p>
                <p className="text-sm mt-1">"제공사 추가" 버튼으로 등록하거나, 게임사 API 등록 메뉴에서 자동으로 가져오세요.</p>
              </div>
            ) : (
              <>
                {/* 요약 */}
                <div className="flex items-center gap-3 bg-blue-900/10 border border-blue-700/30 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-blue-400 bg-blue-900/40 border border-blue-600/40 px-2 py-1 rounded">INVEST API</span>
                  <span className="text-sm text-slate-400">
                    총 <span className="text-slate-200 font-medium">{filteredInvest.length}개</span> 제공사
                    · 활성 <span className="text-green-400 font-medium">{filteredInvest.filter(p => p.is_active).length}개</span>
                    · 카지노 <span className="text-purple-400 font-medium">{investGrouped.casino.length}개</span>
                    · 슬롯 <span className="text-green-400 font-medium">{investGrouped.slot.length}개</span>
                  </span>
                </div>
                {CATEGORIES.map(cat => {
                  const list = investGrouped[cat.value as 'casino' | 'slot'];
                  if (selectedCategory !== 'all' && selectedCategory !== cat.value) return null;
                  const Icon = cat.icon;
                  return (
                    <div key={cat.value}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${cat.color}`}>
                            <Icon size={14} /> {cat.label}
                          </span>
                          <span className="text-xs text-slate-500">{list.length}개</span>
                          <span className="text-xs text-slate-600">(활성 {list.filter(p => p.is_active).length}개)</span>
                        </div>
                        <BulkActions
                          category={cat.value as 'casino' | 'slot'}
                          bulkKey={cat.value}
                          list={list}
                          onActivate={() => handleBulkToggle(cat.value as 'casino' | 'slot', true)}
                          onDeactivate={() => handleBulkToggle(cat.value as 'casino' | 'slot', false)}
                        />
                      </div>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-600 pl-2">등록된 제공사 없음</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[...list].sort((a, b) => ((a as any).metadata?.sort_order ?? 9999) - ((b as any).metadata?.sort_order ?? 9999)).map(p => (
                            <div
                              key={p.id}
                              draggable
                              onDragStart={() => onDragStart(p.id)}
                              onDragOver={e => onDragOver(e, p.id)}
                              onDrop={() => onProviderDrop(list, 'game_provider_invest', p.id, x => (x as any).metadata ?? {})}
                              onDragEnd={onDragEnd}
                              className={`bg-slate-800 border rounded-xl p-4 transition-all cursor-grab active:cursor-grabbing ${dragOverId === p.id ? 'border-blue-500 bg-slate-700/80 scale-[1.01]' : 'border-slate-700'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <GripVertical size={14} className="mt-0.5 text-slate-600 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                                      <span className="text-slate-100 text-sm truncate">{p.provider_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      <span className="text-xs text-slate-500 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">ID: {p.provider_id}</span>
                                      {p.vendor && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{p.vendor.vendor_name}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <StatusBadge active={p.is_active} onToggle={() => handleToggleActive(p)} />
                                  <button onClick={() => openEdit(p)} className="p-1 text-slate-500 hover:text-blue-400 transition-colors">
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => handleDelete(p)} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              {p.synced_at && (
                                <p className="text-xs text-slate-600 mt-2">동기화: {new Date(p.synced_at).toLocaleDateString('ko-KR')}</p>
                              )}
                              <ImageUrlRow
                                id={p.id}
                                imageUrl={(p as any).metadata?.image_url}
                                onSave={() => saveInvestImg(p)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          )}

          {/* ── ACE ── */}
          {apiTab === 'ace' && (
            filteredAce.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p>등록된 ACE 제공사가 없습니다.</p>
                <p className="text-sm mt-1">"게임사 API 등록" 메뉴에서 ACE 게임사의 "제공사 가져오기"를 실행하세요.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-orange-900/10 border border-orange-700/30 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-orange-400 bg-orange-900/40 border border-orange-600/40 px-2 py-1 rounded">ACE API</span>
                  <span className="text-sm text-slate-400">
                    총 <span className="text-slate-200 font-medium">{filteredAce.length}개</span> 제공사
                    · 활성 <span className="text-green-400 font-medium">{filteredAce.filter(p => p.is_active).length}개</span>
                    · 카지노 <span className="text-purple-400 font-medium">{aceGrouped.casino.length}개</span>
                    · 슬롯 <span className="text-green-400 font-medium">{aceGrouped.slot.length}개</span>
                  </span>
                </div>
                {CATEGORIES.map(cat => {
                  const list = aceGrouped[cat.value as 'casino' | 'slot'];
                  if (selectedCategory !== 'all' && selectedCategory !== cat.value) return null;
                  const Icon = cat.icon;
                  const bulkKey = `ace-${cat.value}`;
                  return (
                    <div key={cat.value}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${cat.color}`}>
                            <Icon size={14} /> {cat.label}
                          </span>
                          <span className="text-xs text-slate-500">{list.length}개</span>
                          <span className="text-xs text-slate-600">(활성 {list.filter(p => p.is_active).length}개)</span>
                        </div>
                        <BulkActions
                          category={cat.value as 'casino' | 'slot'}
                          bulkKey={bulkKey}
                          list={list}
                          onActivate={() => handleAceBulkToggle(cat.value as 'casino' | 'slot', true)}
                          onDeactivate={() => handleAceBulkToggle(cat.value as 'casino' | 'slot', false)}
                        />
                      </div>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-600 pl-2">등록된 제공사 없음</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[...list].sort((a, b) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))).map(p => (
                            <div
                              key={p.id}
                              draggable
                              onDragStart={() => onDragStart(p.id)}
                              onDragOver={e => onDragOver(e, p.id)}
                              onDrop={() => onProviderDrop(list, 'game_provider_ace', p.id, x => x.metadata ?? {})}
                              onDragEnd={onDragEnd}
                              className={`bg-slate-800 border rounded-xl p-4 transition-all cursor-grab active:cursor-grabbing ${dragOverId === p.id ? 'border-orange-500 bg-slate-700/80 scale-[1.01]' : 'border-slate-700'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <GripVertical size={14} className="mt-0.5 text-slate-600 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                                      <span className="text-slate-100 text-sm truncate">{p.vendor_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      <span className="text-xs text-slate-500 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">{p.vendor_key}</span>
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-400 border border-orange-700/30">ACE</span>
                                    </div>
                                    {Array.isArray(p.metadata?.skins) && p.metadata.skins.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {p.metadata.skins.slice(0, 3).map((s: any) => (
                                          <span key={s.skin} className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded font-mono">{s.skin}</span>
                                        ))}
                                        {p.metadata.skins.length > 3 && (
                                          <span className="text-xs text-slate-600">+{p.metadata.skins.length - 3}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <StatusBadge active={p.is_active} onToggle={() => handleAceToggle(p)} />
                                  <button onClick={() => handleAceSync(p)} disabled={syncingAce === p.id} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors" title="게임 동기화">
                                    {syncingAce === p.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                  </button>
                                  <button onClick={() => handleAceDelete(p)} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              {p.synced_at && (
                                <p className="text-xs text-slate-600 mt-2">동기화: {new Date(p.synced_at).toLocaleDateString('ko-KR')}</p>
                              )}
                              <ImageUrlRow
                                id={p.id}
                                imageUrl={p.metadata?.image_url}
                                onSave={() => saveAceImg(p)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          )}

          {/* ── HONOR ── */}
          {apiTab === 'honor' && (
            filteredHonor.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <p>등록된 HONOR 제공사가 없습니다.</p>
                <p className="text-sm mt-1">"게임사 API 등록" 메뉴에서 HONOR 게임사의 "제공사 가져오기"를 실행하세요.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-sky-900/10 border border-sky-700/30 rounded-xl px-4 py-3">
                  <span className="text-xs font-bold text-sky-400 bg-sky-900/40 border border-sky-600/40 px-2 py-1 rounded">HONOR API</span>
                  <span className="text-sm text-slate-400">
                    총 <span className="text-slate-200 font-medium">{filteredHonor.length}개</span> 제공사
                    · 활성 <span className="text-green-400 font-medium">{filteredHonor.filter(p => p.is_active).length}개</span>
                    · 카지노 <span className="text-purple-400 font-medium">{honorGrouped.casino.length}개</span>
                    · 슬롯 <span className="text-green-400 font-medium">{honorGrouped.slot.length}개</span>
                  </span>
                </div>
                {CATEGORIES.map(cat => {
                  const list = honorGrouped[cat.value as 'casino' | 'slot'];
                  if (selectedCategory !== 'all' && selectedCategory !== cat.value) return null;
                  const Icon = cat.icon;
                  const bulkKey = `honor-${cat.value}`;
                  return (
                    <div key={cat.value}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm ${cat.color}`}>
                            <Icon size={14} /> {cat.label}
                          </span>
                          <span className="text-xs text-slate-500">{list.length}개</span>
                          <span className="text-xs text-slate-600">(활성 {list.filter(p => p.is_active).length}개)</span>
                        </div>
                        <BulkActions
                          category={cat.value as 'casino' | 'slot'}
                          bulkKey={bulkKey}
                          list={list}
                          onActivate={() => handleHonorBulkToggle(cat.value as 'casino' | 'slot', true)}
                          onDeactivate={() => handleHonorBulkToggle(cat.value as 'casino' | 'slot', false)}
                        />
                      </div>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-600 pl-2">등록된 제공사 없음</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[...list].sort((a, b) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))).map(p => (
                            <div
                              key={p.id}
                              draggable
                              onDragStart={() => onDragStart(p.id)}
                              onDragOver={e => onDragOver(e, p.id)}
                              onDrop={() => onProviderDrop(list, 'game_provider_honor', p.id, x => x.metadata ?? {})}
                              onDragEnd={onDragEnd}
                              className={`bg-slate-800 border rounded-xl p-4 transition-all cursor-grab active:cursor-grabbing ${dragOverId === p.id ? 'border-sky-500 bg-slate-700/80 scale-[1.01]' : 'border-slate-700'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <GripVertical size={14} className="mt-0.5 text-slate-600 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${p.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                                      <span className="text-slate-100 text-sm truncate">{p.vendor_name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      <span className="text-xs text-slate-500 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">{p.vendor_key}</span>
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/30 text-sky-400 border border-sky-700/30">HONOR</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <StatusBadge active={p.is_active} onToggle={() => handleHonorToggle(p)} />
                                  <button onClick={() => handleHonorSync(p)} disabled={syncingHonor === p.id} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors" title="게임 동기화">
                                    {syncingHonor === p.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                  </button>
                                  <button onClick={() => handleHonorDelete(p)} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              {p.synced_at && (
                                <p className="text-xs text-slate-600 mt-2">동기화: {new Date(p.synced_at).toLocaleDateString('ko-KR')}</p>
                              )}
                              <ImageUrlRow
                                id={p.id}
                                imageUrl={p.metadata?.image_url}
                                onSave={() => saveHonorImg(p)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )
          )}
        </div>
      )}

      {/* 하단 통계 */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
          {CATEGORIES.map(cat => {
            const count = currentGrouped[cat.value as 'casino' | 'slot'].length;
            const apiLabel = apiTab === 'ace' ? 'ACE' : apiTab === 'honor' ? 'HONOR' : 'INVEST';
            return (
              <div key={cat.value} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3">
                <span className={`p-2 rounded-lg ${cat.color}`}>
                  <cat.icon size={18} />
                </span>
                <div>
                  <p className="text-2xl text-slate-100">{count}</p>
                  <p className="text-xs text-slate-400">{cat.label} 제공사 ({apiLabel})</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* INVEST 제공사 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-700">
              <h3 className="text-slate-100">{editingId ? '제공사 수정' : '제공사 추가'}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">게임사 *</label>
                <select
                  value={form.vendor_id}
                  onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  {investVendors.map(v => (
                    <option key={v.id} value={v.id}>{v.vendor_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">제공사 ID (숫자) *</label>
                  <input
                    value={form.provider_id}
                    onChange={e => setForm(f => ({ ...f, provider_id: e.target.value }))}
                    placeholder="410"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">카테고리 *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as 'casino' | 'slot' }))}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">제공사 이름 *</label>
                <input
                  value={form.provider_name}
                  onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))}
                  placeholder="Evolution Gaming"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-300">활성화</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">취소</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
