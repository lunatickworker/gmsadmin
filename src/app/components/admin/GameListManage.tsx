import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search, ToggleLeft, ToggleRight, Trash2, Play, Loader2, CheckSquare, Square, GripVertical } from 'lucide-react';
import {
  gameProviderService, gameItemService, gameLaunchService,
  aceProviderService, aceGameService, aceVendorService,
  honorVendorService, HONOR_VENDOR_KEY,
  type GameProvider, type GameItem, type GameVendor,
  type AceProvider, type AceGame,
  type HonorProvider, type HonorGame,
} from '../../../utils/game-management';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

const ACE_VENDOR_KEY = 'ace';

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  casino: { label: '라이브카지노', color: 'text-purple-400 bg-purple-900/30' },
  slot:   { label: '슬롯',        color: 'text-green-400 bg-green-900/30'  },
};

// vendor_key → tab 이름 매핑 (ace 계열은 모두 'ace' 탭으로)
function vendorKeyToTab(key: string): 'invest' | 'ace' | 'honor' | null {
  if (key === 'ace' || key.startsWith('ace')) return 'ace';
  if (key === 'honor') return 'honor';
  // invest, gms 등 나머지는 invest 탭
  return 'invest';
}

export default function GameListManage() {
  const { user } = useAuth();
  const [allowedTabs, setAllowedTabs] = useState<Set<'invest' | 'ace' | 'honor'> | null>(null); // null = 아직 로드 전
  const [apiTab, setApiTab] = useState<'invest' | 'ace' | 'honor'>('invest');

  // ── INVEST ──────────────────────────────────────────────────
  const [providers, setProviders]               = useState<GameProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<GameProvider | null>(null);
  const [games, setGames]                       = useState<GameItem[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingGames, setLoadingGames]         = useState(false);
  const [syncing, setSyncing]                   = useState(false);
  const [launchingId, setLaunchingId]           = useState<string | null>(null);
  const [bulkToggling, setBulkToggling]         = useState(false);
  const tokenCache = useRef<Record<string, string>>({});

  // ── ACE ─────────────────────────────────────────────────────
  const [aceProviders, setAceProviders]               = useState<AceProvider[]>([]);
  const [selectedAceProvider, setSelectedAceProvider] = useState<AceProvider | null>(null);
  const [aceGames, setAceGames]                       = useState<AceGame[]>([]);
  const [loadingAceProviders, setLoadingAceProviders] = useState(false);
  const [loadingAceGames, setLoadingAceGames]         = useState(false);
  const [syncingAce, setSyncingAce]                   = useState(false);
  const [launchingAceId, setLaunchingAceId]           = useState<string | null>(null);
  const [bulkTogglingAce, setBulkTogglingAce]         = useState(false);
  const aceRegisterCache = useRef<Set<string>>(new Set());

  // ── HONOR ────────────────────────────────────────────────────
  const [honorProviders, setHonorProviders]               = useState<HonorProvider[]>([]);
  const [selectedHonorProvider, setSelectedHonorProvider] = useState<HonorProvider | null>(null);
  const [honorGames, setHonorGames]                       = useState<HonorGame[]>([]);
  const [honorLobbies, setHonorLobbies]                   = useState<HonorGame[]>([]);
  const [honorSubTab, setHonorSubTab]                     = useState<'game' | 'lobby'>('game');
  const [loadingHonorProviders, setLoadingHonorProviders] = useState(false);
  const [loadingHonorGames, setLoadingHonorGames]         = useState(false);
  const [loadingHonorLobbies, setLoadingHonorLobbies]     = useState(false);
  const [syncingHonor, setSyncingHonor]                   = useState(false);
  const [syncingHonorLobby, setSyncingHonorLobby]         = useState(false);
  const [launchingHonorId, setLaunchingHonorId]           = useState<string | null>(null);
  const [bulkTogglingHonor, setBulkTogglingHonor]         = useState(false);

  const [search, setSearch] = useState('');

  // ── 드래그&드롭 순서 변경 ─────────────────────────────────────
  const gameDragSrcRef  = useRef<string | null>(null);
  const [gameDragOverId, setGameDragOverId] = useState<string | null>(null);

  function onGameDragStart(id: string) { gameDragSrcRef.current = id; }
  function onGameDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setGameDragOverId(id); }
  function onGameDragEnd() { gameDragSrcRef.current = null; setGameDragOverId(null); }

  async function onGameDrop<T extends { id: string; metadata: Record<string, any> }>(
    list: T[],
    table: string,
    targetId: string,
    setList: (items: T[]) => void,
  ) {
    const srcId = gameDragSrcRef.current;
    onGameDragEnd();
    if (!srcId || srcId === targetId) return;
    const sorted = [...list].sort((a, b) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999)));
    const srcIdx = sorted.findIndex(g => g.id === srcId);
    const tgtIdx = sorted.findIndex(g => g.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    const updated = reordered.map((g, idx) => ({ ...g, metadata: { ...g.metadata, sort_order: idx } })) as unknown as T[];
    setList(updated);
    await Promise.all(updated.map(g =>
      supabase.from(table).update({ metadata: g.metadata }).eq('id', g.id)
    ));
    toast.success('순서가 저장되었습니다.');
  }

  // 운영사 계정이면 partner_settings에서 허용된 vendor key 목록을 가져와 탭 제한
  useEffect(() => {
    const resolveAllowedTabs = async () => {
      if (!user || user.role === 'system_admin') {
        // 시스템 관리자: 모든 탭 허용
        setAllowedTabs(new Set(['invest', 'ace', 'honor']));
        return;
      }

      // 운영사 본인 또는 그 상위 운영사의 partner_settings 조회
      const operatorId = user.role === 'operator'
        ? user.id
        : user.hierarchyPath.find(async (id) => {
            const { data } = await supabase.from('users').select('role').eq('id', id).single();
            return data?.role === 'operator';
          });

      if (!operatorId) {
        setAllowedTabs(new Set(['invest', 'ace', 'honor']));
        return;
      }

      // 운영사 ID 확정 (hierarchy_path에서 operator 찾기)
      let resolvedOperatorId = user.role === 'operator' ? user.id : null;
      if (!resolvedOperatorId && user.hierarchyPath.length > 0) {
        const { data: rows } = await supabase
          .from('users')
          .select('id, role')
          .in('id', user.hierarchyPath)
          .eq('role', 'operator');
        resolvedOperatorId = rows?.[0]?.id ?? null;
      }

      if (!resolvedOperatorId) {
        setAllowedTabs(new Set(['invest', 'ace', 'honor']));
        return;
      }

      const { data: settings } = await supabase
        .from('partner_settings')
        .select('game_vendor_keys')
        .eq('user_id', resolvedOperatorId)
        .maybeSingle();

      const keys: string[] = settings?.game_vendor_keys ?? [];
      if (keys.length === 0) {
        // 설정이 없으면 모두 허용
        setAllowedTabs(new Set(['invest', 'ace', 'honor']));
        return;
      }

      const tabs = new Set<'invest' | 'ace' | 'honor'>();
      for (const k of keys) {
        const tab = vendorKeyToTab(k);
        if (tab) tabs.add(tab);
      }
      setAllowedTabs(tabs);

      // 현재 선택된 탭이 허용되지 않으면 첫 번째 허용 탭으로 이동
      setApiTab(prev => (tabs.has(prev) ? prev : (Array.from(tabs)[0] ?? 'invest')));
    };

    resolveAllowedTabs();
  }, [user?.id]);

  useEffect(() => { loadProviders(); loadAceProviders(); loadHonorProviders(); }, []);
  useEffect(() => {
    if (selectedProvider) loadGames(selectedProvider.id);
    else setGames([]);
  }, [selectedProvider]);
  useEffect(() => {
    if (selectedAceProvider) loadAceGames(selectedAceProvider.id);
    else setAceGames([]);
  }, [selectedAceProvider]);
  useEffect(() => {
    if (selectedHonorProvider) {
      loadHonorGames(selectedHonorProvider.id);
      loadHonorLobbies(selectedHonorProvider.id);
    } else {
      setHonorGames([]);
      setHonorLobbies([]);
    }
  }, [selectedHonorProvider]);

  // ── INVEST 로더 ──────────────────────────────────────────────

  async function loadProviders() {
    try {
      setLoadingProviders(true);
      const data = await gameProviderService.getAll();
      setProviders(data);
      if (data.length > 0 && !selectedProvider) setSelectedProvider(data[0]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function loadGames(providerDbId: string) {
    try {
      setLoadingGames(true);
      setGames(await gameItemService.getByProvider(providerDbId));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingGames(false);
    }
  }

  // ── ACE 로더 ─────────────────────────────────────────────────

  async function loadAceProviders() {
    try {
      setLoadingAceProviders(true);
      const data = await aceProviderService.getAll().catch(() => [] as AceProvider[]);
      setAceProviders(data);
      if (data.length > 0 && !selectedAceProvider) setSelectedAceProvider(data[0]);
    } catch {
    } finally {
      setLoadingAceProviders(false);
    }
  }

  async function loadAceGames(providerDbId: string) {
    try {
      setLoadingAceGames(true);
      setAceGames(await aceGameService.getByProvider(providerDbId));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingAceGames(false);
    }
  }

  // ── HONOR 로더 ───────────────────────────────────────────────

  async function loadHonorProviders() {
    try {
      setLoadingHonorProviders(true);
      const { data, error } = await supabase
        .from('game_provider_honor')
        .select('*, vendor:game_vendors(*)')
        .order('vendor_name');
      if (error) throw new Error(error.message);
      const list: HonorProvider[] = data || [];
      setHonorProviders(list);
      if (list.length > 0 && !selectedHonorProvider) setSelectedHonorProvider(list[0]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingHonorProviders(false);
    }
  }

  async function loadHonorGames(providerDbId: string) {
    try {
      setLoadingHonorGames(true);
      const { data, error } = await supabase
        .from('game_honor')
        .select('*')
        .eq('provider_id', providerDbId)
        .neq('type', 'lobby')
        .order('title');
      if (error) throw new Error(error.message);
      setHonorGames(data || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingHonorGames(false);
    }
  }

  async function loadHonorLobbies(providerDbId: string) {
    try {
      setLoadingHonorLobbies(true);
      const data = await honorVendorService.getLobbyGames(providerDbId);
      setHonorLobbies(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingHonorLobbies(false);
    }
  }

  // ── INVEST 핸들러 ─────────────────────────────────────────────

  async function handleSync() {
    if (!selectedProvider) return;
    const vendor = selectedProvider.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setSyncing(true);
      toast.info(`${selectedProvider.provider_name} 게임 목록 동기화 중...`);
      const result = await gameItemService.syncFromApi(selectedProvider, vendor);
      if (result.added === 0 && result.updated === 0) {
        toast.warning(`동기화 완료 — 게임 없음 (API가 빈 목록 반환). 콘솔에서 응답 확인 요망.`);
      } else {
        toast.success(`동기화 완료 — 신규: ${result.added}개, 업데이트: ${result.updated}개`);
      }
      loadGames(selectedProvider.id);
    } catch (e: any) {
      toast.error(`동기화 실패: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggle(game: GameItem) {
    try {
      const nextActive = game.status !== 'active';
      await gameItemService.toggleActive(game.id, nextActive);
      setGames(prev => prev.map(g => g.id === game.id ? { ...g, status: nextActive ? 'active' : 'inactive' } : g));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleBulkToggle(activate: boolean) {
    if (games.length === 0) return;
    const targets = games.filter(g => activate ? g.status !== 'active' : g.status === 'active');
    if (targets.length === 0) {
      toast.info(activate ? '이미 모든 게임이 활성화되어 있습니다.' : '이미 모든 게임이 비활성화되어 있습니다.');
      return;
    }
    if (!confirm(`${targets.length}개 게임을 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkToggling(true);
      await Promise.all(targets.map(g => gameItemService.toggleActive(g.id, activate)));
      setGames(prev => prev.map(g => ({ ...g, status: activate ? 'active' : 'inactive' })));
      toast.success(`${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkToggling(false);
    }
  }

  async function handleDelete(game: GameItem) {
    if (!confirm(`"${game.game_name}" 게임을 삭제하시겠습니까?`)) return;
    try {
      await gameItemService.delete(game.id);
      setGames(prev => prev.filter(g => g.id !== game.id));
      toast.success('삭제되었습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleLaunch(game: GameItem) {
    const vendor = selectedProvider?.vendor as GameVendor | undefined;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    const gameId = parseInt(game.game_code.split('_').slice(1).join('_'), 10);
    if (isNaN(gameId)) { toast.error('게임 ID를 파악할 수 없습니다.'); return; }
    try {
      setLaunchingId(game.id);
      if (!tokenCache.current[vendor.id]) {
        tokenCache.current[vendor.id] = await gameLaunchService.getToken(vendor);
      }
      const url = await gameLaunchService.launch(vendor, tokenCache.current[vendor.id], gameId);
      window.open(url, '_blank');
    } catch (e: any) {
      delete tokenCache.current[vendor?.id ?? ''];
      toast.error(`게임 실행 실패: ${e.message}`);
    } finally {
      setLaunchingId(null);
    }
  }

  // ── ACE 핸들러 ────────────────────────────────────────────────

  async function handleAceSync() {
    if (!selectedAceProvider) return;
    const vendor = aceProviders.find(p => p.id === selectedAceProvider.id)?.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setSyncingAce(true);
      toast.info(`${selectedAceProvider.vendor_name} 게임 목록 동기화 중...`);
      const result = await aceVendorService.syncGamesForProvider(selectedAceProvider, vendor);
      toast.success(`동기화 완료 — 신규: ${result.added}개, 업데이트: ${result.updated}개`);
      loadAceGames(selectedAceProvider.id);
    } catch (e: any) {
      toast.error(`동기화 실패: ${e.message}`);
    } finally {
      setSyncingAce(false);
    }
  }

  async function handleAceToggle(game: AceGame) {
    try {
      const nextActive = game.status !== 'active';
      await aceGameService.toggleActive(game.id, nextActive);
      setAceGames(prev => prev.map(g => g.id === game.id ? { ...g, status: nextActive ? 'active' : 'inactive' } : g));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAceBulkToggle(activate: boolean) {
    if (aceGames.length === 0) return;
    const targets = aceGames.filter(g => activate ? g.status !== 'active' : g.status === 'active');
    if (targets.length === 0) {
      toast.info(activate ? '이미 모든 게임이 활성화되어 있습니다.' : '이미 모든 게임이 비활성화되어 있습니다.');
      return;
    }
    if (!confirm(`${targets.length}개 ACE 게임을 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkTogglingAce(true);
      await Promise.all(targets.map(g => aceGameService.toggleActive(g.id, activate)));
      setAceGames(prev => prev.map(g => ({ ...g, status: activate ? 'active' : 'inactive' })));
      toast.success(`${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkTogglingAce(false);
    }
  }

  async function handleAceDelete(game: AceGame) {
    if (!confirm(`"${game.game_name_ko ?? game.game_key}" 게임을 삭제하시겠습니까?`)) return;
    try {
      await aceGameService.delete(game.id);
      setAceGames(prev => prev.filter(g => g.id !== game.id));
      toast.success('삭제되었습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAceLaunch(game: AceGame) {
    if (!selectedAceProvider) return;
    const vendorObj = aceProviders.find(p => p.id === selectedAceProvider.id)?.vendor;
    if (!vendorObj) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setLaunchingAceId(game.id);
      if (!aceRegisterCache.current.has(vendorObj.id)) {
        try {
          await aceVendorService.registerMember(vendorObj, {
            username: 'dev1',
            nickname: 'dev1',
            siteUsername: 'dev1',
          });
        } catch (regErr: any) {
          if (!regErr.message?.includes('ALREADY_USER_EXISTS')) throw regErr;
        }
        aceRegisterCache.current.add(vendorObj.id);
      }
      const result = await aceVendorService.launchGame(vendorObj, {
        vendorKey: selectedAceProvider.vendor_key,
        gameKey: game.game_key,
        siteUsername: 'dev1',
        ip: '127.0.0.1',
        language: 'ko',
        platform: 'desktop',
        requestKey: String(Date.now()),
      });
      window.open(result.url, '_blank');
    } catch (e: any) {
      toast.error(`게임 실행 실패: ${e.message}`);
    } finally {
      setLaunchingAceId(null);
    }
  }

  // ── HONOR 핸들러 ──────────────────────────────────────────────

  async function handleHonorSync() {
    if (!selectedHonorProvider) return;
    const providerWithVendor = honorProviders.find(p => p.id === selectedHonorProvider.id) as any;
    const vendor: GameVendor | undefined = providerWithVendor?.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setSyncingHonor(true);
      toast.info(`${selectedHonorProvider.vendor_name} 게임 목록 동기화 중...`);
      const result = await honorVendorService.syncGamesForProvider(selectedHonorProvider, vendor);
      toast.success(`동기화 완료 — 신규: ${result.added}개, 업데이트: ${result.updated}개`);
      loadHonorGames(selectedHonorProvider.id);
    } catch (e: any) {
      toast.error(`동기화 실패: ${e.message}`);
    } finally {
      setSyncingHonor(false);
    }
  }

  async function handleHonorLobbySync() {
    if (!selectedHonorProvider) return;
    const providerWithVendor = honorProviders.find(p => p.id === selectedHonorProvider.id) as any;
    const vendor: GameVendor | undefined = providerWithVendor?.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setSyncingHonorLobby(true);
      toast.info(`${selectedHonorProvider.vendor_name} 로비 목록 동기화 중...`);
      const result = await honorVendorService.syncLobbyListForProvider(selectedHonorProvider, vendor);
      toast.success(`로비 동기화 완료 — 신규: ${result.added}개, 업데이트: ${result.updated}개`);
      loadHonorLobbies(selectedHonorProvider.id);
    } catch (e: any) {
      toast.error(`로비 동기화 실패: ${e.message}`);
    } finally {
      setSyncingHonorLobby(false);
    }
  }

  async function handleHonorToggle(game: HonorGame) {
    try {
      const nextActive = game.status !== 'active';
      const { error } = await supabase
        .from('game_honor')
        .update({ status: nextActive ? 'active' : 'inactive' })
        .eq('id', game.id);
      if (error) throw new Error(error.message);
      setHonorGames(prev => prev.map(g => g.id === game.id ? { ...g, status: nextActive ? 'active' : 'inactive' } : g));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleHonorBulkToggle(activate: boolean) {
    if (honorGames.length === 0) return;
    const targets = honorGames.filter(g => activate ? g.status !== 'active' : g.status === 'active');
    if (targets.length === 0) {
      toast.info(activate ? '이미 모든 게임이 활성화되어 있습니다.' : '이미 모든 게임이 비활성화되어 있습니다.');
      return;
    }
    if (!confirm(`${targets.length}개 HONOR 게임을 ${activate ? '활성화' : '비활성화'}하시겠습니까?`)) return;
    try {
      setBulkTogglingHonor(true);
      await Promise.all(targets.map(g =>
        supabase.from('game_honor').update({ status: activate ? 'active' : 'inactive' }).eq('id', g.id)
      ));
      setHonorGames(prev => prev.map(g => ({ ...g, status: activate ? 'active' : 'inactive' })));
      toast.success(`${targets.length}개 ${activate ? '활성화' : '비활성화'} 완료`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkTogglingHonor(false);
    }
  }

  async function handleHonorDelete(game: HonorGame) {
    if (!confirm(`"${game.title_ko ?? game.title}" 게임을 삭제하시겠습니까?`)) return;
    try {
      const { error } = await supabase.from('game_honor').delete().eq('id', game.id);
      if (error) throw new Error(error.message);
      setHonorGames(prev => prev.filter(g => g.id !== game.id));
      toast.success('삭제되었습니다.');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleHonorLaunch(game: HonorGame) {
    if (!selectedHonorProvider) return;
    const providerWithVendor = honorProviders.find(p => p.id === selectedHonorProvider.id) as any;
    const vendor: GameVendor | undefined = providerWithVendor?.vendor;
    if (!vendor) { toast.error('게임사 정보가 없습니다.'); return; }
    try {
      setLaunchingHonorId(game.id);
      const honorVendorName = selectedHonorProvider.metadata?.honor_vendor || selectedHonorProvider.vendor_key;
      // 로비는 game_id가 해시값이므로 /lobby-list의 문자열 ID(vendor_key)를 game_id로 사용
      const launchId: string | number = game.type === 'lobby'
        ? (game.vendor_key ?? game.game_id)
        : game.game_id;
      const result = await honorVendorService.getGameLaunchLink(
        vendor, 'dev1', launchId as number, honorVendorName, { nickname: 'dev1' }
      );
      window.open(result.link, '_blank');
    } catch (e: any) {
      toast.error(`게임 실행 실패: ${e.message}`);
    } finally {
      setLaunchingHonorId(null);
    }
  }

  // ── 필터링 ───────────────────────────────────────────────────

  const filteredInvest = games.filter(g =>
    !search ||
    g.game_name.toLowerCase().includes(search.toLowerCase()) ||
    g.game_code.includes(search)
  );

  const filteredAce = aceGames.filter(g =>
    !search ||
    (g.game_name_ko ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (g.game_name_en ?? '').toLowerCase().includes(search.toLowerCase()) ||
    g.game_key.toLowerCase().includes(search.toLowerCase())
  );

  const filteredHonor = honorGames.filter(g =>
    !search ||
    (g.title_ko ?? '').toLowerCase().includes(search.toLowerCase()) ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.vendor_key ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredHonorLobbies = honorLobbies.filter(g =>
    !search ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.vendor_key ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // ── 사이드바 그루핑 ──────────────────────────────────────────

  const investCasino = providers.filter(p => p.category === 'casino');
  const investSlot   = providers.filter(p => p.category === 'slot');
  const aceCasino    = aceProviders.filter(p => p.category === 'casino');
  const aceSlot      = aceProviders.filter(p => p.category === 'slot');
  const honorCasino  = honorProviders.filter(p => p.category === 'casino');
  const honorSlot    = honorProviders.filter(p => p.category === 'slot');

  const activeCount      = games.filter(g => g.status === 'active').length;
  const aceActiveCount   = aceGames.filter(g => g.status === 'active').length;
  const honorActiveCount = honorGames.filter(g => g.status === 'active').length;

  const allActive      = games.length > 0 && games.every(g => g.status === 'active');
  const allInactive    = games.length > 0 && games.every(g => g.status !== 'active');
  const aceAllActive   = aceGames.length > 0 && aceGames.every(g => g.status === 'active');
  const aceAllInactive = aceGames.length > 0 && aceGames.every(g => g.status !== 'active');
  const honorAllActive   = honorGames.length > 0 && honorGames.every(g => g.status === 'active');
  const honorAllInactive = honorGames.length > 0 && honorGames.every(g => g.status !== 'active');
  const honorLobbyActiveCount = honorLobbies.filter(g => g.status === 'active').length;

  const catMeta = selectedProvider
    ? (CATEGORY_META[selectedProvider.category] ?? { label: selectedProvider.category, color: 'text-slate-400 bg-slate-700' })
    : null;
  const aceCatMeta = selectedAceProvider
    ? (CATEGORY_META[selectedAceProvider.category] ?? { label: selectedAceProvider.category, color: 'text-slate-400 bg-slate-700' })
    : null;
  const honorCatMeta = selectedHonorProvider
    ? (CATEGORY_META[selectedHonorProvider.category] ?? { label: selectedHonorProvider.category, color: 'text-slate-400 bg-slate-700' })
    : null;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      <style>{`
        .game-list-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .game-list-scroll::-webkit-scrollbar-track { background: #1e293b; }
        .game-list-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        .game-list-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .game-list-scroll { scrollbar-width: auto; scrollbar-color: #475569 #1e293b; }
      `}</style>

      {/* API 탭 */}
      <div className="shrink-0 px-4 pt-3 pb-0 border-b border-slate-700 flex items-center gap-1">
        {(!allowedTabs || allowedTabs.has('invest')) && (
          <button
            onClick={() => { setApiTab('invest'); setSearch(''); }}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors font-medium border-b-2 ${
              apiTab === 'invest'
                ? 'border-blue-500 text-blue-400 bg-slate-800/60'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            INVEST
          </button>
        )}
        {(!allowedTabs || allowedTabs.has('ace')) && (
          <button
            onClick={() => { setApiTab('ace'); setSearch(''); }}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors font-medium border-b-2 flex items-center gap-1.5 ${
              apiTab === 'ace'
                ? 'border-orange-500 text-orange-400 bg-slate-800/60'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-600/40">ACE</span>
            ACE
          </button>
        )}
        {(!allowedTabs || allowedTabs.has('honor')) && (
          <button
            onClick={() => { setApiTab('honor'); setSearch(''); }}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors font-medium border-b-2 flex items-center gap-1.5 ${
              apiTab === 'honor'
                ? 'border-sky-500 text-sky-400 bg-slate-800/60'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-600/40">HONOR</span>
            HONOR
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 사이드바 ─────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col bg-slate-800/60 border-r border-slate-700">
          <div className="px-4 py-3 border-b border-slate-700/60 shrink-0">
            <p className="text-xs text-slate-500">
              {apiTab === 'ace' ? 'ACE 게임 제공사' : apiTab === 'honor' ? 'HONOR 게임 제공사' : '게임 제공사'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto game-list-scroll py-2">
            {/* INVEST 사이드바 */}
            {apiTab === 'invest' && (
              loadingProviders ? (
                <p className="text-xs text-slate-500 px-4 py-2">불러오는 중...</p>
              ) : providers.length === 0 ? (
                <p className="text-xs text-slate-500 px-4">제공사 없음</p>
              ) : (
                <div>
                  {[{ label: '라이브카지노', list: investCasino }, { label: '슬롯', list: investSlot }].map(group =>
                    group.list.length > 0 && (
                      <div key={group.label} className="mb-2">
                        <p className="text-xs text-slate-600 px-4 py-1.5 sticky top-0 bg-slate-800/80 backdrop-blur-sm">
                          {group.label}
                        </p>
                        {group.list.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedProvider(p)}
                            className={`w-full text-left px-4 py-2 transition-colors ${
                              selectedProvider?.id === p.id
                                ? 'bg-blue-600/20 border-r-2 border-blue-500 text-blue-300'
                                : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate text-sm">{p.provider_name}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1 ${p.is_active ? 'bg-green-400' : 'bg-slate-600'}`} />
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">ID: {p.provider_id}</p>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            )}

            {/* ACE 사이드바 */}
            {apiTab === 'ace' && (
              loadingAceProviders ? (
                <p className="text-xs text-slate-500 px-4 py-2">불러오는 중...</p>
              ) : aceProviders.length === 0 ? (
                <p className="text-xs text-slate-500 px-4">ACE 제공사 없음</p>
              ) : (
                <div>
                  {[{ label: '라이브카지노', list: aceCasino }, { label: '슬롯', list: aceSlot }].map(group =>
                    group.list.length > 0 && (
                      <div key={group.label} className="mb-2">
                        <p className="text-xs text-slate-600 px-4 py-1.5 sticky top-0 bg-slate-800/80 backdrop-blur-sm">
                          {group.label}
                        </p>
                        {group.list.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedAceProvider(p)}
                            className={`w-full text-left px-4 py-2 transition-colors ${
                              selectedAceProvider?.id === p.id
                                ? 'bg-orange-600/20 border-r-2 border-orange-500 text-orange-300'
                                : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate text-sm">{p.vendor_name}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1 ${p.is_active ? 'bg-green-400' : 'bg-slate-600'}`} />
                            </div>
                            <p className="text-xs text-slate-600 font-mono mt-0.5 truncate">{p.vendor_key}</p>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            )}

            {/* HONOR 사이드바 */}
            {apiTab === 'honor' && (
              loadingHonorProviders ? (
                <p className="text-xs text-slate-500 px-4 py-2">불러오는 중...</p>
              ) : honorProviders.length === 0 ? (
                <p className="text-xs text-slate-500 px-4">HONOR 제공사 없음</p>
              ) : (
                <div>
                  {[{ label: '라이브카지노', list: honorCasino }, { label: '슬롯', list: honorSlot }].map(group =>
                    group.list.length > 0 && (
                      <div key={group.label} className="mb-2">
                        <p className="text-xs text-slate-600 px-4 py-1.5 sticky top-0 bg-slate-800/80 backdrop-blur-sm">
                          {group.label}
                        </p>
                        {group.list.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedHonorProvider(p)}
                            className={`w-full text-left px-4 py-2 transition-colors ${
                              selectedHonorProvider?.id === p.id
                                ? 'bg-sky-600/20 border-r-2 border-sky-500 text-sky-300'
                                : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate text-sm">{p.vendor_name}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1 ${p.is_active ? 'bg-green-400' : 'bg-slate-600'}`} />
                            </div>
                            <p className="text-xs text-slate-600 font-mono mt-0.5 truncate">{p.vendor_key}</p>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* ── 메인 패널 ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── INVEST 패널 ── */}
          {apiTab === 'invest' && (
            !selectedProvider ? (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                왼쪽에서 게임 제공사를 선택하세요.
              </div>
            ) : (
              <>
                <div className="shrink-0 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl text-slate-100">{selectedProvider.provider_name}</h2>
                      {catMeta && <span className={`text-xs px-2 py-0.5 rounded-lg ${catMeta.color}`}>{catMeta.label}</span>}
                      {selectedProvider.vendor && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">{selectedProvider.vendor.vendor_name}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      전체 {games.length}개 · 활성 {activeCount}개 · 비활성 {games.length - activeCount}개
                    </p>
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={syncing || !selectedProvider.vendor}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? '동기화 중...' : 'API 동기화'}
                  </button>
                </div>

                <div className="shrink-0 px-6 py-3 flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="게임 이름 또는 코드 검색..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {games.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleBulkToggle(true)}
                        disabled={bulkToggling || allActive}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                      >
                        <CheckSquare size={13} /> 전체 활성화
                      </button>
                      <button
                        onClick={() => handleBulkToggle(false)}
                        disabled={bulkToggling || allInactive}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                      >
                        <Square size={13} /> 전체 비활성화
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto game-list-scroll px-6 pb-6">
                  {loadingGames ? (
                    <div className="flex items-center justify-center h-40 text-slate-500">불러오는 중...</div>
                  ) : filteredInvest.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                      {games.length === 0
                        ? <><p>동기화된 게임이 없습니다.</p><p className="text-sm mt-1">"API 동기화" 버튼으로 게임 목록을 가져오세요.</p></>
                        : <p>검색 결과가 없습니다.</p>
                      }
                    </div>
                  ) : (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-700">
                          <tr className="border-b border-slate-600 text-slate-300 text-xs">
                            <th className="px-2 py-3 w-6" />
                            <th className="text-left px-4 py-3">게임 이름</th>
                            <th className="text-left px-4 py-3">게임 코드</th>
                            <th className="text-left px-4 py-3">구분</th>
                            <th className="text-center px-4 py-3">실행</th>
                            <th className="text-center px-4 py-3">상태</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {[...filteredInvest].sort((a, b) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))).map(game => (
                            <tr
                              key={game.id}
                              draggable
                              onDragStart={() => onGameDragStart(game.id)}
                              onDragOver={e => onGameDragOver(e, game.id)}
                              onDrop={() => onGameDrop(games, 'game_invest', game.id, setGames)}
                              onDragEnd={onGameDragEnd}
                              className={`border-b border-slate-700/50 transition-colors cursor-grab active:cursor-grabbing ${gameDragOverId === game.id ? 'bg-blue-900/20' : 'hover:bg-slate-700/20'}`}
                            >
                              <td className="px-2 py-3 text-slate-600"><GripVertical size={13} /></td>
                              <td className="px-4 py-3 text-slate-200">{game.game_name}</td>
                              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{game.game_code}</td>
                              <td className="px-4 py-3 text-xs">
                                {game.game_type === 'casino'
                                  ? <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">라이브</span>
                                  : <span className="px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">슬롯</span>
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleLaunch(game)}
                                  disabled={launchingId === game.id}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-colors disabled:opacity-40"
                                >
                                  {launchingId === game.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleToggle(game)}>
                                  {game.status === 'active'
                                    ? <ToggleRight size={20} className="text-green-400 mx-auto" />
                                    : <ToggleLeft size={20} className="text-slate-500 mx-auto" />
                                  }
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button onClick={() => handleDelete(game)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )
          )}

          {/* ── ACE 패널 ── */}
          {apiTab === 'ace' && (
            !selectedAceProvider ? (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                왼쪽에서 ACE 게임 제공사를 선택하세요.
              </div>
            ) : (
              <>
                <div className="shrink-0 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl text-slate-100">{selectedAceProvider.vendor_name}</h2>
                      {aceCatMeta && <span className={`text-xs px-2 py-0.5 rounded-lg ${aceCatMeta.color}`}>{aceCatMeta.label}</span>}
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-900/30 text-orange-400 border border-orange-700/30 font-mono">
                        {selectedAceProvider.vendor_key}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-orange-900/20 text-orange-500 border border-orange-700/20">ACE</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      전체 {aceGames.length}개 · 활성 {aceActiveCount}개 · 비활성 {aceGames.length - aceActiveCount}개
                    </p>
                  </div>
                  <button
                    onClick={handleAceSync}
                    disabled={syncingAce}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={syncingAce ? 'animate-spin' : ''} />
                    {syncingAce ? '동기화 중...' : 'ACE 동기화'}
                  </button>
                </div>

                <div className="shrink-0 px-6 py-3 flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="게임 이름(한/영) 또는 게임키 검색..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  {aceGames.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAceBulkToggle(true)}
                        disabled={bulkTogglingAce || aceAllActive}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                      >
                        <CheckSquare size={13} /> 전체 활성화
                      </button>
                      <button
                        onClick={() => handleAceBulkToggle(false)}
                        disabled={bulkTogglingAce || aceAllInactive}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                      >
                        <Square size={13} /> 전체 비활성화
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto game-list-scroll px-6 pb-6">
                  {loadingAceGames ? (
                    <div className="flex items-center justify-center h-40 text-slate-500">불러오는 중...</div>
                  ) : filteredAce.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                      {aceGames.length === 0
                        ? <><p>동기화된 ACE 게임이 없습니다.</p><p className="text-sm mt-1">"ACE 동기화" 버튼으로 게임 목록을 가져오세요.</p></>
                        : <p>검색 결과가 없습니다.</p>
                      }
                    </div>
                  ) : (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-700">
                          <tr className="border-b border-slate-600 text-slate-300 text-xs">
                            <th className="px-2 py-3 w-6" />
                            <th className="text-left px-4 py-3">게임명 (한/영)</th>
                            <th className="text-left px-4 py-3">게임 키</th>
                            <th className="text-left px-4 py-3">구분 / 타입</th>
                            <th className="text-left px-4 py-3">플랫폼</th>
                            <th className="text-left px-4 py-3">스킨</th>
                            <th className="text-center px-4 py-3">실행</th>
                            <th className="text-center px-4 py-3">상태</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {[...filteredAce].sort((a, b) => ((a.metadata?.sort_order ?? 9999) - (b.metadata?.sort_order ?? 9999))).map(game => (
                            <tr
                              key={game.id}
                              draggable
                              onDragStart={() => onGameDragStart(game.id)}
                              onDragOver={e => onGameDragOver(e, game.id)}
                              onDrop={() => onGameDrop(aceGames, 'game_ace', game.id, setAceGames)}
                              onDragEnd={onGameDragEnd}
                              className={`border-b border-slate-700/50 transition-colors cursor-grab active:cursor-grabbing ${gameDragOverId === game.id ? 'bg-orange-900/20' : 'hover:bg-slate-700/20'}`}
                            >
                              <td className="px-2 py-3 text-slate-600"><GripVertical size={13} /></td>
                              <td className="px-4 py-3">
                                <p className="text-slate-200">{game.game_name_ko ?? '-'}</p>
                                {game.game_name_en && (
                                  <p className="text-xs text-slate-500 mt-0.5">{game.game_name_en}</p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{game.game_key}</td>
                              <td className="px-4 py-3 text-xs">
                                <div className="flex flex-col gap-1">
                                  {game.category === 'casino'
                                    ? <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 w-fit">라이브</span>
                                    : <span className="px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 w-fit">슬롯</span>
                                  }
                                  {game.game_type && (
                                    <span className="text-slate-500">{game.game_type}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400">{game.platform ?? '-'}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 font-mono">{game.skin ?? '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleAceLaunch(game)}
                                  disabled={launchingAceId === game.id}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 transition-colors disabled:opacity-40"
                                >
                                  {launchingAceId === game.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleAceToggle(game)}>
                                  {game.status === 'active'
                                    ? <ToggleRight size={20} className="text-green-400 mx-auto" />
                                    : <ToggleLeft size={20} className="text-slate-500 mx-auto" />
                                  }
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button onClick={() => handleAceDelete(game)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )
          )}

          {/* ── HONOR 패널 ── */}
          {apiTab === 'honor' && (
            !selectedHonorProvider ? (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                왼쪽에서 HONOR 게임 제공사를 선택하세요.
              </div>
            ) : (
              <>
                {/* 헤더 */}
                <div className="shrink-0 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl text-slate-100">{selectedHonorProvider.vendor_name}</h2>
                      {honorCatMeta && <span className={`text-xs px-2 py-0.5 rounded-lg ${honorCatMeta.color}`}>{honorCatMeta.label}</span>}
                      <span className="text-xs px-2 py-0.5 rounded bg-sky-900/30 text-sky-400 border border-sky-700/30 font-mono">
                        {selectedHonorProvider.vendor_key}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-sky-900/20 text-sky-500 border border-sky-700/20">HONOR</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {honorSubTab === 'game'
                        ? `게임 전체 ${honorGames.length}개 · 활성 ${honorActiveCount}개`
                        : `로비 전체 ${honorLobbies.length}개 · 활성 ${honorLobbyActiveCount}개`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {honorSubTab === 'game' ? (
                      <button
                        onClick={handleHonorSync}
                        disabled={syncingHonor}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={15} className={syncingHonor ? 'animate-spin' : ''} />
                        {syncingHonor ? '동기화 중...' : 'HONOR 동기화'}
                      </button>
                    ) : (
                      <button
                        onClick={handleHonorLobbySync}
                        disabled={syncingHonorLobby}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={15} className={syncingHonorLobby ? 'animate-spin' : ''} />
                        {syncingHonorLobby ? '동기화 중...' : '로비 동기화'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 게임 / 로비 서브탭 */}
                <div className="shrink-0 px-6 pt-3 pb-0 flex items-center gap-1 border-b border-slate-700/50">
                  <button
                    onClick={() => { setHonorSubTab('game'); setSearch(''); }}
                    className={`px-4 py-2 text-xs rounded-t-lg font-medium border-b-2 transition-colors ${
                      honorSubTab === 'game'
                        ? 'border-sky-500 text-sky-400 bg-slate-800/40'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    게임 목록
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs">{honorGames.length}</span>
                  </button>
                  <button
                    onClick={() => { setHonorSubTab('lobby'); setSearch(''); }}
                    className={`px-4 py-2 text-xs rounded-t-lg font-medium border-b-2 transition-colors ${
                      honorSubTab === 'lobby'
                        ? 'border-violet-500 text-violet-400 bg-slate-800/40'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    로비 목록
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs">{honorLobbies.length}</span>
                  </button>
                </div>

                {/* ── 게임 서브탭 ── */}
                {honorSubTab === 'game' && (
                  <>
                    <div className="shrink-0 px-6 py-3 flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="게임 이름(한/영) 또는 벤더키 검색..."
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      {honorGames.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleHonorBulkToggle(true)}
                            disabled={bulkTogglingHonor || honorAllActive}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-700/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                          >
                            <CheckSquare size={13} /> 전체 활성화
                          </button>
                          <button
                            onClick={() => handleHonorBulkToggle(false)}
                            disabled={bulkTogglingHonor || honorAllInactive}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600/40 rounded-lg text-xs transition-colors disabled:opacity-40"
                          >
                            <Square size={13} /> 전체 비활성화
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto game-list-scroll px-6 pb-6">
                      {loadingHonorGames ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">불러오는 중...</div>
                      ) : filteredHonor.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                          {honorGames.length === 0
                            ? <><p>동기화된 HONOR 게임이 없습니다.</p><p className="text-sm mt-1">"HONOR 동기화" 버튼으로 게임 목록을 가져오세요.</p></>
                            : <p>검색 결과가 없습니다.</p>
                          }
                        </div>
                      ) : (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-700">
                              <tr className="border-b border-slate-600 text-slate-300 text-xs">
                                <th className="px-2 py-3 w-6" />
                                <th className="text-left px-4 py-3">게임명 (한/영)</th>
                                <th className="text-left px-4 py-3">게임 ID</th>
                                <th className="text-left px-4 py-3">벤더 키</th>
                                <th className="text-left px-4 py-3">타입</th>
                                <th className="text-center px-4 py-3">실행</th>
                                <th className="text-center px-4 py-3">상태</th>
                                <th className="px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody>
                              {[...filteredHonor].sort((a, b) => ((a.metadata?.sort_order ?? a.rank ?? 9999) - (b.metadata?.sort_order ?? b.rank ?? 9999))).map(game => (
                                <tr
                                  key={game.id}
                                  draggable
                                  onDragStart={() => onGameDragStart(game.id)}
                                  onDragOver={e => onGameDragOver(e, game.id)}
                                  onDrop={() => onGameDrop(honorGames, 'game_honor', game.id, setHonorGames)}
                                  onDragEnd={onGameDragEnd}
                                  className={`border-b border-slate-700/50 transition-colors cursor-grab active:cursor-grabbing ${gameDragOverId === game.id ? 'bg-sky-900/20' : 'hover:bg-slate-700/20'}`}
                                >
                                  <td className="px-2 py-3 text-slate-600"><GripVertical size={13} /></td>
                                  <td className="px-4 py-3">
                                    <p className="text-slate-200">{game.title_ko ?? game.title}</p>
                                    {game.title_ko && (
                                      <p className="text-xs text-slate-500 mt-0.5">{game.title}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{game.game_id}</td>
                                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{game.vendor_key ?? '-'}</td>
                                  <td className="px-4 py-3 text-xs">
                                    {game.type === 'casino'
                                      ? <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">라이브</span>
                                      : <span className="px-1.5 py-0.5 rounded bg-green-900/30 text-green-400">슬롯</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => handleHonorLaunch(game)}
                                      disabled={launchingHonorId === game.id}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 transition-colors disabled:opacity-40"
                                    >
                                      {launchingHonorId === game.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button onClick={() => handleHonorToggle(game)}>
                                      {game.status === 'active'
                                        ? <ToggleRight size={20} className="text-green-400 mx-auto" />
                                        : <ToggleLeft size={20} className="text-slate-500 mx-auto" />
                                      }
                                    </button>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button onClick={() => handleHonorDelete(game)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ── 로비 서브탭 ── */}
                {honorSubTab === 'lobby' && (
                  <>
                    <div className="shrink-0 px-6 py-3 flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="로비 이름 또는 로비 ID 검색..."
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto game-list-scroll px-6 pb-6">
                      {loadingHonorLobbies ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">불러오는 중...</div>
                      ) : filteredHonorLobbies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                          {honorLobbies.length === 0
                            ? <><p>동기화된 로비가 없습니다.</p><p className="text-sm mt-1">"로비 동기화" 버튼으로 로비 목록을 가져오세요.</p></>
                            : <p>검색 결과가 없습니다.</p>
                          }
                        </div>
                      ) : (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-700">
                              <tr className="border-b border-slate-600 text-slate-300 text-xs">
                                <th className="text-left px-4 py-3">썸네일</th>
                                <th className="text-left px-4 py-3">로비명</th>
                                <th className="text-left px-4 py-3">로비 ID</th>
                                <th className="text-left px-4 py-3">Provider</th>
                                <th className="text-center px-4 py-3">실행</th>
                                <th className="text-center px-4 py-3">상태</th>
                                <th className="px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody>
                              {filteredHonorLobbies.map(lobby => (
                                <tr key={lobby.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                                  <td className="px-4 py-2">
                                    {lobby.thumbnail ? (
                                      <img
                                        src={lobby.thumbnail}
                                        alt={lobby.title}
                                        className="w-14 h-10 object-cover rounded border border-slate-700"
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    ) : (
                                      <div className="w-14 h-10 rounded border border-slate-700 bg-slate-700/50" />
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-slate-200">{lobby.title}</td>
                                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">{lobby.vendor_key ?? '-'}</td>
                                  <td className="px-4 py-3 text-xs text-slate-500">
                                    {(lobby.metadata as any)?.provider ?? '-'}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => handleHonorLaunch(lobby)}
                                      disabled={launchingHonorId === lobby.id}
                                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 transition-colors disabled:opacity-40"
                                    >
                                      {launchingHonorId === lobby.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button onClick={() => handleHonorToggle(lobby)}>
                                      {lobby.status === 'active'
                                        ? <ToggleRight size={20} className="text-green-400 mx-auto" />
                                        : <ToggleLeft size={20} className="text-slate-500 mx-auto" />
                                      }
                                    </button>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button onClick={() => handleHonorDelete(lobby)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
