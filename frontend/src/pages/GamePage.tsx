import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import WoodPanel from "@/components/WoodPanel";
import GameButton from "@/components/GameButton";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchQuizQuestion, submitQuizAnswer, fetchUserStats } from "@/lib/api";
import { config } from "@/lib/config";
import type { QuizQuestion, QuizSubmitResponse, QuizStats, QuizGameProfile } from "@/lib/types";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
import MultipleChoiceQuestion from "@/components/quiz/MultipleChoiceQuestion";
import TrueFalseQuestion from "@/components/quiz/TrueFalseQuestion";
import RegionSelectQuestion from "@/components/quiz/RegionSelectQuestion";
import ComparisonQuestion from "@/components/quiz/ComparisonQuestion";
import SelectScreen from "@/components/quiz/SelectScreen";

type GamePhase = "select" | "playing" | "finished";

const GamePage = () => {
  const navigate = useNavigate();
  const { quizProfile: ctxProfile, updateQuizProfile, setIsPlaying, pendingNav, setPendingNav } = useQuizProfile();

  // 게임 단계
  const [phase, setPhase] = useState<GamePhase>("select");

  // 선택 화면 옵션
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [selectedCount, setSelectedCount] = useState(10);

  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [maxQuestions, setMaxQuestions] = useState(config.quizQuestionsPerGame);
  const [gameFinished, setGameFinished] = useState(false);

  // 현재 세션 통계 (로컬)
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [sessionBestStreak, setSessionBestStreak] = useState(0);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<{ x: number; y: number } | null>(null);
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const [isComparisonSwapped, setIsComparisonSwapped] = useState(false);

  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<"landscape" | "portrait">("landscape");

  // 로컬 profile (context에서 초기화, 업데이트 시 context도 동기화)
  const [profile, setProfileLocal] = useState<QuizGameProfile | null>(ctxProfile);
  const setProfile = (p: QuizGameProfile | null) => {
    setProfileLocal(p);
    if (p) updateQuizProfile(p);
  };
  const [energyError, setEnergyError] = useState<number | null>(null);

  // 게임 완료 시 폭죽 효과
  useEffect(() => {
    if (gameFinished) {
      const interval = setInterval(() => {
        confetti({ particleCount: 2, angle: 60, spread: 50, origin: { x: 0.1, y: 0.6 }, colors: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6bff', '#6bffa3'] });
        confetti({ particleCount: 2, angle: 120, spread: 50, origin: { x: 0.9, y: 0.6 }, colors: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6bff', '#6bffa3'] });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [gameFinished]);

  // isPlaying 동기화
  useEffect(() => {
    setIsPlaying(phase === "playing");
    return () => setIsPlaying(false);
  }, [phase, setIsPlaying]);

  // 네비게이션 대기 처리
  useEffect(() => {
    if (pendingNav && phase !== "playing") {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [pendingNav, phase, navigate, setPendingNav]);

  // 게임 시작
  const handleStart = async (difficulty: string, count: number) => {
    setSelectedDifficulty(difficulty); // 난이도 저장
    setMaxQuestions(count);
    setLoading(true);
    setPhase("playing");
    setEnergyError(null);
    try {
      const [q, userStats] = await Promise.all([
        fetchQuizQuestion(difficulty),
        fetchUserStats(),
      ]);
      setQuestion(q);
      setQuestionCount(1);
      setStats(userStats);
    } catch (error: any) {
      if (error?.code === "INSUFFICIENT_ENERGY") {
        setEnergyError(error.energy ?? 0);
        setPhase("select");
      } else {
        console.error("게임 초기화 실패:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadQuestion = async () => {
    if (questionCount >= maxQuestions) {
      setGameFinished(true);
      setPhase("finished");
      await fetchUserStats().then(setStats).catch(console.error);
      return;
    }

    setLoading(true);
    setSelectedIndex(null);
    setSelectedAnswer(null);
    setSelectedRegion(null);
    setSelectedSide(null);
    setResult(null);

    try {
      const q = await fetchQuizQuestion(selectedDifficulty);
      setQuestion(q);
      setQuestionCount(prev => prev + 1);
    } catch (error: any) {
      if (error?.code === "INSUFFICIENT_ENERGY") {
        setEnergyError(error.energy ?? 0);
      } else {
        console.error("문제 불러오기 실패:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const restartGame = () => {
    setQuestionCount(0);
    setGameFinished(false);
    setPhase("select");
    setQuestion(null);
    setSessionCorrect(0);
    setSessionTotal(0);
    setSessionStreak(0);
    setSessionBestStreak(0);
    setSelectedIndex(null);
    setSelectedAnswer(null);
    setSelectedRegion(null);
    setSelectedSide(null);
    setResult(null);
    setEnergyError(null);
  };

  const handleSubmit = async () => {
    if (!question) return;

    const hasAnswer =
      (question.type === "multiple_choice" && selectedIndex !== null) ||
      (question.type === "true_false" && selectedAnswer !== null) ||
      (question.type === "region_select" && selectedRegion !== null) ||
      (question.type === "comparison" && selectedSide !== null);

    if (!hasAnswer) return;

    setSubmitting(true);
    try {
      let actualSelectedSide = selectedSide;
      if (question.type === "comparison" && isComparisonSwapped && selectedSide) {
        actualSelectedSide = selectedSide === "left" ? "right" : "left";
      }

      const res = await submitQuizAnswer({
        questionId: question.id,
        selectedIndex,
        selectedAnswer: selectedAnswer ?? undefined,
        selectedRegion: selectedRegion ?? undefined,
        selectedSide: actualSelectedSide ?? undefined,
      });
      setResult(res);

      // 프로필 업데이트 (에너지/XP/코인)
      if (res.level !== undefined && profile) {
        const updatedProfile: QuizGameProfile = {
          level: res.level,
          tierName: res.tierName ?? profile.tierName,
          totalExp: res.totalExp ?? profile.totalExp,
          totalCoins: res.totalCoins ?? profile.totalCoins,
          energy: res.energy ?? profile.energy,
          maxEnergy: res.maxEnergy ?? profile.maxEnergy,
        };
        setProfile(updatedProfile);
      } else if (profile) {
        // 에너지 2 차감 (백엔드 연동 전 로컬 처리)
        setProfile({ ...profile, energy: Math.max(0, profile.energy - 2) });
      }

      if (res.correctIndex !== undefined && question.type === "multiple_choice") {
        setQuestion({ ...question, correctIndex: res.correctIndex });
      }

      setSessionTotal(prev => prev + 1);
      if (res.correct) {
        setSessionCorrect(prev => prev + 1);
        setSessionStreak(prev => {
          const newStreak = prev + 1;
          setSessionBestStreak(current => Math.max(current, newStreak));
          return newStreak;
        });
      } else {
        setSessionStreak(0);
      }

      const userStats = await fetchUserStats();
      setStats(userStats);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (!question) return false;
    switch (question.type) {
      case "multiple_choice": return selectedIndex !== null;
      case "true_false": return selectedAnswer !== null;
      case "region_select": return selectedRegion !== null;
      case "comparison": return selectedSide !== null;
      default: return false;
    }
  };

  const handleVideoLoad = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoOrientation(video.videoWidth / video.videoHeight > 1 ? "landscape" : "portrait");
  };

  // ──────────────────────────────
  // 선택 화면
  // ──────────────────────────────
  if (phase === "select") {
    return (
      <SelectScreen
        profile={profile}
        onStart={handleStart}
        selectedDifficulty={selectedDifficulty}
        selectedCount={selectedCount}
        onDifficultyChange={setSelectedDifficulty}
        onCountChange={setSelectedCount}
      />
    );
  }

  // ──────────────────────────────
  // 에너지 부족 화면 (진행 중 에너지 소진)
  // ──────────────────────────────
  if (energyError !== null) {
    return (
      <div className="h-[calc(100vh-5rem)] w-full flex items-center justify-center">
        <WoodPanel className="flex flex-col items-center gap-6 p-10 max-w-md text-center">
          <motion.div animate={{ y: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2 }} className="text-7xl">
            😴
          </motion.div>
          <h2 className="font-jua text-3xl text-shadow-deep">에너지 부족!</h2>
          <p className="font-jua text-lg opacity-80">
            에너지가 부족해요.<br />
            현재 에너지: <span className="text-yellow-400">{energyError}</span>
          </p>
          <div className="w-full bg-wood-dark rounded-full h-4 overflow-hidden">
            <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${Math.min(100, (energyError / (profile?.maxEnergy ?? 100)) * 100)}%` }} />
          </div>
          <p className="font-jua text-sm opacity-60">3시간마다 에너지 +10 자동 충전</p>
          <GameButton variant="blue" onClick={() => { setEnergyError(null); setPhase("select"); }}>
            선택 화면으로
          </GameButton>
        </WoodPanel>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-hidden">
      {phase === "finished" ? (
        /* 게임 종료 화면 */
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="flex items-center justify-center h-full w-full relative"
            style={{ backgroundImage: "url(/celebration-background.png)", backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <motion.img src="/fox-celebration.png" alt="Fox" className="absolute left-0 object-contain"
              style={{ maxWidth: "45%", height: "55%", bottom: "-15%", top: "auto" }}
              initial={{ x: -200, opacity: 0 }}
              animate={{ x: 0, opacity: 1, y: [0, -20, 0] }}
              transition={{ x: { duration: 0.8, delay: 0.2 }, opacity: { duration: 0.8, delay: 0.2 }, y: { duration: 0.6, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" } }}
            />
            <motion.img src="/nuguri-celebration.png" alt="Nuguri" className="absolute right-0 object-contain"
              style={{ maxWidth: "45%", height: "55%", bottom: "-15%", top: "auto" }}
              initial={{ x: 200, opacity: 0 }}
              animate={{ x: 0, opacity: 1, y: [0, -20, 0] }}
              transition={{ x: { duration: 0.8, delay: 0.2 }, opacity: { duration: 0.8, delay: 0.2 }, y: { duration: 0.6, repeat: Infinity, repeatDelay: 2.5, delay: 0.8, ease: "easeInOut" } }}
            />
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} className="relative z-10">
              <WoodPanel className="flex flex-col items-center justify-center gap-5 p-10 max-w-2xl">
                <motion.h2 className="font-jua text-5xl text-shadow-deep" animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                  🎉 축하해! 퀴즈 완료! 🎉
                </motion.h2>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-wood-dark rounded-xl p-4">
                    <p className="font-jua text-lg opacity-70">총 문제</p>
                    <p className="font-jua text-3xl">{sessionTotal}개</p>
                  </div>
                  <div className="bg-wood-dark rounded-xl p-4">
                    <p className="font-jua text-lg opacity-70">정답</p>
                    <p className="font-jua text-3xl text-green-500">{sessionCorrect}개</p>
                  </div>
                  <div className="bg-wood-dark rounded-xl p-4">
                    <p className="font-jua text-lg opacity-70">정답률</p>
                    <p className="font-jua text-3xl">{sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0}%</p>
                  </div>
                  <div className="bg-wood-dark rounded-xl p-4">
                    <p className="font-jua text-lg opacity-70">최고 연속</p>
                    <p className="font-jua text-3xl text-yellow-500">{sessionBestStreak}개</p>
                  </div>
                </div>
                {profile && (
                  <div className="grid grid-cols-3 gap-3 w-full">
                    <div className="bg-wood-dark rounded-xl p-3">
                      <p className="font-jua text-sm opacity-70">티어</p>
                      <p className="font-jua text-base">🐣 {profile.tierName}</p>
                    </div>
                    <div className="bg-wood-dark rounded-xl p-3">
                      <p className="font-jua text-sm opacity-70">총 XP</p>
                      <p className="font-jua text-xl text-yellow-400">✨ {profile.totalExp}</p>
                    </div>
                    <div className="bg-wood-dark rounded-xl p-3">
                      <p className="font-jua text-sm opacity-70">보유 코인</p>
                      <p className="font-jua text-xl text-amber-400">💰 {profile.totalCoins}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-4 mt-2">
                  <GameButton variant="green" onClick={restartGame} className="whitespace-nowrap">다시 시작</GameButton>
                  <GameButton variant="blue" onClick={() => navigate("/")} className="whitespace-nowrap">마을 입구로</GameButton>
                </div>
              </WoodPanel>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        /* 퀴즈 화면 */
        <motion.div
          className="grid h-full gap-8 p-6"
          style={{
            gridTemplateColumns:
              question && (question.type === "region_select" || question.type === "comparison")
                ? "1fr"
                : "1fr 1.5fr",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* 왼쪽: 미디어 영역 */}
          {!(question && (question.type === "region_select" || question.type === "comparison")) && (
            <div className="flex flex-col h-full overflow-y-auto">
              {loading ? (
                <Skeleton className="min-h-full rounded-2xl bg-wood-dark" />
              ) : question ? (
                <>
                  <div className="flex items-center justify-between mb-3 px-2 flex-shrink-0">
                    <div className="font-jua text-sm opacity-70">
                      📂 {question.category === "ai-generated-detection" ? "AI 생성 이미지 탐지" : "영상 합성 탐지 (딥페이크)"}
                    </div>
                    <div className="font-jua text-sm px-3 py-1 rounded-full" style={{
                      background: question.difficulty === "easy" ? "rgba(34,197,94,0.2)" : question.difficulty === "medium" ? "rgba(234,179,8,0.2)" : "rgba(239,68,68,0.2)",
                      color: question.difficulty === "easy" ? "#22c55e" : question.difficulty === "medium" ? "#eab308" : "#ef4444",
                    }}>
                      {question.difficulty === "easy" ? "🟢 Lv.1 쉬움" : question.difficulty === "medium" ? "🟡 Lv.2 보통" : "🔴 Lv.3 어려움"}
                    </div>
                  </div>
                  <div className="flex items-center justify-center rounded-2xl overflow-hidden flex-shrink-0" style={{ background: "#000", minHeight: "600px" }}>
                    {question.mediaUrl ? (
                      question.mediaType === "video" ? (
                        <video src={question.mediaUrl} className="w-full h-auto" controls autoPlay loop muted onLoadedMetadata={handleVideoLoad} />
                      ) : (
                        <img src={question.mediaUrl} alt="Quiz" className="w-full h-auto" />
                      )
                    ) : (
                      <motion.span className="text-9xl" animate={{ y: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 2 }}>
                        {question.thumbnailEmoji}
                      </motion.span>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* 오른쪽: 퀴즈 패널 */}
          <WoodPanel className="flex flex-col relative z-30 overflow-y-auto">
            {/* 헤더 */}
            <div className="flex flex-col gap-2 mb-5 relative z-40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-jua text-2xl sm:text-3xl text-shadow-deep flex-shrink-0">
                  {question?.type === "region_select" ? "🔍 조작된 흔적을 찾아라!!" :
                   question?.type === "comparison" ? "⚖️ 가짜 비교하기" :
                   question?.type === "true_false" ? "O/X 퀴즈 - 진짜를 맞춰라!!" :
                   "🎬 가짜를 찾아라!"}
                </h2>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="font-jua text-base sm:text-lg text-shadow-deep whitespace-nowrap">
                    📊 {sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0}%
                  </div>
                  <div className="font-jua text-base sm:text-lg text-shadow-deep whitespace-nowrap">
                    📈 {questionCount}/{maxQuestions}
                  </div>
                  {/* 에너지바 */}
                  {profile && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="font-jua text-sm whitespace-nowrap">⚡ {profile.energy}/{profile.maxEnergy}</span>
                      <div className="w-20 bg-wood-dark rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(profile.energy / profile.maxEnergy) * 100}%`, background: profile.energy > 30 ? "#facc15" : "#ef4444" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
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
                <div className="flex-1 min-h-0 overflow-y-auto px-1">
                  {(() => {
                    switch (question.type) {
                      case "multiple_choice":
                        return (
                          <MultipleChoiceQuestion
                            question={{ ...question, correctIndex: result?.correctIndex ?? question.correctIndex }}
                            selectedIndex={selectedIndex}
                            onSelect={setSelectedIndex}
                            showResult={result !== null}
                            isCorrect={result?.correct}
                          />
                        );
                      case "true_false":
                        return (
                          <TrueFalseQuestion
                            question={question}
                            selectedAnswer={selectedAnswer}
                            onSelect={setSelectedAnswer}
                            showResult={result !== null}
                            isCorrect={result?.correct}
                          />
                        );
                      case "region_select":
                        return (
                          <div className="flex flex-col gap-3 h-full">
                            <p className="font-jua text-xl text-center">🔍 조작된 부분을 클릭하세요!</p>
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
                          </div>
                        );
                      case "comparison":
                        return (
                          <div className="flex flex-col gap-3">
                            <p className="font-jua text-xl text-center">⚖️ 어느 쪽이 AI가 생성한 가짜 이미지인지 선택하세요</p>
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
                              onSwapChange={setIsComparisonSwapped}
                            />
                          </div>
                        );
                      default:
                        return null;
                    }
                  })()}
                </div>

                {/* 제출 / 결과 버튼 */}
                {!(question.type === "region_select" || question.type === "comparison") && (
                  <AnimatePresence mode="wait">
                    {result ? (
                      <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 flex-shrink-0">
                        {question.type === "true_false" ? (
                          <GameButton variant="blue" onClick={loadQuestion}>다음 문제 →</GameButton>
                        ) : (
                          <>
                            <WoodPanel className="p-4 bg-wood-base">
                              <p className="font-jua text-2xl" style={{ color: result.correct ? "hsl(var(--magic-green))" : "hsl(var(--destructive))" }}>
                                {result.correct ? `🎉 정답! +${result.coinsEarned} 코인` : "😢 아쉬워요..."}
                              </p>
                              <p className="text-base mt-2 text-foreground">{result.explanation}</p>
                            </WoodPanel>
                            <GameButton variant="blue" onClick={loadQuestion}>다음 문제 →</GameButton>
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
      )}

      {/* 게임 중 페이지 이탈 확인 모달 */}
      <AnimatePresence>
        {pendingNav && phase === "playing" && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <WoodPanel className="flex flex-col items-center gap-5 p-8 max-w-sm text-center">
              <p className="font-jua text-2xl">🚪 게임을 떠날까요?</p>
              <p className="font-jua text-base opacity-70">진행 중인 퀴즈가 종료돼요!</p>
              <div className="flex gap-4">
                <GameButton variant="blue" onClick={() => { navigate(pendingNav); setPendingNav(null); }}>나가기</GameButton>
                <GameButton variant="green" onClick={() => setPendingNav(null)}>계속하기</GameButton>
              </div>
            </WoodPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GamePage;
