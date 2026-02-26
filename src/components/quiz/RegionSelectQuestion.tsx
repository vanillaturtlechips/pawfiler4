import { useState, useRef } from "react";
import { motion } from "framer-motion";
import type { RegionSelectQuestion } from "@/lib/types";

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
    <div className="absolute inset-0 flex flex-col pt-20">
      {/* 배경 이미지 - 항상 전체 화면 */}
      <div className="absolute inset-0">
        <img
          src={question.mediaUrl}
          alt="Quiz"
          className="w-full h-full object-cover"
          onLoad={() => setImageLoaded(true)}
        />
      </div>

      {/* 안내 텍스트 - 정답 확인 전에만 표시 */}
      {!showResult && (
        <div className="relative z-10 text-center font-jua text-xl py-4 px-6" style={{
          background: "transparent"
        }}>
          <span className="text-white font-bold" style={{
            textShadow: "2px 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.8)"
          }}>
            🔍 딥페이크가 의심되는 부분을 클릭하세요
          </span>
        </div>
      )}

      {/* 클릭 가능한 영역 */}
      <div
        ref={imageRef}
        className="relative z-10 flex-1 cursor-crosshair"
        onClick={handleClick}
      >
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
              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
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

      {/* 버튼 영역 - 황토색 배경 제거 */}
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
