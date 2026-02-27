import { motion } from "framer-motion";
import type { TrueFalseQuestion } from "@/lib/types";

interface Props {
  question: TrueFalseQuestion;
  selectedAnswer: boolean | null;
  onSelect: (answer: boolean) => void;
  showResult: boolean;
  isCorrect?: boolean;
}

export default function TrueFalseQuestion({
  question,
  selectedAnswer,
  onSelect,
  showResult,
  isCorrect,
}: Props) {
  // 결과 화면: 왼쪽에 캐릭터 하나만, 오른쪽에 설명
  if (showResult) {
    const resultImage = isCorrect ? "/ox-rabbit-correct.png" : "/ox-fox-wrong.png";
    
    return (
      <div className="flex gap-8 flex-1 items-center px-8" style={{ paddingTop: '15%' }}>
        {/* 왼쪽: 결과 캐릭터 */}
        <motion.div 
          className="flex-shrink-0 w-64"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.6 }}
        >
          <img 
            src={resultImage}
            alt={isCorrect ? "정답!" : "오답!"}
            className="w-full h-full object-contain drop-shadow-2xl"
          />
        </motion.div>

        {/* 오른쪽: 설명 */}
        <motion.div 
          className="flex-1 font-jua text-2xl p-6 rounded-2xl"
          style={{
            background: isCorrect 
              ? "rgba(34, 197, 94, 0.15)" 
              : "rgba(239, 68, 68, 0.15)",
            border: `3px solid ${isCorrect ? "#22c55e" : "#ef4444"}`,
            color: "hsl(var(--foreground))",
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="mb-3" style={{ color: isCorrect ? "#22c55e" : "#ef4444" }}>
            {isCorrect ? "🎉 정답이에요!" : "😢 아쉬워요..."}
          </div>
          <div className="text-lg leading-relaxed">
            {question.explanation}
          </div>
        </motion.div>
      </div>
    );
  }

  // 선택 화면: 두 캐릭터 나란히
  const renderButton = (answer: boolean, label: string, imageUrl: string) => {
    const isSelected = selectedAnswer === answer;

    return (
      <motion.button
        className="relative cursor-pointer flex-1 flex flex-col items-center gap-3 max-w-xs"
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(answer)}
      >
        {/* Character Image */}
        <div className="relative w-full aspect-square max-h-64">
          <motion.img 
            src={imageUrl}
            alt={label}
            className="w-full h-full object-contain drop-shadow-2xl"
            animate={{
              filter: isSelected 
                ? "brightness(1.2) drop-shadow(0 0 30px rgba(255,255,255,0.5))"
                : "brightness(1) drop-shadow(0 25px 25px rgba(0,0,0,0.5))"
            }}
          />

          {/* Selection Glow */}
          {isSelected && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
            />
          )}
        </div>

        {/* Label */}
        <motion.div 
          className="font-jua text-xl text-center px-5 py-2 rounded-full"
          style={{ 
            background: isSelected
              ? "rgba(255, 255, 255, 0.2)"
              : "rgba(139, 92, 46, 0.3)",
            color: "hsl(var(--foreground))",
            textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
            border: isSelected ? "2px solid currentColor" : "2px solid transparent",
          }}
          animate={{
            scale: isSelected ? [1, 1.05, 1] : 1,
          }}
          transition={{
            duration: 0.8,
            repeat: isSelected ? Infinity : 0,
          }}
        >
          {label}
        </motion.div>
      </motion.button>
    );
  };

  return (
    <div className="flex gap-8 flex-1 items-center justify-center px-8" style={{ paddingTop: '15%' }}>
      {renderButton(true, "진짜 (Real)", "/ox-rabbit.png")}
      {renderButton(false, "가짜 (Fake)", "/ox-fox.png")}
    </div>
  );
}
