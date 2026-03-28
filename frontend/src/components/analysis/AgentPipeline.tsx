import { motion } from "framer-motion";
import type { AgentTiming } from "@/lib/types";

interface Props {
  timings: AgentTiming[];
  totalMs: number;
}

export default function AgentPipeline({ timings, totalMs }: Props) {
  if (!timings || timings.length === 0) return null;

  return (
    <motion.div
      className="star-card-glow p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <p className="font-jua text-lg mb-1" style={{ color: "hsl(var(--star-text))" }}>⚡ 에이전트 파이프라인</p>
      <p className="font-gothic text-xs mb-5" style={{ color: "hsl(var(--star-text-dim))" }}>병렬 처리 타임라인</p>

      <div className="space-y-4">
        {timings.map((agent, i) => {
          const startPct = (agent.startMs / totalMs) * 100;
          const baseWidthPct = Math.max(((agent.endMs - agent.startMs) / totalMs) * 100, agent.status === "running" ? 16 : 0);
          const duration = Math.max(agent.endMs - agent.startMs, 0);
          const durationLabel = agent.status === "running" ? "진행 중" : `${(duration / 1000).toFixed(1)}s`;
          const isRunning = agent.status === "running";
          const isDone = agent.status === "completed";
          const isError = agent.status === "error";

          return (
            <div key={agent.agentName} className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="font-jua text-sm" style={{ color: "hsl(var(--star-text))" }}>
                  {agent.agentIcon} {agent.agentName}
                </span>
                <div className="flex items-center gap-2.5">
                  <span className="font-gothic text-xs tabular-nums" style={{ color: isRunning ? "hsl(var(--star-accent))" : "hsl(var(--star-text-dim))" }}>{durationLabel}</span>
                  {isRunning && (
                    <motion.span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "hsl(var(--star-accent))", boxShadow: "0 0 8px hsl(var(--star-accent) / 0.6)" }}
                      animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                  {isDone && <span className="text-sm" style={{ color: "hsl(var(--star-accent))" }}>✓</span>}
                  {isError && <span className="text-sm" style={{ color: "hsl(var(--star-warm))" }}>✗</span>}
                </div>
              </div>

              <div className="w-full h-3.5 rounded-full overflow-hidden relative star-bar">
                <motion.div
                  className="absolute top-0 h-full rounded-full overflow-hidden"
                  style={{
                    left: `${startPct}%`,
                    background: isRunning
                      ? "linear-gradient(90deg, hsl(var(--star-accent)), hsl(var(--star-aurora-b) / 0.8))"
                      : isDone
                        ? "hsl(var(--star-accent))"
                        : "hsl(var(--star-warm))",
                    boxShadow: isRunning ? "0 0 16px hsl(var(--star-accent) / 0.5)" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${baseWidthPct}%` }}
                  transition={{ delay: i * 0.12, duration: 0.6, ease: "easeOut" }}
                >
                  {isRunning && (
                    <motion.div
                      className="absolute inset-y-0 w-16"
                      style={{ background: "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.3), transparent)" }}
                      animate={{ x: ["-130%", "250%"] }}
                      transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                    />
                  )}
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-4 text-xs font-gothic" style={{ color: "hsl(var(--star-text-dim))" }}>
        <span>0s</span>
        <span>{(totalMs / 1000).toFixed(1)}s</span>
      </div>
    </motion.div>
  );
}
