import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { useAuth } from "@/contexts/AuthContext";
import { runVideoAnalysis } from "@/lib/mockApi";
import type { AnalysisStage, AnalysisLogEntry, DeepfakeReport } from "@/lib/types";

const stageLabels: Record<AnalysisStage, string> = {
  IDLE: "대기 중",
  UPLOADING: "업로드 중...",
  MCP_CONNECTING: "MCP 연결 중...",
  SAGEMAKER_PROCESSING: "AI 분석 중...",
  COMPLETED: "분석 완료!",
  ERROR: "오류 발생",
};

const AnalysisPage = () => {
  const { token } = useAuth();
  const [stage, setStage] = useState<AnalysisStage>("IDLE");
  const [logs, setLogs] = useState<AnalysisLogEntry[]>([]);
  const [report, setReport] = useState<DeepfakeReport | null>(null);
  const [url, setUrl] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (log: AnalysisLogEntry) => {
    setLogs((prev) => [...prev, log]);
    // Derive stage from log content
    if (log.message.includes("업로드")) setStage("UPLOADING");
    if (log.message.includes("MCP")) setStage("MCP_CONNECTING");
    if (log.message.includes("SageMaker") || log.message.includes("프레임")) setStage("SAGEMAKER_PROCESSING");
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleAnalyze = async () => {
    if (!token) return;
    setLogs([]);
    setReport(null);
    setStage("UPLOADING");
    try {
      const result = await runVideoAnalysis(token, url || "uploaded_file.mp4", addLog);
      setReport(result);
      setStage("COMPLETED");
    } catch {
      setStage("ERROR");
    }
  };

  const verdictConfig = {
    fake: { emoji: "🚨", label: "가짜 (Deepfake)", color: "hsl(var(--destructive))" },
    real: { emoji: "✅", label: "진짜 (Authentic)", color: "hsl(var(--magic-green))" },
    uncertain: { emoji: "🤔", label: "불확실 (Uncertain)", color: "hsl(var(--magic-orange))" },
  };

  return (
    <motion.div
      className="grid h-full grid-cols-[1.2fr_1fr] gap-7 items-stretch p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <ParchmentPanel className="flex flex-col gap-5">
        <h2 className="font-jua text-4xl" style={{ color: "hsl(var(--wood-darkest))" }}>
          🔮 마법 구슬 분석기
        </h2>
        <p className="text-lg leading-relaxed" style={{ color: "hsl(var(--wood-dark))" }}>
          가짜인지 궁금한 영상 파일을 올리거나, 주소를 적어주세요!
        </p>

        {/* Drop zone */}
        <motion.div
          className="cursor-pointer rounded-2xl bg-white p-10 text-center"
          style={{ border: "4px dashed hsl(var(--parchment-border))" }}
          whileHover={{
            borderColor: "hsl(199,97%,37%)",
            backgroundColor: "#E1F5FE",
            scale: 1.02,
          }}
          onClick={handleAnalyze}
        >
          <motion.div
            className="text-6xl"
            animate={{ y: [-3, 3, -3] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            ☁️
          </motion.div>
          <div className="font-jua text-xl mt-2.5" style={{ color: "hsl(var(--wood-darkest))" }}>
            {stage === "IDLE" ? "영상 파일 끌어놓기 (클릭하여 시뮬레이션)" : stageLabels[stage]}
          </div>
        </motion.div>

        {/* URL input */}
        <div
          className="flex items-center rounded-xl bg-white px-4"
          style={{ border: "4px solid hsl(var(--parchment-border))" }}
        >
          <span className="text-2xl">🔗</span>
          <input
            type="text"
            placeholder="영상 주소(URL) 붙여넣기..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border-none bg-transparent p-4 text-lg outline-none font-gothic"
            style={{ color: "hsl(var(--parchment-text))" }}
          />
        </div>

        <GameButton
          variant="blue"
          className={`text-2xl ${stage !== "IDLE" && stage !== "COMPLETED" && stage !== "ERROR" ? "opacity-50 pointer-events-none" : ""}`}
          onClick={handleAnalyze}
        >
          ✨ 마법 구슬아, 분석해줘!
        </GameButton>
      </ParchmentPanel>

      {/* Right panel: Log terminal / Report */}
      <WoodPanel className="flex h-full flex-col">
        <AnimatePresence mode="wait">
          {report ? (
            <motion.div
              key="report"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col gap-4 flex-1"
            >
              <h2 className="font-jua text-2xl text-shadow-deep">📋 분석 보고서</h2>
              <div className="text-center py-4">
                <span className="text-6xl">{verdictConfig[report.verdict].emoji}</span>
                <div
                  className="font-jua text-3xl mt-2"
                  style={{ color: verdictConfig[report.verdict].color }}
                >
                  {verdictConfig[report.verdict].label}
                </div>
                <div className="font-jua text-5xl mt-1" style={{ color: verdictConfig[report.verdict].color }}>
                  {report.confidenceScore}%
                </div>
              </div>
              <div className="flex-1 rounded-xl p-3" style={{ background: "hsl(var(--wood-dark))" }}>
                <div className="font-jua text-sm mb-2 opacity-70">조작 탐지 영역</div>
                {report.manipulatedRegions.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-wood-darkest/30">
                    <span>{r.label}</span>
                    <span className="font-bold">{r.confidence}%</span>
                  </div>
                ))}
                <div className="text-xs mt-3 opacity-50">
                  모델: {report.modelVersion} · 프레임: {report.frameSamplesAnalyzed}개 · {report.processingTimeMs}ms
                </div>
              </div>
              <GameButton variant="green" onClick={() => { setReport(null); setStage("IDLE"); setLogs([]); }}>
                🔄 새 분석 시작
              </GameButton>
            </motion.div>
          ) : logs.length > 0 ? (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col flex-1"
            >
              <h2 className="font-jua text-2xl mb-3 text-shadow-deep">🖥️ 분석 터미널</h2>
              <div
                className="flex-1 rounded-xl p-4 overflow-y-auto font-mono text-sm"
                style={{ background: "#0a0a0a", color: "#4ade80", maxHeight: 400 }}
              >
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`py-0.5 ${
                      log.type === "error" ? "text-red-400" :
                      log.type === "warning" ? "text-yellow-400" :
                      log.type === "success" ? "text-green-400" : "text-gray-300"
                    }`}
                  >
                    <span className="opacity-40 text-xs mr-2">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    {log.message}
                  </motion.div>
                ))}
                <div ref={logEndRef} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <h2 className="font-jua text-3xl mb-7 text-shadow-deep">결과 대기 중...</h2>
              <motion.div
                className="flex items-center justify-center rounded-full text-8xl mb-7"
                style={{
                  width: 220,
                  height: 220,
                  background: "radial-gradient(circle, #E1F5FE, hsl(199,97%,37%))",
                  border: "10px solid #B3E5FC",
                  boxShadow: "0 0 60px hsl(199,97%,37%)",
                }}
                animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              >
                ?
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </WoodPanel>
    </motion.div>
  );
};

export default AnalysisPage;
