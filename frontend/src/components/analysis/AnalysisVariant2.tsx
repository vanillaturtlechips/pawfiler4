import { motion, AnimatePresence } from "framer-motion";
import GameButton from "@/components/GameButton";
import ApiKeyManager from "@/components/ApiKeyManager";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";

/**
 * Variant 2: Card Flip / Stage Transition
 * 풀스크린 스테이지 전환 – 업로드 → 분석중 → 결과
 */
const AnalysisVariant2 = () => {
  const a = useAnalysis();

  const currentView = a.report ? "result" : a.isAnalyzing ? "analyzing" : "upload";

  return (
    <div className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <div className="flex flex-col items-center px-4 pb-8">
        <AnimatePresence mode="wait">

          {/* ── UPLOAD STAGE ── */}
          {currentView === "upload" && (
            <motion.div
              key="upload"
              className="w-full max-w-lg flex flex-col items-center gap-6 pt-8"
              initial={{ opacity: 0, rotateY: -90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 90 }}
              transition={{ duration: 0.5 }}
              style={{ perspective: 1200 }}
            >
              <h1 className="font-jua text-4xl text-foreground text-shadow-glow">🔮 마법 구슬 분석기</h1>

              <input ref={a.fileInputRef} type="file" accept="video/*" onChange={a.handleInputChange} className="hidden" />

              <motion.div
                className="w-full rounded-3xl p-10 text-center cursor-pointer"
                style={{
                  background: a.isDragging
                    ? "linear-gradient(145deg, rgba(0,137,188,0.15), rgba(0,100,180,0.08))"
                    : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                  border: a.isDragging ? "3px dashed hsl(var(--magic-blue))" : "3px dashed rgba(255,255,255,0.15)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                }}
                whileHover={{ scale: 1.02, borderColor: "rgba(0,137,188,0.5)" }}
                onClick={() => a.fileInputRef.current?.click()}
                onDrop={a.handleDrop}
                onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
                onDragLeave={() => a.setIsDragging(false)}
              >
                {a.previewUrl ? (
                  <div>
                    <video src={a.previewUrl} className="w-full max-h-52 rounded-2xl object-contain mx-auto" controls onClick={(e) => e.stopPropagation()} />
                    <div className="mt-3 font-gothic text-sm text-foreground/50">
                      📹 {a.selectedFile?.name} ({((a.selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)
                    </div>
                  </div>
                ) : (
                  <>
                    <motion.div className="text-8xl mb-4" animate={{ y: [-8, 8, -8] }} transition={{ repeat: Infinity, duration: 3 }}>
                      📁
                    </motion.div>
                    <p className="font-jua text-xl text-foreground/80">영상을 여기에 드래그하세요</p>
                    <p className="font-gothic text-sm text-foreground/40 mt-2">mp4, mov, avi · 최대 {MAX_FILE_SIZE_MB}MB · 3분 이하 권장</p>
                  </>
                )}
              </motion.div>

              {a.fileError && (
                <div className="rounded-xl px-5 py-3 text-sm font-jua" style={{ background: "rgba(220,38,38,0.15)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.3)" }}>
                  ⚠️ {a.fileError}
                </div>
              )}

              {a.stage === "ERROR" && (
                <div className="text-center">
                  <p className="font-jua text-foreground/60 mb-3">분석에 실패했어요 😢</p>
                  <GameButton variant="green" onClick={a.handleReset}>🔄 다시 시도</GameButton>
                </div>
              )}

              <GameButton
                variant="blue"
                className={`text-xl w-full ${!a.selectedFile ? "opacity-40 pointer-events-none" : ""}`}
                onClick={a.handleAnalyze}
              >
                ✨ 마법 구슬아, 분석해줘!
              </GameButton>
            </motion.div>
          )}

          {/* ── ANALYZING STAGE ── */}
          {currentView === "analyzing" && (
            <motion.div
              key="analyzing"
              className="w-full max-w-md flex flex-col items-center gap-8 pt-16"
              initial={{ opacity: 0, rotateY: -90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 90 }}
              transition={{ duration: 0.5 }}
            >
              {/* Spinning orb with video inside */}
              <div className="relative">
                <motion.div
                  className="w-56 h-56 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    background: "radial-gradient(circle at 35% 30%, rgba(200,230,255,0.8), rgba(0,80,160,0.4))",
                    border: "6px solid rgba(255,255,255,0.2)",
                    boxShadow: "0 0 80px rgba(0,137,188,0.4), inset 0 0 50px rgba(255,255,255,0.15)",
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                >
                  {a.previewUrl && (
                    <video src={a.previewUrl} className="w-36 h-36 rounded-full object-cover opacity-60" autoPlay muted loop />
                  )}
                </motion.div>
                {/* Orbiting particles */}
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="absolute w-3 h-3 rounded-full"
                    style={{
                      background: "hsl(var(--magic-blue))",
                      boxShadow: "0 0 10px hsl(var(--magic-blue-glow))",
                      top: "50%", left: "50%",
                    }}
                    animate={{
                      x: [Math.cos(i * 2.09) * 130, Math.cos(i * 2.09 + Math.PI) * 130],
                      y: [Math.sin(i * 2.09) * 130, Math.sin(i * 2.09 + Math.PI) * 130],
                    }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.3, ease: "linear", repeatType: "reverse" }}
                  />
                ))}
              </div>

              <div className="text-center">
                <h2 className="font-jua text-2xl text-foreground text-shadow-deep">마법 구슬이 분석하고 있어요</h2>
                <p className="font-gothic text-sm text-foreground/40 mt-2">잠시만 기다려주세요...</p>
              </div>

              {/* Stage indicators */}
              <div className="flex gap-4">
                {STAGES.map((s, i) => (
                  <motion.div
                    key={s.key}
                    className="flex flex-col items-center gap-2"
                    animate={{ opacity: i <= a.currentStageIdx ? 1 : 0.3 }}
                  >
                    <motion.div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg"
                      style={{
                        background: i <= a.currentStageIdx
                          ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(199,97%,55%))"
                          : "rgba(255,255,255,0.05)",
                        border: i <= a.currentStageIdx ? "2px solid rgba(255,255,255,0.2)" : "2px solid rgba(255,255,255,0.05)",
                        boxShadow: i === a.currentStageIdx ? "0 0 20px rgba(0,137,188,0.4)" : "none",
                      }}
                      animate={i === a.currentStageIdx ? { scale: [1, 1.15, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      {i < a.currentStageIdx ? "✓" : s.icon}
                    </motion.div>
                    <span className="text-xs font-jua text-foreground/50">{s.label}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── RESULT STAGE ── */}
          {currentView === "result" && a.report && (
            <motion.div
              key="result"
              className="w-full max-w-2xl flex flex-col items-center gap-5 pt-6"
              initial={{ opacity: 0, rotateY: -90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 90 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="font-jua text-3xl text-foreground text-shadow-glow">📋 분석 보고서</h1>

              {/* Verdict */}
              <motion.div
                className="w-full rounded-3xl p-8 text-center"
                style={{
                  background: verdictConfig[a.report.finalVerdict].bg,
                  border: `3px solid ${verdictConfig[a.report.finalVerdict].border}`,
                  boxShadow: verdictConfig[a.report.finalVerdict].glow,
                  backdropFilter: "blur(20px)",
                }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              >
                <motion.span className="text-7xl block" animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                  {verdictConfig[a.report.finalVerdict].emoji}
                </motion.span>
                <div className="font-jua text-3xl mt-3" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                  {verdictConfig[a.report.finalVerdict].label}
                </div>
                <div className="font-jua text-6xl mt-1" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                  {(a.report.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs mt-2 text-foreground/40 font-gothic">종합 신뢰도</div>
              </motion.div>

              {/* Details */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                {a.report.visual && (
                  <GlassCard icon="🎬" title="영상 분석" verdict={a.report.visual.verdict === "FAKE" ? "AI 의심" : "실제"} isBad={a.report.visual.verdict === "FAKE"} confidence={a.report.visual.confidence} delay={0.3} />
                )}
                {a.report.audio && (
                  <GlassCard icon="🎙️" title="음성 분석" verdict={a.report.audio.isSynthetic ? "합성 의심" : "실제"} isBad={a.report.audio.isSynthetic} confidence={a.report.audio.confidence} delay={0.4} />
                )}
              </div>

              <div className="w-full flex gap-3">
                <GameButton variant="green" className="flex-1" onClick={() => a.navigate("/game")}>🎮 퀴즈</GameButton>
                <GameButton variant="blue" className="flex-1" onClick={a.handleShare}>🔗 공유</GameButton>
                <GameButton variant="blue" className="flex-1" onClick={a.handleSave}>💾 저장</GameButton>
              </div>
              <GameButton variant="green" onClick={a.handleReset}>🔄 새 분석 시작</GameButton>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-2xl mt-8">
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
};

const GlassCard = ({ icon, title, verdict, isBad, confidence, delay }: {
  icon: string; title: string; verdict: string; isBad: boolean; confidence: number; delay: number;
}) => (
  <motion.div
    className="rounded-2xl p-5"
    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="font-jua">{icon} {title}</span>
      <span className="text-xs font-jua px-3 py-1 rounded-full" style={{
        background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
        color: isBad ? "#fca5a5" : "#86efac",
      }}>{verdict}</span>
    </div>
    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <motion.div className="h-full rounded-full" style={{ background: isBad ? "linear-gradient(90deg,#ef4444,#f87171)" : "linear-gradient(90deg,#22c55e,#4ade80)" }}
        initial={{ width: 0 }} animate={{ width: `${(confidence * 100).toFixed(0)}%` }} transition={{ duration: 0.8, delay: delay + 0.1 }} />
    </div>
    <div className="text-right text-xs font-gothic mt-1 text-foreground/50">{(confidence * 100).toFixed(0)}%</div>
  </motion.div>
);

export default AnalysisVariant2;
