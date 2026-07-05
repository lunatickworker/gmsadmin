import { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { api } from '../../../utils/api';

const LOGO_URL = 'https://jlgvkwofxcyegcealbdr.supabase.co/storage/v1/object/public/image/Benz%20logo.png';

interface GameSignupModalProps {
  open: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

interface SignupData {
  username: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  bankName: string;
  accountNumber: string;
  referralCode: string;
}

function Field({
  label, id, children,
}: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="text-xs text-slate-400">{label}</label>}
      {children}
    </div>
  );
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-9 bg-[#111] border border-[#333] rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227] transition-colors disabled:opacity-50 ${className}`}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold text-[#c9a227] tracking-wider uppercase">{children}</span>
      <div className="flex-1 h-px bg-[#c9a227]/20" />
    </div>
  );
}

export default function GameSignupModal({ open, onClose, onSwitchToLogin }: GameSignupModalProps) {
  const [formData, setFormData] = useState<SignupData>({
    username: '', password: '', passwordConfirm: '',
    name: '', phone: '', bankName: '', accountNumber: '', referralCode: '',
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: keyof SignupData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(prev => ({ ...prev, [field]: e.target.value }));

  if (!open) return null;

  const handleClose = () => {
    setDone(false);
    onClose();
  };

  const validate = () => {
    if (!formData.username || formData.username.length < 4) { toast.error('아이디는 4자 이상이어야 합니다'); return false; }
    if (!formData.password || formData.password.length < 6) { toast.error('비밀번호는 6자 이상이어야 합니다'); return false; }
    if (formData.password !== formData.passwordConfirm) { toast.error('비밀번호가 일치하지 않습니다'); return false; }
    if (!formData.name) { toast.error('이름을 입력해주세요'); return false; }
    if (!formData.phone) { toast.error('연락처를 입력해주세요'); return false; }
    if (!formData.bankName || !formData.accountNumber) { toast.error('은행명과 계좌번호를 입력해주세요'); return false; }
    if (!agreeTerms || !agreePrivacy) { toast.error('약관에 동의해주세요'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      const result = await api.signup({
        username: formData.username,
        password: formData.password,
        name: formData.name,
        phone: formData.phone,
        bank_name: formData.bankName,
        account_number: formData.accountNumber,
        referral_code: formData.referralCode || undefined,
      });
      if (!result.success) { toast.error(result.error || '회원가입에 실패했습니다'); return; }
      setDone(true);
    } catch (err: any) {
      toast.error(err?.message || '회원가입에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* modal */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 bg-[#1a1a1a] border border-[#3a3020] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* ── Logo ────────────────────────────────────────── */}
        <div className="relative bg-[#0d0d0d] pt-5 pb-4 flex flex-col items-center border-b border-[#2a2010] shrink-0">
          <img
            src={LOGO_URL}
            alt="BENZ CASINO"
            className="h-16 w-auto object-contain"
          />
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-slate-600 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Title bar ───────────────────────────────────── */}
        <div className="flex items-center bg-[#111] border-b border-[#2a2010] px-5 py-2.5 shrink-0">
          <span className="text-white/80 text-sm font-medium tracking-wide">회원가입</span>
        </div>

        {/* ── Scrollable form ─────────────────────────────── */}
        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3020 transparent' }}>
          {done ? (
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-base mb-1">가입 신청 완료</p>
                <p className="text-slate-400 text-sm leading-relaxed">
                  관리자 <span className="text-[#c9a227]">승인 후</span> 로그인이 가능합니다.
                </p>
              </div>
              <button
                onClick={() => { setDone(false); onSwitchToLogin(); }}
                className="w-full h-10 rounded bg-gradient-to-r from-[#c9a227] to-[#a07820] text-black font-bold text-sm"
              >
                로그인 화면으로
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              {/* 계정 정보 */}
              <SectionTitle>계정 정보</SectionTitle>

              <Field label="아이디" id="su-username">
                <Input id="su-username" type="text" placeholder="4자 이상" value={formData.username} onChange={set('username')} disabled={isLoading} />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="비밀번호">
                  <Input type="password" placeholder="6자 이상" value={formData.password} onChange={set('password')} disabled={isLoading} />
                </Field>
                <Field label="비밀번호 확인">
                  <Input type="password" placeholder="재입력" value={formData.passwordConfirm} onChange={set('passwordConfirm')} disabled={isLoading} />
                </Field>
              </div>

              <Field label="추천인 코드 (선택)">
                <Input type="text" placeholder="추천인 아이디" value={formData.referralCode} onChange={set('referralCode')} disabled={isLoading} />
              </Field>

              {/* 개인 정보 */}
              <SectionTitle>개인 정보</SectionTitle>

              <div className="grid grid-cols-2 gap-2">
                <Field label="이름">
                  <Input type="text" placeholder="실명" value={formData.name} onChange={set('name')} disabled={isLoading} />
                </Field>
                <Field label="연락처">
                  <Input type="tel" placeholder="01012345678" value={formData.phone} onChange={set('phone')} disabled={isLoading} />
                </Field>
              </div>

              {/* 계좌 정보 */}
              <SectionTitle>계좌 정보</SectionTitle>

              <div className="grid grid-cols-2 gap-2">
                <Field label="은행명">
                  <Input type="text" placeholder="예: 국민은행" value={formData.bankName} onChange={set('bankName')} disabled={isLoading} />
                </Field>
                <Field label="계좌번호">
                  <Input type="text" placeholder="'-' 없이 입력" value={formData.accountNumber} onChange={set('accountNumber')} disabled={isLoading} />
                </Field>
              </div>
              <p className="text-[10px] text-slate-600">* 본인 명의 계좌를 입력해주세요</p>

              {/* 약관 */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={agreeTerms}
                    onCheckedChange={v => setAgreeTerms(v as boolean)}
                    disabled={isLoading}
                    className="border-[#444] data-[state=checked]:bg-[#c9a227] data-[state=checked]:border-[#c9a227]"
                  />
                  <span className="text-xs text-slate-400">이용약관에 동의합니다 <span className="text-red-500">*</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={agreePrivacy}
                    onCheckedChange={v => setAgreePrivacy(v as boolean)}
                    disabled={isLoading}
                    className="border-[#444] data-[state=checked]:bg-[#c9a227] data-[state=checked]:border-[#c9a227]"
                  />
                  <span className="text-xs text-slate-400">개인정보 처리방침에 동의합니다 <span className="text-red-500">*</span></span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded bg-gradient-to-r from-[#c9a227] to-[#a07820] hover:from-[#d4b030] hover:to-[#b08828] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm tracking-wide transition-all"
              >
                {isLoading ? '가입 신청 중...' : '회원가입 신청'}
              </button>

              <p className="text-center text-xs text-slate-500 pb-2">
                이미 계정이 있으신가요?{' '}
                <button
                  type="button"
                  onClick={() => { setDone(false); onSwitchToLogin(); }}
                  className="text-[#c9a227] hover:text-[#d4b030] transition-colors"
                  disabled={isLoading}
                >
                  로그인
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
