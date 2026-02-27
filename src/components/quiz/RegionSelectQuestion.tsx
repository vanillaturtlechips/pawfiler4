import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RegionSelectQuestion } from "@/lib/types";
import GameButton from "@/components/GameButton";

interface Props {
  question: RegionSelectQuestion;
  selectedRegion: { x: number; y: number } | null;
  onSelect: (point: { x: number; y: number }) => void;
  showResult: boolean;
  isCorrect?: boolean;
  onSubmit?: () => void;
  canSubmit?: boolean;
  submitting?: boolean;
  onNext?: () => void;
  resultExplanation?: string;
  coinsEarned?: number;
}

export default function RegionSelectQuestion({
  question,
  selectedRegion,
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
  const imageRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showResult || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    onSelect({ x, y });
  };

  return (
<<<<<<< HEAD
<<<<<<< Updated upstream
    <div className="absolute inset-0 flex flex-col pt-20">
      {/* 배경 이미지 - 항상 전체 화면 */}
      <div className="absolute inset-0">
=======
    <div className="flex flex-col gap-3 flex-1 overflow-hidden">
      {/* 클릭 가능한 이미지 영역 */}
      <div
        ref={imageRef}
        className="relative flex-1 rounded-2xl overflow-hidden bg-black"
        onClick={handleClick}
        style={{ 
          minHeight: '300px',
          cursor: showResult ? 'default' : 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 24 24\'><circle cx=\'10\' cy=\'10\' r=\'7\' fill=\'none\' stroke=\'white\' stroke-width=\'2\'/><line x1=\'15\' y1=\'15\' x2=\'21\' y2=\'21\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\'/></svg>") 16 16, crosshair'
        }}
      >
>>>>>>> Stashed changes
=======
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* 클릭 가능한 이미지 영역 */}
      <div
        ref={imageRef}
        className="relative flex-1 cursor-crosshair rounded-2xl overflow-hidden bg-black"
        onClick={handleClick}
        style={{ minHeight: '400px' }}
      >
>>>>>>> origin/main
        <img
          src={question.mediaUrl}
          alt="Quiz"
          className="w-full h-full object-contain"
          onLoad={() => setImageLoaded(true)}
        />

        {/* Selected Point */}
        {selectedRegion && imageLoaded && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute w-16 h-16 rounded-full border-4 pointer-events-none"
            style={{
              left: selectedRegion.x - 32,
              top: selectedRegion.y - 32,
              borderColor: showResult
                ? isCorrect
                  ? "#22c55e"
                  : "#ef4444"
                : "#fff",
              background: showResult
                ? isCorrect
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(239, 68, 68, 0.3)"
                : "rgba(255, 255, 255, 0.3)",
              boxShadow: showResult
                ? isCorrect
                  ? "0 0 30px rgba(34, 197, 94, 0.8)"
                  : "0 0 30px rgba(239, 68, 68, 0.8)"
                : "0 0 30px rgba(255, 255, 255, 0.8)",
            }}
          >
            <div className="w-full h-full flex items-center justify-center text-3xl">
              {showResult ? (isCorrect ? "✓" : "✗") : "📍"}
            </div>
          </motion.div>
        )}

        {/* Correct Regions (show after answer) */}
        {showResult &&
          question.correctRegions.map((region, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="absolute rounded-full border-4 pointer-events-none"
              style={{
                left: region.x - region.radius,
                top: region.y - region.radius,
                width: region.radius * 2,
                height: region.radius * 2,
                borderColor: "#22c55e",
                background: "rgba(34, 197, 94, 0.2)",
                boxShadow: "0 0 30px rgba(34, 197, 94, 0.5)",
              }}
            />
          ))}
      </div>

<<<<<<< HEAD
<<<<<<< Updated upstream
      {/* 버튼 영역 - 황토색 배경 제거 */}
      <div className="relative z-20 p-6">
=======
      {/* 결과 표시 및 버튼 */}
      <AnimatePresence mode="wait">
>>>>>>> origin/main
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
<<<<<<< HEAD
=======
      {/* 결과 표시 및 버튼 - flex-shrink-0으로 고정 */}
      <div className="flex-shrink-0">
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
>>>>>>> Stashed changes
      </div>
=======
      </AnimatePresence>
>>>>>>> origin/main
    </div>
  );
}
