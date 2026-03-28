import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { verdictConfig } from "@/hooks/useAnalysis";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

export type BatchItemStatus = "queued" | "analyzing" | "completed" | "error";

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BatchItemStatus;
  verdict?: "REAL" | "FAKE" | "UNCERTAIN";
  confidence?: number;
  progress?: number; // 0-100
}

interface Props {
  onAnalyzeFile: (file: File) => void;
}

export default function BatchQueue({ onAnalyzeFile }: Props) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: BatchItem[] = Array.from(files)
      .filter(f => f.type.startsWith("video/"))
      .slice(0, 10)
      .map(f => ({
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: "queued" as const,
      }));
    setItems(prev => [...prev, ...newItems].slice(0, 20));
  }, []);

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const processQueue = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const queued = items.filter(i => i.status === "queued");
    for (const item of queued) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "analyzing" as const, progress: 0 } : i));

      try {
        const formData = new FormData();
        formData.append("video", item.file);
        formData.append("modality", "both");

        const resp = await fetch("http://localhost:8000/", { method: "POST", body: formData });
        const data = await resp.json();

        setItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: "completed" as const,
          verdict: data.verdict?.toUpperCase() as "FAKE" | "REAL" | "UNCERTAIN",
          confidence: data.confidence ?? 0,
          progress: 100,
        } : i));
      } catch {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "queued" as const, progress: 0 } : i));
      }
    }

    setIsProcessing(false);
  };

  const clearCompleted = () => {
    setItems(prev => {
      prev.filter(i => i.status === "completed").forEach(i => URL.revokeObjectURL(i.previewUrl));
      return prev.filter(i => i.status !== "completed");
    });
  };

  const queuedCount = items.filter(i => i.status === "queued").length;
  const analyzingCount = items.filter(i => i.status === "analyzing").length;
  const completedCount = items.filter(i => i.status === "completed").length;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={spring}
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📈</span>
          <span className="font-jua text-sm text-foreground">배치 분석 큐</span>
          {items.length > 0 && (
            <span className="text-[10px] font-gothic px-2 py-0.5 rounded-full text-foreground/40" style={{ background: "rgba(255,255,255,0.06)" }}>
              {items.length}개
            </span>
          )}
        </div>
        <motion.span className="text-foreground/30 text-sm" animate={{ rotate: expanded ? 180 : 0 }}>▼</motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="px-4 pb-4"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Stats */}
            <div className="flex gap-3 mb-3">
              {[
                { label: "대기", count: queuedCount, color: "rgba(255,255,255,0.2)" },
                { label: "분석 중", count: analyzingCount, color: "hsl(199,97%,47%)" },
                { label: "완료", count: completedCount, color: "#22c55e" },
              ].map(s => (
                <div key={s.label} className="flex-1 rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <p className="font-jua text-lg" style={{ color: s.color }}>{s.count}</p>
                  <p className="font-gothic text-[9px] text-foreground/30">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Drop zone */}
            <label
              className="block w-full rounded-xl p-4 text-center cursor-pointer mb-3 transition-colors"
              style={{ border: "2px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
            >
              <input
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <p className="font-gothic text-xs text-foreground/30">📁 여러 영상 파일을 선택하세요</p>
            </label>

            {/* Queue list */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {item.status === "queued" && <span className="text-foreground/20 text-xs">⏳</span>}
                    {item.status === "analyzing" && (
                      <motion.span
                        className="block w-2.5 h-2.5 rounded-full"
                        style={{ background: "hsl(199,97%,47%)" }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                      />
                    )}
                    {item.status === "completed" && item.verdict && (
                      <span className="text-xs">{verdictConfig[item.verdict].emoji}</span>
                    )}
                    {item.status === "error" && <span className="text-xs">❌</span>}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-gothic text-[10px] text-foreground/50 truncate">{item.file.name}</p>
                    {item.status === "analyzing" && item.progress !== undefined && (
                      <div className="w-full h-1 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: "hsl(199,97%,47%)" }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Result / actions */}
                  <div className="flex items-center gap-2">
                    {item.status === "completed" && item.verdict && (
                      <span className="font-gothic text-[10px]" style={{ color: verdictConfig[item.verdict].border }}>
                        {(item.confidence! * 100).toFixed(0)}%
                      </span>
                    )}
                    {item.status === "completed" && (
                      <button
                        className="text-[10px] text-foreground/20 hover:text-foreground/50 cursor-pointer bg-transparent border-none"
                        onClick={() => onAnalyzeFile(item.file)}
                        title="상세 분석"
                      >
                        🔍
                      </button>
                    )}
                    {(item.status === "queued" || item.status === "completed") && (
                      <button
                        className="text-[10px] text-foreground/20 hover:text-foreground/50 cursor-pointer bg-transparent border-none"
                        onClick={() => removeItem(item.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {items.length === 0 && (
              <p className="font-gothic text-[10px] text-foreground/20 text-center py-4">큐가 비어있어요</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              <motion.button
                className="flex-1 py-2.5 rounded-xl font-jua text-xs cursor-pointer border-none"
                style={{
                  background: queuedCount > 0 && !isProcessing
                    ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(220,90%,45%))"
                    : "rgba(255,255,255,0.05)",
                  color: queuedCount > 0 && !isProcessing ? "white" : "rgba(255,255,255,0.2)",
                  pointerEvents: queuedCount === 0 || isProcessing ? "none" : "auto",
                }}
                whileHover={queuedCount > 0 ? { scale: 1.02 } : {}}
                whileTap={queuedCount > 0 ? { scale: 0.98 } : {}}
                onClick={processQueue}
              >
                {isProcessing ? "⏳ 처리 중..." : `▶ ${queuedCount}개 분석 시작`}
              </motion.button>
              {completedCount > 0 && (
                <motion.button
                  className="py-2.5 px-4 rounded-xl font-gothic text-[10px] cursor-pointer border-none text-foreground/40"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={clearCompleted}
                >
                  🗑 완료 제거
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
