import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { UnifiedReport } from "@/lib/types";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

type AgentKey = "visual" | "audio" | "llm" | "metadata";

interface Props {
  report: UnifiedReport;
  onRerun: (agents: AgentKey[]) => void;
  isRerunning: boolean;
  rerunningAgents: AgentKey[];
}

const AGENTS: { key: AgentKey; icon: string; label: string }[] = [
  { key: "visual", icon: "🎬", label: "Visual Agent" },
  { key: "audio", icon: "🎙️", label: "Audio Agent" },
  { key: "llm", icon: "🧠", label: "LLM Agent" },
  { key: "metadata", icon: "📦", label: "Metadata Agent" },
];

export default function AgentRerun({ report, onRerun, isRerunning, rerunningAgents }: Props) {
  const [selected, setSelected] = useState<Set<AgentKey>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const toggle = (key: AgentKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const getConfidence = (key: AgentKey): number => {
    switch (key) {
      case "visual": return report.visual?.confidence ?? 0;
      case "audio": return report.audio?.confidence ?? 0;
      case "llm": return report.llm?.confidence ?? 0;
      case "metadata": return report.metadata?.confidence ?? 0;
    }
  };

  const getVerdict = (key: AgentKey): string => {
    switch (key) {
      case "visual": return report.visual?.verdict === "FAKE" ? "AI 의심" : "실제";
      case "audio": return report.audio?.isSynthetic ? "합성 의심" : "자연";
      case "llm": return report.llm?.verdict ?? "-";
      case "metadata": return report.metadata?.verdict ?? "-";
    }
  };

  const isLowConfidence = (key: AgentKey) => getConfidence(key) < 0.75;

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
          <span className="text-lg">🔄</span>
          <span className="font-jua text-sm text-foreground">에이전트 선택적 재실행</span>
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
            <p className="font-gothic text-[10px] text-foreground/30 mb-3">
              신뢰도가 낮은 에이전트를 선택하여 재분석할 수 있어요
            </p>

            <div className="space-y-2">
              {AGENTS.map((agent) => {
                const conf = getConfidence(agent.key);
                const low = isLowConfidence(agent.key);
                const isSelected = selected.has(agent.key);
                const isRunning = rerunningAgents.includes(agent.key);

                return (
                  <motion.button
                    key={agent.key}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer border-none text-left transition-colors"
                    style={{
                      background: isSelected
                        ? "rgba(0,137,188,0.12)"
                        : "rgba(255,255,255,0.03)",
                      border: isSelected
                        ? "1px solid rgba(0,137,188,0.3)"
                        : "1px solid rgba(255,255,255,0.05)",
                    }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => !isRerunning && toggle(agent.key)}
                    disabled={isRerunning}
                  >
                    <span className="text-lg">{agent.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-jua text-xs text-foreground/70">{agent.label}</span>
                        {low && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-gothic" style={{ background: "rgba(234,179,8,0.15)", color: "#facc15" }}>
                            낮은 신뢰도
                          </span>
                        )}
                      </div>
                      <p className="font-gothic text-[10px] text-foreground/30 mt-0.5">{getVerdict(agent.key)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-gothic text-xs" style={{ color: low ? "#facc15" : "#86efac" }}>
                        {(conf * 100).toFixed(0)}%
                      </span>
                      {isRunning && (
                        <motion.span
                          className="w-2 h-2 rounded-full"
                          style={{ background: "hsl(199,97%,47%)" }}
                          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                        />
                      )}
                      {!isRunning && (
                        <div
                          className="w-4 h-4 rounded border flex items-center justify-center"
                          style={{
                            borderColor: isSelected ? "hsl(199,97%,47%)" : "rgba(255,255,255,0.15)",
                            background: isSelected ? "hsl(199,97%,47%)" : "transparent",
                          }}
                        >
                          {isSelected && <span className="text-[8px] text-white">✓</span>}
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <motion.button
              className="w-full mt-3 py-3 rounded-xl font-jua text-sm cursor-pointer border-none"
              style={{
                background: selected.size > 0 && !isRerunning
                  ? "linear-gradient(135deg, hsl(199,97%,37%), hsl(220,90%,45%))"
                  : "rgba(255,255,255,0.05)",
                color: selected.size > 0 && !isRerunning ? "white" : "rgba(255,255,255,0.2)",
                pointerEvents: selected.size === 0 || isRerunning ? "none" : "auto",
              }}
              whileHover={selected.size > 0 ? { scale: 1.02 } : {}}
              whileTap={selected.size > 0 ? { scale: 0.98 } : {}}
              onClick={() => {
                onRerun(Array.from(selected));
                setSelected(new Set());
              }}
            >
              {isRerunning
                ? "⏳ 재분석 중..."
                : selected.size > 0
                  ? `🔄 ${selected.size}개 에이전트 재실행`
                  : "에이전트를 선택하세요"
              }
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
