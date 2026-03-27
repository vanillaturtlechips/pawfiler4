import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import confetti from "canvas-confetti";
import GameButton from "@/components/GameButton";
import ApiKeyManager from "@/components/ApiKeyManager";
import AnalysisHistory from "@/components/analysis/AnalysisHistory";
import AgentDetailTabs from "@/components/analysis/AgentDetailTabs";
import EnsembleRadarChart from "@/components/analysis/EnsembleRadarChart";
import StreamingText from "@/components/analysis/StreamingText";
import AgentPipeline from "@/components/analysis/AgentPipeline";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";
import { generateAnalysisPdf } from "@/lib/generatePdf";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

const AnalysisPage = () => {
  const a = useAnalysis();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const confettiFired = useRef(false);

  // Fire confetti when result appears
  const fireConfetti = () => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const verdict = a.report?.finalVerdict;
    if (verdict === "REAL") {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#22c55e", "#4ade80", "#86efac"] });
    } else if (verdict === "FAKE") {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 }, colors: ["#ef4444", "#f87171", "#fca5a5"] });
    } else {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 }, colors: ["#eab308", "#facc15"] });
    }
  };

  const handleShareLink = async () => {
    await a.handleShareLink();
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
  };

  const handleCommunityPost = () => {
    if (!a.report) return;
    const v = verdictConfig[a.report.finalVerdict];
    // Navigate to community with pre-filled data
    const params = new URLSearchParams({
      title: `🔮 분석 결과: ${v.label} (${(a.report.confidence * 100).toFixed(0)}%)`,
      body: a.report.explanation || `판정: ${v.label}`,
      tag: "analysis",
    });
    a.navigate(`/community?${params.toString()}`);
  };

  // Reset confetti flag when report clears
  if (!a.report) confettiFired.current = false;

  const sectionSpring = {
    initial: { opacity: 0, y: 60, scale: 0.95 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: true, margin: "-50px" },
    transition: { ...spring, duration: 0.6 },
  };

  return (
    <div ref={containerRef} className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      {/* Share toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl font-jua text-sm"
            style={{ background: "rgba(34,197,94,0.9)", color: "white", backdropFilter: "blur(10px)" }}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
          >
            ✅ 공유 링크가 복사됐어요!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section 1: Hero ── */}
      <motion.section
        className="flex flex-col items-center justify-center text-center py-16 px-4"
        style={{ minHeight: "50vh" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="text-9xl mb-6"
          animate={{ y: [-10, 10, -10], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        >
          🔮
        </motion.div>
        <motion.h1
          className="font-jua text-5xl text-foreground text-shadow-glow leading-tight"
          initial={{ opacity: 0, y: 30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.2 }}
        >
          마법 구슬<br />분석기
        </motion.h1>
        <motion.p
          className="font-gothic text-base text-foreground/50 mt-4 max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          진짜 영상과 AI가 만든 가짜 영상을 구별하는<br />마법의 두루마리를 펼쳐보세요
        </motion.p>
        <motion.div className="mt-8 text-foreground/30 text-2xl" animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          ↓
        </motion.div>
      </motion.section>

      {/* ── History Section ── */}
      <div className="px-4 pb-8 max-w-lg mx-auto">
        <AnalysisHistory
          history={a.history}
          onSelect={a.loadHistoryReport}
          onClear={a.clearHistory}
        />
      </div>

      {/* ── Section 2: Upload ── */}
      <motion.section className="flex flex-col items-center px-4 pb-16" {...sectionSpring}>
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <motion.div
              className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg"
              style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}
              whileHover={{ scale: 1.2, rotate: 10 }}
            >1</motion.div>
            <h2 className="font-jua text-2xl text-foreground text-shadow-deep">📜 영상을 올려주세요</h2>
          </div>

          <input ref={a.fileInputRef} type="file" accept="video/*" onChange={a.handleInputChange} className="hidden" />

          <motion.div
            className="rounded-3xl p-8 text-center cursor-pointer"
            style={{
              background: a.isDragging
                ? "linear-gradient(145deg, rgba(0,137,188,0.12), rgba(0,100,180,0.06))"
                : "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              border: a.isDragging ? "3px dashed hsl(var(--magic-blue))" : "3px dashed rgba(255,255,255,0.12)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 15px 50px rgba(0,0,0,0.3)",
            }}
            whileHover={{ scale: 1.01, borderColor: "rgba(0,137,188,0.4)" }}
            whileTap={{ scale: 0.99 }}
            onClick={() => !a.isAnalyzing && a.fileInputRef.current?.click()}
            onDrop={a.handleDrop}
            onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
            onDragLeave={() => a.setIsDragging(false)}
          >
            {a.previewUrl ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                <video src={a.previewUrl} className="w-full max-h-56 rounded-2xl object-contain mx-auto" controls onClick={(e) => e.stopPropagation()} />
                <div className="mt-3 font-gothic text-sm text-foreground/40">
                  📹 {a.selectedFile?.name} ({((a.selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)
                </div>
              </motion.div>
            ) : (
              <>
                <motion.div className="text-7xl mb-4" animate={{ y: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 3 }}>
                  ☁️
                </motion.div>
                <p className="font-jua text-xl text-foreground/70">영상을 여기에 드래그하세요</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  {["📏 최대 100MB", "⏱ 3분 이하", "🎞 mp4·mov·avi"].map(t => (
                    <span key={t} className="text-xs font-gothic px-3 py-1 rounded-full text-foreground/30" style={{ background: "rgba(255,255,255,0.04)" }}>{t}</span>
                  ))}
                </div>
              </>
            )}
          </motion.div>

          <AnimatePresence>
            {a.fileError && (
              <motion.div className="mt-3 rounded-xl px-4 py-2.5 text-sm font-jua" style={{ background: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.2)" }}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                ⚠️ {a.fileError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ── Section 3: Analyze ── */}
      <motion.section className="flex flex-col items-center px-4 pb-16" {...sectionSpring}>
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <motion.div
              className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg"
              style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}
              whileHover={{ scale: 1.2, rotate: 10 }}
            >2</motion.div>
            <h2 className="font-jua text-2xl text-foreground text-shadow-deep">✨ 분석 시작</h2>
          </div>

          {/* Progress */}
          <AnimatePresence>
            {a.isAnalyzing && (
              <motion.div
                className="mb-5 rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex flex-col gap-3">
                  {STAGES.map((s, i) => (
                    <motion.div
                      key={s.key}
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1, ...spring }}
                    >
                      <motion.div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                        style={{
                          background: i <= a.currentStageIdx ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(199,97%,55%))" : "rgba(255,255,255,0.05)",
                          color: i <= a.currentStageIdx ? "white" : "rgba(255,255,255,0.2)",
                          boxShadow: i === a.currentStageIdx ? "0 0 20px rgba(0,137,188,0.5)" : "none",
                        }}
                        animate={i === a.currentStageIdx ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 1 }}
                      >
                        {i < a.currentStageIdx ? "✓" : s.icon}
                      </motion.div>
                      <div className="flex-1">
                        <span className="text-sm font-jua" style={{ color: i <= a.currentStageIdx ? "hsl(var(--magic-blue))" : "rgba(255,255,255,0.2)" }}>{s.label}</span>
                        <div className="w-full h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: i <= a.currentStageIdx
                                ? "linear-gradient(90deg, hsl(var(--magic-blue)), hsl(199,97%,60%))"
                                : "transparent",
                              boxShadow: i === a.currentStageIdx ? "0 0 10px rgba(0,137,188,0.5)" : "none",
                            }}
                            animate={{ width: i <= a.currentStageIdx ? "100%" : "0%" }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent Pipeline (during analysis) */}
          <AnimatePresence>
            {a.isAnalyzing && a.agentTimings.length > 0 && (
              <motion.div
                className="mb-5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <AgentPipeline timings={a.agentTimings} totalMs={a.report?.totalProcessingTimeMs || 5000} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analyze button */}
          <motion.button
            className="relative w-full overflow-hidden rounded-2xl py-5 font-jua text-xl text-white cursor-pointer border-none outline-none"
            style={{
              background: a.isAnalyzing
                ? "linear-gradient(135deg, hsl(199,97%,30%), hsl(199,97%,40%))"
                : !a.selectedFile
                  ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))"
                  : "linear-gradient(135deg, hsl(199,97%,37%), hsl(220,90%,45%))",
              boxShadow: a.selectedFile && !a.isAnalyzing
                ? "0 8px 30px rgba(0,137,188,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
                : "none",
              color: !a.selectedFile ? "rgba(255,255,255,0.25)" : "white",
              textShadow: a.selectedFile ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
              pointerEvents: !a.selectedFile || a.isAnalyzing ? "none" : "auto",
            }}
            whileHover={a.selectedFile && !a.isAnalyzing ? { scale: 1.02, y: -2 } : {}}
            whileTap={a.selectedFile && !a.isAnalyzing ? { scale: 0.97, y: 1 } : {}}
            onClick={a.handleAnalyze}
          >
            {a.selectedFile && !a.isAnalyzing && (
              <motion.div
                className="absolute inset-0"
                style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)" }}
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 1 }}
              />
            )}
            {a.isAnalyzing && (
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{ border: "2px solid rgba(255,255,255,0.3)" }}
                animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.03, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              {a.isAnalyzing ? (
                <>
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>⏳</motion.span>
                  구슬이 분석하는 중...
                </>
              ) : (
                <>🔮 마법 구슬아, 분석해줘!</>
              )}
            </span>
          </motion.button>

          {/* Error state with retry */}
          <AnimatePresence>
            {a.stage === "ERROR" && (
              <motion.div
                className="mt-4 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
              >
                <p className="font-jua text-foreground/50 mb-3">분석에 실패했어요 😢</p>
                <div className="flex gap-3">
                  <GameButton variant="orange" className="flex-1" onClick={a.handleRetry}>🔄 재시도</GameButton>
                  <GameButton variant="green" className="flex-1" onClick={a.handleReset}>📂 새 파일</GameButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ── Section 4: Results ── */}
      <AnimatePresence>
        {a.report && (
          <>
            {/* Verdict */}
            <motion.section
              className="flex flex-col items-center px-4 pb-12"
              {...sectionSpring}
              onAnimationComplete={fireConfetti}
            >
              <div className="w-full max-w-lg">
                <div className="flex items-center gap-3 mb-6">
                  <motion.div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg"
                    style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}
                    whileHover={{ scale: 1.2, rotate: 10 }}
                  >3</motion.div>
                  <h2 className="font-jua text-2xl text-foreground text-shadow-deep">📋 판정 결과</h2>
                </div>

                <motion.div
                  className="rounded-3xl p-8 text-center"
                  style={{
                    background: verdictConfig[a.report.finalVerdict].bg,
                    border: `3px solid ${verdictConfig[a.report.finalVerdict].border}`,
                    boxShadow: verdictConfig[a.report.finalVerdict].glow,
                    backdropFilter: "blur(20px)",
                  }}
                  initial={{ scale: 0.5, opacity: 0, rotateY: 90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  transition={{ ...spring, stiffness: 200 }}
                >
                  <motion.span
                    className="text-7xl block"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.3, 1] }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    {verdictConfig[a.report.finalVerdict].emoji}
                  </motion.span>
                  <motion.div
                    className="font-jua text-3xl mt-3"
                    style={{ color: verdictConfig[a.report.finalVerdict].border }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    {verdictConfig[a.report.finalVerdict].label}
                  </motion.div>
                  <motion.div
                    className="font-jua text-6xl mt-1"
                    style={{ color: verdictConfig[a.report.finalVerdict].border }}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, ...spring }}
                  >
                    {(a.report.confidence * 100).toFixed(0)}%
                  </motion.div>
                  <div className="text-xs mt-2 text-foreground/30 font-gothic">종합 신뢰도</div>
                </motion.div>
              </div>
            </motion.section>

            {/* Agent Pipeline (completed) */}
            {a.report.agentTimings && a.report.agentTimings.length > 0 && (
              <motion.section className="flex flex-col items-center px-4 pb-8" {...sectionSpring}>
                <div className="w-full max-w-lg">
                  <AgentPipeline timings={a.report.agentTimings} totalMs={a.report.totalProcessingTimeMs} />
                </div>
              </motion.section>
            )}

            {/* Ensemble Radar Chart */}
            <motion.section className="flex flex-col items-center px-4 pb-8" {...sectionSpring}>
              <div className="w-full max-w-lg">
                <EnsembleRadarChart report={a.report} />
              </div>
            </motion.section>

            {/* AI Opinion (Streaming) */}
            {a.report.explanation && (
              <motion.section className="flex flex-col items-center px-4 pb-8" {...sectionSpring}>
                <div className="w-full max-w-lg">
                  <motion.div
                    className="rounded-2xl p-5"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}
                  >
                    <p className="font-jua text-sm mb-3">🤖 AI 종합 의견</p>
                    <StreamingText
                      text={a.report.explanation}
                      speed={20}
                      className="font-gothic text-xs text-foreground/50 leading-relaxed"
                    />
                  </motion.div>
                </div>
              </motion.section>
            )}

            {/* Detail Tabs */}
            <motion.section className="flex flex-col items-center px-4 pb-12" {...sectionSpring}>
              <div className="w-full max-w-lg">
                <div className="flex items-center gap-3 mb-6">
                  <motion.div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg"
                    style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}
                    whileHover={{ scale: 1.2, rotate: 10 }}
                  >4</motion.div>
                  <h2 className="font-jua text-2xl text-foreground text-shadow-deep">🔍 에이전트별 상세 분석</h2>
                </div>
                <AgentDetailTabs report={a.report} />
                <motion.div
                  className="rounded-xl p-3 mt-4 text-xs text-foreground/25 font-gothic"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  ⏱ {(a.report.totalProcessingTimeMs / 1000).toFixed(1)}초 · 🖼 {a.report.visual?.framesAnalyzed || 0}프레임 · 🤖 4 에이전트
                </motion.div>
              </div>
            </motion.section>

            {/* Actions */}
            <motion.section className="flex flex-col items-center px-4 pb-16" {...sectionSpring}>
              <div className="w-full max-w-lg flex flex-col gap-3">
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg"
                    style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}
                    whileHover={{ scale: 1.2, rotate: 10 }}
                  >5</motion.div>
                  <h2 className="font-jua text-2xl text-foreground text-shadow-deep">🎯 다음은?</h2>
                </div>

                {/* Primary actions */}
                <GameButton variant="green" onClick={() => a.navigate("/game")}>🎮 관련 퀴즈 풀어보기</GameButton>

                {/* Share & export row */}
                <div className="grid grid-cols-3 gap-3">
                  <GameButton variant="blue" className="text-sm" onClick={a.handleShare}>🔗 공유</GameButton>
                  <GameButton variant="blue" className="text-sm" onClick={handleShareLink}>📎 링크</GameButton>
                  <GameButton variant="blue" className="text-sm" onClick={() => a.report && generateAnalysisPdf(a.report)}>📄 PDF</GameButton>
                </div>

                {/* Community post */}
                <GameButton variant="orange" onClick={handleCommunityPost}>📢 커뮤니티에 공유하기</GameButton>

                {/* Save & new analysis */}
                <div className="flex gap-3">
                  <GameButton variant="blue" className="flex-1 text-base" onClick={a.handleSave}>💾 JSON 저장</GameButton>
                  <GameButton variant="green" className="flex-1 text-base" onClick={a.handleReset}>🔄 새 분석</GameButton>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>

      {/* API Key Manager */}
      <div className="px-4 pb-8 max-w-lg mx-auto">
        <ApiKeyManager />
      </div>
    </div>
  );
};

const ScrollCard = ({ icon, title, verdict, isBad, confidence, sub, delay: d = 0 }: {
  icon: string; title: string; verdict: string; isBad: boolean; confidence: number; sub?: string; delay?: number;
}) => (
  <motion.div
    className="rounded-2xl p-5"
    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
    initial={{ opacity: 0, x: -30, scale: 0.95 }}
    whileInView={{ opacity: 1, x: 0, scale: 1 }}
    viewport={{ once: true }}
    transition={{ delay: d, ...spring }}
    whileHover={{ scale: 1.01, x: 5 }}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="font-jua">{icon} {title}</span>
      <motion.span
        className="text-xs font-jua px-3 py-1 rounded-full"
        style={{
          background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
          color: isBad ? "#fca5a5" : "#86efac",
        }}
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: d + 0.2, type: "spring", stiffness: 500 }}
      >
        {verdict}
      </motion.span>
    </div>
    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{
          background: isBad ? "linear-gradient(90deg,#ef4444,#f87171)" : "linear-gradient(90deg,#22c55e,#4ade80)",
          boxShadow: `0 0 10px ${isBad ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
        }}
        initial={{ width: 0 }}
        whileInView={{ width: `${(confidence * 100).toFixed(0)}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: d + 0.3 }}
      />
    </div>
    <div className="flex justify-between mt-1.5 text-xs font-gothic">
      <span className="text-foreground/30">{sub || ""}</span>
      <span className="text-foreground/50">{(confidence * 100).toFixed(0)}%</span>
    </div>
  </motion.div>
);

export default AnalysisPage;
