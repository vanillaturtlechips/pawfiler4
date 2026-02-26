import { motion } from "framer-motion";
import type { MultipleChoiceQuestion } from "@/lib/types";

interface Props {
  question: MultipleChoiceQuestion;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  showResult: boolean;
  isCorrect?: boolean;
}

export default function MultipleChoiceQuestion({
  question,
  selectedIndex,
  onSelect,
  showResult,
  isCorrect,
}: Props) {
  return (
    <div className="flex flex-col gap-3 flex-1">
      {question.options.map((opt, i) => {
        const isSelected = selectedIndex === i;
        const isCorrectAnswer = showResult && i === question.correctIndex;
        const isWrong = showResult && isSelected && !isCorrect;

        return (
          <motion.button
            key={i}
            className={`font-jua rounded-2xl p-4 text-xl cursor-pointer border-4 transition-colors flex-shrink-0 ${
              isCorrectAnswer
                ? "bg-primary text-primary-foreground border-primary"
                : isWrong
                ? "bg-destructive text-destructive-foreground border-destructive"
                : isSelected
                ? "bg-wood-base text-foreground border-foreground"
                : "bg-wood-dark text-foreground border-wood-darkest"
            }`}
            whileHover={!showResult ? { scale: 1.01 } : {}}
            whileTap={!showResult ? { scale: 0.99 } : {}}
            onClick={() => !showResult && onSelect(i)}
            disabled={showResult}
          >
            {opt}
          </motion.button>
        );
      })}
    </div>
  );
}
