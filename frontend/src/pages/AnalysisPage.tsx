import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import AIModelCard from "@/components/AIModelCard";
import AudioPanel from "@/components/AudioPanel";
import FrameTimeline from "@/components/FrameTimeline";
import ApiKeyManager from "@/components/ApiKeyManager";
import { useAuth } from "@/contexts/AuthContext";
import { runVideoAnalysis, getUnifiedResult, fetchAnalysisQuota, type AnalysisQuota } from "@/lib/api";
import type { AnalysisStage, UnifiedReport } from "@/lib/types";
import { useNavigate } from "react-router-dom";

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const STAGES: { key: AnalysisStage; label: string; icon: string }[] = [
  { key: "UPLOADING", label: "업로드", icon: "📤" },
  { key: "MCP_CONNECTING", label: "연결", icon: "🔗" },
  { key: "SAGEMAKER_PROCESSING", label: "AI 분석", icon: "🧠" },
  { key: "COMPLETED", label: "완료", icon: "✅" },
];

const stageIndex = (stage: AnalysisStage) =>
  STAGES.findIndex((s) => s.key === stage);

const verdictConfig = {
  FAKE: { emoji: "🚨", label: "AI 생성 영상", bg: "rgba(220,38,38,0.12)", border: "hsl(var(--destructive))", glow: "0 0 40px rgba(220,38,38,0.3)" },
  REAL: { emoji: "✅", label: "실제 영상", bg: "rgba(34,197,94,0.12)", border: "hsl(var(--magic-green))", glow: "0 0 40px rgba(34,197,94,0.3)" },
  UNCERTAIN: { emoji: "🤔", label: "불확실", bg: "rgba(234,179,8,0.12)", border: "hsl(var(--magic-orange))", glow: "0 0 40px rgba(234,179,8,0.3)" },
};

const AnalysisPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<AnalysisStage>("IDLE");
  const [report, setReport] = useState<UnifiedReport | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [quota, setQuota] = useState<AnalysisQuota | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.id) fetchAnalysisQuota(user.id).then(setQuota);
  }, [user?.id]);

  const handleFileSelect = useCallback((file: File) => {
    setFileError(null);
    if (!file.type.startsWith("video/")) {
      setFileError("영상 파일만 업로드할 수 있어요 (mp4, mov 등)");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 해요`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setReport(null);
    setStage("IDLE");
  }, [previewUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleAnalyze = async () => {
    if (!token || !selectedFile) return;
    setReport(null);
    setStage("UPLOADING");
    try {
      const basicResult = await runVideoAnalysis(selectedFile, (s: string) => setStage(s as AnalysisStage));
      const unified = await getUnifiedResult(basicResult.taskId);
      setStage("COMPLETED");
      setReport(unified);
    } catch {
      setStage("ERROR");
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setReport(null);
    setStage("IDLE");
    setFileError(null);
  };

  const handleSave = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${report.taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!report) return;
    const verdict = verdictConfig[report.finalVerdict];
    const text = `PawFiler 영상 분석 결과: ${verdict.label} (${(report.confidence * 100).toFixed(0)}%)`;
    if (navigator.share) {
      await navigator.share({ title: "PawFiler 분석 결과", text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("결과가 클립보드에 복사됐어요!");
    }
  };

  const isAnalyzing = stage !== "IDLE" && stage !== "COMPLETED" && stage !== "ERROR";
  const currentStageIdx = stageIndex(stage);

  return (
    <div className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      {/* Page header */}
      <motion.div
        className="text-center pt-4 pb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="font-jua text-5xl text-foreground text-shadow-glow">
          🔮 마법 구슬 분석기
        </h1>
        <p className="font-gothic text-base mt-2 text-foreground/60">
          AI가 만든 영상인지, 진짜 영상인지 마법의 힘으로 판별해드려요
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 px-4 pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {/* ── Left: Upload Panel ── */}
        <div className="flex flex-col gap-5">
          <ParchmentPanel className="flex flex-col gap-5">
            {/* Drop zone */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleInputChange}
              className="hidden"
            />
            <motion.div
              className="relative cursor-pointer rounded-2xl p-8 text-center transition-colors"
              style={{
                background: isDragging
                  ? "linear-gradient(135deg, rgba(0,137,188,0.08), rgba(0,137,188,0.15))"
                  : previewUrl
                    ? "rgba(255,255,255,0.6)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.6))",
                border: isDragging
                  ? "3px dashed hsl(var(--magic-blue))"
                  : "3px dashed hsl(var(--parchment-border))",
                boxShadow: isDragging ? "inset 0 0 30px rgba(0,137,188,0.1)" : "none",
              }}
              whileHover={{ scale: 1.01, borderColor: "hsl(199,97%,50%)" }}
              onClick={() => !isAnalyzing && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
            >
              {previewUrl ? (
                <div className="relative">
                  <video
                    src={previewUrl}
                    className="w-full max-h-48 rounded-xl object-contain mx-auto"
                    controls
                    onClick={(e) => e.stopPropagation()}
                  />
                  {selectedFile && (
                    <motion.div
                      className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-gothic"
                      style={{
                        background: "hsl(var(--parchment))",
                        border: "2px solid hsl(var(--parchment-border))",
                        color: "hsl(var(--wood-dark))",
                      }}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      📹 {selectedFile.name}
                      <span className="opacity-50">({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)</span>
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="py-4">
                  <motion.div
                    className="text-7xl mb-3"
                    animate={{ y: [-5, 5, -5], rotate: [0, 3, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  >
                    ☁️
                  </motion.div>
                  <div className="font-jua text-xl" style={{ color: "hsl(var(--wood-darkest))" }}>
                    영상 파일을 끌어놓거나 클릭하세요
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-3 text-xs font-gothic" style={{ color: "hsl(var(--wood-light))" }}>
                    <span className="flex items-center gap-1 rounded-full px-3 py-1" style={{ background: "rgba(0,0,0,0.04)" }}>
                      📏 최대 {MAX_FILE_SIZE_MB}MB
                    </span>
                    <span className="flex items-center gap-1 rounded-full px-3 py-1" style={{ background: "rgba(0,0,0,0.04)" }}>
                      ⏱ 3분 이하 권장
                    </span>
                    <span className="flex items-center gap-1 rounded-full px-3 py-1" style={{ background: "rgba(0,0,0,0.04)" }}>
                      🎞 mp4 · mov · avi
                    </span>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Quota */}
            {quota && (
              <motion.div
                className="flex items-center justify-between rounded-xl px-5 py-3 text-sm font-jua"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.5))",
                  border: "2px solid hsl(var(--parchment-border))",
                }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <span style={{ color: "hsl(var(--wood-dark))" }}>📊 이번 달 분석 횟수</span>
                {quota.limit === -1 ? (
                  <span className="flex items-center gap-1" style={{ color: "hsl(var(--magic-green))" }}>
                    👑 무제한 <span className="text-xs opacity-60">(프리미엄)</span>
                  </span>
                ) : (
                  <span style={{ color: quota.remaining === 0 ? "hsl(var(--destructive))" : "hsl(var(--magic-green))" }}>
                    {quota.used} / {quota.limit}
                    {quota.remaining === 0 && <span className="text-xs ml-1 opacity-70"> — 코인 10개로 추가 분석</span>}
                  </span>
                )}
              </motion.div>
            )}

            {/* Error */}
            <AnimatePresence>
              {fileError && (
                <motion.div
                  className="rounded-xl p-4 text-sm font-jua flex items-center gap-2"
                  style={{
                    background: "rgba(220,38,38,0.08)",
                    border: "2px solid rgba(220,38,38,0.3)",
                    color: "hsl(var(--destructive))",
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <span className="text-lg">⚠️</span> {fileError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress steps */}
            <AnimatePresence>
              {isAnalyzing && (
                <motion.div
                  className="flex flex-col gap-3 rounded-xl p-5"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))",
                    border: "2px solid hsl(var(--parchment-border))",
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex justify-between relative">
                    {/* Connecting line */}
                    <div
                      className="absolute top-4 left-0 right-0 h-0.5 mx-8"
                      style={{ background: "hsl(var(--parchment-border))" }}
                    />
                    <motion.div
                      className="absolute top-4 left-0 h-0.5 mx-8"
                      style={{ background: "hsl(var(--magic-blue))" }}
                      animate={{ width: `${((currentStageIdx) / (STAGES.length - 1)) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                    {STAGES.map((s, i) => (
                      <motion.div
                        key={s.key}
                        className="flex flex-col items-center gap-1.5 z-10 flex-1"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: i <= currentStageIdx ? 1 : 0.85 }}
                      >
                        <motion.div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{
                            background: i <= currentStageIdx
                              ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(199,97%,50%))"
                              : "hsl(var(--parchment-border))",
                            color: i <= currentStageIdx ? "white" : "hsl(var(--wood-light))",
                            boxShadow: i <= currentStageIdx ? "0 4px 12px rgba(0,137,188,0.3)" : "none",
                          }}
                          animate={i === currentStageIdx ? { scale: [1, 1.15, 1] } : {}}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                          {i < currentStageIdx ? "✓" : s.icon}
                        </motion.div>
                        <span
                          className="text-xs font-jua"
                          style={{
                            color: i <= currentStageIdx ? "hsl(var(--magic-blue))" : "hsl(var(--wood-light))",
                          }}
                        >
                          {s.label}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Analyze button */}
            <GameButton
              variant="blue"
              className={`text-2xl ${!selectedFile || isAnalyzing ? "opacity-50 pointer-events-none" : ""}`}
              onClick={handleAnalyze}
            >
              {isAnalyzing ? "⏳ 분석 중..." : "✨ 마법 구슬아, 분석해줘!"}
            </GameButton>
          </ParchmentPanel>
        </div>

        {/* ── Right: Result Panel ── */}
        <WoodPanel className="flex flex-col" style={{ minHeight: "500px" }}>
          <AnimatePresence mode="wait">
            {report ? (
              <motion.div
                key="report"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col gap-4 flex-1 overflow-y-auto"
              >
                <h2 className="font-jua text-2xl text-shadow-deep">📋 분석 보고서</h2>

                {/* Verdict card */}
                <motion.div
                  className="rounded-2xl p-6 text-center"
                  style={{
                    background: verdictConfig[report.finalVerdict].bg,
                    border: `3px solid ${verdictConfig[report.finalVerdict].border}`,
                    boxShadow: verdictConfig[report.finalVerdict].glow,
                  }}
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <motion.div
                    className="text-6xl mb-2"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    {verdictConfig[report.finalVerdict].emoji}
                  </motion.div>
                  <div className="font-jua text-2xl" style={{ color: verdictConfig[report.finalVerdict].border }}>
                    {verdictConfig[report.finalVerdict].label}
                  </div>
                  <div className="font-jua text-5xl mt-1" style={{ color: verdictConfig[report.finalVerdict].border }}>
                    {(report.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs mt-2 opacity-50 font-gothic">종합 신뢰도</div>
                </motion.div>

                {/* Visual analysis */}
                {report.visual && (
                  <AnalysisSectionCard
                    icon="🎬"
                    title="영상 프레임 분석"
                    verdict={report.visual.verdict === "FAKE" ? "AI 생성 의심" : report.visual.verdict === "REAL" ? "실제 영상" : "불확실"}
                    isBad={report.visual.verdict === "FAKE"}
                    confidence={report.visual.confidence}
                    extra={<span className="text-xs opacity-40 font-gothic">분석 프레임: {report.visual.framesAnalyzed}개</span>}
                  />
                )}

                {/* Audio analysis */}
                {report.audio && (
                  <AnalysisSectionCard
                    icon="🎙️"
                    title="음성 분석"
                    verdict={report.audio.isSynthetic ? "합성 음성 의심" : "실제 음성"}
                    isBad={report.audio.isSynthetic}
                    confidence={report.audio.confidence}
                  />
                )}

                {/* AI explanation */}
                {(report as any).explanation && (
                  <motion.div
                    className="rounded-xl p-4"
                    style={{
                      background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.05))",
                      border: "1px solid rgba(99,102,241,0.25)",
                    }}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🤖</span>
                      <span className="font-jua text-base">AI 분석 의견</span>
                    </div>
                    <p className="text-sm leading-relaxed opacity-80 font-gothic">{(report as any).explanation}</p>
                  </motion.div>
                )}

                {/* Meta info */}
                <div
                  className="rounded-xl p-3 text-xs opacity-40 flex items-center gap-4 font-gothic"
                  style={{ background: "rgba(0,0,0,0.15)" }}
                >
                  <span>⏱ 처리 시간: {(report.totalProcessingTimeMs / 1000).toFixed(1)}초</span>
                  <span>🖼 분석 프레임: {report.visual?.framesAnalyzed || 0}개</span>
                </div>

                {/* Actions */}
                <GameButton variant="green" onClick={() => navigate("/game")}>
                  🎮 관련 퀴즈 풀어보기
                </GameButton>
                <div className="flex gap-3">
                  <GameButton variant="blue" className="flex-1 text-base" onClick={handleShare}>
                    🔗 공유
                  </GameButton>
                  <GameButton variant="blue" className="flex-1 text-base" onClick={handleSave}>
                    💾 저장
                  </GameButton>
                </div>
                <GameButton variant="green" onClick={handleReset}>
                  🔄 새 분석 시작
                </GameButton>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center text-center gap-6"
              >
                <h2 className="font-jua text-2xl text-shadow-deep">
                  {stage === "ERROR" ? "분석에 실패했어요 😢" : "마법 구슬이 기다리고 있어요"}
                </h2>
                <motion.div
                  className="flex items-center justify-center rounded-full text-8xl"
                  style={{
                    width: 200,
                    height: 200,
                    background: stage === "ERROR"
                      ? "radial-gradient(circle at 40% 40%, rgba(255,200,200,0.6), rgba(220,38,38,0.2))"
                      : "radial-gradient(circle at 40% 40%, rgba(200,230,255,0.6), rgba(0,137,188,0.2))",
                    border: stage === "ERROR" ? "6px solid rgba(220,38,38,0.3)" : "6px solid rgba(0,137,188,0.2)",
                    boxShadow: stage === "ERROR"
                      ? "0 0 60px rgba(220,38,38,0.2), inset 0 0 40px rgba(255,255,255,0.1)"
                      : "0 0 60px rgba(0,137,188,0.2), inset 0 0 40px rgba(255,255,255,0.15)",
                  }}
                  animate={{
                    scale: [1, 1.04, 1],
                    rotate: [0, 3, -3, 0],
                  }}
                  transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                >
                  {stage === "ERROR" ? "💔" : "🔮"}
                </motion.div>
                <p className="text-sm font-gothic opacity-40 max-w-xs">
                  {stage === "ERROR"
                    ? "네트워크 오류 또는 서버 문제일 수 있어요. 다시 시도해보세요."
                    : "왼쪽에서 영상 파일을 올리면 마법 구슬이 분석을 시작해요!"}
                </p>
                {stage === "ERROR" && (
                  <GameButton variant="green" onClick={handleReset}>
                    🔄 다시 시도
                  </GameButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </WoodPanel>
      </motion.div>

      {/* API Key Manager */}
      <div className="px-4 pb-8">
        <ApiKeyManager />
      </div>
    </div>
  );
};

/* ── Reusable analysis section card ── */
const AnalysisSectionCard = ({
  icon,
  title,
  verdict,
  isBad,
  confidence,
  extra,
}: {
  icon: string;
  title: string;
  verdict: string;
  isBad: boolean;
  confidence: number;
  extra?: React.ReactNode;
}) => (
  <motion.div
    className="rounded-xl p-4"
    style={{
      background: "rgba(0,0,0,0.15)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}
    initial={{ opacity: 0, x: 10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 0.15 }}
  >
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="font-jua text-base">{title}</span>
      </div>
      <span
        className="font-jua text-xs px-3 py-1 rounded-full"
        style={{
          background: isBad ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.2)",
          color: isBad ? "#fca5a5" : "#86efac",
          border: `1px solid ${isBad ? "rgba(220,38,38,0.3)" : "rgba(34,197,94,0.3)"}`,
        }}
      >
        {verdict}
      </span>
    </div>
    {/* Confidence bar */}
    <div className="flex justify-between text-xs mb-1.5 font-gothic">
      <span className="opacity-50">신뢰도</span>
      <span className="font-bold">{(confidence * 100).toFixed(0)}%</span>
    </div>
    <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{
          background: isBad
            ? "linear-gradient(90deg, #ef4444, #f87171)"
            : "linear-gradient(90deg, #22c55e, #4ade80)",
        }}
        initial={{ width: 0 }}
        animate={{ width: `${(confidence * 100).toFixed(0)}%` }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
    </div>
    {extra && <div className="mt-2">{extra}</div>}
  </motion.div>
);

export default AnalysisPage;
