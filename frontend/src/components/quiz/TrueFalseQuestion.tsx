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
  const renderButton = (answer: boolean, label: string, imageUrl: string, isFox = false) => {
    const isSelected = selectedAnswer === answer;

    return (
      <motion.button
        className="relative cursor-pointer flex flex-col items-center"
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(answer)}
      >
        {/* 말풍선 + 캐릭터를 하나의 그룹으로 */}
        <div className="flex flex-col items-center">
          {/* Speech Bubble - SVG as single shape */}
          <motion.div 
            className="relative w-[clamp(150px,15vw,200px)] mb-1"
            animate={{
              scale: isSelected ? [1, 1.1, 1] : 1,
              y: isSelected ? [0, -5, 0] : 0,
            }}
            transition={{
              duration: 0.8,
              repeat: isSelected ? Infinity : 0,
            }}
          >
            <svg 
              width="100%" 
              height="75" 
              viewBox="0 0 200 80" 
              className="drop-shadow-lg"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Speech bubble shape with tail */}
              <path
                d="M 20 10 
                   Q 10 10, 10 20 
                   L 10 50 
                   Q 10 60, 20 60 
                   L 85 60 
                   L 100 75 
                   L 105 60 
                   L 180 60 
                   Q 190 60, 190 50 
                   L 190 20 
                   Q 190 10, 180 10 
                   Z"
                fill="white"
                stroke="#4a3728"
                strokeWidth={isSelected ? "4" : "3"}
              />
              {/* Golden glow when selected */}
              {isSelected && (
                <path
                  d="M 20 10 
                     Q 10 10, 10 20 
                     L 10 50 
                     Q 10 60, 20 60 
                     L 85 60 
                     L 100 75 
                     L 105 60 
                     L 180 60 
                     Q 190 60, 190 50 
                     L 190 20 
                     Q 190 10, 180 10 
                     Z"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="6"
                  opacity="0.6"
                />
              )}
            </svg>
            
            {/* Text overlay */}
            <div 
              className="absolute inset-0 flex items-center justify-center font-jua text-base sm:text-lg"
              style={{ 
                color: "#4a3728",
                fontWeight: "bold",
                paddingBottom: "12px",
              }}
            >
              {label}
            </div>
          </motion.div>

          {/* Character Image - 고정 높이 컨테이너 */}
          <div 
            className="relative flex items-end justify-center"
            style={{
              width: isFox ? 'clamp(190px, 19vw, 253px)' : 'clamp(165px, 16.5vw, 220px)',
              height: 'clamp(165px, 16.5vw, 220px)',
            }}
          >
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
        </div>
      </motion.button>
    );
  };

  return (
    <div className="flex gap-8 sm:gap-12 md:gap-16 flex-1 items-end justify-center px-4 sm:px-6 md:px-8" style={{ paddingTop: '10%' }}>
      {renderButton(true, "이건 진짜야!!", "/ox-rabbit.png", false)}
      {renderButton(false, "이건 가짜거든!!", "/ox-fox.png", true)}
    </div>
  );
}
