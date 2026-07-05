import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface GameLoginModalProps {
  open: boolean;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onClose?: () => void;
  onSwitchToSignup: () => void;
  isLoading?: boolean;
}

function generateCaptcha(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Main Login Modal ─────────────────────────────────────────────────────────
export default function GameLoginModal({
  open,
  onLogin,
  onClose,
  onSwitchToSignup,
  isLoading = false,
}: GameLoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaCode, setCaptchaCode] = useState(generateCaptcha);
  const [submitting, setSubmitting] = useState(false);

  const refreshCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptcha());
    setCaptchaAnswer('');
  }, []);

  useEffect(() => {
    if (open) {
      refreshCaptcha();
    }
  }, [open, refreshCaptcha]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (captchaAnswer !== captchaCode) {
      refreshCaptcha();
      toast.error('보안코드가 일치하지 않습니다');
      return;
    }
    setSubmitting(true);
    try {
      await onLogin(username.trim(), password);
    } finally {
      setSubmitting(false);
      refreshCaptcha();
    }
  };

  const busy = submitting || isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative z-10 w-full max-w-[380px] mx-4 bg-[#1a1a1a] border border-[#3a3020] rounded-lg shadow-2xl overflow-hidden">

        {/* ── Logo Banner ─────────────────────────────────────── */}
        <div className="relative bg-[#0d0d0d] pt-6 pb-5 flex flex-col items-center border-b border-[#2a2010]">
          <img
            src="https://jlgvkwofxcyegcealbdr.supabase.co/storage/v1/object/public/image/Benz%20logo.png"
            alt="BENZ CASINO"
            className="h-20 w-auto object-contain"
          />
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-slate-600 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── Title bar ───────────────────────────────────────── */}
        <div className="flex items-center bg-[#111] border-b border-[#2a2010] px-5 py-2.5">
          <span className="text-white/80 text-sm font-medium tracking-wide">로그인</span>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-3">
          {/* ID */}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디"
            disabled={busy}
            autoComplete="username"
            className="w-full h-10 bg-[#111] border border-[#333] rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227] transition-colors"
          />

          {/* Password */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            disabled={busy}
            autoComplete="current-password"
            className="w-full h-10 bg-[#111] border border-[#333] rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227] transition-colors"
          />

          {/* Captcha */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-20 h-10 rounded bg-[#0d0d0d] border border-[#333] select-none shrink-0">
              <span
                className="font-mono font-bold text-[#c9a227]"
                style={{ fontStyle: 'italic', letterSpacing: '0.2em' }}
              >
                {captchaCode}
              </span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, ''))}
              placeholder="숫자 입력"
              disabled={busy}
              className="flex-1 min-w-0 h-10 bg-[#111] border border-[#333] rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227] transition-colors"
            />
            <button
              type="button"
              onClick={refreshCaptcha}
              disabled={busy}
              className="w-9 h-10 flex items-center justify-center rounded border border-[#333] text-slate-500 hover:text-white hover:border-[#c9a227] transition-colors shrink-0"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={busy || !username || !password || captchaAnswer.length < 4}
            className="w-full h-11 rounded bg-gradient-to-r from-[#c9a227] to-[#a07820] hover:from-[#d4b030] hover:to-[#b08828] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm tracking-wide transition-all"
          >
            {busy ? '로그인 중...' : '로그인'}
          </button>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-600">
              계정 문의는{' '}
              <span className="text-slate-500">고객센터</span>를 이용해주세요
            </p>
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-xs text-[#c9a227] hover:text-[#d4b030] transition-colors"
            >
              회원가입
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
