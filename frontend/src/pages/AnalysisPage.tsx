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

const STAGES: { key: AnalysisStage; label: string }[] = [
  { key: "UPLOADING", label: "업로드" },
  { key: "MCP_CONNECTING", label: "연결" },
  { key: "SAGEMAKER_PROCESSING", label: "AI 분석" },
  { key: "COMPLETED", label: "완료" },
];

const stageIndex = (stage: AnalysisStage) =>
  STAGES.findIndex((s) => s.key === stage);

const verdictConfig = {
  FAKE: { emoji: "🚨", label: "AI 생성 영상", color: "hsl(var(--destructive))" },
  REAL: { emoji: "✅", label: "실제 영상", color: "hsl(var(--magic-green))" },
  UNCERTAIN: { emoji: "🤔", label: "불확실", color: "hsl(var(--magic-orange))" },
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
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleAnalyze = async () => {
    if (!token || !selectedFile) return;
    setReport(null);
    setStage("UPLOADING");
    try {
      const basicResult = await runVideoAnalysis(selectedFile);
      setStage("SAGEMAKER_PROCESSING");
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
    const text = `PawFiler 영상 분석 결과: ${verdict.label} (${(report.confidence * 100).toFixed(0)}%)${report.visual?.aiModel ? ` — ${report.visual.aiModel.modelName}` : ""}`;
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
      <motion.div
        className="grid grid-cols-[1.2fr_1fr] gap-7 items-start p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Left panel */}
        <ParchmentPanel className="flex flex-col gap-5">
          <h2 className="font-jua text-4xl" style={{ color: "hsl(var(--wood-darkest))" }}>
            🔮 마법 구슬 분석기
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: "hsl(var(--wood-dark))" }}>
            AI가 만든 영상인지 확인하고 싶은 파일을 올려주세요!
          </p>

          {/* Drop zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleInputChange}
            className="hidden"
          />
          <motion.div
            className="cursor-pointer rounded-2xl bg-white p-6 text-center"
            style={{ border: "4px dashed hsl(var(--parchment-border))" }}
            whileHover={{ borderColor: "hsl(199,97%,37%)", backgroundColor: "#E1F5FE", scale: 1.02 }}
            onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {previewUrl ? (
              <video
                src={previewUrl}
                className="w-full max-h-40 rounded-xl object-contain"
                controls
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <motion.div
                  className="text-6xl"
                  animate={{ y: [-3, 3, -3] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                >
                  ☁️
                </motion.div>
                <div className="font-jua text-xl mt-2.5" style={{ color: "hsl(var(--wood-darkest))" }}>
                  영상 파일 끌어놓기 또는 클릭
                </div>
                <div className="text-sm mt-1 opacity-60" style={{ color: "hsl(var(--wood-dark))" }}>
                  최대 {MAX_FILE_SIZE_MB}MB · 3분 이하 권장 · mp4, mov, avi
                </div>
              </>
            )}
          </motion.div>

          {selectedFile && (
            <div className="text-sm font-gothic opacity-70 truncate" style={{ color: "hsl(var(--wood-dark))" }}>
              📹 {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
            </div>
          )}

          {/* 횟수 표시 */}
          {quota && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-2 text-sm font-jua"
              style={{ background: "white", border: "2px solid hsl(var(--parchment-border))" }}
            >
              <span style={{ color: "hsl(var(--wood-dark))" }}>이번 달 분석 횟수</span>
              <span style={{ color: quota.remaining === 0 ? "hsl(var(--destructive))" : "hsl(var(--magic-green))" }}>
                {quota.used} / {quota.limit}
                {quota.remaining === 0 && " (소진)"}
              </span>
            </div>
          )}

          {fileError && (
            <div className="rounded-xl p-3 bg-red-100 border-2 border-red-400 text-sm font-jua text-red-700">
              ⚠️ {fileError}
            </div>
          )}

          {/* Progress bar */}
          {isAnalyzing && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                {STAGES.map((s, i) => (
                  <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500"
                      style={{
                        background: i <= currentStageIdx ? "hsl(199,97%,37%)" : "hsl(var(--parchment-border))",
                        color: i <= currentStageIdx ? "white" : "hsl(var(--wood-dark))",
                      }}
                    >
                      {i < currentStageIdx ? "✓" : i + 1}
                    </div>
                    <span className="text-xs font-jua" style={{ color: "hsl(var(--wood-dark))" }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-full h-2 rounded-full bg-white/50 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "hsl(199,97%,37%)" }}
                  animate={{ width: `${((currentStageIdx + 1) / STAGES.length) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          )}

          <GameButton
            variant="blue"
            className={`text-2xl ${!selectedFile || isAnalyzing ? "opacity-50 pointer-events-none" : ""}`}
            onClick={handleAnalyze}
          >
            {isAnalyzing ? "⏳ 분석 중..." : "✨ 마법 구슬아, 분석해줘!"}
          </GameButton>
        </ParchmentPanel>

        {/* Right panel */}
        <WoodPanel className="flex flex-col" style={{ minHeight: "600px" }}>
          <AnimatePresence mode="wait">
            {report ? (
              <motion.div
                key="report"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col gap-4 flex-1 overflow-y-auto"
              >
                <h2 className="font-jua text-2xl text-shadow-deep">📋 분석 보고서</h2>

                {/* 최종 판정 */}
                <div className="text-center py-4">
                  <span className="text-6xl">{verdictConfig[report.finalVerdict]?.emoji}</span>
                  <div className="font-jua text-3xl mt-2" style={{ color: verdictConfig[report.finalVerdict]?.color }}>
                    {verdictConfig[report.finalVerdict]?.label}
                  </div>
                  <div className="font-jua text-5xl mt-1" style={{ color: verdictConfig[report.finalVerdict]?.color }}>
                    {(report.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                {report.warnings.length > 0 && (
                  <div className="rounded-xl p-3 bg-yellow-100 border-2 border-yellow-400">
                    {report.warnings.map((w, i) => (
                      <div key={i} className="text-sm font-jua" style={{ color: "hsl(var(--wood-darkest))" }}>⚠️ {w}</div>
                    ))}
                  </div>
                )}

                {report.visual?.aiModel && <AIModelCard prediction={report.visual.aiModel} />}
                {report.audio && <AudioPanel audio={report.audio} />}
                {report.visual?.frames && report.visual.frames.length > 0 && (
                  <FrameTimeline frames={report.visual.frames} />
                )}

                <div className="rounded-xl p-3 text-xs opacity-70" style={{ background: "hsl(var(--wood-dark))" }}>
                  <div>프레임 분석: {report.visual?.framesAnalyzed || 0}개</div>
                  <div>처리 시간: {(report.totalProcessingTimeMs / 1000).toFixed(1)}초</div>
                </div>

                {/* 퀴즈 연동 */}
                <GameButton variant="green" onClick={() => navigate("/game")}>
                  🎮 관련 퀴즈 풀어보기
                </GameButton>

                {/* 공유/저장 */}
                <div className="flex gap-2">
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
                className="flex flex-1 flex-col items-center justify-center text-center"
              >
                <h2 className="font-jua text-3xl mb-7 text-shadow-deep">
                  {stage === "ERROR" ? "분석 실패 😢" : "결과 대기 중..."}
                </h2>
                <motion.div
                  className="flex items-center justify-center rounded-full text-8xl mb-7"
                  style={{
                    width: 220, height: 220,
                    background: stage === "ERROR"
                      ? "radial-gradient(circle, #FFEBEE, hsl(var(--destructive)))"
                      : "radial-gradient(circle, #E1F5FE, hsl(199,97%,37%))",
                    border: "10px solid #B3E5FC",
                    boxShadow: "0 0 60px hsl(199,97%,37%)",
                  }}
                  animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                >
                  {stage === "ERROR" ? "!" : "?"}
                </motion.div>
                {stage === "ERROR" && (
                  <GameButton variant="green" onClick={handleReset}>🔄 다시 시도</GameButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </WoodPanel>
      </motion.div>

      {/* API 키 관리 섹션 */}
      <div className="px-6 pb-6">
        <ApiKeyManager />
      </div>
    </div>
  );
};

export default AnalysisPage;
