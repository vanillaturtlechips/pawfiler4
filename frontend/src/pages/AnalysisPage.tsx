import { motion, AnimatePresence } from "framer-motion";
import { useRef } from "react";
import GameButton from "@/components/GameButton";
import ApiKeyManager from "@/components/ApiKeyManager";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";

const AnalysisPage = () => {
  const a = useAnalysis();
  const containerRef = useRef<HTMLDivElement>(null);

  const fadeInUp = {
    initial: { opacity: 0, y: 40 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-50px" },
    transition: { duration: 0.6 },
  };

  return (
    <div ref={containerRef} className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
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
        <h1 className="font-jua text-5xl text-foreground text-shadow-glow leading-tight">
          마법 구슬<br />분석기
        </h1>
        <p className="font-gothic text-base text-foreground/50 mt-4 max-w-md">
          진짜 영상과 AI가 만든 가짜 영상을 구별하는<br />마법의 두루마리를 펼쳐보세요
        </p>
        <motion.div className="mt-8 text-foreground/30 text-2xl" animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          ↓
        </motion.div>
      </motion.section>

      {/* ── Section 2: Upload ── */}
      <motion.section className="flex flex-col items-center px-4 pb-16" {...fadeInUp}>
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg" style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}>1</div>
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
            onClick={() => !a.isAnalyzing && a.fileInputRef.current?.click()}
            onDrop={a.handleDrop}
            onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
            onDragLeave={() => a.setIsDragging(false)}
          >
            {a.previewUrl ? (
              <div>
                <video src={a.previewUrl} className="w-full max-h-56 rounded-2xl object-contain mx-auto" controls onClick={(e) => e.stopPropagation()} />
                <div className="mt-3 font-gothic text-sm text-foreground/40">
                  📹 {a.selectedFile?.name} ({((a.selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)
                </div>
              </div>
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
      <motion.section className="flex flex-col items-center px-4 pb-16" {...fadeInUp}>
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg" style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}>2</div>
            <h2 className="font-jua text-2xl text-foreground text-shadow-deep">✨ 분석 시작</h2>
          </div>

          {/* Progress */}
          {a.isAnalyzing && (
            <motion.div className="mb-5 rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex flex-col gap-3">
                {STAGES.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <motion.div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                      style={{
                        background: i <= a.currentStageIdx ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(199,97%,55%))" : "rgba(255,255,255,0.05)",
                        color: i <= a.currentStageIdx ? "white" : "rgba(255,255,255,0.2)",
                        boxShadow: i === a.currentStageIdx ? "0 0 15px rgba(0,137,188,0.4)" : "none",
                      }}
                      animate={i === a.currentStageIdx ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      {i < a.currentStageIdx ? "✓" : s.icon}
                    </motion.div>
                    <div className="flex-1">
                      <span className="text-sm font-jua" style={{ color: i <= a.currentStageIdx ? "hsl(var(--magic-blue))" : "rgba(255,255,255,0.2)" }}>{s.label}</span>
                      <div className="w-full h-1 rounded-full mt-1" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: "hsl(var(--magic-blue))" }}
                          animate={{ width: i <= a.currentStageIdx ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Analyze button — redesigned */}
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
            whileTap={a.selectedFile && !a.isAnalyzing ? { scale: 0.98, y: 1 } : {}}
            onClick={a.handleAnalyze}
          >
            {/* Shimmer effect */}
            {a.selectedFile && !a.isAnalyzing && (
              <motion.div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                }}
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 1 }}
              />
            )}
            {/* Pulse ring when analyzing */}
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

          {a.stage === "ERROR" && (
            <div className="mt-4 text-center">
              <p className="font-jua text-foreground/50 mb-3">분석에 실패했어요 😢</p>
              <GameButton variant="green" onClick={a.handleReset}>🔄 다시 시도</GameButton>
            </div>
          )}
        </div>
      </motion.section>

      {/* ── Section 4: Results ── */}
      <AnimatePresence>
        {a.report && (
          <>
            {/* Verdict */}
            <motion.section className="flex flex-col items-center px-4 pb-12" {...fadeInUp}>
              <div className="w-full max-w-lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg" style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}>3</div>
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
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring" }}
                >
                  <motion.span className="text-7xl block" animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                    {verdictConfig[a.report.finalVerdict].emoji}
                  </motion.span>
                  <div className="font-jua text-3xl mt-3" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                    {verdictConfig[a.report.finalVerdict].label}
                  </div>
                  <div className="font-jua text-6xl mt-1" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                    {(a.report.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs mt-2 text-foreground/30 font-gothic">종합 신뢰도</div>
                </motion.div>
              </div>
            </motion.section>

            {/* Detail */}
            <motion.section className="flex flex-col items-center px-4 pb-12" {...fadeInUp}>
              <div className="w-full max-w-lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg" style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}>4</div>
                  <h2 className="font-jua text-2xl text-foreground text-shadow-deep">🔍 상세 분석</h2>
                </div>

                <div className="flex flex-col gap-4">
                  {a.report.visual && (
                    <ScrollCard icon="🎬" title="영상 프레임" verdict={a.report.visual.verdict === "FAKE" ? "AI 의심" : "실제"} isBad={a.report.visual.verdict === "FAKE"} confidence={a.report.visual.confidence} sub={`${a.report.visual.framesAnalyzed}프레임 분석`} />
                  )}
                  {a.report.audio && (
                    <ScrollCard icon="🎙️" title="음성 분석" verdict={a.report.audio.isSynthetic ? "합성 의심" : "실제"} isBad={a.report.audio.isSynthetic} confidence={a.report.audio.confidence} />
                  )}
                  {a.report.explanation && (
                    <div className="rounded-2xl p-5" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <p className="font-jua text-sm mb-2">🤖 AI 의견</p>
                      <p className="font-gothic text-xs text-foreground/50 leading-relaxed">{(a.report as any).explanation}</p>
                    </div>
                  )}
                  <div className="rounded-xl p-3 text-xs text-foreground/25 font-gothic" style={{ background: "rgba(255,255,255,0.02)" }}>
                    ⏱ {(a.report.totalProcessingTimeMs / 1000).toFixed(1)}초 · 🖼 {a.report.visual?.framesAnalyzed || 0}프레임
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Actions */}
            <motion.section className="flex flex-col items-center px-4 pb-16" {...fadeInUp}>
              <div className="w-full max-w-lg flex flex-col gap-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg" style={{ background: "rgba(0,137,188,0.2)", color: "hsl(var(--magic-blue))" }}>5</div>
                  <h2 className="font-jua text-2xl text-foreground text-shadow-deep">🎯 다음은?</h2>
                </div>
                <GameButton variant="green" onClick={() => a.navigate("/game")}>🎮 관련 퀴즈 풀어보기</GameButton>
                <div className="flex gap-3">
                  <GameButton variant="blue" className="flex-1 text-base" onClick={a.handleShare}>🔗 공유</GameButton>
                  <GameButton variant="blue" className="flex-1 text-base" onClick={a.handleSave}>💾 저장</GameButton>
                </div>
                <GameButton variant="green" onClick={a.handleReset}>🔄 새 분석 시작</GameButton>
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

const ScrollCard = ({ icon, title, verdict, isBad, confidence, sub }: {
  icon: string; title: string; verdict: string; isBad: boolean; confidence: number; sub?: string;
}) => (
  <motion.div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
    initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
    <div className="flex items-center justify-between mb-3">
      <span className="font-jua">{icon} {title}</span>
      <span className="text-xs font-jua px-3 py-1 rounded-full" style={{
        background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
        color: isBad ? "#fca5a5" : "#86efac",
      }}>{verdict}</span>
    </div>
    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div className="h-full rounded-full" style={{ background: isBad ? "linear-gradient(90deg,#ef4444,#f87171)" : "linear-gradient(90deg,#22c55e,#4ade80)" }}
        initial={{ width: 0 }} whileInView={{ width: `${(confidence * 100).toFixed(0)}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }} />
    </div>
    <div className="flex justify-between mt-1.5 text-xs font-gothic">
      <span className="text-foreground/30">{sub || ""}</span>
      <span className="text-foreground/50">{(confidence * 100).toFixed(0)}%</span>
    </div>
  </motion.div>
);

export default AnalysisPage;
