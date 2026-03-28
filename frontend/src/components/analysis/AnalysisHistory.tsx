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
      className="star-card-glow w-full overflow-hidden"
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
          <span className="font-jua text-base" style={{ color: "hsl(var(--star-text))" }}>최근 분석 이력</span>
          <span
            className="text-xs font-gothic px-2.5 py-1 rounded-full font-bold"
            style={{
              color: "hsl(var(--star-text))",
              background: "hsl(var(--star-surface) / 0.9)",
              border: "1px solid hsl(var(--star-border) / 0.45)",
            }}
          >
            {history.length}건
          </span>
        </div>
        <motion.span
          className="text-sm font-bold"
          style={{ color: "hsl(var(--star-text-dim))" }}
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
            <div className="space-y-2.5">
              {history.map((item, i) => {
                const v = verdictConfig[item.verdict];
                return (
                  <motion.button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer border-none text-left"
                    style={{
                      background: "hsl(var(--star-surface) / 0.88)",
                      border: "1px solid hsl(var(--star-border) / 0.4)",
                      boxShadow: "inset 0 1px 0 hsl(var(--star-text) / 0.06)",
                    }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelect(item)}
                  >
                    <span className="text-xl">{v.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-gothic text-sm font-bold truncate" style={{ color: "hsl(var(--star-text))" }}>
                        {item.fileName}
                      </p>
                      <p className="font-gothic text-xs mt-1" style={{ color: "hsl(var(--star-text-dim))" }}>
                        {new Date(item.date).toLocaleDateString("ko-KR")} · {(item.fileSize / 1024 / 1024).toFixed(1)}MB
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-jua" style={{ color: v.border }}>{v.label}</span>
                      <span className="text-xs font-gothic font-bold" style={{ color: "hsl(var(--star-text-dim))" }}>
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <button
              className="mt-3 w-full text-center text-sm font-gothic cursor-pointer bg-transparent border-none py-2 transition-colors"
              style={{ color: "hsl(var(--star-text-dim))" }}
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
