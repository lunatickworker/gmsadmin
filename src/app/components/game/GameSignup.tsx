import { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { api } from '../../../utils/api';
import { CheckCircle } from 'lucide-react';

interface GameSignupProps {
  onSignup: (data: SignupData) => void;
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

export default function GameSignup({ onSignup, onSwitchToLogin }: GameSignupProps) {
  const [formData, setFormData] = useState<SignupData>({
    username: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: '',
    bankName: '',
    accountNumber: '',
    referralCode: '',
  });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleChange = (field: keyof SignupData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const validateForm = () => {
    if (!formData.username || formData.username.length < 4) {
      toast.error('아이디는 4자 이상이어야 합니다');
      return false;
    }
    if (!formData.password || formData.password.length < 6) {
      toast.error('비밀번호는 6자 이상이어야 합니다');
      return false;
    }
    if (formData.password !== formData.passwordConfirm) {
      toast.error('비밀번호가 일치하지 않습니다');
      return false;
    }
    if (!formData.name) {
      toast.error('이름을 입력해주세요');
      return false;
    }
    if (!formData.phone) {
      toast.error('연락처를 입력해주세요');
      return false;
    }
    if (!formData.bankName || !formData.accountNumber) {
      toast.error('은행명과 계좌번호를 입력해주세요');
      return false;
    }
    if (!agreeTerms || !agreePrivacy) {
      toast.error('약관에 동의해주세요');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

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

      if (!result.success) {
        toast.error(result.error || '회원가입에 실패했습니다');
        return;
      }

      onSignup(formData);
      setSignupDone(true);
    } catch (error: any) {
      toast.error(error?.message || '회원가입에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-block bg-gradient-to-r from-yellow-500 to-amber-600 p-4 rounded-xl mb-6">
            <h1 className="text-3xl font-bold text-black">BENZ</h1>
          </div>
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm p-10">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-3">가입 신청 완료</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-2">
              회원가입 신청이 접수되었습니다.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              관리자 <span className="text-yellow-400 font-medium">승인 후</span> 로그인이 가능합니다.<br />
              승인까지 잠시 기다려 주세요.
            </p>
            <Button
              onClick={onSwitchToLogin}
              className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-black font-bold"
            >
              로그인 화면으로
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-gradient-to-r from-yellow-500 to-amber-600 p-4 rounded-xl mb-4">
            <h1 className="text-3xl font-bold text-black">BENZ</h1>
          </div>
          <h2 className="text-4xl font-bold text-white mb-2">CASINO</h2>
          <p className="text-slate-400">프리미엄 온라인 카지노</p>
        </div>

        {/* Signup Form */}
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <div className="p-8">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">회원가입</h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 계정 정보 */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-yellow-500">계정 정보</h4>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-300">아이디</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="4자 이상 입력하세요"
                    value={formData.username}
                    onChange={handleChange('username')}
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                    disabled={isLoading}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">비밀번호</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="6자 이상"
                      value={formData.password}
                      onChange={handleChange('password')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordConfirm" className="text-slate-300">비밀번호 확인</Label>
                    <Input
                      id="passwordConfirm"
                      type="password"
                      placeholder="비밀번호 재입력"
                      value={formData.passwordConfirm}
                      onChange={handleChange('passwordConfirm')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* 추천인 코드 */}
                <div className="space-y-2">
                  <Label htmlFor="referralCode" className="text-slate-300">
                    추천인 코드 <span className="text-slate-500 text-xs">(선택)</span>
                  </Label>
                  <Input
                    id="referralCode"
                    type="text"
                    placeholder="추천인 아이디를 입력하세요"
                    value={formData.referralCode}
                    onChange={handleChange('referralCode')}
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-slate-500">* 추천인이 있는 경우 해당 파트너 소속으로 등록됩니다</p>
                </div>
              </div>

              {/* 개인 정보 */}
              <div className="space-y-4 pt-4 border-t border-slate-700">
                <h4 className="text-lg font-semibold text-yellow-500">개인 정보</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-300">이름</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="실명을 입력하세요"
                      value={formData.name}
                      onChange={handleChange('name')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-slate-300">연락처</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="01012345678"
                      value={formData.phone}
                      onChange={handleChange('phone')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* 계좌 정보 */}
              <div className="space-y-4 pt-4 border-t border-slate-700">
                <h4 className="text-lg font-semibold text-yellow-500">계좌 정보</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName" className="text-slate-300">은행명</Label>
                    <Input
                      id="bankName"
                      type="text"
                      placeholder="예: 국민은행"
                      value={formData.bankName}
                      onChange={handleChange('bankName')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" className="text-slate-300">계좌번호</Label>
                    <Input
                      id="accountNumber"
                      type="text"
                      placeholder="'-' 없이 입력"
                      value={formData.accountNumber}
                      onChange={handleChange('accountNumber')}
                      className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-yellow-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">* 입출금 처리를 위해 본인 명의 계좌를 입력해주세요</p>
              </div>

              {/* 약관 동의 */}
              <div className="space-y-3 pt-4 border-t border-slate-700">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={agreeTerms}
                    onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                    disabled={isLoading}
                  />
                  <label htmlFor="terms" className="text-sm text-slate-300 cursor-pointer">
                    이용약관에 동의합니다 <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="privacy"
                    checked={agreePrivacy}
                    onCheckedChange={(checked) => setAgreePrivacy(checked as boolean)}
                    disabled={isLoading}
                  />
                  <label htmlFor="privacy" className="text-sm text-slate-300 cursor-pointer">
                    개인정보 처리방침에 동의합니다 <span className="text-red-500">*</span>
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-black font-bold py-6"
                disabled={isLoading}
              >
                {isLoading ? '가입 신청 중...' : '회원가입 신청'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-slate-400 text-sm">
                이미 계정이 있으신가요?{' '}
                <button
                  onClick={onSwitchToLogin}
                  className="text-yellow-500 hover:text-yellow-400 font-medium"
                  disabled={isLoading}
                >
                  로그인
                </button>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
