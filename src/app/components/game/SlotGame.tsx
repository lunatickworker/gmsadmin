import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ArrowLeft, DollarSign, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SlotGameProps {
  onBack: () => void;
  balance: number;
  onBalanceChange: (newBalance: number) => void;
}

const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎', '7️⃣'];
const symbolValues: Record<string, number> = {
  '🍒': 2,
  '🍋': 3,
  '🍊': 4,
  '🍇': 5,
  '🔔': 10,
  '⭐': 20,
  '💎': 50,
  '7️⃣': 100,
};

export default function SlotGame({ onBack, balance, onBalanceChange }: SlotGameProps) {
  const [betAmount, setBetAmount] = useState<string>('10000');
  const [reels, setReels] = useState<string[]>(['🍒', '🍒', '🍒']);
  const [isSpinning, setIsSpinning] = useState(false);
  const [gameResult, setGameResult] = useState<string>('');
  const [spinCount, setSpinCount] = useState(0);

  const getRandomSymbol = () => {
    return symbols[Math.floor(Math.random() * symbols.length)];
  };

  const spin = () => {
    const amount = parseInt(betAmount);
    if (amount > balance) {
      toast.error('잔액이 부족합니다');
      return;
    }
    if (amount < 1000) {
      toast.error('최소 배팅 금액은 1,000원입니다');
      return;
    }

    setIsSpinning(true);
    setGameResult('');
    onBalanceChange(balance - amount);

    let spinInterval: NodeJS.Timeout;
    let elapsed = 0;
    const spinDuration = 2000;

    spinInterval = setInterval(() => {
      setReels([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
      elapsed += 100;

      if (elapsed >= spinDuration) {
        clearInterval(spinInterval);

        const finalReels = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
        setReels(finalReels);

        setTimeout(() => {
          checkWin(finalReels, amount);
          setIsSpinning(false);
          setSpinCount(prev => prev + 1);
        }, 300);
      }
    }, 100);
  };

  const checkWin = (finalReels: string[], amount: number) => {
    const [first, second, third] = finalReels;

    if (first === second && second === third) {
      const multiplier = symbolValues[first];
      const winAmount = amount * multiplier;
      onBalanceChange(balance - amount + winAmount);
      setGameResult(`🎉 3개 일치! ${first} × ${multiplier} = +${winAmount.toLocaleString()}원`);
      toast.success(`대박! ${winAmount.toLocaleString()}원 획득!`);
    } else if (first === second || second === third || first === third) {
      const matchedSymbol = first === second ? first : (second === third ? second : first);
      const multiplier = Math.floor(symbolValues[matchedSymbol] / 2);
      const winAmount = amount * multiplier;
      onBalanceChange(balance - amount + winAmount);
      setGameResult(`2개 일치! ${matchedSymbol} × ${multiplier} = +${winAmount.toLocaleString()}원`);
      toast.success(`${winAmount.toLocaleString()}원 획득!`);
    } else {
      setGameResult('아쉽게도 꽝! 다시 도전하세요');
      toast.error('다음 기회에!');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-slate-900 to-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Button variant="ghost" onClick={onBack} className="text-white">
            <ArrowLeft className="w-4 h-4 mr-2" />
            로비로 돌아가기
          </Button>
          <Card className="bg-slate-800 border-slate-700 p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-xs text-slate-400">보유 금액</p>
                <p className="text-xl font-bold text-white">{balance.toLocaleString()}원</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-8 h-8 text-yellow-500" />
            <h1 className="text-4xl font-bold text-white">슬롯 머신</h1>
            <Sparkles className="w-8 h-8 text-yellow-500" />
          </div>
          <p className="text-slate-400">행운을 시험해보세요!</p>
        </div>

        <Card className="bg-gradient-to-br from-yellow-800/40 to-slate-800 border-yellow-500/50 p-12 mb-8">
          <div className="bg-slate-900/80 rounded-2xl p-8 mb-8">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {reels.map((symbol, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded-xl h-40 flex items-center justify-center text-7xl shadow-2xl transition-transform ${
                    isSpinning ? 'animate-bounce' : ''
                  }`}
                >
                  {symbol}
                </div>
              ))}
            </div>

            {gameResult && (
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">{gameResult}</p>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="text-slate-300 mb-2 block">배팅 금액</label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white text-lg"
              disabled={isSpinning}
            />
            <div className="flex gap-2 mt-2">
              {[10000, 50000, 100000, 500000, 1000000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setBetAmount(amount.toString())}
                  disabled={isSpinning}
                  className="text-slate-300"
                >
                  {amount >= 1000000 ? `${amount / 1000000}백만` : `${amount / 10000}만`}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={spin}
            disabled={isSpinning}
            className="w-full h-20 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-2xl font-bold shadow-lg"
          >
            {isSpinning ? '회전 중...' : '🎰 SPIN 🎰'}
          </Button>

          <div className="mt-4 text-center text-slate-400">
            <p className="text-sm">총 {spinCount}회 스핀</p>
          </div>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <h3 className="text-lg font-bold text-white mb-4">배당표</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(symbolValues).map(([symbol, multiplier]) => (
              <div key={symbol} className="flex items-center justify-between bg-slate-900/50 p-3 rounded">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{symbol}</span>
                  <span className="text-slate-300">× 3</span>
                </div>
                <span className="text-yellow-400 font-bold">{multiplier}배</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4 text-center">
            * 2개 일치 시 배당의 절반 지급
          </p>
        </Card>
      </div>
    </div>
  );
}
