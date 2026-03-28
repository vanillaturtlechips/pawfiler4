import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { UnifiedReport } from "@/lib/types";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

export type AgentKey = "visual" | "audio" | "llm" | "metadata";

interface Props {
  report: UnifiedReport;
  onRerun: (agents: AgentKey[]) => void;
  isRerunning: boolean;
  rerunningAgents: AgentKey[];
}

const AGENTS: { key: AgentKey; icon: string; label: string; gradient: string }[] = [
  { key: "visual", icon: "🎬", label: "Visual Agent", gradient: "from-rose-500/20 to-pink-500/10" },
  { key: "audio", icon: "🎙️", label: "Audio Agent", gradient: "from-teal-500/20 to-cyan-500/10" },
  { key: "llm", icon: "🧠", label: "LLM Agent", gradient: "from-violet-500/20 to-purple-500/10" },
  { key: "metadata", icon: "📦", label: "Metadata Agent", gradient: "from-amber-500/20 to-yellow-500/10" },
];

const AGENT_COLORS: Record<AgentKey, string> = {
  visual: "#f472b6",
  audio: "#2dd4bf",
  llm: "#a78bfa",
  metadata: "#fbbf24",
};

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
      className="overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(165deg, hsl(235 30% 22% / 0.98), hsl(230 35% 15% / 0.98))",
        border: "1px solid hsl(228 28% 45% / 0.6)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 hsl(228 28% 50% / 0.2)",
        backdropFilter: "blur(20px)",
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={spring}
    >
      <button
        className="w-full flex items-center justify-between px-6 py-5 cursor-pointer bg-transparent border-none text-left group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <motion.span 
            className="text-2xl"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            🔄
          </motion.span>
          <div>
            <span className="font-jua text-lg block" style={{ color: "#e8eaf6" }}>
              에이전트 선택적 재실행
            </span>
            {!expanded && (
              <span className="text-xs block mt-0.5" style={{ color: "#9fa8da" }}>
                클릭하여 펼치기
              </span>
            )}
          </div>
        </div>
        <motion.span 
          className="text-sm font-bold"
          style={{ color: "#7986cb" }}
          animate={{ rotate: expanded ? 180 : 0 }}
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="px-5 pb-5"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="font-gothic text-sm mb-4 font-medium" style={{ color: "#b0bec5" }}>
              신뢰도가 낮은 에이전트를 선택하여 재분석할 수 있어요
            </p>

            <div className="space-y-3">
              {AGENTS.map((agent, i) => {
                const conf = getConfidence(agent.key);
                const low = isLowConfidence(agent.key);
                const isSelected = selected.has(agent.key);
                const isRunning = rerunningAgents.includes(agent.key);
                const color = AGENT_COLORS[agent.key];

                return (
                  <motion.button
                    key={agent.key}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl cursor-pointer border-none text-left bg-gradient-to-r ${agent.gradient}`}
                    style={{
                      background: isSelected
                        ? `linear-gradient(135deg, ${color}22, ${color}11)`
                        : "hsl(232 28% 20% / 0.9)",
                      border: isSelected
                        ? `2px solid ${color}88`
                        : "1px solid hsl(228 28% 38% / 0.5)",
                      boxShadow: isSelected
                        ? `0 0 20px ${color}22, inset 0 1px 0 ${color}33`
                        : "inset 0 1px 0 hsl(228 28% 40% / 0.15)",
                    }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ 
                      scale: 1.02, 
                      boxShadow: `0 4px 20px ${color}33`,
                    }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => !isRerunning && toggle(agent.key)}
                    disabled={isRerunning}
                  >
                    <span className="text-2xl">{agent.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-jua text-base font-bold" style={{ color: "#e8eaf6" }}>
                          {agent.label}
                        </span>
                        {low && (
                          <span 
                            className="text-[10px] px-2.5 py-1 rounded-full font-gothic font-bold"
                            style={{ 
                              background: "rgba(251,191,36,0.25)", 
                              color: "#fbbf24",
                              border: "1px solid rgba(251,191,36,0.3)",
                            }}
                          >
                            낮은 신뢰도
                          </span>
                        )}
                      </div>
                      <p className="font-gothic text-sm mt-1 font-medium" style={{ color: "#90a4ae" }}>
                        {getVerdict(agent.key)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span 
                        className="font-gothic text-lg font-extrabold tabular-nums"
                        style={{ color: low ? "#fbbf24" : "#4ade80" }}
                      >
                        {(conf * 100).toFixed(0)}%
                      </span>
                      {isRunning && (
                        <motion.span
                          className="w-4 h-4 rounded-full"
                          style={{ background: color, boxShadow: `0 0 12px ${color}88` }}
                          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                        />
                      )}
                      {!isRunning && (
                        <motion.div
                          className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: isSelected ? color : "hsl(228 28% 42%)",
                            background: isSelected ? color : "transparent",
                            boxShadow: isSelected ? `0 0 10px ${color}55` : "none",
                          }}
                          whileTap={{ scale: 0.8 }}
                        >
                          {isSelected && (
                            <motion.span
                              className="text-xs text-white font-bold"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500 }}
                            >
                              ✓
                            </motion.span>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <motion.button
              className="w-full mt-5 py-4 rounded-xl font-jua text-base cursor-pointer border-none relative overflow-hidden"
              style={{
                background: selected.size > 0 && !isRerunning
                  ? "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)"
                  : "hsl(232 28% 22%)",
                color: selected.size > 0 && !isRerunning ? "white" : "#7986cb",
                boxShadow: selected.size > 0 && !isRerunning
                  ? "0 6px 24px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"
                  : "inset 0 1px 0 hsl(228 28% 30% / 0.3)",
                border: selected.size > 0 && !isRerunning
                  ? "1px solid rgba(139,92,246,0.5)"
                  : "1px solid hsl(228 28% 35% / 0.4)",
                pointerEvents: selected.size === 0 || isRerunning ? "none" : "auto",
              }}
              whileHover={selected.size > 0 ? { scale: 1.02, boxShadow: "0 8px 32px rgba(99,102,241,0.5)" } : {}}
              whileTap={selected.size > 0 ? { scale: 0.97 } : {}}
              onClick={() => {
                onRerun(Array.from(selected));
                setSelected(new Set());
              }}
            >
              {selected.size > 0 && !isRerunning && (
                <motion.div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                  }}
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                />
              )}
              <span className="relative z-10">
                {isRerunning
                  ? "⏳ 재분석 중..."
                  : selected.size > 0
                    ? `🔄 ${selected.size}개 에이전트 재실행`
                    : "에이전트를 선택하세요"
                }
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
