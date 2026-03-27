import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { runVideoAnalysis, getUnifiedResult, fetchAnalysisQuota, type AnalysisQuota } from "@/lib/api";
import { config } from "@/lib/config";
import type { AnalysisStage, UnifiedReport } from "@/lib/types";

export const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const STAGES: { key: AnalysisStage; label: string; icon: string }[] = [
  { key: "UPLOADING", label: "업로드", icon: "📤" },
  { key: "MCP_CONNECTING", label: "연결", icon: "🔗" },
  { key: "SAGEMAKER_PROCESSING", label: "AI 분석", icon: "🧠" },
  { key: "COMPLETED", label: "완료", icon: "✅" },
];

export const stageIndex = (stage: AnalysisStage) =>
  STAGES.findIndex((s) => s.key === stage);

export const verdictConfig = {
  FAKE: { emoji: "🚨", label: "AI 생성 영상", bg: "rgba(220,38,38,0.12)", border: "hsl(var(--destructive))", glow: "0 0 40px rgba(220,38,38,0.3)" },
  REAL: { emoji: "✅", label: "실제 영상", bg: "rgba(34,197,94,0.12)", border: "hsl(var(--magic-green))", glow: "0 0 40px rgba(34,197,94,0.3)" },
  UNCERTAIN: { emoji: "🤔", label: "불확실", bg: "rgba(234,179,8,0.12)", border: "hsl(var(--magic-orange))", glow: "0 0 40px rgba(234,179,8,0.3)" },
};

export function useAnalysis() {
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

  return {
    stage, report, selectedFile, previewUrl, fileError, quota,
    isDragging, setIsDragging, fileInputRef,
    handleInputChange, handleDrop, handleAnalyze, handleReset,
    handleSave, handleShare, handleFileSelect,
    isAnalyzing, currentStageIdx, navigate,
  };
}
