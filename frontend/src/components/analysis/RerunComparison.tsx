import { motion } from "framer-motion";
import type { UnifiedReport } from "@/lib/types";

interface Props {
  history: UnifiedReport[];
  current: UnifiedReport;
}

export default function RerunComparison({ history, current }: Props) {
  if (history.length === 0) return null;

  const prev = history[history.length - 1];

  const getDiff = (key: "visual" | "audio" | "llm" | "metadata") => {
    const prevConf = prev[key]?.confidence ?? 0;
    const currConf = current[key]?.confidence ?? 0;
    const diff = currConf - prevConf;
    return { prev: prevConf, curr: currConf, diff };
  };

  return (
    <motion.div
      className="mt-4 rounded-2xl p-4"
      style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="font-jua text-xs text-foreground/60 mb-3">📊 재분석 결과 비교</p>
      <div className="space-y-2">
        {(["visual", "audio", "llm", "metadata"] as const).map(key => {
          const { prev, curr, diff } = getDiff(key);
          if (prev === 0 && curr === 0) return null;
          
          const icon = { visual: "🎬", audio: "🎙️", llm: "🧠", metadata: "📦" }[key];
          const label = { visual: "Visual", audio: "Audio", llm: "LLM", metadata: "Meta" }[key];
          
          return (
            <div key={key} className="flex items-center justify-between">
              <span className="font-gothic text-xs text-foreground/50">{icon} {label}</span>
              <div className="flex items-center gap-2">
                <span className="font-gothic text-xs text-foreground/30">{(prev * 100).toFixed(0)}%</span>
                <span className="text-foreground/20">→</span>
                <span className="font-gothic text-xs text-foreground">{(curr * 100).toFixed(0)}%</span>
                <span
                  className="font-gothic text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: diff > 0 ? "rgba(34,197,94,0.15)" : diff < 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                    color: diff > 0 ? "#86efac" : diff < 0 ? "#fca5a5" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {diff > 0 ? "+" : ""}{(diff * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
