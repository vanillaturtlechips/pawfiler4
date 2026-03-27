import { motion, AnimatePresence } from "framer-motion";
import GameButton from "@/components/GameButton";
import ApiKeyManager from "@/components/ApiKeyManager";
import { useAnalysis, MAX_FILE_SIZE_MB, STAGES, verdictConfig } from "@/hooks/useAnalysis";

/**
 * Variant 3: Dashboard Style (Glassmorphism)
 * 영상 프리뷰 좌측 + 원형 게이지 + 분석 카드 우측 배치
 */
const AnalysisVariant3 = () => {
  const a = useAnalysis();

  return (
    <div className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <div className="px-4 pb-8 pt-4">
        {/* Header */}
        <motion.div className="flex items-center justify-between mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <h1 className="font-jua text-3xl text-foreground text-shadow-deep">🔮 딥페이크 분석</h1>
            <p className="font-gothic text-sm text-foreground/40 mt-1">AI 기반 영상 진위 판별 시스템</p>
          </div>
          {a.quota && (
            <div className="rounded-xl px-4 py-2 text-sm font-jua" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              📊 {a.quota.limit === -1 ? "👑 무제한" : `${a.quota.used}/${a.quota.limit} 사용`}
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
          {/* ── Left column: Upload + Video ── */}
          <div className="flex flex-col gap-4">
            <input ref={a.fileInputRef} type="file" accept="video/*" onChange={a.handleInputChange} className="hidden" />

            {/* Upload / Preview card */}
            <motion.div
              className="rounded-2xl overflow-hidden cursor-pointer"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: a.isDragging ? "2px solid hsl(var(--magic-blue))" : "2px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                minHeight: 280,
              }}
              whileHover={{ borderColor: "rgba(0,137,188,0.4)" }}
              onClick={() => !a.isAnalyzing && !a.previewUrl && a.fileInputRef.current?.click()}
              onDrop={a.handleDrop}
              onDragOver={(e) => { e.preventDefault(); a.setIsDragging(true); }}
              onDragLeave={() => a.setIsDragging(false)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {a.previewUrl ? (
                <div className="p-4">
                  <video src={a.previewUrl} className="w-full rounded-xl object-contain" style={{ maxHeight: 250 }} controls />
                  <div className="flex items-center justify-between mt-3 px-1">
                    <span className="font-gothic text-xs text-foreground/40 truncate max-w-[60%]">📹 {a.selectedFile?.name}</span>
                    <button className="font-jua text-xs px-3 py-1 rounded-lg text-foreground/60 hover:text-foreground/80" style={{ background: "rgba(255,255,255,0.05)" }}
                      onClick={(e) => { e.stopPropagation(); a.fileInputRef.current?.click(); }}>
                      변경
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-14 px-6">
                  <motion.div className="text-6xl mb-4" animate={{ y: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 3 }}>
                    🎬
                  </motion.div>
                  <p className="font-jua text-lg text-foreground/70">영상 파일을 업로드하세요</p>
                  <p className="font-gothic text-xs text-foreground/30 mt-2">드래그 앤 드롭 · 최대 {MAX_FILE_SIZE_MB}MB</p>
                </div>
              )}
            </motion.div>

            {a.fileError && (
              <div className="rounded-xl px-4 py-2.5 text-sm font-jua" style={{ background: "rgba(220,38,38,0.1)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.2)" }}>
                ⚠️ {a.fileError}
              </div>
            )}

            {/* Progress */}
            {a.isAnalyzing && (
              <motion.div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-3">
                  {STAGES.map((s, i) => (
                    <div key={s.key} className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <motion.span className="text-sm"
                          animate={i === a.currentStageIdx ? { scale: [1, 1.3, 1] } : {}}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >{i < a.currentStageIdx ? "✅" : s.icon}</motion.span>
                        <span className="text-xs font-jua" style={{ color: i <= a.currentStageIdx ? "hsl(var(--magic-blue))" : "rgba(255,255,255,0.2)" }}>{s.label}</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: "hsl(var(--magic-blue))" }}
                          animate={{ width: i <= a.currentStageIdx ? "100%" : "0%" }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <GameButton
              variant="blue"
              className={`text-lg ${!a.selectedFile || a.isAnalyzing ? "opacity-40 pointer-events-none" : ""}`}
              onClick={a.handleAnalyze}
            >
              {a.isAnalyzing ? "⏳ 분석 중..." : "✨ 분석 시작"}
            </GameButton>

            {a.stage === "ERROR" && (
              <GameButton variant="green" onClick={a.handleReset}>🔄 다시 시도</GameButton>
            )}
          </div>

          {/* ── Right column: Results ── */}
          <div className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {a.report ? (
                <motion.div key="result" className="flex flex-col gap-4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  {/* Main gauge */}
                  <motion.div
                    className="rounded-2xl p-6 flex items-center gap-6"
                    style={{
                      background: verdictConfig[a.report.finalVerdict].bg,
                      border: `2px solid ${verdictConfig[a.report.finalVerdict].border}`,
                      boxShadow: verdictConfig[a.report.finalVerdict].glow,
                      backdropFilter: "blur(20px)",
                    }}
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                  >
                    {/* Circular gauge */}
                    <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                        <motion.circle
                          cx="60" cy="60" r="50" fill="none"
                          stroke={verdictConfig[a.report.finalVerdict].border}
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={314}
                          initial={{ strokeDashoffset: 314 }}
                          animate={{ strokeDashoffset: 314 * (1 - a.report.confidence) }}
                          transition={{ duration: 1.5, delay: 0.3 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl">{verdictConfig[a.report.finalVerdict].emoji}</span>
                        <span className="font-jua text-lg" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                          {(a.report.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="font-jua text-2xl" style={{ color: verdictConfig[a.report.finalVerdict].border }}>
                        {verdictConfig[a.report.finalVerdict].label}
                      </div>
                      <div className="font-gothic text-xs text-foreground/40 mt-1">종합 판정 결과</div>
                      <div className="font-gothic text-xs text-foreground/30 mt-2">
                        ⏱ {(a.report.totalProcessingTimeMs / 1000).toFixed(1)}초 · 🖼 {a.report.visual?.framesAnalyzed || 0}프레임
                      </div>
                    </div>
                  </motion.div>

                  {/* Sub cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {a.report.visual && (
                      <DashCard icon="🎬" title="영상" verdict={a.report.visual.verdict === "FAKE" ? "AI 의심" : "실제"} isBad={a.report.visual.verdict === "FAKE"} confidence={a.report.visual.confidence} />
                    )}
                    {a.report.audio && (
                      <DashCard icon="🎙️" title="음성" verdict={a.report.audio.isSynthetic ? "합성" : "실제"} isBad={a.report.audio.isSynthetic} confidence={a.report.audio.confidence} />
                    )}
                  </div>

                  {(a.report as any).explanation && (
                    <div className="rounded-2xl p-4" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", backdropFilter: "blur(10px)" }}>
                      <p className="font-jua text-sm mb-1">🤖 AI 의견</p>
                      <p className="font-gothic text-xs text-foreground/60 leading-relaxed">{(a.report as any).explanation}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <GameButton variant="green" className="flex-1 text-base" onClick={() => a.navigate("/game")}>🎮 퀴즈</GameButton>
                    <GameButton variant="blue" className="flex-1 text-base" onClick={a.handleShare}>🔗 공유</GameButton>
                    <GameButton variant="blue" className="flex-1 text-base" onClick={a.handleSave}>💾 저장</GameButton>
                  </div>
                  <GameButton variant="green" onClick={a.handleReset}>🔄 새 분석</GameButton>
                </motion.div>
              ) : (
                <motion.div key="empty" className="flex flex-col items-center justify-center rounded-2xl py-20" style={{ background: "rgba(255,255,255,0.02)", border: "2px dashed rgba(255,255,255,0.06)", minHeight: 400 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <motion.div className="text-7xl mb-4" animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 3 }}>
                    📊
                  </motion.div>
                  <p className="font-jua text-xl text-foreground/30">분석 결과가 여기에 표시돼요</p>
                  <p className="font-gothic text-xs text-foreground/20 mt-2">영상을 업로드하고 분석을 시작하세요</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6">
          <ApiKeyManager />
        </div>
      </div>
    </div>
  );
};

const DashCard = ({ icon, title, verdict, isBad, confidence }: {
  icon: string; title: string; verdict: string; isBad: boolean; confidence: number;
}) => (
  <motion.div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="flex items-center justify-between mb-2">
      <span className="font-jua text-sm">{icon} {title}</span>
      <span className="text-xs font-jua px-2 py-0.5 rounded-full" style={{
        background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
        color: isBad ? "#fca5a5" : "#86efac",
      }}>{verdict}</span>
    </div>
    <div className="font-jua text-2xl" style={{ color: isBad ? "#f87171" : "#4ade80" }}>
      {(confidence * 100).toFixed(0)}%
    </div>
    <div className="w-full h-1.5 rounded-full mt-2" style={{ background: "rgba(255,255,255,0.05)" }}>
      <motion.div className="h-full rounded-full" style={{ background: isBad ? "#ef4444" : "#22c55e" }}
        initial={{ width: 0 }} animate={{ width: `${(confidence * 100).toFixed(0)}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
    </div>
  </motion.div>
);

export default AnalysisVariant3;
