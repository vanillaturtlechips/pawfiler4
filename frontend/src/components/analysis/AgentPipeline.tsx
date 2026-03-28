import { motion } from "framer-motion";
import type { AgentTiming } from "@/lib/types";

interface Props {
  timings: AgentTiming[];
  totalMs: number;
}

const statusColors: Record<string, string> = {
  pending: "rgba(255,255,255,0.08)",
  running: "hsl(199,97%,47%)",
  completed: "#22c55e",
  error: "#ef4444",
};

export default function AgentPipeline({ timings, totalMs }: Props) {
  if (!timings || timings.length === 0) return null;

  return (
    <motion.div
      className="rounded-2xl p-5"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <p className="font-jua text-sm mb-1 text-foreground/80">⚡ 에이전트 파이프라인</p>
      <p className="font-gothic text-xs text-foreground/40 mb-4">병렬 처리 타임라인</p>

      <div className="space-y-3">
        {timings.map((agent, i) => {
          const startPct = (agent.startMs / totalMs) * 100;
          const widthPct = ((agent.endMs - agent.startMs) / totalMs) * 100;
          const duration = ((agent.endMs - agent.startMs) / 1000).toFixed(1);
          const color = statusColors[agent.status] || statusColors.pending;

          return (
            <div key={agent.agentName} className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="font-jua text-xs text-foreground/70">
                  {agent.agentIcon} {agent.agentName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-gothic text-xs text-foreground/40">{duration}s</span>
                  {agent.status === "running" && (
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: color }}
                      animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                  {agent.status === "completed" && <span className="text-[10px]">✓</span>}
                  {agent.status === "error" && <span className="text-[10px]">✗</span>}
                </div>
              </div>

              {/* Timeline bar */}
              <div className="w-full h-3 rounded-full overflow-hidden relative" style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${startPct}%`,
                    background: agent.status === "running"
                      ? `linear-gradient(90deg, ${color}, ${color}88)`
                      : color,
                    boxShadow: agent.status === "running" ? `0 0 12px ${color}66` : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{ delay: i * 0.15, duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Time axis */}
      <div className="flex justify-between mt-3 text-xs font-gothic text-foreground/30">
        <span>0s</span>
        <span>{(totalMs / 1000).toFixed(1)}s</span>
      </div>
    </motion.div>
  );
}
