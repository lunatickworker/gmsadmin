import { useState } from 'react';
import { Settings, Save, RefreshCw, Lock, Bell, Database } from 'lucide-react';

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    siteName: 'BENZ CASINO',
    siteDescription: '프리미엄 온라인 카지노',
    maintenanceMode: false,
    allowRegistration: true,
    minDepositAmount: 10000,
    maxDepositAmount: 10000000,
    minWithdrawAmount: 10000,
    maxWithdrawAmount: 5000000,
    pointConversionRate: 1.0,
    sessionTimeout: 30,
    passwordMinLength: 8,
    enableTwoFactor: false,
    enableEmailNotification: true,
    enableSmsNotification: false,
    maxLoginAttempts: 5,
    lockoutDuration: 30,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (field: string, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Supabase API 연동
    setTimeout(() => {
      setIsSaving(false);
      alert('설정이 저장되었습니다.');
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-500/10 rounded-lg">
            <Settings className="text-slate-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">시스템 설정</h2>
            <p className="text-sm text-slate-400">전반적인 시스템 설정 관리</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 기본 설정 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100 mb-4">
          <Settings size={20} className="text-slate-400" />
          기본 설정
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              사이트 이름
            </label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => handleInputChange('siteName', e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              사이트 설명
            </label>
            <input
              type="text"
              value={settings.siteDescription}
              onChange={(e) => handleInputChange('siteDescription', e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
            <div>
              <div className="font-medium text-slate-100">점검 모드</div>
              <div className="text-sm text-slate-400">활성화 시 일반 사용자 접속 제한</div>
            </div>
            <button
              onClick={() =>
                handleInputChange('maintenanceMode', !settings.maintenanceMode)
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.maintenanceMode ? 'bg-yellow-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
            <div>
              <div className="font-medium text-slate-100">신규 회원가입 허용</div>
              <div className="text-sm text-slate-400">비활성화 시 신규 가입 차단</div>
            </div>
            <button
              onClick={() =>
                handleInputChange('allowRegistration', !settings.allowRegistration)
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.allowRegistration ? 'bg-green-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.allowRegistration ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 입출금 설정 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100 mb-4">
          <Database size={20} className="text-slate-400" />
          입출금 설정
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              최소 입금액
            </label>
            <input
              type="number"
              value={settings.minDepositAmount}
              onChange={(e) =>
                handleInputChange('minDepositAmount', Number(e.target.value))
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              최대 입금액
            </label>
            <input
              type="number"
              value={settings.maxDepositAmount}
              onChange={(e) =>
                handleInputChange('maxDepositAmount', Number(e.target.value))
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              최소 출금액
            </label>
            <input
              type="number"
              value={settings.minWithdrawAmount}
              onChange={(e) =>
                handleInputChange('minWithdrawAmount', Number(e.target.value))
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              최대 출금액
            </label>
            <input
              type="number"
              value={settings.maxWithdrawAmount}
              onChange={(e) =>
                handleInputChange('maxWithdrawAmount', Number(e.target.value))
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              포인트 전환율
            </label>
            <input
              type="number"
              step="0.1"
              value={settings.pointConversionRate}
              onChange={(e) =>
                handleInputChange('pointConversionRate', Number(e.target.value))
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* 보안 설정 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100 mb-4">
          <Lock size={20} className="text-slate-400" />
          보안 설정
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                세션 타임아웃 (분)
              </label>
              <input
                type="number"
                value={settings.sessionTimeout}
                onChange={(e) =>
                  handleInputChange('sessionTimeout', Number(e.target.value))
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                비밀번호 최소 길이
              </label>
              <input
                type="number"
                value={settings.passwordMinLength}
                onChange={(e) =>
                  handleInputChange('passwordMinLength', Number(e.target.value))
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                최대 로그인 시도 횟수
              </label>
              <input
                type="number"
                value={settings.maxLoginAttempts}
                onChange={(e) =>
                  handleInputChange('maxLoginAttempts', Number(e.target.value))
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                계정 잠금 시간 (분)
              </label>
              <input
                type="number"
                value={settings.lockoutDuration}
                onChange={(e) =>
                  handleInputChange('lockoutDuration', Number(e.target.value))
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
            <div>
              <div className="font-medium text-slate-100">2단계 인증</div>
              <div className="text-sm text-slate-400">로그인 시 추가 인증 요구</div>
            </div>
            <button
              onClick={() =>
                handleInputChange('enableTwoFactor', !settings.enableTwoFactor)
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enableTwoFactor ? 'bg-green-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enableTwoFactor ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100 mb-4">
          <Bell size={20} className="text-slate-400" />
          알림 설정
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
            <div>
              <div className="font-medium text-slate-100">이메일 알림</div>
              <div className="text-sm text-slate-400">중요 이벤트 이메일 발송</div>
            </div>
            <button
              onClick={() =>
                handleInputChange(
                  'enableEmailNotification',
                  !settings.enableEmailNotification
                )
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enableEmailNotification ? 'bg-green-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enableEmailNotification ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
            <div>
              <div className="font-medium text-slate-100">SMS 알림</div>
              <div className="text-sm text-slate-400">중요 이벤트 SMS 발송</div>
            </div>
            <button
              onClick={() =>
                handleInputChange('enableSmsNotification', !settings.enableSmsNotification)
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enableSmsNotification ? 'bg-green-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enableSmsNotification ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
