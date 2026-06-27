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
    if (open) refreshCaptcha();
  }, [open, refreshCaptcha]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (captchaAnswer !== captchaCode) {
      refreshCaptcha();
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative z-10 w-full max-w-[360px] mx-4 bg-[#1a1a1a] border border-[#3a3020] rounded shadow-2xl overflow-hidden">
        {/* title bar */}
        <div className="flex items-center justify-between bg-[#111] border-b border-[#2a2010] px-5 py-3">
          <span className="text-white font-semibold tracking-wide">로그인</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
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
            <div className="flex items-center justify-center w-24 h-10 rounded bg-[#0d0d0d] border border-[#333] select-none">
              <span
                className="font-mono font-bold tracking-[0.25em] text-[#c9a227]"
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
              className="flex-1 h-10 bg-[#111] border border-[#333] rounded px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#c9a227] transition-colors"
            />
            <button
              type="button"
              onClick={refreshCaptcha}
              disabled={busy}
              className="w-10 h-10 flex items-center justify-center rounded border border-[#333] text-slate-500 hover:text-white hover:border-[#c9a227] transition-colors shrink-0"
            >
              <RefreshCw size={14} />
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

          {/* Links */}
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <button type="button" className="hover:text-slate-300 transition-colors">아이디 찾기</button>
              <span className="text-slate-700">|</span>
              <button type="button" className="hover:text-slate-300 transition-colors">비밀번호 찾기</button>
            </div>
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-[#c9a227] hover:text-[#d4b030] transition-colors"
            >
              회원가입
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
