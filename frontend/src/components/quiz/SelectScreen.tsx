import { motion } from "framer-motion";
import WoodPanel from "@/components/WoodPanel";
import GameButton from "@/components/GameButton";
import type { QuizGameProfile } from "@/lib/types";

interface SelectScreenProps {
  profile: QuizGameProfile | null;
  onStart: (difficulty: string, questionCount: number) => void;
  selectedDifficulty: string;
  selectedCount: number;
  onDifficultyChange: (d: string) => void;
  onCountChange: (c: number) => void;
  onEnergyRefill?: () => void;
}

const DIFFICULTY_OPTIONS = [
  { value: "all", label: "🎲 랜덤", desc: "모든 난이도 혼합", detail: "4가지 유형 무작위 출제", color: "#a78bfa" },
  { value: "easy", label: "🟢 쉬움", desc: "Lv.1 입문자용", detail: "비교적 명확한 딥페이크 영상·이미지", color: "#22c55e" },
  { value: "medium", label: "🟡 보통", desc: "Lv.2 일반", detail: "육안으로 구분하기 애매한 수준", color: "#eab308" },
  { value: "hard", label: "🔴 어려움", desc: "Lv.3 고급", detail: "최신 기술로 정교하게 합성된 미디어", color: "#ef4444" },
];

const COUNT_OPTIONS = [
  { value: 5, label: "5문제", energy: 25, bonus: null },
  { value: 10, label: "10문제", energy: 40, bonus: "완주 보너스 +50XP +100코인" },
];

const SelectScreen = ({
  profile,
  onStart,
  selectedDifficulty,
  selectedCount,
  onDifficultyChange,
  onCountChange,
  onEnergyRefill,
}: SelectScreenProps) => {
  const energy = profile?.energy ?? 100;
  const maxEnergy = profile?.maxEnergy ?? 100;
  const energyCost = selectedCount === 5 ? 25 : 40; // 5문제=25, 10문제=40
  const canStart = energy >= energyCost;

  const handleEmojiClick = () => {
    if (onEnergyRefill) {
      onEnergyRefill();
    }
  };
  const sessionAccuracy = null; // 세션 시작 전이므로 없음

  return (
    <div className="h-[calc(100vh-5rem)] w-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        <WoodPanel className="flex flex-col items-center gap-6 p-8">
          {/* 헤더 */}
          <div className="flex flex-col items-center gap-2">
            <motion.span
              className="text-7xl cursor-pointer"
              animate={{ y: [-4, 4, -4] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              onClick={handleEmojiClick}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="클릭하면 에너지 풀충!"
            >
              🦊
            </motion.span>
            <h2 className="font-jua text-4xl text-shadow-deep text-center">퀴즈 시작하기</h2>
            <p className="font-jua text-base opacity-70 text-center">딥페이크 탐지 능력을 키워보세요!</p>
          </div>

          {/* 에너지 바 */}
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="font-jua text-base">⚡ 에너지</span>
              <span className="font-jua text-base">
                <span style={{ color: canStart ? "#facc15" : "#ef4444" }}>{energy}</span>
                <span className="opacity-60"> / {maxEnergy}</span>
              </span>
            </div>
            <div className="w-full bg-wood-dark rounded-full h-4 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: energy > 30 ? "linear-gradient(90deg,#facc15,#f59e0b)" : "linear-gradient(90deg,#ef4444,#dc2626)",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (energy / maxEnergy) * 100)}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p className="font-jua text-xs opacity-50 mt-1 text-right">3시간마다 에너지 +10 자동 충전</p>
          </div>

          {/* 난이도 선택 */}
          <div className="w-full">
            <p className="font-jua text-lg mb-3">🎯 난이도 선택</p>
            <div className="grid grid-cols-2 gap-3">
              {DIFFICULTY_OPTIONS.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => onDifficultyChange(opt.value)}
                  className="font-jua rounded-xl px-4 py-3 text-left cursor-pointer transition-all"
                  style={{
                    background: selectedDifficulty === opt.value
                      ? `linear-gradient(135deg, ${opt.color}33, ${opt.color}22)`
                      : "hsl(var(--wood-dark))",
                    border: selectedDifficulty === opt.value
                      ? `2px solid ${opt.color}`
                      : "2px solid transparent",
                    boxShadow: selectedDifficulty === opt.value
                      ? `0 0 12px ${opt.color}44`
                      : "none",
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="text-base">{opt.label}</div>
                  <div className="text-xs opacity-60">{opt.desc}</div>
                  {selectedDifficulty === opt.value && (
                    <div className="text-xs mt-1 opacity-80">{opt.detail}</div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          {/* 문제 수 선택 */}
          <div className="w-full">
            <p className="font-jua text-lg mb-3">📋 문제 수 선택</p>
            <div className="flex gap-3">
              {COUNT_OPTIONS.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => onCountChange(opt.value)}
                  className="flex-1 font-jua rounded-xl py-3 cursor-pointer transition-all"
                  style={{
                    background: selectedCount === opt.value
                      ? "linear-gradient(135deg, hsl(var(--wood-base)), hsl(var(--wood-light)))"
                      : "hsl(var(--wood-dark))",
                    border: selectedCount === opt.value
                      ? "2px solid hsl(var(--wood-darkest))"
                      : "2px solid transparent",
                    boxShadow: selectedCount === opt.value
                      ? "0 4px 0 hsl(var(--wood-darkest))"
                      : "none",
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="text-xl">{opt.label}</div>
                  <div className="text-xs opacity-60 mt-1">⚡ {opt.energy} 소모</div>
                  {opt.bonus && <div className="text-xs opacity-70 mt-1">🎁 {opt.bonus}</div>}
                </motion.button>
              ))}
            </div>
          </div>

          {/* 시작 버튼 */}
          {canStart ? (
            <GameButton
              variant="green"
              className="w-full text-xl"
              onClick={() => onStart(selectedDifficulty, selectedCount)}
            >
              🚀 게임 시작!
            </GameButton>
          ) : (
            <div className="w-full">
              <div
                className="w-full font-jua text-xl text-center rounded-xl py-4 opacity-60"
                style={{
                  background: "hsl(var(--wood-dark))",
                  border: "2px solid #ef4444",
                  color: "#ef4444",
                }}
              >
                😴 에너지 부족 (필요: {energyCost}, 보유: {energy})
              </div>
              <p className="font-jua text-sm text-center opacity-50 mt-2">3시간마다 에너지가 자동으로 충전돼요</p>
            </div>
          )}
        </WoodPanel>
      </motion.div>
    </div>
  );
};

export default SelectScreen;
