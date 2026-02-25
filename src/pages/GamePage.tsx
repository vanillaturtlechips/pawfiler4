import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import WoodPanel from "@/components/WoodPanel";
import GameButton from "@/components/GameButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchQuizQuestion, submitQuizAnswer } from "@/lib/api";
import type { QuizQuestion, QuizSubmitResponse, LegacyQuizQuestion } from "@/lib/types";
import MultipleChoiceQuestion from "@/components/quiz/MultipleChoiceQuestion";
import TrueFalseQuestion from "@/components/quiz/TrueFalseQuestion";
import RegionSelectQuestion from "@/components/quiz/RegionSelectQuestion";
import ComparisonQuestion from "@/components/quiz/ComparisonQuestion";

const GamePage = () => {
  const { token } = useAuth();
  const [question, setQuestion] = useState<QuizQuestion | LegacyQuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Multiple Choice & Legacy
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  // True/False
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  
  // Region Select
  const [selectedRegion, setSelectedRegion] = useState<{ x: number; y: number } | null>(null);
  
  // Comparison
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  
  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(1240);
  const [lives, setLives] = useState(2);
  const [videoOrientation, setVideoOrientation] = useState<"landscape" | "portrait">("landscape");

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setSelectedIndex(null);
    setSelectedAnswer(null);
    setSelectedRegion(null);
    setSelectedSide(null);
    setResult(null);
    try {
      const q = await fetchQuizQuestion();
      setQuestion(q);
      setVideoOrientation("landscape");
    } catch (error) {
      console.error("Failed to load question:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (!question) return;
    
    // Check if answer is selected based on question type
    const hasAnswer = 
      ('type' in question && question.type === 'multiple_choice' && selectedIndex !== null) ||
      ('type' in question && question.type === 'true_false' && selectedAnswer !== null) ||
      ('type' in question && question.type === 'region_select' && selectedRegion !== null) ||
      ('type' in question && question.type === 'comparison' && selectedSide !== null) ||
      (!('type' in question) && selectedIndex !== null); // Legacy support
    
    if (!hasAnswer) return;
    
    setSubmitting(true);
    try {
      const res = await submitQuizAnswer({
        questionId: question.id,
        selectedIndex,
        selectedAnswer: selectedAnswer ?? undefined,
        selectedRegion: selectedRegion ?? undefined,
        selectedSide: selectedSide ?? undefined,
      });
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

  const canSubmit = () => {
    if (!question) return false;
    if ('type' in question) {
      switch (question.type) {
        case 'multiple_choice':
          return selectedIndex !== null;
        case 'true_false':
          return selectedAnswer !== null;
        case 'region_select':
          return selectedRegion !== null;
        case 'comparison':
          return selectedSide !== null;
        default:
          return false;
      }
    }
    // Legacy support
    return selectedIndex !== null;
  };

  const handleVideoLoad = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const aspectRatio = video.videoWidth / video.videoHeight;
    setVideoOrientation(aspectRatio > 1 ? "landscape" : "portrait");
  };

  return (
    <motion.div
      className={`grid h-full gap-7 p-5 ${
        // Region Select와 Comparison은 전체 화면 사용
        question && 'type' in question && (question.type === 'region_select' || question.type === 'comparison')
          ? "grid-cols-1"
          : videoOrientation === "portrait" 
          ? "grid-cols-1 grid-rows-[1fr_auto]" 
          : "grid-cols-[1fr_2fr]"
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Left: Video Section - Region Select와 Comparison일 때는 숨김 */}
      {!(question && 'type' in question && (question.type === 'region_select' || question.type === 'comparison')) && (
        <WoodPanel className="flex flex-col">
          {loading ? (
            <Skeleton className="flex-1 rounded-2xl bg-wood-dark" />
          ) : question ? (
            <>
              {/* Category and Difficulty Header */}
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="font-jua text-sm opacity-70">
                  📂 딥페이크 탐지
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
              
              <div
                className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden"
                style={{ background: "#000", border: "6px solid hsl(var(--wood-darkest))" }}
              >
                {question && 'type' in question && question.mediaUrl ? (
                  question.mediaType === 'video' ? (
                    <video
                      src={question.mediaUrl}
                      className="max-w-full max-h-full object-contain"
                      controls
                      autoPlay
                      loop
                      muted
                      onLoadedMetadata={handleVideoLoad}
                    />
                  ) : (
                    <img
                      src={question.mediaUrl}
                      alt="Quiz"
                      className="max-w-full max-h-full object-contain"
                    />
                  )
                ) : question && 'videoUrl' in question && question.videoUrl ? (
                  // Legacy support
                  <video
                    src={question.videoUrl}
                    className="max-w-full max-h-full object-contain"
                    controls
                    autoPlay
                    loop
                    muted
                    onLoadedMetadata={handleVideoLoad}
                  />
                ) : (
                  <motion.span
                    className="text-9xl"
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    {question?.thumbnailEmoji}
                  </motion.span>
                )}
              </div>
            </>
          ) : null}
        </WoodPanel>
      )}

      {/* Right: Quiz Section */}
      <WoodPanel className="flex flex-col relative z-30">
        {/* Header - 모든 유형 통일 */}
        <div className="flex items-center justify-between mb-5 relative z-40">
          <h2 className="font-jua text-3xl text-shadow-deep">
            {question && 'type' in question && question.type === 'region_select' 
              ? "🔍 의심 부분 찾기"
              : "🎬 가짜를 찾아라!"}
          </h2>
          <div className="flex items-center gap-4">
            <div className="font-jua text-lg text-shadow-deep">📊 정답률 78%</div>
            <div className="font-jua text-lg text-shadow-deep">📈 3/10</div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col gap-4 p-5">
            <Skeleton className="h-16 w-full rounded-xl bg-wood-dark" />
            <Skeleton className="h-16 w-full rounded-xl bg-wood-dark" />
            <Skeleton className="h-16 w-full rounded-xl bg-wood-dark" />
            <Skeleton className="h-16 w-full rounded-xl bg-wood-dark" />
          </div>
        ) : question ? (
          <div className="flex flex-1 flex-col gap-4 min-h-0">
            {/* Render appropriate question type */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {(() => {
                if ('type' in question) {
                  switch (question.type) {
                    case 'multiple_choice':
                      return (
                        <MultipleChoiceQuestion
                          question={question}
                          selectedIndex={selectedIndex}
                          onSelect={setSelectedIndex}
                          showResult={result !== null}
                          isCorrect={result?.correct}
                        />
                      );
                    case 'true_false':
                      return (
                        <TrueFalseQuestion
                          question={question}
                          selectedAnswer={selectedAnswer}
                          onSelect={setSelectedAnswer}
                          showResult={result !== null}
                          isCorrect={result?.correct}
                        />
                      );
                    case 'region_select':
                      return (
                        <RegionSelectQuestion
                          question={question}
                          selectedRegion={selectedRegion}
                          onSelect={setSelectedRegion}
                          showResult={result !== null}
                          isCorrect={result?.correct}
                          onSubmit={result ? undefined : handleSubmit}
                          canSubmit={selectedRegion !== null}
                          submitting={submitting}
                          onNext={loadQuestion}
                          resultExplanation={result?.explanation}
                          coinsEarned={result?.coinsEarned}
                        />
                      );
                    case 'comparison':
                      return (
                        <ComparisonQuestion
                          question={question}
                          selectedSide={selectedSide}
                          onSelect={setSelectedSide}
                          showResult={result !== null}
                          isCorrect={result?.correct}
                          onSubmit={result ? undefined : handleSubmit}
                          canSubmit={selectedSide !== null}
                          submitting={submitting}
                          onNext={loadQuestion}
                          resultExplanation={result?.explanation}
                          coinsEarned={result?.coinsEarned}
                        />
                      );
                    default:
                      return null;
                  }
                } else {
                  // Legacy support
                  return (
                    <div className="flex flex-col gap-3 flex-1">
                      {question.options.map((opt, i) => {
                        const isSelected = selectedIndex === i;
                        const showResult = result !== null;
                        const isCorrectAnswer = showResult && i === question.correctIndex;
                        const isWrong = showResult && isSelected && !result.correct;

                        return (
                          <motion.button
                            key={i}
                            className={`font-jua rounded-2xl p-5 text-xl cursor-pointer border-4 transition-colors ${
                              isCorrectAnswer
                                ? "bg-primary text-primary-foreground border-primary"
                                : isWrong
                                ? "bg-destructive text-destructive-foreground border-destructive"
                                : isSelected
                                ? "bg-wood-base text-foreground border-foreground"
                                : "bg-wood-dark text-foreground border-wood-darkest"
                            }`}
                            whileHover={!showResult ? { scale: 1.02 } : {}}
                            whileTap={!showResult ? { scale: 0.98 } : {}}
                            onClick={() => !showResult && setSelectedIndex(i)}
                            disabled={showResult}
                          >
                            {opt}
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                }
              })()}
            </div>

            {/* Submit / Result - 항상 하단에 고정 (RegionSelect, Comparison 제외) */}
            {!(question && 'type' in question && (question.type === 'region_select' || question.type === 'comparison')) && (
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3 flex-shrink-0"
                  >
                    {/* True/False 문제는 컴포넌트 안에 설명이 있으므로 버튼만 표시 */}
                    {question && 'type' in question && question.type === 'true_false' ? (
                      <GameButton variant="blue" onClick={loadQuestion}>
                        다음 문제 →
                      </GameButton>
                    ) : (
                      <>
                        <WoodPanel className="p-4 bg-wood-base">
                          <p className="font-jua text-2xl" style={{ color: result.correct ? "hsl(var(--magic-green))" : "hsl(var(--destructive))" }}>
                            {result.correct ? "🎉 정답! +" + result.coinsEarned + "닢" : "😢 아쉬워요..."}
                          </p>
                          <p className="text-base mt-2 text-foreground">{result.explanation}</p>
                        </WoodPanel>
                        <GameButton variant="blue" onClick={loadQuestion}>
                          다음 문제 →
                        </GameButton>
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="submit" className="flex-shrink-0">
                    <GameButton
                      variant="green"
                      onClick={handleSubmit}
                      className={!canSubmit() || submitting ? "opacity-50 pointer-events-none" : ""}
                    >
                      {submitting ? "⏳ 채점 중..." : "✅ 정답 확인!"}
                    </GameButton>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        ) : null}
      </WoodPanel>
    </motion.div>
  );
};

export default GamePage;
