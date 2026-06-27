import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface BaccaratGameProps {
  onBack: () => void;
  balance: number;
  onBalanceChange: (newBalance: number) => void;
}

type BetType = 'player' | 'banker' | 'tie' | null;

export default function BaccaratGame({ onBack, balance, onBalanceChange }: BaccaratGameProps) {
  const [betAmount, setBetAmount] = useState<string>('10000');
  const [selectedBet, setSelectedBet] = useState<BetType>(null);
  const [playerCards, setPlayerCards] = useState<number[]>([]);
  const [bankerCards, setBankerCards] = useState<number[]>([]);
  const [gameResult, setGameResult] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);

  const getCardValue = (card: number) => {
    return card % 10;
  };

  const calculateScore = (cards: number[]) => {
    return cards.reduce((sum, card) => sum + getCardValue(card), 0) % 10;
  };

  const placeBet = (type: BetType) => {
    const amount = parseInt(betAmount);
    if (amount > balance) {
      toast.error('잔액이 부족합니다');
      return;
    }
    if (amount < 1000) {
      toast.error('최소 배팅 금액은 1,000원입니다');
      return;
    }
    setSelectedBet(type);
  };

  const startGame = () => {
    if (!selectedBet) {
      toast.error('배팅을 선택해주세요');
      return;
    }

    const amount = parseInt(betAmount);
    onBalanceChange(balance - amount);
    setIsPlaying(true);
    setGameResult('');

    const newPlayerCards = [
      Math.floor(Math.random() * 13) + 1,
      Math.floor(Math.random() * 13) + 1,
    ];
    const newBankerCards = [
      Math.floor(Math.random() * 13) + 1,
      Math.floor(Math.random() * 13) + 1,
    ];

    setPlayerCards(newPlayerCards);
    setBankerCards(newBankerCards);

    setTimeout(() => {
      const playerScore = calculateScore(newPlayerCards);
      const bankerScore = calculateScore(newBankerCards);

      let result = '';
      let winAmount = 0;

      if (playerScore > bankerScore) {
        result = 'player';
        if (selectedBet === 'player') {
          winAmount = amount * 2;
          onBalanceChange(balance - amount + winAmount);
          setGameResult('플레이어 승리! +' + winAmount.toLocaleString() + '원');
          toast.success('승리하셨습니다!');
        } else {
          setGameResult('플레이어 승리! 배팅 실패');
          toast.error('아쉽게도 졌습니다');
        }
      } else if (bankerScore > playerScore) {
        result = 'banker';
        if (selectedBet === 'banker') {
          winAmount = amount * 1.95;
          onBalanceChange(balance - amount + winAmount);
          setGameResult('뱅커 승리! +' + Math.floor(winAmount).toLocaleString() + '원');
          toast.success('승리하셨습니다!');
        } else {
          setGameResult('뱅커 승리! 배팅 실패');
          toast.error('아쉽게도 졌습니다');
        }
      } else {
        result = 'tie';
        if (selectedBet === 'tie') {
          winAmount = amount * 9;
          onBalanceChange(balance - amount + winAmount);
          setGameResult('무승부! +' + winAmount.toLocaleString() + '원');
          toast.success('대박! 무승부 적중!');
        } else {
          onBalanceChange(balance);
          setGameResult('무승부! 배팅 금액 반환');
        }
      }

      setIsPlaying(false);
      setSelectedBet(null);
    }, 2000);
  };

  const renderCard = (card: number) => {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suit = suits[Math.floor(Math.random() * 4)];
    const value = values[card - 1];
    const isRed = suit === '♥' || suit === '♦';

    return (
      <div className={`w-20 h-28 bg-white rounded-lg flex flex-col items-center justify-center shadow-lg ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div className="text-2xl">{suit}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-black p-8">
      <div className="max-w-6xl mx-auto">
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

        <h1 className="text-4xl font-bold text-white text-center mb-12">바카라</h1>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <Card className="bg-blue-900/30 border-blue-500/50 p-8">
            <h3 className="text-2xl font-bold text-blue-300 text-center mb-6">플레이어</h3>
            <div className="flex gap-4 justify-center mb-6">
              {playerCards.map((card, idx) => (
                <div key={idx}>{renderCard(card)}</div>
              ))}
            </div>
            {playerCards.length > 0 && (
              <div className="text-center">
                <p className="text-white text-xl">점수: {calculateScore(playerCards)}</p>
              </div>
            )}
          </Card>

          <Card className="bg-red-900/30 border-red-500/50 p-8">
            <h3 className="text-2xl font-bold text-red-300 text-center mb-6">뱅커</h3>
            <div className="flex gap-4 justify-center mb-6">
              {bankerCards.map((card, idx) => (
                <div key={idx}>{renderCard(card)}</div>
              ))}
            </div>
            {bankerCards.length > 0 && (
              <div className="text-center">
                <p className="text-white text-xl">점수: {calculateScore(bankerCards)}</p>
              </div>
            )}
          </Card>
        </div>

        {gameResult && (
          <div className="text-center mb-8">
            <p className="text-3xl font-bold text-yellow-400">{gameResult}</p>
          </div>
        )}

        <Card className="bg-slate-800 border-slate-700 p-8">
          <h3 className="text-xl font-bold text-white mb-6">배팅하기</h3>

          <div className="mb-6">
            <label className="text-slate-300 mb-2 block">배팅 금액</label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white"
              disabled={isPlaying}
            />
            <div className="flex gap-2 mt-2">
              {[10000, 50000, 100000, 500000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setBetAmount(amount.toString())}
                  disabled={isPlaying}
                  className="text-slate-300"
                >
                  {(amount / 10000).toFixed(0)}만
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Button
              onClick={() => placeBet('player')}
              disabled={isPlaying}
              className={`h-20 ${selectedBet === 'player' ? 'bg-blue-600' : 'bg-blue-900/50'} hover:bg-blue-700`}
            >
              <div>
                <div className="font-bold">플레이어</div>
                <div className="text-sm">배당 2.0</div>
              </div>
            </Button>
            <Button
              onClick={() => placeBet('tie')}
              disabled={isPlaying}
              className={`h-20 ${selectedBet === 'tie' ? 'bg-green-600' : 'bg-green-900/50'} hover:bg-green-700`}
            >
              <div>
                <div className="font-bold">무승부</div>
                <div className="text-sm">배당 9.0</div>
              </div>
            </Button>
            <Button
              onClick={() => placeBet('banker')}
              disabled={isPlaying}
              className={`h-20 ${selectedBet === 'banker' ? 'bg-red-600' : 'bg-red-900/50'} hover:bg-red-700`}
            >
              <div>
                <div className="font-bold">뱅커</div>
                <div className="text-sm">배당 1.95</div>
              </div>
            </Button>
          </div>

          <Button
            onClick={startGame}
            disabled={!selectedBet || isPlaying}
            className="w-full h-14 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg font-bold"
          >
            {isPlaying ? '게임 진행 중...' : '게임 시작'}
          </Button>
        </Card>
      </div>
    </div>
  );
}
