import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { HistoryItem } from "@/hooks/useAnalysis";
import { verdictConfig } from "@/hooks/useAnalysis";

interface Props {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

export default function AnalysisHistory({ history, onSelect, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  return (
    <motion.div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📋</span>
          <span className="font-jua text-sm text-foreground">최근 분석 이력</span>
          <span className="text-xs font-gothic px-2 py-0.5 rounded-full text-foreground/40" style={{ background: "rgba(255,255,255,0.06)" }}>
            {history.length}건
          </span>
        </div>
        <motion.span
          className="text-foreground/30 text-sm"
          animate={{ rotate: expanded ? 180 : 0 }}
        >
          ▼
        </motion.span>
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
            <div className="space-y-2">
              {history.map((item, i) => {
                const v = verdictConfig[item.verdict];
                return (
                  <motion.button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer bg-transparent border-none text-left"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ scale: 1.01, background: "rgba(255,255,255,0.06)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelect(item)}
                  >
                    <span className="text-xl">{v.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-gothic text-xs text-foreground/70 truncate">{item.fileName}</p>
                      <p className="font-gothic text-[10px] text-foreground/30 mt-0.5">
                        {new Date(item.date).toLocaleDateString("ko-KR")} · {(item.fileSize / 1024 / 1024).toFixed(1)}MB
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-jua" style={{ color: v.border }}>{v.label}</span>
                      <span className="text-[10px] font-gothic text-foreground/30">
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <button
              className="mt-3 w-full text-center text-xs font-gothic text-foreground/30 hover:text-foreground/50 cursor-pointer bg-transparent border-none py-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
            >
              🗑️ 이력 전체 삭제
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
