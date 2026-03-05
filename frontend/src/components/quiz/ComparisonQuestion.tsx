import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import type { ComparisonQuestion } from "@/lib/types";
import GameButton from "@/components/GameButton";

interface Props {
  question: ComparisonQuestion;
  selectedSide: "left" | "right" | null;
  onSelect: (side: "left" | "right") => void;
  showResult: boolean;
  isCorrect?: boolean;
  onSubmit?: () => void;
  canSubmit?: boolean;
  submitting?: boolean;
  onNext?: () => void;
  resultExplanation?: string;
  coinsEarned?: number;
  onSwapChange?: (isSwapped: boolean) => void;
}

export default function ComparisonQuestion({
  question,
  selectedSide,
  onSelect,
  showResult,
  isCorrect,
  onSubmit,
  canSubmit,
  submitting,
  onNext,
  resultExplanation,
  coinsEarned,
  onSwapChange,
}: Props) {
  // 이미지 순서를 랜덤하게 결정 (문제가 바뀔 때마다 새로 결정)
  const [isSwapped, setIsSwapped] = useState(false);
  
  useEffect(() => {
    // 50% 확률로 이미지 순서를 바꿈
    const swapped = Math.random() < 0.5;
    setIsSwapped(swapped);
    // 부모 컴포넌트에 알림
    if (onSwapChange) {
      onSwapChange(swapped);
    }
  }, [question?.id, onSwapChange]);
  
  // 실제 정답 위치 계산 (이미지가 스왑되었으면 반대로)
  const actualCorrectSide: "left" | "right" = isSwapped 
    ? (question?.correctSide === "left" ? "right" : "left")
    : (question?.correctSide || "left");
  const renderImage = (side: "left" | "right", imageUrl: string) => {
    const isSelected = selectedSide === side;
    const isCorrectAnswer = showResult && side === actualCorrectSide;
    const isWrong = showResult && isSelected && !isCorrect;

    return (
      <motion.div
        className="flex-1 relative cursor-pointer transition-all rounded-2xl overflow-hidden"
        style={{
          border: isCorrectAnswer 
            ? "6px solid #22c55e"
            : isWrong
            ? "6px solid #ef4444"
            : isSelected
            ? "6px solid #fff"
            : "4px solid rgba(255, 255, 255, 0.3)",
          boxShadow: isSelected && !showResult
            ? "0 0 30px rgba(255, 255, 255, 0.8)"
            : "none",
        }}
        whileHover={!showResult ? { scale: 1.02 } : {}}
        whileTap={!showResult ? { scale: 0.98 } : {}}
        onClick={() => !showResult && onSelect(side)}
      >
        <img 
          src={imageUrl} 
          alt={`Option ${side}`} 
          className="w-full h-full object-cover"
        />

        {/* Result Overlay */}
        {showResult && isSelected && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              background: isCorrect
                ? "rgba(34, 197, 94, 0.3)"
                : "rgba(239, 68, 68, 0.3)",
            }}
          >
            <div className="text-8xl">
              {isCorrect ? "✓" : "✗"}
            </div>
          </div>
        )}

        {/* Correct Answer Indicator */}
        {showResult && isCorrectAnswer && !isSelected && (
          <div
            className="absolute inset-0 flex items-center justify-center text-8xl pointer-events-none"
            style={{
              background: "rgba(34, 197, 94, 0.2)",
            }}
          >
            ✓
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      {/* Category and Difficulty Header */}
      <div className="flex items-center justify-between px-2 flex-shrink-0">
        <div className="font-jua text-sm opacity-70">
          📂 AI 이미지 탐지
        </div>
        <div className="font-jua text-sm px-3 py-1 rounded-full" style={{
          background: question.difficulty === "easy" ? "rgba(34, 197, 94, 0.2)" : 
                     question.difficulty === "medium" ? "rgba(234, 179, 8, 0.2)" : 
                     "rgba(239, 68, 68, 0.2)",
          color: question.difficulty === "easy" ? "#22c55e" : 
                 question.difficulty === "medium" ? "#eab308" : 
                 "#ef4444"
        }}>
          {question.difficulty === "easy" ? "🟢 Lv.1 쉬움" : 
           question.difficulty === "medium" ? "🟡 Lv.2 보통" : 
           "🔴 Lv.3 어려움"}
        </div>
      </div>
      
      {/* 이미지 비교 영역 */}
      <div className="flex gap-4 flex-shrink-0" style={{ minHeight: '400px' }}>
        {isSwapped ? (
          <>
            {renderImage("left", question.comparisonMediaUrl)}
            {renderImage("right", question.mediaUrl)}
          </>
        ) : (
          <>
            {renderImage("left", question.mediaUrl)}
            {renderImage("right", question.comparisonMediaUrl)}
          </>
        )}
      </div>

      {/* 결과 표시 및 버튼 */}
      <AnimatePresence mode="wait">
        {showResult ? (
          <motion.div 
            key="result"
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="p-4 rounded-2xl bg-wood-base border-4 border-wood-darkest">
              <p className="font-jua text-2xl" style={{ color: isCorrect ? "hsl(var(--magic-green))" : "hsl(var(--destructive))" }}>
                {isCorrect ? `🎉 정답! +${coinsEarned}닢` : "😢 아쉬워요..."}
              </p>
              <p className="text-base mt-2 text-foreground">{resultExplanation}</p>
            </div>
            <GameButton variant="blue" onClick={onNext}>
              다음 문제 →
            </GameButton>
          </motion.div>
        ) : (
          <motion.div key="submit">
            <GameButton
              variant="green"
              onClick={onSubmit}
              className={!canSubmit || submitting ? "opacity-50 pointer-events-none" : ""}
            >
              {submitting ? "⏳ 채점 중..." : "✅ 정답 확인!"}
            </GameButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
