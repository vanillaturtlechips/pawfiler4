import { motion, AnimatePresence } from "framer-motion";
import GameButton from "@/components/GameButton";
import ApiKeyManager from "@/components/ApiKeyManager";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";

/**
 * Variant 1: Fullscreen Center Focus
 * 구슬이 중앙에 크게 → 파일 드롭 시 위로 올라가며 결과가 아래로 펼쳐짐
 */
const AnalysisVariant1 = () => {
  const a = useAnalysis();
  const hasFile = !!a.selectedFile;

  return (
    <div className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <div className="flex flex-col items-center px-4 pb-8">

        {/* ── Crystal Ball ── */}
        <motion.div
          className="flex flex-col items-center cursor-pointer"
          animate={{
            marginTop: hasFile ? 20 : 120,
            scale: hasFile ? 0.7 : 1,
          }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          onClick={() => !a.isAnalyzing && a.fileInputRef.current?.click()}
          onDrop={a.handleDrop}
          onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
          onDragLeave={() => a.setIsDragging(false)}
        >
          <motion.div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 260,
              height: 260,
              background: a.isDragging
                ? "radial-gradient(circle at 40% 35%, rgba(180,230,255,0.9), rgba(0,137,188,0.4))"
                : a.stage === "ERROR"
                  ? "radial-gradient(circle at 40% 35%, rgba(255,200,200,0.7), rgba(220,38,38,0.3))"
                  : "radial-gradient(circle at 40% 35%, rgba(200,230,255,0.7), rgba(0,100,180,0.25))",
              border: a.isDragging ? "6px solid hsl(var(--magic-blue))" : "6px solid rgba(255,255,255,0.15)",
              boxShadow: a.isDragging
                ? "0 0 80px rgba(0,137,188,0.5), inset 0 0 60px rgba(255,255,255,0.2)"
                : "0 0 60px rgba(0,137,188,0.2), inset 0 0 40px rgba(255,255,255,0.1)",
            }}
            animate={a.isAnalyzing ? { rotate: [0, 360] } : { scale: [1, 1.03, 1] }}
            transition={a.isAnalyzing
              ? { repeat: Infinity, duration: 3, ease: "linear" }
              : { repeat: Infinity, duration: 4, ease: "easeInOut" }
            }
          >
            <span className="text-8xl select-none">
              {a.stage === "ERROR" ? "💔" : a.isAnalyzing ? "🌀" : "🔮"}
            </span>
            {/* Inner highlight */}
            <div
              className="absolute top-6 left-10 w-16 h-8 rounded-full opacity-40"
              style={{ background: "linear-gradient(180deg, white 0%, transparent 100%)" }}
            />
          </motion.div>

          {!hasFile && (
            <motion.div
              className="text-center mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="font-jua text-2xl text-foreground text-shadow-glow">
                마법 구슬을 클릭하세요
              </p>
              <p className="font-gothic text-sm text-foreground/50 mt-2">
                또는 영상 파일을 여기에 끌어놓으세요 · 최대 {MAX_FILE_SIZE_MB}MB
              </p>
            </motion.div>
          )}
        </motion.div>

        <input ref={a.fileInputRef} type="file" accept="video/*" onChange={a.handleInputChange} className="hidden" />

        {/* ── File info + Analyze button ── */}
        <AnimatePresence>
          {hasFile && !a.report && (
            <motion.div
              className="w-full max-w-xl flex flex-col items-center gap-4 mt-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {a.previewUrl && (
                <video src={a.previewUrl} className="w-full max-h-48 rounded-2xl object-contain" controls
                  style={{ border: "3px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}
                />
              )}
              <div className="font-gothic text-sm text-foreground/60">
                📹 {a.selectedFile?.name} ({((a.selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)
              </div>

              {/* Progress */}
              {a.isAnalyzing && (
                <div className="w-full flex items-center gap-2">
                  {STAGES.map((s, i) => (
                    <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
                      <motion.div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm"
                        style={{
                          background: i <= a.currentStageIdx
                            ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(199,97%,55%))"
                            : "rgba(255,255,255,0.08)",
                          color: i <= a.currentStageIdx ? "white" : "rgba(255,255,255,0.3)",
                          boxShadow: i === a.currentStageIdx ? "0 0 20px rgba(0,137,188,0.5)" : "none",
                        }}
                        animate={i === a.currentStageIdx ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      >
                        {i < a.currentStageIdx ? "✓" : s.icon}
                      </motion.div>
                      <span className="text-xs font-jua" style={{ color: i <= a.currentStageIdx ? "hsl(var(--magic-blue))" : "rgba(255,255,255,0.3)" }}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <GameButton
                variant="blue"
                className={`text-xl w-full max-w-sm ${a.isAnalyzing ? "opacity-50 pointer-events-none" : ""}`}
                onClick={a.handleAnalyze}
              >
                {a.isAnalyzing ? "⏳ 분석 중..." : "✨ 마법 구슬아, 분석해줘!"}
              </GameButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error ── */}
        <AnimatePresence>
          {a.fileError && (
            <motion.div className="mt-4 rounded-xl px-5 py-3 text-sm font-jua" style={{ background: "rgba(220,38,38,0.15)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.3)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              ⚠️ {a.fileError}
            </motion.div>
          )}
          {a.stage === "ERROR" && !a.report && (
            <motion.div className="mt-6 flex flex-col items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="font-jua text-foreground/60">분석에 실패했어요 😢</p>
              <GameButton variant="green" onClick={a.handleReset}>🔄 다시 시도</GameButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        <AnimatePresence>
          {a.report && (
            <motion.div
              className="w-full max-w-2xl flex flex-col gap-5 mt-2"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Verdict */}
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
                transition={{ type: "spring", stiffness: 200 }}
              >
                <motion.span className="text-7xl block" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
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

              {/* Detail cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {a.report.visual && (
                  <DetailCard icon="🎬" title="영상 분석"
                    verdict={a.report.visual.verdict === "FAKE" ? "AI 의심" : "실제"}
                    isBad={a.report.visual.verdict === "FAKE"}
                    confidence={a.report.visual.confidence}
                    sub={`프레임 ${a.report.visual.framesAnalyzed}개`}
                  />
                )}
                {a.report.audio && (
                  <DetailCard icon="🎙️" title="음성 분석"
                    verdict={a.report.audio.isSynthetic ? "합성 의심" : "실제"}
                    isBad={a.report.audio.isSynthetic}
                    confidence={a.report.audio.confidence}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <GameButton variant="green" className="flex-1" onClick={() => a.navigate("/game")}>🎮 퀴즈</GameButton>
                <GameButton variant="blue" className="flex-1" onClick={a.handleShare}>🔗 공유</GameButton>
                <GameButton variant="blue" className="flex-1" onClick={a.handleSave}>💾 저장</GameButton>
              </div>
              <GameButton variant="green" onClick={a.handleReset}>🔄 새 분석</GameButton>
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

const DetailCard = ({ icon, title, verdict, isBad, confidence, sub }: {
  icon: string; title: string; verdict: string; isBad: boolean; confidence: number; sub?: string;
}) => (
  <motion.div
    className="rounded-2xl p-5"
    style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      backdropFilter: "blur(10px)",
    }}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="font-jua text-base">{icon} {title}</span>
      <span className="text-xs font-jua px-3 py-1 rounded-full" style={{
        background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
        color: isBad ? "#fca5a5" : "#86efac",
      }}>{verdict}</span>
    </div>
    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <motion.div className="h-full rounded-full" style={{ background: isBad ? "linear-gradient(90deg,#ef4444,#f87171)" : "linear-gradient(90deg,#22c55e,#4ade80)" }}
        initial={{ width: 0 }} animate={{ width: `${(confidence * 100).toFixed(0)}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
    </div>
    <div className="flex justify-between mt-1.5 text-xs font-gothic">
      <span className="opacity-40">{sub || ""}</span>
      <span>{(confidence * 100).toFixed(0)}%</span>
    </div>
  </motion.div>
);

export default AnalysisVariant1;
