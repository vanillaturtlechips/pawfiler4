import { motion } from "framer-motion";
import type { ComparisonQuestion } from "@/lib/types";

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
        className="flex-1 relative cursor-pointer transition-all"
        whileHover={!showResult ? { scale: 1.02 } : {}}
        whileTap={!showResult ? { scale: 0.98 } : {}}
        onClick={() => !showResult && onSelect(side)}
      >
        <img 
          src={imageUrl} 
          alt={`Option ${side}`} 
          className="w-full h-full object-cover rounded-2xl"
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
              : "none"
          }}
        />

        {/* Result Overlay - 정답 확인 후에만 */}
        {showResult && isSelected && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl"
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
            className="absolute inset-0 flex items-center justify-center text-8xl pointer-events-none rounded-2xl"
            style={{ background: "rgba(34, 197, 94, 0.2)" }}
          >
            ✓
          </div>
        )}

        {/* Label */}
        <div 
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 font-jua text-2xl px-6 py-2 rounded-full"
          style={{
            background: "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            border: "2px solid rgba(255, 255, 255, 0.3)"
          }}
        >
          {side === "left" ? "A" : "B"}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="absolute inset-0 flex flex-col pt-20">
      {/* 안내 텍스트 - 정답 확인 전에만 표시 */}
      {!showResult && (
        <div className="relative z-10 text-center font-jua text-xl py-4 px-6">
          <span className="text-white font-bold" style={{
            textShadow: "2px 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.8)"
          }}>
            🔍 어느 쪽이 진짜 영상인가요?
          </span>
        </div>
      )}

      {/* 이미지 비교 영역 */}
      <div className="relative z-10 flex-1 flex gap-5 px-6">
        {renderImage("left", question.mediaUrl)}
        {renderImage("right", question.comparisonMediaUrl)}
      </div>

      {/* 버튼 영역 */}
      <div className="relative z-20 p-6">
        {showResult ? (
          <motion.div 
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* 결과 패널 */}
            <div className="p-4 rounded-2xl" style={{
              background: isCorrect ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)",
              border: `3px solid ${isCorrect ? "#22c55e" : "#ef4444"}`,
              backdropFilter: "blur(10px)"
            }}>
              <p className="font-jua text-2xl" style={{ color: isCorrect ? "#22c55e" : "#ef4444" }}>
                {isCorrect ? `🎉 정답! +${coinsEarned}닢` : "😢 아쉬워요..."}
              </p>
              <p className="text-base mt-2 text-white font-semibold" style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
                {resultExplanation}
              </p>
            </div>
            {/* 다음 문제 버튼 */}
            <button
              onClick={onNext}
              className="w-full font-jua text-2xl py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-lg"
            >
              다음 문제 →
            </button>
          </motion.div>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full font-jua text-2xl py-4 px-6 rounded-2xl transition-all shadow-lg ${
              canSubmit && !submitting
                ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                : "bg-gray-600 text-gray-400 cursor-not-allowed opacity-50"
            }`}
          >
            {submitting ? "⏳ 채점 중..." : "✅ 정답 확인!"}
          </button>
        )}
      </div>
    </div>
  );
}
