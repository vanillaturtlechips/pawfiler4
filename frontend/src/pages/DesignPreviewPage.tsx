import { useState } from "react";
import { motion } from "framer-motion";

const spring = { type: "spring" as const, stiffness: 300, damping: 22 };

const agents = [
  { name: "Visual Agent", icon: "🎬", verdict: "AI 의심", conf: 92, color: "#f87171" },
  { name: "Audio Agent", icon: "🎙️", verdict: "자연", conf: 78, color: "#60a5fa" },
  { name: "LLM Agent", icon: "🧠", verdict: "실제 영상", conf: 88, color: "#a78bfa" },
  { name: "Metadata", icon: "📦", verdict: "정상", conf: 65, color: "#34d399" },
];

/* ── Current: 별빛 연구소 ── */
function StarfieldDesign() {
  return (
    <div className="space-y-5">
      {/* Verdict */}
      <motion.div
        className="rounded-3xl p-8 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, hsl(232 28% 24%), hsl(228 38% 14%))",
          border: "2px solid hsl(0 70% 55% / 0.5)",
          boxShadow: "0 0 60px hsl(0 70% 50% / 0.15), 0 20px 50px hsl(228 38% 8% / 0.5)",
        }}
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      >
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at 25% 15%, hsl(180 70% 55% / 0.15), transparent 55%), radial-gradient(ellipse at 75% 85%, hsl(275 55% 58% / 0.1), transparent 55%)" }} />
        <span className="text-6xl block mb-3 relative z-10">⚠️</span>
        <p className="font-jua text-2xl relative z-10" style={{ color: "hsl(0 70% 65%)" }}>AI 생성 의심</p>
        <p className="font-jua text-6xl mt-1 relative z-10" style={{ color: "hsl(0 70% 65%)" }}>87%</p>
        <p className="font-gothic text-xs mt-2 relative z-10" style={{ color: "hsl(215 20% 65%)" }}>종합 신뢰도</p>
      </motion.div>

      {/* Agents */}
      <div className="space-y-2.5">
        {agents.map((a, i) => (
          <motion.div
            key={a.name}
            className="rounded-xl px-4 py-3.5 flex items-center gap-3"
            style={{
              background: "linear-gradient(160deg, hsl(232 28% 24% / 0.9), hsl(228 38% 14% / 0.85))",
              border: "1px solid hsl(225 30% 35% / 0.5)",
              backdropFilter: "blur(12px)",
            }}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, ...spring }}
          >
            <span className="text-xl">{a.icon}</span>
            <div className="flex-1">
              <p className="font-jua text-sm" style={{ color: "hsl(210 30% 88%)" }}>{a.name}</p>
              <p className="font-gothic text-xs" style={{ color: "hsl(215 20% 65%)" }}>{a.verdict}</p>
            </div>
            <span className="font-gothic text-sm font-bold" style={{ color: a.color }}>{a.conf}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Netflix-style: 넷플릭스 프리미엄 ── */
function NetflixDesign() {
  return (
    <div className="space-y-5">
      {/* Verdict - cinematic card */}
      <motion.div
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
        }}
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      >
        {/* Red accent bar at top */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #e50914, #b20710)" }} />
        <div className="p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-gothic tracking-[0.2em] uppercase" style={{ color: "#999" }}>Analysis Complete</span>
          </div>
          <span className="text-5xl block mb-4">⚠️</span>
          <p className="font-gothic text-sm font-bold tracking-wider uppercase" style={{ color: "#e50914" }}>AI Generated — Suspected</p>
          <p className="text-6xl font-gothic font-bold mt-2" style={{ color: "#fff" }}>87<span className="text-3xl" style={{ color: "#666" }}>%</span></p>
          <p className="text-xs mt-2 font-gothic" style={{ color: "#666" }}>Confidence Score</p>
        </div>
      </motion.div>

      {/* Agents - Netflix row style */}
      <div>
        <p className="font-gothic text-xs font-bold tracking-wider uppercase mb-3 px-1" style={{ color: "#999" }}>Agent Results</p>
        <div className="space-y-px rounded-xl overflow-hidden" style={{ border: "1px solid #1a1a1a" }}>
          {agents.map((a, i) => (
            <motion.div
              key={a.name}
              className="flex items-center gap-4 px-5 py-4"
              style={{
                background: i % 2 === 0 ? "#111" : "#0d0d0d",
                borderBottom: i < agents.length - 1 ? "1px solid #1a1a1a" : "none",
              }}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, ...spring }}
              whileHover={{ backgroundColor: "#1a1a1a" }}
            >
              <span className="text-xl w-8 text-center">{a.icon}</span>
              <div className="flex-1">
                <p className="font-gothic text-sm font-bold" style={{ color: "#e5e5e5" }}>{a.name}</p>
                <p className="font-gothic text-xs mt-0.5" style={{ color: "#666" }}>{a.verdict}</p>
              </div>
              {/* Mini bar */}
              <div className="w-24 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#222" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: a.conf > 85 ? "#e50914" : a.conf > 70 ? "#f5c518" : "#46d369" }}
                    initial={{ width: 0 }} animate={{ width: `${a.conf}%` }}
                    transition={{ delay: i * 0.15 + 0.3, duration: 0.8 }}
                  />
                </div>
                <span className="font-gothic text-xs font-bold tabular-nums" style={{ color: "#e5e5e5", minWidth: "2rem", textAlign: "right" }}>{a.conf}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Action buttons - Netflix style */}
      <div className="flex gap-2">
        <motion.button
          className="flex-1 py-3 rounded-lg font-gothic text-sm font-bold border-none cursor-pointer"
          style={{ background: "#e50914", color: "#fff" }}
          whileHover={{ scale: 1.02, backgroundColor: "#f40612" }}
          whileTap={{ scale: 0.98 }}
        >
          ▶ 상세 보기
        </motion.button>
        <motion.button
          className="flex-1 py-3 rounded-lg font-gothic text-sm font-bold border-none cursor-pointer"
          style={{ background: "#333", color: "#fff" }}
          whileHover={{ scale: 1.02, backgroundColor: "#444" }}
          whileTap={{ scale: 0.98 }}
        >
          ↗ 공유
        </motion.button>
      </div>
    </div>
  );
}

const concepts = [
  { key: "starlight", label: "🌌 별빛 연구소", desc: "현재 적용된 테마", Component: StarfieldDesign },
  { key: "netflix", label: "🎬 넷플릭스 프리미엄", desc: "깔끔한 다크 모던 스타일", Component: NetflixDesign },
] as const;

export default function DesignPreviewPage() {
  const [active, setActive] = useState<string>("starlight");
  const current = concepts.find(c => c.key === active)!;

  return (
    <div className="w-full min-h-screen overflow-y-auto" style={{ background: active === "netflix" ? "#000" : "hsl(228 38% 12%)" }}>
      {/* Header */}
      <div className="max-w-xl mx-auto pt-10 px-4">
        <h1 className="font-jua text-2xl text-center mb-2" style={{ color: active === "netflix" ? "#fff" : "hsl(210 30% 88%)" }}>
          🎨 디자인 비교
        </h1>
        <p className="font-gothic text-xs text-center mb-8" style={{ color: active === "netflix" ? "#666" : "hsl(215 20% 65%)" }}>
          두 가지 스타일을 비교해보세요
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {concepts.map(c => (
            <motion.button
              key={c.key}
              className="flex-1 py-3 px-3 rounded-xl font-jua text-sm cursor-pointer border-none text-center"
              style={{
                background: active === c.key
                  ? (c.key === "netflix" ? "#e50914" : "hsl(210 80% 55%)")
                  : (active === "netflix" ? "#1a1a1a" : "hsl(230 32% 20%)"),
                color: active === c.key ? "#fff" : (active === "netflix" ? "#888" : "hsl(215 20% 65%)"),
                border: `1px solid ${active === c.key ? "transparent" : (active === "netflix" ? "#2a2a2a" : "hsl(225 30% 35% / 0.4)")}`,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActive(c.key)}
            >
              <div>{c.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70 font-gothic">{c.desc}</div>
            </motion.button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <current.Component />
        </motion.div>

        <div className="h-20" />
      </div>
    </div>
  );
}
