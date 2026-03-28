import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { UnifiedReport } from "@/lib/types";

interface Props {
  report: UnifiedReport;
}

const agentColors: Record<string, { stroke: string; fill: string; bar: string }> = {
  Visual: { stroke: "hsl(340 75% 65%)", fill: "hsl(340 75% 65%)", bar: "linear-gradient(90deg, hsl(340 75% 55%), hsl(350 80% 70%))" },
  Audio: { stroke: "hsl(175 70% 55%)", fill: "hsl(175 70% 55%)", bar: "linear-gradient(90deg, hsl(175 70% 45%), hsl(185 75% 60%))" },
  LLM: { stroke: "hsl(265 65% 65%)", fill: "hsl(265 65% 65%)", bar: "linear-gradient(90deg, hsl(265 65% 55%), hsl(280 70% 70%))" },
  Metadata: { stroke: "hsl(45 85% 60%)", fill: "hsl(45 85% 60%)", bar: "linear-gradient(90deg, hsl(40 80% 50%), hsl(50 90% 65%))" },
};

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

      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--star-border))" strokeOpacity={0.4} />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "hsl(210 25% 85%)", fontSize: 12, fontFamily: "Jua" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "hsl(var(--star-text-dim))", fontSize: 9 }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(235 24% 22%)",
              border: "1px solid hsl(228 28% 40%)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "hsl(210 25% 92%)",
              boxShadow: "0 8px 30px hsl(230 35% 8% / 0.5)",
            }}
            formatter={(v: number) => [`${v}%`, "신뢰도"]}
          />
          <Radar
            name="신뢰도"
            dataKey="score"
            stroke="hsl(210 85% 68%)"
            fill="url(#radarGradient)"
            fillOpacity={0.25}
            strokeWidth={2.5}
          />
          <defs>
            <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(210 85% 68%)" />
              <stop offset="50%" stopColor="hsl(270 60% 62%)" />
              <stop offset="100%" stopColor="hsl(175 75% 58%)" />
            </linearGradient>
          </defs>
        </RadarChart>
      </ResponsiveContainer>

      {/* Weight breakdown with colorful bars */}
      <div className="mt-5 space-y-3">
        <p className="font-jua text-xs" style={{ color: "hsl(var(--star-text-dim))" }}>가중치 배분</p>
        {weights.map((w, i) => {
          const colors = agentColors[w.name];
          return (
            <motion.div
              key={w.name}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -15 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <span className="font-gothic text-xs w-20" style={{ color: colors.stroke }}>{w.icon} {w.name}</span>
              <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "hsl(var(--star-deep))", border: "1px solid hsl(var(--star-border) / 0.2)" }}>
                <motion.div
                  className="h-full rounded-full relative overflow-hidden"
                  style={{ background: colors.bar }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${w.weight * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                >
                  <motion.div
                    className="absolute inset-y-0 w-8"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }}
                    animate={{ x: ["-100%", "400%"] }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.3, ease: "easeInOut" }}
                  />
                </motion.div>
              </div>
              <span className="font-gothic text-xs w-10 text-right tabular-nums font-bold" style={{ color: colors.stroke }}>{(w.weight * 100).toFixed(0)}%</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
