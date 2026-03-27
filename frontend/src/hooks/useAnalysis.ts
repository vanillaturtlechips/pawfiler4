import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { runVideoAnalysis, getUnifiedResult, fetchAnalysisQuota, type AnalysisQuota } from "@/lib/api";
import { config } from "@/lib/config";
import type { AnalysisStage, UnifiedReport, AgentTiming } from "@/lib/types";

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

export interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export interface HistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  verdict: "REAL" | "FAKE" | "UNCERTAIN";
  confidence: number;
  date: string;
  report: UnifiedReport;
}

const HISTORY_KEY = "pawfiler_analysis_history";
const MAX_HISTORY = 10;

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [agentTimings, setAgentTimings] = useState<AgentTiming[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.id) {
      if (config.useMockApi || config.useMockAuth) {
        setQuota({ used: 2, limit: 5, remaining: 3 });
      } else {
        fetchAnalysisQuota(user.id).then(setQuota);
      }
    }
  }, [user?.id]);

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message, type }]);
  }, []);

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
    setLogs([]);
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

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const mockAnalyze = async () => {
    setReport(null);
    setLogs([]);

    // Initialize agent timings (parallel)
    const agents: AgentTiming[] = [
      { agentName: "Visual Agent", agentIcon: "🎬", startMs: 0, endMs: 0, status: "pending" },
      { agentName: "Audio Agent", agentIcon: "🎙️", startMs: 0, endMs: 0, status: "pending" },
      { agentName: "LLM Agent", agentIcon: "🧠", startMs: 0, endMs: 0, status: "pending" },
      { agentName: "Metadata Agent", agentIcon: "📦", startMs: 0, endMs: 0, status: "pending" },
    ];
    setAgentTimings([...agents]);

    addLog("📤 영상 파일 업로드 시작...", "info");
    setStage("UPLOADING");
    await delay(600);
    addLog(`📁 파일: ${selectedFile?.name} (${((selectedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)`, "info");
    await delay(600);
    addLog("✅ 업로드 완료", "success");

    setStage("MCP_CONNECTING");
    addLog("🔗 MCP 오케스트레이터 연결 중...", "info");
    await delay(500);
    addLog("📡 Ray Serve 클러스터 연결 완료", "success");
    await delay(300);

    setStage("SAGEMAKER_PROCESSING");
    addLog("⚡ 멀티 에이전트 병렬 분석 시작...", "info");

    // Simulate parallel agents
    const baseTime = 1200;
    // Start all agents
    agents[0] = { ...agents[0], startMs: 0, status: "running" };
    agents[1] = { ...agents[1], startMs: 200, status: "running" };
    agents[2] = { ...agents[2], startMs: 100, status: "running" };
    agents[3] = { ...agents[3], startMs: 50, status: "running" };
    setAgentTimings([...agents]);

    await delay(400);
    addLog("📦 Metadata Agent: EXIF/인코딩 분석 중...", "info");

    await delay(500);
    agents[3] = { ...agents[3], endMs: baseTime * 0.5, status: "completed" };
    setAgentTimings([...agents]);
    addLog("✅ Metadata Agent 완료 (0.6s)", "success");

    await delay(400);
    addLog("🎙️ Audio Agent: 스펙트로그램 분석 중...", "info");

    await delay(600);
    agents[1] = { ...agents[1], endMs: baseTime * 0.8, status: "completed" };
    setAgentTimings([...agents]);
    addLog("✅ Audio Agent 완료 (1.0s)", "success");

    await delay(400);
    addLog("🎬 Visual Agent: 프레임 추론 중...", "info");

    await delay(600);
    agents[0] = { ...agents[0], endMs: baseTime * 1.0, status: "completed" };
    setAgentTimings([...agents]);
    addLog("✅ Visual Agent 완료 (1.2s)", "success");

    await delay(300);
    addLog("🧠 LLM Agent: Chain of Thought 생성 중...", "info");

    await delay(700);
    agents[2] = { ...agents[2], endMs: baseTime * 1.2, status: "completed" };
    setAgentTimings([...agents]);
    addLog("✅ LLM Agent 완료 (1.4s)", "success");

    await delay(300);
    addLog("📊 앙상블 결과 종합 중...", "info");
    await delay(400);

    setStage("COMPLETED");
    addLog("✅ 분석 완료!", "success");

    const verdicts = ["FAKE", "REAL", "UNCERTAIN"] as const;
    const pick = verdicts[Math.floor(Math.random() * 3)];
    const conf = 0.7 + Math.random() * 0.25;
    const framesAnalyzed = 24 + Math.floor(Math.random() * 20);

    const newReport: UnifiedReport = {
      taskId: `mock-${Date.now()}`,
      finalVerdict: pick,
      confidence: parseFloat(conf.toFixed(2)),
      visual: {
        verdict: pick === "UNCERTAIN" ? "REAL" : pick,
        confidence: parseFloat((conf - 0.02 + Math.random() * 0.04).toFixed(2)),
        aiModel: { modelName: "Sora", confidence: 0.87, candidates: [{ name: "Sora", score: 0.87 }, { name: "Runway Gen-3", score: 0.12 }] },
        framesAnalyzed,
        frames: Array.from({ length: Math.min(framesAnalyzed, 20) }, (_, i) => ({
          frameNumber: i * 3,
          deepfakeScore: pick === "FAKE" ? 0.6 + Math.random() * 0.35 : Math.random() * 0.3,
          timestampMs: i * 100,
        })),
      },
      audio: {
        isSynthetic: pick === "FAKE",
        confidence: parseFloat((0.65 + Math.random() * 0.3).toFixed(2)),
        method: pick === "FAKE" ? "TTS" : "natural",
        segments: Array.from({ length: 8 }, (_, i) => ({
          startMs: i * 500,
          endMs: (i + 1) * 500,
          syntheticScore: pick === "FAKE" ? 0.5 + Math.random() * 0.45 : Math.random() * 0.25,
        })),
      },
      llm: {
        verdict: pick === "FAKE" ? "AI 생성 가짜 영상" : pick === "REAL" ? "실제 영상" : "판단 불확실",
        confidence: parseFloat((0.7 + Math.random() * 0.25).toFixed(2)),
        reasoning: pick === "FAKE"
          ? "1단계: 프레임 간 일관성 분석 → 피부 텍스처가 프레임마다 미세하게 변동됨\n2단계: 눈 깜빡임 패턴 → 자연스러운 분포(3-5초 간격)에서 벗어남\n3단계: 조명 반사 분석 → 좌안과 우안의 반사 패턴이 일치하지 않음\n4단계: 오디오-입술 동기화 → 0.15초 오프셋 감지\n5단계: GAN 아티팩트 → 얼굴 윤곽선에서 체커보드 패턴 발견\n\n결론: 복수의 지표가 AI 생성 콘텐츠를 강력히 시사합니다."
          : pick === "REAL"
          ? "1단계: 프레임 간 일관성 분석 → 자연스러운 노이즈 패턴 확인\n2단계: 눈 깜빡임 패턴 → 정상 분포(3.5초 평균)\n3단계: 조명 반사 분석 → 양안 반사 패턴 일치\n4단계: 카메라 흔들림 → 자연스러운 핸드헬드 진동 확인\n5단계: 압축 아티팩트 → 일반적인 H.264 인코딩 패턴\n\n결론: 모든 지표가 실제 촬영 영상임을 나타냅니다."
          : "1단계: 프레임 분석 → 일부 구간에서 미세한 이상 감지\n2단계: 오디오 분석 → 경계선 수준의 합성 점수\n3단계: 조명 분석 → 부분적으로 불일치\n\n결론: 확정적 판단이 어려우며, 추가 분석이 권장됩니다.",
        keyFindings: pick === "FAKE"
          ? ["얼굴 윤곽선에서 GAN 체커보드 아티팩트 발견", "눈 깜빡임 주기가 비자연적 (7.2초 평균)", "오디오-입술 동기화 0.15초 지연", "Sora 모델 시그니처와 87% 일치"]
          : pick === "REAL"
          ? ["자연스러운 카메라 흔들림 패턴 확인", "피부 텍스처 일관성 유지", "배경 노이즈 자연 분포"]
          : ["일부 프레임에서 경계선 수준의 이상 감지", "오디오 합성 점수가 판정 기준 근처"],
        modelUsed: "Claude Sonnet 4 (Ulema Agent)",
      },
      metadata: {
        verdict: pick === "FAKE" ? "변조 의심" : "정상",
        confidence: parseFloat((0.6 + Math.random() * 0.3).toFixed(2)),
        codec: "H.264 (AVC)",
        resolution: "1920x1080",
        fps: 30,
        bitrate: "8.5 Mbps",
        encodingHistory: pick === "FAKE"
          ? ["원본 인코딩: H.265 → H.264 트랜스코딩 감지", "2차 인코딩 흔적 발견 (품질 손실)", "메타데이터 타임스탬프 불일치"]
          : ["단일 인코딩: H.264 Main Profile", "정상적인 인코딩 체인"],
        exifData: {
          "촬영 기기": pick === "FAKE" ? "정보 없음" : "iPhone 15 Pro",
          "촬영 날짜": "2024-12-15 14:32:00",
          "GPS 좌표": pick === "FAKE" ? "정보 없음" : "37.5665° N, 126.9780° E",
          "소프트웨어": pick === "FAKE" ? "FFmpeg 6.1" : "iOS 17.2",
        },
        compressionArtifacts: pick === "FAKE" ? 0.72 : 0.15,
        tamperingIndicators: pick === "FAKE"
          ? ["이중 인코딩 흔적", "메타데이터 타임스탬프 불일치", "비정상적 양자화 테이블"]
          : [],
      },
      explanation: pick === "FAKE"
        ? "이 영상은 Sora 모델로 생성된 AI 합성 영상으로 판단됩니다. 프레임 간 일관성 부족, 비자연적 피부 텍스처, 그리고 눈 깜빡임 패턴의 이상이 감지되었습니다."
        : pick === "REAL"
        ? "이 영상은 실제 촬영된 진짜 영상으로 판단됩니다. 자연스러운 조명 변화, 카메라 흔들림, 그리고 일관된 노이즈 패턴이 확인되었습니다."
        : "이 영상의 진위 여부를 확실히 판단하기 어렵습니다. 일부 프레임에서 AI 생성 흔적이 감지되었으나, 압축 아티팩트와 구분이 어려운 수준입니다.",
      warnings: [],
      totalProcessingTimeMs: 4700 + Math.floor(Math.random() * 1000),
      agentTimings: agents.map(a => ({ ...a })),
    };

    setReport(newReport);

    // Save to history
    if (selectedFile) {
      const item: HistoryItem = {
        id: newReport.taskId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        verdict: pick,
        confidence: parseFloat(conf.toFixed(2)),
        date: new Date().toISOString(),
        report: newReport,
      };
      const updated = [item, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
    }
  };

  const handleAnalyze = async () => {
    if (!token || !selectedFile) return;
    if (config.useMockApi || config.useMockAuth) {
      return mockAnalyze();
    }
    setReport(null);
    setLogs([]);
    setStage("UPLOADING");
    addLog("📤 영상 업로드 시작...", "info");
    try {
      const basicResult = await runVideoAnalysis(selectedFile, (s: string) => {
        setStage(s as AnalysisStage);
        addLog(`⏳ 단계 전환: ${s}`, "info");
      });
      addLog("📊 통합 결과 요청 중...", "info");
      const unified = await getUnifiedResult(basicResult.taskId);
      setStage("COMPLETED");
      addLog("✅ 분석 완료!", "success");
      setReport(unified);
    } catch {
      setStage("ERROR");
      addLog("❌ 분석 실패", "error");
    }
  };

  const handleRetry = () => {
    setReport(null);
    setStage("IDLE");
    setLogs([]);
  };

  // Agent selective re-run
  const [rerunningAgents, setRerunningAgents] = useState<string[]>([]);
  const [isRerunning, setIsRerunning] = useState(false);

  const handleAgentRerun = async (agents: string[]) => {
    if (!report) return;
    setIsRerunning(true);
    setRerunningAgents(agents);

    await delay(1500 + Math.random() * 1000);

    // Generate new mock data for selected agents
    const pick = report.finalVerdict;
    const updatedReport = { ...report };

    for (const agent of agents) {
      const newConf = parseFloat((0.65 + Math.random() * 0.3).toFixed(2));
      if (agent === "visual" && updatedReport.visual) {
        updatedReport.visual = { ...updatedReport.visual, confidence: newConf };
      } else if (agent === "audio" && updatedReport.audio) {
        updatedReport.audio = { ...updatedReport.audio, confidence: newConf };
      } else if (agent === "llm" && updatedReport.llm) {
        updatedReport.llm = { ...updatedReport.llm, confidence: newConf };
      } else if (agent === "metadata" && updatedReport.metadata) {
        updatedReport.metadata = { ...updatedReport.metadata, confidence: newConf };
      }
    }

    // Recalculate overall confidence
    const confs = [
      updatedReport.visual?.confidence ?? 0,
      updatedReport.audio?.confidence ?? 0,
      updatedReport.llm?.confidence ?? 0,
      updatedReport.metadata?.confidence ?? 0,
    ];
    updatedReport.confidence = parseFloat((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(2));

    setReport(updatedReport);
    setIsRerunning(false);
    setRerunningAgents([]);
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setReport(null);
    setStage("IDLE");
    setFileError(null);
    setLogs([]);
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

  const handleShareLink = async () => {
    if (!report) return;
    // In real app this would generate a unique URL via backend
    const shareUrl = `${window.location.origin}/analysis/result/${report.taskId}`;
    await navigator.clipboard.writeText(shareUrl);
    alert("공유 링크가 복사됐어요!");
  };

  const loadHistoryReport = (item: HistoryItem) => {
    setReport(item.report);
    setStage("COMPLETED");
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const isAnalyzing = stage !== "IDLE" && stage !== "COMPLETED" && stage !== "ERROR";
  const currentStageIdx = stageIndex(stage);

  return {
    stage, report, selectedFile, previewUrl, fileError, quota,
    isDragging, setIsDragging, fileInputRef, logs, history, agentTimings,
    handleInputChange, handleDrop, handleAnalyze, handleReset, handleRetry,
    handleSave, handleShare, handleShareLink, handleFileSelect,
    loadHistoryReport, clearHistory, handleAgentRerun, isRerunning, rerunningAgents,
    isAnalyzing, currentStageIdx, navigate, setReport,
  };
}
