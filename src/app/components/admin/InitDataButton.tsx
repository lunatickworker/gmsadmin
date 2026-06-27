import { useState } from 'react';
import { Database } from 'lucide-react';
import { api } from '../../../utils/api';

export default function InitDataButton() {
  const [loading, setLoading] = useState(false);

  const handleInit = async () => {
    if (!confirm('샘플 데이터를 추가하시겠습니까? 기존 데이터는 유지됩니다.')) return;

    setLoading(true);
    try {
      const res = await api.initData();
      if (res.success) {
        alert('샘플 데이터가 추가되었습니다. 페이지를 새로고침해주세요.');
        window.location.reload();
      } else {
        alert('오류가 발생했습니다: ' + res.error);
      }
    } catch (error) {
      console.error('Error initializing data:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleInit}
      disabled={loading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors text-sm"
    >
      <Database size={18} />
      {loading ? '추가 중...' : '샘플 데이터 추가'}
    </button>
  );
}
