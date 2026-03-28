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
    { name: "Visual", weight: 0.35, icon: "🎬" },
    { name: "Audio", weight: 0.25, icon: "🎙️" },
    { name: "LLM", weight: 0.25, icon: "🧠" },
    { name: "Metadata", weight: 0.15, icon: "📦" },
  ];

  return (
    <motion.div
      className="star-card-glow p-6"
      initial={{ opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <p className="font-jua text-lg mb-1" style={{ color: "hsl(var(--star-text))" }}>📊 에이전트 앙상블</p>
      <p className="font-gothic text-xs mb-5" style={{ color: "hsl(var(--star-text-dim))" }}>각 에이전트의 신뢰도를 종합하여 최종 판정을 도출합니다</p>

      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--star-border))" strokeOpacity={0.5} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "hsl(215 40% 68%)", fontSize: 11, fontFamily: "Jua" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "hsl(var(--star-text-dim))", fontSize: 9 }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(228 32% 14%)",
              border: "1px solid hsl(222 35% 28%)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "hsl(215 40% 72%)",
              boxShadow: "0 8px 30px hsl(230 40% 5% / 0.5)",
            }}
            formatter={(v: number) => [`${v}%`, "신뢰도"]}
          />
          <Radar
            name="신뢰도"
            dataKey="score"
            stroke="hsl(210 70% 60%)"
            fill="hsl(210 70% 60%)"
            fillOpacity={0.15}
            strokeWidth={2.5}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Weight breakdown */}
      <div className="mt-5 space-y-2.5">
        <p className="font-jua text-xs" style={{ color: "hsl(var(--star-text-dim))" }}>가중치 배분</p>
        {weights.map(w => (
          <div key={w.name} className="flex items-center gap-3">
            <span className="font-gothic text-xs w-20" style={{ color: "hsl(var(--star-text-dim))" }}>{w.icon} {w.name}</span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden star-bar">
              <motion.div
                className="h-full rounded-full star-bar-fill"
                initial={{ width: 0 }}
                whileInView={{ width: `${w.weight * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              />
            </div>
            <span className="font-gothic text-xs w-10 text-right tabular-nums" style={{ color: "hsl(var(--star-accent))" }}>{(w.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
