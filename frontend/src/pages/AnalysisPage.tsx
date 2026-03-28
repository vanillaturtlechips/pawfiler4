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
import AgentRerun from "@/components/analysis/AgentRerun";
import RerunComparison from "@/components/analysis/RerunComparison";
import BatchQueue from "@/components/analysis/BatchQueue";
import AdversarialSimulation from "@/components/analysis/AdversarialSimulation";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";
import { generateAnalysisPdf } from "@/lib/generatePdf";
import StarfieldBackground from "@/components/analysis/StarfieldBackground";

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };

const AnalysisPage = () => {
  const a = useAnalysis();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const confettiFired = useRef(false);

  const fireConfetti = () => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const verdict = a.report?.finalVerdict;
    if (verdict === "REAL") {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#60a5fa", "#818cf8", "#a78bfa"] });
    } else if (verdict === "FAKE") {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 }, colors: ["#ef4444", "#f87171", "#fb923c"] });
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
    const params = new URLSearchParams({
      title: `🔮 분석 결과: ${v.label} (${(a.report.confidence * 100).toFixed(0)}%)`,
      body: a.report.explanation || `판정: ${v.label}`,
      tag: "analysis",
    });
    a.navigate(`/community?${params.toString()}`);
  };

  if (!a.report) confettiFired.current = false;

  const sectionSpring = {
    initial: { opacity: 0, y: 50, scale: 0.97 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: true, margin: "-40px" },
    transition: { ...spring, duration: 0.7 },
  };

  return (
    <div ref={containerRef} className="w-full overflow-y-auto relative" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <StarfieldBackground />

      {/* Share toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl font-jua text-sm"
            style={{ background: "hsl(var(--star-accent) / 0.9)", color: "white", backdropFilter: "blur(16px)", boxShadow: "0 0 30px hsl(var(--star-accent) / 0.4)" }}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
          >
            ✅ 공유 링크가 복사됐어요!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ── */}
      <motion.section
        className="flex flex-col items-center justify-center text-center py-16 px-4 relative z-10"
        style={{ minHeight: "50vh" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Floating orb behind emoji */}
        <motion.div
          className="absolute top-[15%] w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsla(210, 90%, 70%, 0.15), hsla(270, 60%, 60%, 0.08), transparent 70%)",
            filter: "blur(40px)",
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        />
        <motion.div
          className="text-8xl mb-6 relative"
          animate={{ y: [-8, 8, -8], rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        >
          🌌
          <motion.div
            className="absolute -inset-8 blur-3xl opacity-50 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(var(--star-accent) / 0.5), hsl(var(--star-aurora-b) / 0.3), transparent 70%)" }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 3 }}
          />
        </motion.div>
        <motion.h1
          className="font-jua text-5xl md:text-7xl leading-tight"
          style={{ color: "hsl(var(--star-text))", textShadow: "0 0 40px hsl(var(--star-accent) / 0.4), 0 0 80px hsl(var(--star-aurora-b) / 0.2)" }}
          initial={{ opacity: 0, y: 30, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.2 }}
        >
          별빛<br />분석기
        </motion.h1>
        <motion.p
          className="font-gothic text-base mt-5 max-w-md leading-relaxed"
          style={{ color: "hsl(var(--star-text-dim))" }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          진짜 영상과 AI가 만든 가짜 영상을 구별하는<br />별빛 연구소의 분석을 시작하세요
        </motion.p>
        <motion.div
          className="mt-8 text-2xl"
          style={{ color: "hsl(var(--star-accent) / 0.6)" }}
          animate={{ y: [0, 10, 0], opacity: [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          ↓
        </motion.div>
      </motion.section>

      {/* ── History ── */}
      <div className="px-4 pb-4 max-w-xl mx-auto relative z-10">
        <AnalysisHistory history={a.history} onSelect={a.loadHistoryReport} onClear={a.clearHistory} />
      </div>

      {/* ── Batch Queue ── */}
      <div className="px-4 pb-8 max-w-xl mx-auto relative z-10">
        <BatchQueue onAnalyzeFile={a.handleFileSelect} />
      </div>

      {/* ── Upload ── */}
      <motion.section className="flex flex-col items-center px-4 pb-16 relative z-10" {...sectionSpring}>
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-4 mb-8">
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-jua text-lg text-white"
              style={{ background: "linear-gradient(135deg, hsl(175 70% 50%), hsl(195 80% 55%))", boxShadow: "0 4px 15px hsl(175 70% 50% / 0.3)" }}
              whileHover={{ scale: 1.15, rotate: 8 }}
            >1</motion.div>
            <h2 className="font-jua text-2xl" style={{ color: "hsl(var(--star-text))" }}>📜 영상을 올려주세요</h2>
          </div>

          <input ref={a.fileInputRef} type="file" accept="video/*" onChange={a.handleInputChange} className="hidden" />

          <motion.div
            className="rounded-3xl p-10 text-center cursor-pointer relative overflow-hidden"
            style={{
              background: a.isDragging
                ? "linear-gradient(145deg, hsl(var(--star-accent) / 0.08), hsl(var(--star-card)))"
                : "linear-gradient(145deg, hsl(var(--star-card)), hsl(var(--star-deep)))",
              border: a.isDragging ? "2px dashed hsl(var(--star-accent))" : "2px dashed hsl(var(--star-border) / 0.4)",
              boxShadow: "0 20px 60px hsl(var(--star-deep) / 0.5)",
            }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => !a.isAnalyzing && a.fileInputRef.current?.click()}
            onDrop={a.handleDrop}
            onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
            onDragLeave={() => a.setIsDragging(false)}
          >
            {a.previewUrl ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                <video src={a.previewUrl} className="w-full max-h-60 rounded-2xl object-contain mx-auto" controls onClick={(e) => e.stopPropagation()} />
                <div className="mt-4 font-gothic text-sm" style={{ color: "hsl(var(--star-text-dim))" }}>
                  📹 {a.selectedFile?.name} ({((a.selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)
                </div>
              </motion.div>
            ) : (
              <>
                <motion.div className="text-7xl mb-5" animate={{ y: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 3 }}>
                  ☁️
                </motion.div>
                <p className="font-jua text-xl" style={{ color: "hsl(var(--star-text))" }}>영상을 여기에 드래그하세요</p>
                <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
                  {["📏 최대 100MB", "⏱ 3분 이하", "🎞 mp4·mov·avi"].map(t => (
                    <span key={t} className="text-xs font-gothic px-3 py-1.5 rounded-full" style={{ background: "hsl(var(--star-surface))", color: "hsl(var(--star-text-dim))", border: "1px solid hsl(var(--star-border) / 0.2)" }}>{t}</span>
                  ))}
                </div>
              </>
            )}
          </motion.div>

          <AnimatePresence>
            {a.fileError && (
              <motion.div className="mt-4 rounded-xl px-5 py-3 text-sm font-jua" style={{ background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--star-warm))", border: "1px solid hsl(var(--destructive) / 0.25)" }}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                ⚠️ {a.fileError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ── Analyze ── */}
      <motion.section className="flex flex-col items-center px-4 pb-16 relative z-10" {...sectionSpring}>
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-4 mb-8">
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-jua text-lg text-white"
              style={{ background: "linear-gradient(135deg, hsl(265 65% 55%), hsl(285 70% 60%))", boxShadow: "0 4px 15px hsl(265 65% 55% / 0.3)" }}
              whileHover={{ scale: 1.15, rotate: 8 }}
            >2</motion.div>
            <h2 className="font-jua text-2xl" style={{ color: "hsl(var(--star-text))" }}>✨ 분석 시작</h2>
          </div>

          {/* Progress */}
          <AnimatePresence>
            {a.isAnalyzing && (
              <motion.div
                className="mb-6 star-card-glow p-6"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="flex flex-col gap-4">
                  {STAGES.map((s, i) => {
                    const progress = a.stageProgress[s.key] ?? 0;
                    const isDone = progress >= 100;
                    const isActive = a.stage === s.key;

                    return (
                      <motion.div
                        key={s.key}
                        className="flex items-center gap-4"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: progress > 0 || isActive ? 1 : 0.4, x: 0 }}
                        transition={{ delay: i * 0.08, ...spring }}
                      >
                        <motion.div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                          style={{
                            background: isDone ? "hsl(var(--star-accent) / 0.2)" : isActive ? "hsl(var(--star-accent) / 0.15)" : "hsl(var(--star-surface))",
                            color: isDone || isActive ? "hsl(var(--star-accent))" : "hsl(var(--star-text-dim))",
                            border: `1px solid ${isDone || isActive ? "hsl(var(--star-accent) / 0.35)" : "hsl(var(--star-border) / 0.2)"}`,
                            boxShadow: isActive ? "0 0 20px hsl(var(--star-accent) / 0.3)" : "none",
                          }}
                          animate={isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                          transition={{ repeat: isActive ? Infinity : 0, duration: 1.2 }}
                        >
                          {isDone ? "✓" : s.icon}
                        </motion.div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <span className="text-sm font-jua" style={{ color: isDone || isActive ? "hsl(var(--star-text))" : "hsl(var(--star-text-dim))" }}>{s.label}</span>
                            <span className="font-gothic text-xs tabular-nums" style={{ color: isActive ? "hsl(var(--star-accent))" : "hsl(var(--star-text-dim))" }}>
                              {progress > 0 ? `${Math.round(progress)}%` : "대기"}
                            </span>
                          </div>
                          <div className="w-full h-3 rounded-full overflow-hidden star-bar">
                            <motion.div
                              className="h-full rounded-full relative overflow-hidden"
                              style={{
                                background: isDone || isActive
                                  ? "linear-gradient(90deg, hsl(var(--star-accent)), hsl(var(--star-accent-glow)))"
                                  : "hsl(var(--star-border) / 0.3)",
                                boxShadow: isActive ? "0 0 16px hsl(var(--star-accent) / 0.5)" : "none",
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            >
                              {isActive && progress > 6 && (
                                <motion.div
                                  className="absolute inset-y-0 w-20"
                                  style={{ background: "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.25), transparent)" }}
                                  animate={{ x: ["-150%", "350%"] }}
                                  transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
                                />
                              )}
                            </motion.div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Agent Pipeline */}
          <AnimatePresence>
            {a.isAnalyzing && a.agentTimings.length > 0 && (
              <motion.div className="mb-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <AgentPipeline timings={a.agentTimings} totalMs={a.report?.totalProcessingTimeMs || 5000} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analyze button */}
          <motion.button
            className="relative w-full overflow-hidden rounded-2xl py-6 font-jua text-xl cursor-pointer border-none outline-none"
            style={{
              background: a.isAnalyzing
                ? "linear-gradient(135deg, hsl(var(--star-accent)), hsl(var(--star-aurora-b)))"
                : !a.selectedFile
                  ? "linear-gradient(135deg, hsl(var(--star-surface)), hsl(var(--star-card)))"
                  : "linear-gradient(135deg, hsl(210 85% 58%), hsl(230 75% 55%), hsl(260 60% 55%))",
              boxShadow: a.selectedFile && !a.isAnalyzing
                ? "0 6px 0 hsl(230 70% 35%), 0 12px 40px hsl(var(--star-accent) / 0.4), 0 0 60px hsl(var(--star-accent) / 0.15)"
                : a.isAnalyzing ? "0 4px 30px hsl(var(--star-accent) / 0.3)" : "none",
              color: !a.selectedFile ? "hsl(var(--star-text-dim) / 0.4)" : "white",
              pointerEvents: !a.selectedFile || a.isAnalyzing ? "none" : "auto",
              textShadow: a.selectedFile ? "1px 2px 3px rgba(0,0,0,0.3)" : "none",
            }}
            whileHover={a.selectedFile && !a.isAnalyzing ? { scale: 1.03, y: -4, boxShadow: "0 6px 0 hsl(230 70% 35%), 0 16px 50px hsl(var(--star-accent) / 0.5), 0 0 80px hsl(var(--star-accent) / 0.2)" } : {}}
            whileTap={a.selectedFile && !a.isAnalyzing ? { scale: 0.97, y: 3, boxShadow: "0 2px 0 hsl(230 70% 35%)" } : {}}
            onClick={a.handleAnalyze}
          >
            {a.selectedFile && !a.isAnalyzing && (
              <motion.div
                className="absolute inset-0"
                style={{ background: "linear-gradient(105deg, transparent 30%, hsl(0 0% 100% / 0.18) 48%, hsl(0 0% 100% / 0.28) 50%, hsl(0 0% 100% / 0.18) 52%, transparent 70%)" }}
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 1 }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-3">
              {a.isAnalyzing ? (
                <>
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>⏳</motion.span>
                  분석하는 중...
                </>
              ) : (
                <>🌌 별빛 분석 시작!</>
              )}
            </span>
          </motion.button>

          {/* Error */}
          <AnimatePresence>
            {a.stage === "ERROR" && (
              <motion.div className="mt-5 text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <p className="font-jua mb-3" style={{ color: "hsl(var(--star-text-dim))" }}>분석에 실패했어요 😢</p>
                <div className="flex gap-3">
                  <GameButton variant="orange" className="flex-1" onClick={a.handleRetry}>🔄 재시도</GameButton>
                  <GameButton variant="green" className="flex-1" onClick={a.handleReset}>📂 새 파일</GameButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ── Results ── */}
      <AnimatePresence>
        {a.report && (
          <>
            {/* Verdict */}
            <motion.section className="flex flex-col items-center px-4 pb-14 relative z-10" {...sectionSpring} onAnimationComplete={fireConfetti}>
              <div className="w-full max-w-xl">
                <div className="flex items-center gap-4 mb-8">
                  <motion.div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-jua text-lg text-white"
                    style={{ background: "linear-gradient(135deg, hsl(340 70% 55%), hsl(10 80% 55%))", boxShadow: "0 4px 15px hsl(340 70% 55% / 0.3)" }}
                    whileHover={{ scale: 1.15, rotate: 8 }}
                  >3</motion.div>
                  <h2 className="font-jua text-2xl" style={{ color: "hsl(var(--star-text))" }}>📋 판정 결과</h2>
                </div>

                <motion.div
                  className="rounded-3xl p-10 text-center relative overflow-hidden"
                  style={{
                    background: `linear-gradient(160deg, hsl(var(--star-card)), hsl(var(--star-deep)))`,
                    border: `2px solid ${verdictConfig[a.report.finalVerdict].border}`,
                    boxShadow: `${verdictConfig[a.report.finalVerdict].glow}, 0 24px 60px hsl(var(--star-deep) / 0.5)`,
                  }}
                  initial={{ scale: 0.5, opacity: 0, rotateY: 90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  transition={{ ...spring, stiffness: 200 }}
                >
                  {/* Aurora overlay */}
                  <motion.div
                    className="absolute inset-0 star-aurora opacity-30"
                    animate={{ opacity: [0.2, 0.4, 0.2] }}
                    transition={{ repeat: Infinity, duration: 4 }}
                  />
                  <motion.span
                    className="text-8xl block relative z-10"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.3, 1] }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    {verdictConfig[a.report.finalVerdict].emoji}
                  </motion.span>
                  <motion.div
                    className="font-jua text-3xl mt-4 relative z-10"
                    style={{ color: verdictConfig[a.report.finalVerdict].border }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    {verdictConfig[a.report.finalVerdict].label}
                  </motion.div>
                  <motion.div
                    className="font-jua text-7xl mt-2 relative z-10"
                    style={{ color: verdictConfig[a.report.finalVerdict].border }}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, ...spring }}
                  >
                    {(a.report.confidence * 100).toFixed(0)}%
                  </motion.div>
                  <div className="text-xs mt-3 font-gothic relative z-10" style={{ color: "hsl(var(--star-text-dim))" }}>종합 신뢰도</div>
                </motion.div>
              </div>
            </motion.section>

            {/* Agent Pipeline (completed) */}
            {a.report.agentTimings && a.report.agentTimings.length > 0 && (
              <motion.section className="flex flex-col items-center px-4 pb-10 relative z-10" {...sectionSpring}>
                <div className="w-full max-w-xl">
                  <AgentPipeline timings={a.report.agentTimings} totalMs={a.report.totalProcessingTimeMs} />
                </div>
              </motion.section>
            )}

            {/* Ensemble Radar */}
            <motion.section className="flex flex-col items-center px-4 pb-10 relative z-10" {...sectionSpring}>
              <div className="w-full max-w-xl">
                <EnsembleRadarChart report={a.report} />
              </div>
            </motion.section>

            {/* AI Opinion */}
            {a.report.explanation && !a.report.llm?.reasoning && (
              <motion.section className="flex flex-col items-center px-4 pb-10 relative z-10" {...sectionSpring}>
                <div className="w-full max-w-xl">
                  <motion.div className="star-card-glow p-6">
                    <p className="font-jua text-base mb-3" style={{ color: "hsl(var(--star-text))" }}>🤖 AI 종합 의견</p>
                    <StreamingText text={a.report.explanation} speed={20} className="font-gothic text-sm leading-relaxed" />
                  </motion.div>
                </div>
              </motion.section>
            )}

            {/* Detail Tabs */}
            <motion.section className="flex flex-col items-center px-4 pb-14 relative z-10" {...sectionSpring}>
              <div className="w-full max-w-xl star-card-glow p-5 sm:p-7">
                <div className="flex items-center gap-4 mb-8">
                  <motion.div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-jua text-lg"
                    style={{ background: "hsl(var(--star-accent) / 0.15)", color: "hsl(var(--star-accent))", border: "1px solid hsl(var(--star-accent) / 0.25)" }}
                    whileHover={{ scale: 1.15, rotate: 8 }}
                  >4</motion.div>
                  <h2 className="font-jua text-2xl" style={{ color: "hsl(var(--star-text))" }}>🔍 에이전트별 상세 분석</h2>
                </div>
                <AgentDetailTabs report={a.report} />
                <motion.div
                  className="rounded-xl p-3.5 mt-5 text-xs font-gothic"
                  style={{ background: "hsl(var(--star-surface))", color: "hsl(var(--star-text-dim))", border: "1px solid hsl(var(--star-border) / 0.2)" }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  ⏱ {(a.report.totalProcessingTimeMs / 1000).toFixed(1)}초 · 🖼 {a.report.visual?.framesAnalyzed || 0}프레임 · 🤖 4 에이전트
                </motion.div>
              </div>
            </motion.section>

            {/* Agent Rerun + Adversarial */}
            <motion.section className="flex flex-col items-center px-4 pb-14 relative z-10" {...sectionSpring}>
              <div className="w-full max-w-xl space-y-5">
                <AgentRerun report={a.report} onRerun={a.handleAgentRerun} isRerunning={a.isRerunning} rerunningAgents={a.rerunningAgents} />
                {a.rerunHistory && a.rerunHistory.length > 0 && (
                  <RerunComparison history={a.rerunHistory} current={a.report} />
                )}
                <AdversarialSimulation report={a.report} />
              </div>
            </motion.section>

            {/* Actions */}
            <motion.section className="flex flex-col items-center px-4 pb-20 relative z-10" {...sectionSpring}>
              <div className="w-full max-w-xl flex flex-col gap-4">
                <div className="flex items-center gap-4 mb-4">
                  <motion.div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-jua text-lg"
                    style={{ background: "hsl(var(--star-accent) / 0.15)", color: "hsl(var(--star-accent))", border: "1px solid hsl(var(--star-accent) / 0.25)" }}
                    whileHover={{ scale: 1.15, rotate: 8 }}
                  >5</motion.div>
                  <h2 className="font-jua text-2xl" style={{ color: "hsl(var(--star-text))" }}>🎯 다음은?</h2>
                </div>
                <GameButton variant="green" onClick={() => a.navigate("/game")}>🎮 관련 퀴즈 풀어보기</GameButton>
                <div className="grid grid-cols-3 gap-3">
                  <GameButton variant="blue" className="text-sm" onClick={a.handleShare}>🔗 공유</GameButton>
                  <GameButton variant="blue" className="text-sm" onClick={handleShareLink}>📎 링크</GameButton>
                  <GameButton variant="blue" className="text-sm" onClick={() => a.report && generateAnalysisPdf(a.report)}>📄 PDF</GameButton>
                </div>
                <GameButton variant="orange" onClick={handleCommunityPost}>📢 커뮤니티에 공유하기</GameButton>
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
      <div className="px-4 pb-8 max-w-xl mx-auto relative z-10">
        <ApiKeyManager />
      </div>
    </div>
  );
};

export default AnalysisPage;
