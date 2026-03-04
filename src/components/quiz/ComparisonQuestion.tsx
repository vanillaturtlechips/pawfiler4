import { motion, AnimatePresence } from "framer-motion";
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
}: Props) {
  const renderImage = (side: "left" | "right", imageUrl: string) => {
    const isSelected = selectedSide === side;
    const isCorrectAnswer = showResult && side === question.correctSide;
    const isWrong = showResult && isSelected && !isCorrect;

    return (
      <motion.div
        className="flex-1 relative cursor-pointer transition-all rounded-2xl overflow-hidden"
        whileHover={!showResult ? { scale: 1.02 } : {}}
        whileTap={!showResult ? { scale: 0.98 } : {}}
        onClick={() => !showResult && onSelect(side)}
      >
        <img 
          src={imageUrl} 
          alt={`Option ${side}`} 
          className="w-full h-full object-contain"
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
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      {/* 이미지 비교 영역 */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden" style={{ maxHeight: 'calc(100vh - 450px)' }}>
        {renderImage("left", question.mediaUrl)}
        {renderImage("right", question.comparisonMediaUrl)}
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
