import { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import type { User as AuthUser } from '../../context/AuthContext';
import { mapDbUserToUser } from '../../context/AuthContext';
import { supabase } from '../../../utils/supabase/client';

interface LoginProps {
  onLogin: (userData: AuthUser) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('아이디와 비밀번호를 입력해주세요');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('verify_user_login', {
        p_username: username,
        p_password: password,
      });

      if (error) {
        console.error('RPC error:', error);
        toast.error('로그인 처리 중 오류가 발생했습니다');
        return;
      }

      if (!data || data.length === 0) {
        toast.error('아이디 또는 비밀번호가 올바르지 않습니다');
        return;
      }

      const user = mapDbUserToUser(data[0]);
      toast.success(`${user.levelName}으로 로그인했습니다`);
      onLogin(user);
    } catch (err) {
      toast.error('서버 연결에 실패했습니다');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700 p-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">관리자 로그인</h1>
          <p className="text-slate-400">계층별 관리 시스템</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <Label className="text-slate-300 mb-2 block">아이디</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                className="bg-slate-900 border-slate-600 text-white pl-10"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-300 mb-2 block">비밀번호</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="bg-slate-900 border-slate-600 text-white pl-10"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

      </Card>
    </div>
  );
}
