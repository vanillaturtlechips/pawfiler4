import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { UnifiedReport } from "@/lib/types";

interface Props {
  report: UnifiedReport;
}

export default function EnsembleRadarChart({ report }: Props) {
  const agents = [
    { agent: "Visual", confidence: report.visual?.confidence ?? 0, icon: "🎬" },
    { agent: "Audio", confidence: report.audio?.confidence ?? 0, icon: "🎙️" },
    { agent: "LLM", confidence: report.llm?.confidence ?? 0, icon: "🧠" },
    { agent: "Metadata", confidence: report.metadata?.confidence ?? 0, icon: "📦" },
  ];

  const data = agents.map(a => ({
    subject: `${a.icon} ${a.agent}`,
    score: +(a.confidence * 100).toFixed(0),
    fullMark: 100,
  }));

  const weights = [
    { name: "Visual", weight: 0.35 },
    { name: "Audio", weight: 0.25 },
    { name: "LLM", weight: 0.25 },
    { name: "Metadata", weight: 0.15 },
  ];

  return (
    <motion.div
      className="rounded-2xl p-5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <p className="font-jua text-sm mb-1 text-foreground/70">📊 에이전트 앙상블</p>
      <p className="font-gothic text-[10px] text-foreground/30 mb-3">각 에이전트의 신뢰도를 종합하여 최종 판정을 도출합니다</p>

      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
          />
          <Tooltip
            contentStyle={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "11px" }}
            formatter={(v: number) => [`${v}%`, "신뢰도"]}
          />
          <Radar
            name="신뢰도"
            dataKey="score"
            stroke="hsl(199,97%,47%)"
            fill="hsl(199,97%,47%)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Weight breakdown */}
      <div className="mt-3 space-y-1.5">
        <p className="font-gothic text-[10px] text-foreground/30">가중치 배분</p>
        {weights.map(w => (
          <div key={w.name} className="flex items-center gap-2">
            <span className="font-gothic text-[10px] text-foreground/40 w-16">{w.name}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "hsl(199,97%,47%)" }}
                initial={{ width: 0 }}
                whileInView={{ width: `${w.weight * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <span className="font-gothic text-[10px] text-foreground/30 w-8 text-right">{(w.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
