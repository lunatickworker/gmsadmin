import { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ImageIcon, Plus, Eye, EyeOff, Pencil, Trash2, Upload, Type } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../utils/api';

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  metadata: {
    format?: string;       // portrait_full | portrait_half | landscape_full | landscape_half
    content_type?: string; // image | text
    text_content?: string;
    bg_color?: string;
    text_color?: string;
  };
}

const FORMAT_OPTIONS = [
  { value: 'landscape_full', label: '가로형 400×250px', desc: '팝업 고정 크기: 400×250px', aspect: 'aspect-[8/5]', maxW: 'max-w-full' },
  { value: 'portrait_full', label: '세로형 50% (250×400px)', desc: '팝업 고정 크기: 250×400px', aspect: 'aspect-[5/8]', maxW: 'max-w-[180px]' },
  { value: 'landscape_half', label: '가로형 소형', desc: '권장 크기: 640×360px', aspect: 'aspect-video', maxW: 'max-w-[50%]' },
  { value: 'portrait_half', label: '세로형 소형', desc: '권장 크기: 360×640px', aspect: 'aspect-[9/16]', maxW: 'max-w-[90px]' },
];

const FORMAT_MAP = Object.fromEntries(FORMAT_OPTIONS.map(f => [f.value, f]));

const defaultForm = {
  title: '',
  link_url: '',
  position: 'popup',
  display_order: 1,
  is_active: false,
  content_type: 'image' as 'image' | 'text',
  format: 'landscape_full',
  image_url: '',
  text_content: '',
  bg_color: '#1e293b',
  text_color: '#ffffff',
};

export default function BannerManage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.getBanners();
      setBanners(res.data || []);
    } catch { toast.error('배너 로드 실패'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ ...defaultForm }); setImagePreview(''); setEditingId(null); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      setForm(f => ({ ...f, image_url: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.title) { toast.error('배너 제목을 입력해주세요'); return; }
    if (form.content_type === 'image' && !form.image_url) { toast.error('이미지를 선택하거나 URL을 입력해주세요'); return; }
    if (form.content_type === 'text' && !form.text_content) { toast.error('텍스트 내용을 입력해주세요'); return; }

    const payload = {
      title: form.title,
      image_url: form.content_type === 'image' ? form.image_url : undefined,
      link_url: form.link_url,
      position: form.position,
      display_order: form.display_order,
      is_active: form.is_active,
      metadata: {
        format: form.format,
        content_type: form.content_type,
        text_content: form.text_content,
        bg_color: form.bg_color,
        text_color: form.text_color,
      },
    };

    try {
      if (editingId) {
        await api.updateBanner(editingId, payload);
        toast.success('배너가 수정되었습니다');
      } else {
        await api.createBanner(payload);
        toast.success('배너가 추가되었습니다');
      }
      setShowForm(false);
      resetForm();
      load();
    } catch { toast.error('저장 실패'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('배너를 삭제하시겠습니까?')) return;
    try { await api.deleteBanner(id); toast.success('삭제되었습니다'); load(); }
    catch { toast.error('삭제 실패'); }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      await api.updateBanner(banner.id, { is_active: !banner.is_active });
      toast.success(banner.is_active ? '비활성화되었습니다' : '활성화되었습니다');
      load();
    } catch { toast.error('변경 실패'); }
  };

  const startEdit = (b: Banner) => {
    setEditingId(b.id);
    setForm({
      title: b.title,
      link_url: b.link_url || '',
      position: b.position,
      display_order: b.display_order,
      is_active: b.is_active,
      content_type: (b.metadata?.content_type as any) || 'image',
      format: b.metadata?.format || 'landscape_full',
      image_url: b.image_url || '',
      text_content: b.metadata?.text_content || '',
      bg_color: b.metadata?.bg_color || '#1e293b',
      text_color: b.metadata?.text_color || '#ffffff',
    });
    setImagePreview(b.image_url || '');
    setShowForm(true);
  };

  const fmtInfo = FORMAT_MAP[form.format] || FORMAT_OPTIONS[2];
  const activeBanners = banners.filter(b => b.is_active);
  const inactiveBanners = banners.filter(b => !b.is_active);

  const BannerPreview = ({ banner }: { banner: Banner }) => {
    const fmt = FORMAT_MAP[banner.metadata?.format || 'landscape_full'];
    const isText = banner.metadata?.content_type === 'text';
    return (
      <div className={`relative bg-slate-900 rounded-lg overflow-hidden ${fmt?.aspect || 'aspect-video'} ${fmt?.maxW || 'max-w-full'} mx-auto`}>
        {isText ? (
          <div className="absolute inset-0 flex items-center justify-center p-4"
            style={{ backgroundColor: banner.metadata?.bg_color || '#1e293b', color: banner.metadata?.text_color || '#fff' }}>
            <p className="text-center font-medium text-sm leading-relaxed">{banner.metadata?.text_content}</p>
          </div>
        ) : banner.image_url ? (
          <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        {!banner.is_active && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white text-sm font-bold">비활성화</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">배너 관리</h2>
          <p className="text-slate-400">사이트 배너를 관리합니다</p>
        </div>
        <Button onClick={() => { setShowForm(true); resetForm(); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> 배너 추가
        </Button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '전체 배너', value: banners.length, color: 'border-blue-500/30' },
          { label: '활성화', value: activeBanners.length, color: 'border-green-500/30' },
          { label: '비활성화', value: inactiveBanners.length, color: 'border-slate-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className={`bg-slate-800 border ${color} p-4`}>
            <p className="text-slate-400 text-sm mb-1">{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </Card>
        ))}
      </div>

      {/* 폼 */}
      {showForm && (
        <Card className="bg-slate-800 border-slate-700 p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-6">{editingId ? '배너 수정' : '새 배너 추가'}</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 mb-2 block">배너 제목</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="배너 제목" className="bg-slate-900 border-slate-600 text-white" />
              </div>

              <div>
                <Label className="text-slate-300 mb-2 block">배너 포맷</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setForm({ ...form, format: opt.value })}
                      className={`p-3 rounded-lg border text-left transition-all ${form.format === opt.value ? 'bg-blue-600 border-blue-500' : 'bg-slate-900 border-slate-600 hover:border-slate-500'}`}>
                      <p className="text-white text-sm font-medium">{opt.label}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-slate-300 mb-2 block">콘텐츠 유형</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'image', label: '이미지 업로드', icon: <ImageIcon className="w-4 h-4" /> },
                    { value: 'text', label: '텍스트 입력', icon: <Type className="w-4 h-4" /> }].map(opt => (
                    <button key={opt.value} onClick={() => setForm({ ...form, content_type: opt.value as any })}
                      className={`p-3 rounded-lg border flex items-center gap-2 transition-all ${form.content_type === opt.value ? 'bg-blue-600 border-blue-500' : 'bg-slate-900 border-slate-600 hover:border-slate-500'}`}>
                      <span className="text-white">{opt.icon}</span>
                      <span className="text-white text-sm">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.content_type === 'image' ? (
                <div>
                  <Label className="text-slate-300 mb-2 block">이미지</Label>
                  <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg mb-3 text-xs text-blue-300">
                    📐 권장 크기: {fmtInfo.desc} · JPG, PNG, WebP · 최대 5MB
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full text-slate-300" onClick={() => fileRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-2" /> 파일 선택
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    <div className="relative">
                      <span className="absolute inset-x-0 text-center text-slate-500 text-xs top-2">또는 URL 직접 입력</span>
                      <Input value={form.image_url} onChange={e => { setForm({ ...form, image_url: e.target.value }); setImagePreview(e.target.value); }}
                        placeholder="https://example.com/banner.jpg"
                        className="bg-slate-900 border-slate-600 text-white mt-6" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-slate-300 mb-2 block">텍스트 내용</Label>
                    <textarea value={form.text_content} onChange={e => setForm({ ...form, text_content: e.target.value })}
                      placeholder="배너에 표시할 텍스트를 입력하세요"
                      className="w-full h-24 bg-slate-900 border border-slate-600 rounded-md p-3 text-white resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-300 mb-2 block">배경 색상</Label>
                      <div className="flex gap-2">
                        <input type="color" value={form.bg_color} onChange={e => setForm({ ...form, bg_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                        <Input value={form.bg_color} onChange={e => setForm({ ...form, bg_color: e.target.value })}
                          className="bg-slate-900 border-slate-600 text-white" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2 block">텍스트 색상</Label>
                      <div className="flex gap-2">
                        <input type="color" value={form.text_color} onChange={e => setForm({ ...form, text_color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                        <Input value={form.text_color} onChange={e => setForm({ ...form, text_color: e.target.value })}
                          className="bg-slate-900 border-slate-600 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 mb-2 block">링크 URL (선택)</Label>
                  <Input value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })}
                    placeholder="/event/special" className="bg-slate-900 border-slate-600 text-white" />
                </div>
                <div>
                  <Label className="text-slate-300 mb-2 block">표시 순서</Label>
                  <Input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })}
                    className="bg-slate-900 border-slate-600 text-white" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4" />
                <span className="text-slate-300">즉시 활성화</span>
              </label>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">{editingId ? '수정 완료' : '추가'}</Button>
                <Button onClick={() => { setShowForm(false); resetForm(); }} variant="outline" className="text-slate-300">취소</Button>
              </div>
            </div>

            {/* 미리보기 */}
            <div>
              <Label className="text-slate-300 mb-2 block">미리보기</Label>
              <div className="bg-slate-900 rounded-lg p-4 min-h-48 flex items-center justify-center">
                {form.content_type === 'text' ? (
                  <div className={`relative rounded-lg overflow-hidden ${fmtInfo.aspect} ${fmtInfo.maxW} w-full flex items-center justify-center p-4`}
                    style={{ backgroundColor: form.bg_color, color: form.text_color }}>
                    <p className="text-center font-medium text-sm leading-relaxed">
                      {form.text_content || '텍스트를 입력하면 미리보기가 표시됩니다'}
                    </p>
                  </div>
                ) : imagePreview ? (
                  <div className={`relative rounded-lg overflow-hidden ${fmtInfo.aspect} ${fmtInfo.maxW} w-full`}>
                    <img src={imagePreview} alt="미리보기" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    이미지를 업로드하면 미리보기가 표시됩니다
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 배너 목록 */}
      {loading ? (
        <div className="text-center text-slate-400 py-12">로딩 중...</div>
      ) : banners.length === 0 ? (
        <div className="text-center text-slate-400 py-12">등록된 배너가 없습니다</div>
      ) : (
        <div className="space-y-4">
          {banners.map(banner => (
            <Card key={banner.id} className="bg-slate-800 border-slate-700 overflow-hidden">
              <div className="grid md:grid-cols-5 gap-6 p-6">
                <div className="md:col-span-2">
                  <BannerPreview banner={banner} />
                </div>
                <div className="md:col-span-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <ImageIcon className="w-5 h-5 text-blue-500" />
                      <h3 className="text-xl font-bold text-white">{banner.title}</h3>
                      <Badge className={banner.is_active ? 'bg-green-600' : 'bg-slate-600'}>
                        {banner.is_active ? '활성' : '비활성'}
                      </Badge>
                      {banner.metadata?.format && (
                        <Badge className="bg-blue-800 text-xs">
                          {FORMAT_MAP[banner.metadata.format]?.label || banner.metadata.format}
                        </Badge>
                      )}
                      {banner.metadata?.content_type === 'text' && (
                        <Badge className="bg-purple-800 text-xs">텍스트</Badge>
                      )}
                    </div>
                    <div className="space-y-1.5 text-sm text-slate-400">
                      <div><span className="text-slate-500">링크:</span> <span className="text-slate-300">{banner.link_url || '없음'}</span></div>
                      <div><span className="text-slate-500">순서:</span> <span className="text-slate-300">{banner.display_order}</span></div>
                      <div><span className="text-slate-500">등록일:</span> <span className="text-slate-300">{new Date(banner.created_at).toLocaleDateString('ko-KR')}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <Button onClick={() => toggleActive(banner)} variant="outline"
                      className={banner.is_active ? 'text-slate-300' : 'text-green-400 border-green-600'}>
                      {banner.is_active ? <><EyeOff className="w-4 h-4 mr-1" />비활성화</> : <><Eye className="w-4 h-4 mr-1" />활성화</>}
                    </Button>
                    <Button variant="outline" className="text-slate-300" onClick={() => startEdit(banner)}>
                      <Pencil className="w-4 h-4 mr-1" />수정
                    </Button>
                    <Button variant="outline" className="text-red-400 hover:text-red-300" onClick={() => handleDelete(banner.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />삭제
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
