import { useEffect, useState } from 'react';
import { Edit2, Trash2, Wifi, Eye, EyeOff, RefreshCw, ChevronDown, ChevronUp, Tv, Gamepad, AlertCircle, Download, Plus } from 'lucide-react';
import {
  gameVendorService, gameProviderService, gameItemService,
  aceVendorService, aceProviderService,
  honorVendorService,
  HONOR_VENDOR_KEY,
  type GameVendor, type GameProvider, type AceProvider, type HonorProvider,
} from '../../../utils/game-management';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

const ACE_VENDOR_KEY = 'ace';
const isAceVendor = (key: string) => key === 'ace' || key.startsWith('ace_');

type VendorFormData = {
  vendor_key: string;
  vendor_name: string;
  api_base_url: string;
  opcode: string;
  secret_key: string;
  description: string;
  is_active: boolean;
};

const DEFAULT_VENDOR_FORM: VendorFormData = {
  vendor_key: '',
  vendor_name: '',
  api_base_url: 'https://api.invest-ho.com/api',
  opcode: '',
  secret_key: '',
  description: '',
  is_active: true,
};

const CATEGORY_META = {
  casino: { label: '라이브카지노', icon: Tv, color: 'text-purple-400 bg-purple-900/30' },
  slot: { label: '슬롯', icon: Gamepad, color: 'text-green-400 bg-green-900/30' },
} as const;

interface ProviderWithCount extends GameProvider {
  gameCount: number;
}

interface AceProviderWithCount extends AceProvider {
  gameCount: number;
}

interface HonorProviderWithCount extends HonorProvider {
  gameCount: number;
}

interface VendorWithProviders extends GameVendor {
  providers: ProviderWithCount[];
  aceProviders: AceProviderWithCount[];
  honorProviders: HonorProviderWithCount[];
}

export default function GameVendorManage() {
  const [vendors, setVendors] = useState<VendorWithProviders[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState<VendorFormData>(DEFAULT_VENDOR_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [syncingVendor, setSyncingVendor] = useState<string | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<string | null>(null);
  const [fetchingProviders, setFetchingProviders] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const vendorList = await gameVendorService.getAll();

      let allProviders: any[] = [];
      try {
        allProviders = await gameProviderService.getAll();
      } catch (e: any) {
        toast.error(`제공사 목록 로드 실패: ${e.message}`);
      }

      let allAceProviders: AceProvider[] = [];
      try {
        allAceProviders = await aceProviderService.getAll();
      } catch { /* ACE 테이블 없을 경우 무시 */ }

      // HONOR 제공사 전체 로드
      let allHonorProviders: HonorProvider[] = [];
      try {
        const { data: honorData } = await supabase
          .from('game_provider_honor')
          .select('*');
        allHonorProviders = honorData || [];
      } catch { /* 테이블 없을 경우 무시 */ }

      const withProviders: VendorWithProviders[] = await Promise.all(
        vendorList.map(async (v) => {
          const isAce = isAceVendor(v.vendor_key);
          const isHonor = v.vendor_key === HONOR_VENDOR_KEY;

          // INVEST 제공사 (ace/honor 제외)
          const provs = (!isAce && !isHonor) ? allProviders.filter((p: any) => p.vendor_id === v.id) : [];
          const provsWithCount = await Promise.all(
            provs.map(async (p: any) => {
              try {
                const { count } = await supabase
                  .from('game_invest')
                  .select('*', { count: 'exact', head: true })
                  .eq('provider_id', p.id);
                return { ...p, gameCount: count ?? 0 };
              } catch {
                return { ...p, gameCount: 0 };
              }
            })
          );

          // ACE 제공사
          const aceProvs = isAce ? allAceProviders.filter((p) => p.vendor_id === v.id) : [];
          const aceProvsWithCount: AceProviderWithCount[] = await Promise.all(
            aceProvs.map(async (p) => {
              try {
                const { count } = await supabase
                  .from('game_ace')
                  .select('*', { count: 'exact', head: true })
                  .eq('provider_id', p.id);
                return { ...p, gameCount: count ?? 0 };
              } catch {
                return { ...p, gameCount: 0 };
              }
            })
          );

          // HONOR 제공사
          const honorProvs = isHonor ? allHonorProviders.filter((p) => p.vendor_id === v.id) : [];
          const honorProvsWithCount: HonorProviderWithCount[] = await Promise.all(
            honorProvs.map(async (p) => {
              try {
                const { count } = await supabase
                  .from('game_honor')
                  .select('*', { count: 'exact', head: true })
                  .eq('provider_id', p.id);
                return { ...p, gameCount: count ?? 0 };
              } catch {
                return { ...p, gameCount: 0 };
              }
            })
          );

          return { ...v, providers: provsWithCount, aceProviders: aceProvsWithCount, honorProviders: honorProvsWithCount };
        })
      );
      setVendors(withProviders);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreateVendor() {
    setEditingVendorId(null);
    setVendorForm(DEFAULT_VENDOR_FORM);
    setShowVendorModal(true);
  }

  function openEditVendor(v: GameVendor) {
    setEditingVendorId(v.id);
    setVendorForm({
      vendor_key: v.vendor_key,
      vendor_name: v.vendor_name,
      api_base_url: v.api_base_url,
      opcode: v.opcode,
      secret_key: v.secret_key,
      description: v.description,
      is_active: v.is_active,
    });
    setShowVendorModal(true);
  }

  async function handleSaveVendor() {
    const isHonorForm = vendorForm.vendor_key === HONOR_VENDOR_KEY;
    // Honor는 OPCODE 불필요 (Bearer 토큰만 사용)
    if (!vendorForm.vendor_key || !vendorForm.vendor_name || !vendorForm.api_base_url || !vendorForm.secret_key) {
      toast.error('필수 항목을 모두 입력해주세요.');
      return;
    }
    if (!isHonorForm && !vendorForm.opcode) {
      toast.error('OPCODE를 입력해주세요.');
      return;
    }
    try {
      setSaving(true);
      if (editingVendorId) {
        await gameVendorService.update(editingVendorId, vendorForm);
        toast.success('게임사 정보가 수정되었습니다.');
        setShowVendorModal(false);
        await load();
      } else {
        const created = await gameVendorService.create(vendorForm);
        setShowVendorModal(false);
        setExpandedVendor(created.id);
        await load();

        // 자동으로 제공사 목록 API 호출 후 게임 목록까지 동기화
        try {
          setAutoSyncStatus('제공사 목록을 API에서 가져오는 중...');
          toast.info('제공사 목록을 API에서 가져오는 중...');

          if (created.vendor_key === HONOR_VENDOR_KEY) {
            // Honor: /vendor-list (Bearer 인증)
            const provResult = await honorVendorService.fetchVendorList(created);
            if (provResult.created === 0 && provResult.skipped === 0) {
              toast.warning('Honor /vendor-list에서 가져온 제공사가 없습니다.');
              setAutoSyncStatus(null);
              await load();
              return;
            }
            toast.info(`Honor 제공사 ${provResult.created}개 등록됨. 게임 목록 동기화 중...`);
            setAutoSyncStatus(`Honor 게임 동기화 중...`);
            const syncResult = await honorVendorService.syncAllGames(created.id, created);
            if (syncResult.errors.length > 0) {
              toast.warning(`일부 오류 발생: ${syncResult.errors.join(' / ')}`);
            } else {
              toast.success(`Honor 등록 완료! 제공사 ${provResult.created}개 · 게임 ${syncResult.added}개 등록`);
            }
          } else if (!isAceVendor(created.vendor_key)) {
            // INVEST: /game/provider (md5 signature)
            const provResult = await gameVendorService.fetchProvidersFromApi(created);
            if (provResult.created === 0 && provResult.skipped === 0) {
              toast.warning('API에서 가져온 제공사가 없습니다. 제공사를 수동으로 추가해주세요.');
              setAutoSyncStatus(null);
              await load();
              return;
            }
            toast.info(`제공사 ${provResult.created}개 등록됨 (기존 ${provResult.skipped}개). 게임 목록 동기화 중...`);
            setAutoSyncStatus(`게임 목록 동기화 중... (제공사 ${provResult.providers.length}개)`);
            const syncResult = await gameVendorService.syncAllGames(created.id);
            if (syncResult.errors.length > 0) {
              toast.warning(`일부 오류 발생: ${syncResult.errors.join(' / ')}`);
            } else {
              toast.success(
                `등록 완료! 제공사 ${provResult.created}개 · 게임 ${syncResult.added}개 등록, ${syncResult.updated}개 업데이트`
              );
            }
          }
        } catch (syncErr: any) {
          toast.warning(`게임사 등록 완료. 제공사/게임 자동 동기화 실패: ${syncErr.message}`);
        } finally {
          setAutoSyncStatus(null);
          await load();
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVendor(v: GameVendor) {
    if (!confirm(`"${v.vendor_name}" 게임사를 삭제하시겠습니까?\n하위 제공사 및 게임 데이터도 모두 삭제됩니다.`)) return;
    try {
      await gameVendorService.delete(v.id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleTest(v: GameVendor) {
    try {
      setTestingId(v.id);
      const isAce = isAceVendor(v.vendor_key);
      const isHonor = v.api_base_url.includes('honorlink') || v.vendor_key === 'honor';
      if (isAce) {
        const balance = await aceVendorService.fetchAgentBalance(v);
        toast.success(`ACE 에이전트 잔액: ${Number(balance).toLocaleString()} 원`);
      } else if (isHonor) {
        const balance = await gameVendorService.fetchHonorBalance(v);
        toast.success(`Honor 에이전트 잔액: ${Number(balance).toLocaleString()} 원`);
      } else {
        const result = await gameVendorService.testConnection(v);
        if (result.RESULT) {
          toast.success(`연결 성공! (${v.vendor_name})`);
        } else {
          toast.error(`연결 실패: ${result.message ?? '응답 오류'}`);
        }
      }
      await load();
    } catch (e: any) {
      toast.error(`연결 오류: ${e.message}`);
    } finally {
      setTestingId(null);
    }
  }

  async function handleDeleteProvider(provider: GameProvider) {
    if (!confirm(`"${provider.provider_name}" 제공사를 삭제하시겠습니까?\n하위 게임 목록도 모두 삭제됩니다.`)) return;
    try {
      await gameProviderService.delete(provider.id);
      toast.success('삭제되었습니다.');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSyncProvider(provider: ProviderWithCount, _vendor: GameVendor) {
    try {
      setSyncingProvider(provider.id);
      toast.info(`${provider.provider_name} 게임 목록 동기화 중...`);
      const result = await gameItemService.syncFromApi(provider, _vendor);
      if (result.added === 0 && result.updated === 0) {
        toast.warning(`동기화 완료 — 게임 없음 (API가 빈 목록 반환). 콘솔에서 응답 확인 요망.`);
      } else {
        toast.success(`동기화 완료: ${result.added}개 추가, ${result.updated}개 업데이트`);
      }
      await load();
    } catch (e: any) {
      toast.error(`동기화 실패: ${e.message}`);
    } finally {
      setSyncingProvider(null);
    }
  }

  async function handleFetchProviders(v: GameVendor) {
    try {
      setFetchingProviders(v.id);
      toast.info(`${v.vendor_name} 제공사 목록을 API에서 가져오는 중...`);
      if (isAceVendor(v.vendor_key)) {
        const result = await aceVendorService.fetchProvidersFromApi(v);
        toast.success(`ACE 제공사 ${result.created}개 신규 등록, ${result.skipped}개 이미 존재`);
      } else if (v.vendor_key === HONOR_VENDOR_KEY) {
        // Honor: /vendor-list API (Bearer 인증, md5/signature 없음)
        const result = await honorVendorService.fetchVendorList(v);
        toast.success(`Honor 제공사 ${result.created}개 신규 등록, ${result.skipped}개 이미 존재`);
      } else {
        // INVEST: /game/provider API (md5 signature 인증)
        const result = await gameVendorService.fetchProvidersFromApi(v);
        toast.success(`제공사 ${result.created}개 신규 등록, ${result.skipped}개 이미 존재`);
      }
      await load();
    } catch (e: any) {
      toast.error(`제공사 목록 가져오기 실패: ${e.message}`);
    } finally {
      setFetchingProviders(null);
    }
  }

  async function handleSyncAll(vendorId: string, vendorName: string) {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) return;

    const isAce = isAceVendor(vendor.vendor_key);
    const isHonor = vendor.vendor_key === HONOR_VENDOR_KEY;

    let hasProviders = false;
    if (isAce) hasProviders = vendor.aceProviders.length > 0;
    else if (isHonor) hasProviders = vendor.honorProviders.length > 0;
    else hasProviders = vendor.providers.length > 0;

    if (!hasProviders) {
      toast.error('동기화할 제공사가 없습니다. 먼저 제공사를 추가해주세요.');
      return;
    }

    try {
      setSyncingVendor(vendorId);
      toast.info(`${vendorName} 전체 게임 동기화 중...`);
      if (isAce) {
        const result = await aceVendorService.syncAllGames(vendorId, vendor);
        if (result.errors.length > 0) {
          toast.warning(`일부 오류 발생: ${result.errors.join(' / ')}`);
        } else {
          toast.success(`ACE 동기화 완료: ${result.added}개 추가, ${result.updated}개 업데이트 (${result.providerCount}개 제공사)`);
        }
      } else if (isHonor) {
        // Honor: /game-list?vendor=xxx (Bearer 인증, md5/signature 없음)
        const result = await honorVendorService.syncAllGames(vendorId, vendor);
        if (result.errors.length > 0) {
          toast.warning(`일부 오류 발생: ${result.errors.join(' / ')}`);
        } else {
          toast.success(`Honor 동기화 완료: ${result.added}개 추가, ${result.updated}개 업데이트 (${result.providerCount}개 제공사)`);
        }
      } else {
        // INVEST: /game/lists (md5 signature 인증)
        const result = await gameVendorService.syncAllGames(vendorId);
        if (result.errors.length > 0) {
          toast.warning(`일부 오류 발생: ${result.errors.join(' / ')}`);
        } else {
          toast.success(`전체 동기화 완료: ${result.added}개 추가, ${result.updated}개 업데이트 (${result.providerCount}개 제공사)`);
        }
      }
      await load();
    } catch (e: any) {
      toast.error(`동기화 실패: ${e.message}`);
    } finally {
      setSyncingVendor(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl text-slate-100">게임사 API 등록</h2>
          <p className="text-sm text-slate-400 mt-0.5">게임사 API 벤더를 등록하고, 제공사 추가 후 게임 목록을 동기화합니다.</p>
        </div>
        <button
          onClick={openCreateVendor}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
        >
          <Plus size={16} /> 게임사 추가
        </button>
      </div>

      {autoSyncStatus && (
        <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 text-sm text-blue-300">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
          {autoSyncStatus}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">불러오는 중...</div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p>등록된 게임사가 없습니다.</p>
          <p className="text-sm mt-1">"게임사 추가" 버튼으로 첫 번째 게임사를 등록해주세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vendors.map(v => {
            const isExpanded = expandedVendor === v.id;
            const isAce = isAceVendor(v.vendor_key);
            const isHonor = v.vendor_key === HONOR_VENDOR_KEY;
            const totalGames = isAce
              ? v.aceProviders.reduce((sum, p) => sum + p.gameCount, 0)
              : isHonor
                ? v.honorProviders.reduce((sum, p) => sum + p.gameCount, 0)
                : v.providers.reduce((sum, p) => sum + p.gameCount, 0);
            const totalProviders = isAce
              ? v.aceProviders.length
              : isHonor
                ? v.honorProviders.length
                : v.providers.length;

            return (
              <div key={v.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* 벤더 헤더 */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${v.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-100">{v.vendor_name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">{v.vendor_key}</span>
                          {!v.is_active && <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-400">비활성</span>}
                          {isAce && (
                            <span className="text-xs px-2 py-0.5 rounded bg-orange-900/40 text-orange-400 font-semibold">ACE</span>
                          )}
                          {isHonor && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 font-semibold">HONOR</span>
                          )}
                          <span className="text-xs text-slate-500">
                            제공사 {totalProviders}개 · 게임 {totalGames}개
                          </span>
                        </div>
                        {v.description && <p className="text-sm text-slate-400 mt-0.5">{v.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleFetchProviders(v)}
                        disabled={fetchingProviders === v.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-blue-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                        title="API에서 제공사 목록 자동 가져오기"
                      >
                        {fetchingProviders === v.id
                          ? <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                          : <Download size={13} />}
                        제공사 가져오기
                      </button>
                      <button
                        onClick={() => handleTest(v)}
                        disabled={testingId === v.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {testingId === v.id
                          ? <span className="animate-spin inline-block w-3 h-3 border border-slate-400 border-t-transparent rounded-full" />
                          : <Wifi size={13} />}
                        보유금 업데이트
                      </button>
                      <button
                        onClick={() => handleSyncAll(v.id, v.vendor_name)}
                        disabled={syncingVendor === v.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {syncingVendor === v.id
                          ? <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
                          : <RefreshCw size={13} />}
                        게임 가져오기
                      </button>
                      <button onClick={() => openEditVendor(v)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleDeleteVendor(v)} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                      <button
                        onClick={() => setExpandedVendor(isExpanded ? null : v.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* API 정보 요약 */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="bg-slate-900/50 rounded-lg px-3 py-2">
                      <p className="text-slate-500 text-xs mb-1">API URL</p>
                      <p className="text-slate-300 font-mono text-xs break-all">{v.api_base_url}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg px-3 py-2">
                      <p className="text-slate-500 text-xs mb-1">OPCODE</p>
                      <p className="text-slate-300 font-mono text-xs">{v.opcode}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg px-3 py-2">
                      <p className="text-slate-500 text-xs mb-1">SECRET KEY</p>
                      <div className="flex items-center gap-2">
                        <p className="text-slate-300 font-mono text-xs flex-1">
                          {showSecret[v.id] ? v.secret_key : '•'.repeat(Math.min(v.secret_key.length, 20))}
                        </p>
                        <button
                          onClick={() => setShowSecret(prev => ({ ...prev, [v.id]: !prev[v.id] }))}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          {showSecret[v.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 보유금액 (연결 테스트 후 표시) */}
                  {v.total_balance !== null && v.total_balance !== undefined && (
                    <div className="mt-3 flex items-center gap-6 bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">보유금액</p>
                        <p className="text-emerald-400 font-mono">{Number(v.total_balance).toLocaleString()} 원</p>
                      </div>
                      {v.balance_checked_at && (
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">마지막 확인</p>
                          <p className="text-xs text-slate-400">
                            {new Date(v.balance_checked_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 제공사 패널 (확장 시) */}
                {isExpanded && (
                  <div className="border-t border-slate-700 bg-slate-900/30">
                    <div className="px-5 py-4">
                      <h4 className="text-sm text-slate-300 mb-4">
                        게임 제공사
                        {isAce && <span className="ml-2 text-xs text-orange-400">(ACE — 벤더 키 기반)</span>}
                        {isHonor && <span className="ml-2 text-xs text-blue-400">(Honor — /vendor-list, Bearer 인증)</span>}
                      </h4>

                      {isHonor ? (
                        v.honorProviders.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <AlertCircle size={24} className="mx-auto mb-2 text-slate-600" />
                            <p className="text-sm">등록된 Honor 제공사가 없습니다.</p>
                            <p className="text-xs mt-1">"제공사 가져오기"로 /vendor-list API에서 자동 등록하세요.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {v.honorProviders.map(p => (
                              <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-blue-400 bg-blue-900/30">
                                    <Gamepad size={11} />
                                    Honor
                                  </div>
                                  <span className="text-slate-200 text-sm">{p.vendor_name}</span>
                                  <span className="text-xs text-slate-500 font-mono">vendor: {p.vendor_key}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-slate-400">
                                    게임 {p.gameCount}개
                                    {p.synced_at && (
                                      <span className="text-slate-600 ml-1">
                                        · {new Date(p.synced_at).toLocaleDateString('ko-KR')} 동기화
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        setSyncingProvider(p.id);
                                        toast.info(`${p.vendor_name} 게임 동기화 중...`);
                                        const r = await honorVendorService.syncGamesForProvider(p, v);
                                        toast.success(`동기화 완료: ${r.added}개 추가, ${r.updated}개 업데이트`);
                                        await load();
                                      } catch (e: any) {
                                        toast.error(`동기화 실패: ${e.message}`);
                                      } finally {
                                        setSyncingProvider(null);
                                      }
                                    }}
                                    disabled={syncingProvider === p.id}
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-700 hover:bg-emerald-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {syncingProvider === p.id
                                      ? <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                                      : <RefreshCw size={11} />}
                                    동기화
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`"${p.vendor_name}" Honor 제공사를 삭제하시겠습니까?`)) return;
                                      try {
                                        await honorVendorService.deleteProvider(p.id);
                                        toast.success('삭제되었습니다.');
                                        await load();
                                      } catch (e: any) {
                                        toast.error(e.message);
                                      }
                                    }}
                                    className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : isAce ? (
                        v.aceProviders.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <AlertCircle size={24} className="mx-auto mb-2 text-slate-600" />
                            <p className="text-sm">등록된 ACE 제공사가 없습니다.</p>
                            <p className="text-xs mt-1">"제공사 가져오기" 버튼으로 API에서 자동으로 가져오세요.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {v.aceProviders.map(p => {
                              const category = p.category as keyof typeof CATEGORY_META | undefined;
                              const catMeta = category ? CATEGORY_META[category] : undefined;
                              const CatIcon = catMeta?.icon ?? Gamepad;
                              return (
                                <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${catMeta?.color ?? 'text-slate-400 bg-slate-700'}`}>
                                      <CatIcon size={11} />
                                      {catMeta?.label ?? category ?? '-'}
                                    </div>
                                    <span className="text-slate-200 text-sm">{p.vendor_name}</span>
                                    <span className="text-xs text-slate-500 font-mono">key: {p.vendor_key}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400">
                                      게임 {p.gameCount}개
                                      {p.synced_at && (
                                        <span className="text-slate-600 ml-1">
                                          · {new Date(p.synced_at).toLocaleDateString('ko-KR')} 동기화
                                        </span>
                                      )}
                                    </span>
                                    <button
                                      onClick={async () => {
                                        try {
                                          setSyncingProvider(p.id);
                                          toast.info(`${p.vendor_name} 게임 동기화 중...`);
                                          const r = await aceVendorService.syncGamesForProvider(p, v);
                                          toast.success(`동기화 완료: ${r.added}개 추가, ${r.updated}개 업데이트`);
                                          await load();
                                        } catch (e: any) {
                                          toast.error(`동기화 실패: ${e.message}`);
                                        } finally {
                                          setSyncingProvider(null);
                                        }
                                      }}
                                      disabled={syncingProvider === p.id}
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-700 hover:bg-emerald-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {syncingProvider === p.id
                                        ? <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                                        : <RefreshCw size={11} />}
                                      동기화
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`"${p.vendor_name}" ACE 제공사를 삭제하시겠습니까?`)) return;
                                        try {
                                          await aceProviderService.delete(p.id);
                                          toast.success('삭제되었습니다.');
                                          await load();
                                        } catch (e: any) {
                                          toast.error(e.message);
                                        }
                                      }}
                                      className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        v.providers.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <AlertCircle size={24} className="mx-auto mb-2 text-slate-600" />
                            <p className="text-sm">등록된 제공사가 없습니다.</p>
                            <p className="text-xs mt-1">"제공사 가져오기" 버튼으로 API에서 자동으로 가져오세요.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {v.providers.map(p => {
                              const category = p.category as keyof typeof CATEGORY_META | undefined;
                              const catMeta = category ? CATEGORY_META[category] : undefined;
                              const CatIcon = catMeta?.icon ?? Gamepad;
                              return (
                                <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${catMeta?.color ?? 'text-slate-400 bg-slate-700'}`}>
                                      <CatIcon size={11} />
                                      {catMeta?.label ?? category ?? '-'}
                                    </div>
                                    <span className="text-slate-200 text-sm">{p.provider_name}</span>
                                    <span className="text-xs text-slate-500 font-mono">ID: {p.provider_id}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400">
                                      게임 {p.gameCount}개
                                      {p.updated_at && (
                                        <span className="text-slate-600 ml-1">
                                          · {new Date(p.updated_at).toLocaleDateString('ko-KR')} 업데이트
                                        </span>
                                      )}
                                    </span>
                                    <button
                                      onClick={() => handleSyncProvider(p, v)}
                                      disabled={syncingProvider === p.id}
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-700 hover:bg-emerald-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {syncingProvider === p.id
                                        ? <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
                                        : <RefreshCw size={11} />}
                                      동기화
                                    </button>
                                    <button
                                      onClick={() => handleDeleteProvider(p)}
                                      className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 벤더 등록/수정 모달 */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-700">
              <h3 className="text-slate-100">{editingVendorId ? '게임사 수정' : '게임사 추가'}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">벤더 키 (고유값) *</label>
                  <input
                    value={vendorForm.vendor_key}
                    onChange={e => {
                      const key = e.target.value.toLowerCase().replace(/\s/g, '');
                      setVendorForm(f => ({
                        ...f,
                        vendor_key: key,
                        // Honor 감지 시 API URL 자동 설정
                        api_base_url: key === HONOR_VENDOR_KEY ? 'https://api.honorlink.org/ap' : f.api_base_url,
                      }));
                    }}
                    placeholder="invest / honor / ace"
                    disabled={!!editingVendorId}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">게임사 이름 *</label>
                  <input
                    value={vendorForm.vendor_name}
                    onChange={e => setVendorForm(f => ({ ...f, vendor_name: e.target.value }))}
                    placeholder="INVEST"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">API Base URL *</label>
                <input
                  value={vendorForm.api_base_url}
                  onChange={e => setVendorForm(f => ({ ...f, api_base_url: e.target.value }))}
                  placeholder="https://api.invest-ho.com/api"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    OPCODE {vendorForm.vendor_key === HONOR_VENDOR_KEY ? <span className="text-slate-600">(Honor 미사용)</span> : '*'}
                  </label>
                  <input
                    value={vendorForm.opcode}
                    onChange={e => setVendorForm(f => ({ ...f, opcode: e.target.value }))}
                    placeholder={vendorForm.vendor_key === HONOR_VENDOR_KEY ? 'Honor는 OPCODE 불필요' : '발급받은 opcode'}
                    disabled={vendorForm.vendor_key === HONOR_VENDOR_KEY}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    SECRET KEY * {vendorForm.vendor_key === HONOR_VENDOR_KEY && <span className="text-blue-400">(= Bearer 토큰)</span>}
                  </label>
                  <input
                    type="password"
                    value={vendorForm.secret_key}
                    onChange={e => setVendorForm(f => ({ ...f, secret_key: e.target.value }))}
                    placeholder={vendorForm.vendor_key === HONOR_VENDOR_KEY ? 'Honor API KEY (Bearer 토큰)' : '발급받은 secret key'}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">설명</label>
                <input
                  value={vendorForm.description}
                  onChange={e => setVendorForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="(선택 입력)"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={vendorForm.is_active}
                  onChange={e => setVendorForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-300">활성화</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowVendorModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveVendor}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
