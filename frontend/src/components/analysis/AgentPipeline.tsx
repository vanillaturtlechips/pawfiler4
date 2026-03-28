import { motion } from "framer-motion";
import type { AgentTiming } from "@/lib/types";

interface Props {
  timings: AgentTiming[];
  totalMs: number;
}

const statusColors: Record<string, string> = {
  pending: "hsl(var(--muted) / 0.7)",
  running: "hsl(var(--primary))",
  completed: "hsl(var(--primary))",
  error: "hsl(var(--destructive))",
};

export default function AgentPipeline({ timings, totalMs }: Props) {
  if (!timings || timings.length === 0) return null;

  return (
    <motion.div
      className="rounded-3xl p-5"
      style={{ background: "hsl(var(--card) / 0.78)", border: "1px solid hsl(var(--border) / 0.55)", boxShadow: "0 18px 48px hsl(var(--background) / 0.42)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <p className="font-jua text-sm mb-1 text-foreground">⚡ 에이전트 파이프라인</p>
      <p className="font-gothic text-xs text-foreground/70 mb-4">병렬 처리 타임라인</p>

      <div className="space-y-3">
        {timings.map((agent, i) => {
          const startPct = (agent.startMs / totalMs) * 100;
          const baseWidthPct = Math.max(((agent.endMs - agent.startMs) / totalMs) * 100, agent.status === "running" ? 16 : 0);
          const duration = Math.max(agent.endMs - agent.startMs, 0);
          const durationLabel = agent.status === "running" ? "진행 중" : `${(duration / 1000).toFixed(1)}s`;
          const color = statusColors[agent.status] || statusColors.pending;

          return (
            <div key={agent.agentName} className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-jua text-sm text-foreground/88">
                  {agent.agentIcon} {agent.agentName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-gothic text-xs text-foreground/65">{durationLabel}</span>
                  {agent.status === "running" && (
                    <motion.span
                      className="w-2 h-2 rounded-full"
                      style={{ background: color }}
                      animate={{ opacity: [1, 0.35, 1], scale: [1, 1.35, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                  {agent.status === "completed" && <span className="text-xs text-primary">✓</span>}
                  {agent.status === "error" && <span className="text-xs text-destructive">✗</span>}
                </div>
              </div>

              <div className="w-full h-3 rounded-full overflow-hidden relative" style={{ background: "hsl(var(--muted) / 0.72)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                <motion.div
                  className="absolute top-0 h-full rounded-full overflow-hidden"
                  style={{
                    left: `${startPct}%`,
                    background: agent.status === "running"
                      ? `linear-gradient(90deg, ${color}, hsl(var(--accent)))`
                      : color,
                    boxShadow: agent.status === "running" ? `0 0 14px ${color}` : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${baseWidthPct}%` }}
                  transition={{ delay: i * 0.12, duration: 0.5, ease: "easeOut" }}
                >
                  {agent.status === "running" && (
                    <motion.div
                      className="absolute inset-y-0 w-14"
                      style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary-foreground) / 0.32), transparent)" }}
                      animate={{ x: ["-120%", "220%"] }}
                      transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                    />
                  )}
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-3 text-xs font-gothic text-foreground/60">
        <span>0s</span>
        <span>{(totalMs / 1000).toFixed(1)}s</span>
      </div>
    </motion.div>
  );
}
