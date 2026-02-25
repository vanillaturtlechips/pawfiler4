import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchQuizQuestion, submitQuizAnswer } from "@/lib/mockApi";
import type { QuizQuestion, QuizSubmitResponse } from "@/lib/types";

const GamePage = () => {
  const { token } = useAuth();
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(1240);
  const [lives, setLives] = useState(2);

  const loadQuestion = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setSelectedIndex(null);
    setResult(null);
    try {
      const q = await fetchQuizQuestion(token);
      setQuestion(q);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (selectedIndex === null || !question || !token) return;
    setSubmitting(true);
    try {
      const res = await submitQuizAnswer(token, { questionId: question.id, selectedIndex });
      setResult(res);
      if (res.correct) {
        setScore((s) => s + res.coinsEarned);
      } else {
        setLives((l) => Math.max(0, l - 1));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="grid h-full grid-cols-[2fr_1fr] gap-7 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <WoodPanel className="flex flex-col">
        <h2 className="font-jua text-3xl mb-5 text-shadow-deep">🎬 가짜를 찾아라!</h2>

        {loading ? (
          <div className="flex flex-1 flex-col gap-4 p-5">
            <Skeleton className="h-40 w-full rounded-2xl bg-wood-dark" />
            <Skeleton className="h-10 w-3/4 rounded-xl bg-wood-dark" />
            <Skeleton className="h-10 w-2/3 rounded-xl bg-wood-dark" />
          </div>
        ) : question ? (
          <div className="flex flex-1 flex-col gap-4">
            {/* Video area */}
            <div
              className="flex items-center justify-center rounded-2xl flex-1"
              style={{ background: "#000", border: "6px solid hsl(var(--wood-darkest))" }}
            >
              <motion.span
                className="text-6xl"
                animate={{ y: [-5, 5, -5] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {question.thumbnailEmoji}
              </motion.span>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              {question.options.map((opt, i) => {
                const isSelected = selectedIndex === i;
                const showResult = result !== null;
                const isCorrect = showResult && i === question.correctIndex;
                const isWrong = showResult && isSelected && !result.correct;

                return (
                  <motion.button
                    key={i}
                    className={`font-jua rounded-2xl p-4 text-lg cursor-pointer border-4 transition-colors ${
                      isCorrect
                        ? "bg-primary text-primary-foreground border-primary"
                        : isWrong
                        ? "bg-destructive text-destructive-foreground border-destructive"
                        : isSelected
                        ? "bg-wood-base text-foreground border-foreground"
                        : "bg-wood-dark text-foreground border-wood-darkest"
                    }`}
                    whileHover={!showResult ? { scale: 1.03 } : {}}
                    whileTap={!showResult ? { scale: 0.97 } : {}}
                    onClick={() => !showResult && setSelectedIndex(i)}
                    disabled={showResult}
                  >
                    {opt}
                  </motion.button>
                );
              })}
            </div>

            {/* Submit / Result */}
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3"
                >
                  <ParchmentPanel className="p-4">
                    <p className="font-jua text-xl" style={{ color: result.correct ? "hsl(var(--magic-green))" : "hsl(var(--destructive))" }}>
                      {result.correct ? "🎉 정답! +" + result.coinsEarned + "닢" : "😢 아쉬워요..."}
                    </p>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--parchment-text))" }}>{result.explanation}</p>
                  </ParchmentPanel>
                  <GameButton variant="blue" onClick={loadQuestion}>
                    다음 문제 →
                  </GameButton>
                </motion.div>
              ) : (
                <motion.div key="submit">
                  <GameButton
                    variant="green"
                    onClick={handleSubmit}
                    className={selectedIndex === null || submitting ? "opacity-50 pointer-events-none" : ""}
                  >
                    {submitting ? "⏳ 채점 중..." : "✅ 정답 확인!"}
                  </GameButton>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </WoodPanel>

      <div className="flex flex-col gap-7">
        <ParchmentPanel>
          <h2 className="font-jua text-3xl mb-4" style={{ color: "hsl(var(--wood-darkest))", textShadow: "none" }}>
            📊 내 기록
          </h2>
          <div className="text-xl font-bold" style={{ color: "hsl(var(--wood-darkest))" }}>
            점수: {score.toLocaleString()} 점
          </div>
          <div className="text-4xl mt-2.5">
            {Array.from({ length: 3 }, (_, i) => (i < lives ? "❤️" : "🖤")).join(" ")}
          </div>
        </ParchmentPanel>

        <WoodPanel className="flex flex-1 flex-col">
          <h2 className="font-jua text-3xl mb-4 text-shadow-deep">💡 힌트 수첩</h2>
          <ul className="flex-1 list-disc pl-5 text-lg leading-relaxed">
            <li>눈 깜빡임이 어색한가요?</li>
            <li>얼굴빛과 조명이 일치하나요?</li>
          </ul>
          <GameButton variant="green">🔍 돋보기 쓰기</GameButton>
        </WoodPanel>
      </div>
    </motion.div>
  );
};

export default GamePage;
