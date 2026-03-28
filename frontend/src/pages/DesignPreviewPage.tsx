import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

const spring = { type: "spring" as const, stiffness: 300, damping: 22 };

const radarData = [
  { subject: "🎬 Visual", score: 92 },
  { subject: "🎙️ Audio", score: 78 },
  { subject: "🧠 LLM", score: 88 },
  { subject: "📦 Meta", score: 65 },
];

const pipelineData = [
  { name: "Visual Agent", icon: "🎬", progress: 100, time: "1.2s" },
  { name: "Audio Agent", icon: "🎙️", progress: 85, time: "진행 중" },
  { name: "LLM Agent", icon: "🧠", progress: 60, time: "진행 중" },
  { name: "Metadata", icon: "📦", progress: 100, time: "0.4s" },
];

/* ──────────────────────────────────────────────
   CONCEPT 1 — 마법 서재 (Enchanted Library)
   Warm parchment tones, aged ink, scroll borders
   ────────────────────────────────────────────── */
function Concept1() {
  return (
    <div className="space-y-4">
      {/* Verdict Card */}
      <motion.div
        className="rounded-2xl p-6 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(165deg, hsl(40 55% 16%), hsl(25 40% 12%))",
          border: "2px solid hsl(35 50% 30%)",
          boxShadow: "0 12px 40px hsl(20 60% 6% / 0.7), inset 0 1px 0 hsl(40 60% 35% / 0.2)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      >
        {/* Subtle parchment texture overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, hsl(40 50% 80%) 3px, hsl(40 50% 80%) 4px)" }} />
        <span className="text-5xl block mb-2 relative z-10">🔮</span>
        <p className="font-jua text-2xl relative z-10" style={{ color: "hsl(45 80% 72%)" }}>AI 생성 의심</p>
        <p className="font-jua text-5xl mt-1 relative z-10" style={{ color: "hsl(0 70% 62%)" }}>87%</p>
        <p className="font-gothic text-xs mt-2 relative z-10" style={{ color: "hsl(35 30% 55%)" }}>종합 신뢰도</p>
      </motion.div>

      {/* Pipeline */}
      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(30 35% 14%), hsl(22 30% 11%))",
          border: "1px solid hsl(35 40% 25%)",
          boxShadow: "inset 0 1px 0 hsl(40 50% 30% / 0.15)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
      >
        <p className="font-jua text-sm mb-4" style={{ color: "hsl(40 60% 70%)" }}>⚡ 에이전트 파이프라인</p>
        <div className="space-y-3">
          {pipelineData.map((p, i) => (
            <div key={p.name}>
              <div className="flex justify-between mb-1">
                <span className="font-jua text-xs" style={{ color: "hsl(40 40% 65%)" }}>{p.icon} {p.name}</span>
                <span className="font-gothic text-xs" style={{ color: "hsl(35 30% 50%)" }}>{p.time}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(25 25% 18%)", border: "1px solid hsl(30 30% 22%)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: p.progress === 100
                      ? "linear-gradient(90deg, hsl(35 60% 45%), hsl(45 70% 55%))"
                      : "linear-gradient(90deg, hsl(27 90% 50%), hsl(35 80% 60%))",
                    boxShadow: p.progress < 100 ? "0 0 12px hsl(27 100% 50% / 0.4)" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.progress}%` }}
                  transition={{ delay: i * 0.15, duration: 0.8 }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Radar */}
      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(30 35% 14%), hsl(22 30% 11%))",
          border: "1px solid hsl(35 40% 25%)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(40 60% 70%)" }}>📊 앙상블 레이더</p>
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(35 30% 28%)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(40 40% 60%)", fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="hsl(35 70% 55%)" fill="hsl(35 70% 55%)" fillOpacity={0.2} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Detail card */}
      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(30 35% 14%), hsl(22 30% 11%))",
          border: "1px solid hsl(35 40% 25%)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(40 60% 70%)" }}>💭 Chain of Thought</p>
        <p className="font-gothic text-sm leading-relaxed" style={{ color: "hsl(40 30% 60%)" }}>
          프레임 분석 결과 얼굴 랜드마크의 미세한 불일치가 감지되었습니다. 특히 눈과 입 주변의 텍스처가 GAN 아티팩트 패턴과 일치하며...
        </p>
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   CONCEPT 2 — 크리스탈 동굴 (Crystal Cave)
   Deep translucent, prismatic edges, gem accents
   ────────────────────────────────────────────── */
function Concept2() {
  return (
    <div className="space-y-4">
      <motion.div
        className="rounded-3xl p-6 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, hsl(240 30% 12%), hsl(260 25% 8%))",
          border: "1px solid hsl(270 40% 35% / 0.4)",
          boxShadow: "0 0 60px hsl(270 60% 40% / 0.15), 0 20px 50px hsl(240 40% 5% / 0.6), inset 0 1px 0 hsl(270 50% 60% / 0.1)",
        }}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      >
        {/* Prismatic shimmer */}
        <motion.div
          className="absolute inset-0"
          style={{ background: "linear-gradient(105deg, transparent 30%, hsl(280 70% 70% / 0.06) 45%, hsl(200 80% 70% / 0.06) 55%, transparent 70%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        />
        <span className="text-5xl block mb-2 relative z-10">💎</span>
        <p className="font-jua text-2xl relative z-10" style={{ color: "hsl(280 60% 78%)" }}>AI 생성 의심</p>
        <p className="font-jua text-5xl mt-1 relative z-10" style={{ color: "hsl(350 65% 65%)" }}>87%</p>
        <p className="font-gothic text-xs mt-2 relative z-10" style={{ color: "hsl(260 25% 55%)" }}>종합 신뢰도</p>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(250 25% 13%), hsl(260 22% 9%))",
          border: "1px solid hsl(270 35% 30% / 0.35)",
          boxShadow: "0 0 30px hsl(270 50% 40% / 0.08)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
      >
        <p className="font-jua text-sm mb-4" style={{ color: "hsl(270 50% 75%)" }}>⚡ 에이전트 파이프라인</p>
        <div className="space-y-3">
          {pipelineData.map((p, i) => (
            <div key={p.name}>
              <div className="flex justify-between mb-1">
                <span className="font-jua text-xs" style={{ color: "hsl(270 35% 70%)" }}>{p.icon} {p.name}</span>
                <span className="font-gothic text-xs" style={{ color: "hsl(260 20% 50%)" }}>{p.time}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(260 20% 16%)", border: "1px solid hsl(270 25% 22%)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: p.progress === 100
                      ? "linear-gradient(90deg, hsl(270 60% 55%), hsl(290 50% 65%))"
                      : "linear-gradient(90deg, hsl(200 70% 50%), hsl(270 60% 60%))",
                    boxShadow: p.progress < 100 ? "0 0 14px hsl(200 80% 55% / 0.4)" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.progress}%` }}
                  transition={{ delay: i * 0.15, duration: 0.8 }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(250 25% 13%), hsl(260 22% 9%))",
          border: "1px solid hsl(270 35% 30% / 0.35)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(270 50% 75%)" }}>📊 앙상블 레이더</p>
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(270 25% 28%)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(270 35% 65%)", fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="hsl(270 60% 65%)" fill="hsl(270 60% 65%)" fillOpacity={0.2} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(250 25% 13%), hsl(260 22% 9%))",
          border: "1px solid hsl(270 35% 30% / 0.35)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(270 50% 75%)" }}>💭 Chain of Thought</p>
        <p className="font-gothic text-sm leading-relaxed" style={{ color: "hsl(260 20% 65%)" }}>
          프레임 분석 결과 얼굴 랜드마크의 미세한 불일치가 감지되었습니다. 특히 눈과 입 주변의 텍스처가 GAN 아티팩트 패턴과 일치하며...
        </p>
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   CONCEPT 3 — 마법진 HUD (Magic Circle Terminal)
   Dark terminal, rune borders, circuit glow
   ────────────────────────────────────────────── */
function Concept3() {
  return (
    <div className="space-y-4">
      <motion.div
        className="rounded-xl p-6 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, hsl(160 30% 6%), hsl(170 25% 4%))",
          border: "1px solid hsl(160 80% 40% / 0.3)",
          boxShadow: "0 0 40px hsl(160 80% 40% / 0.08), inset 0 0 60px hsl(160 50% 20% / 0.05)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      >
        {/* Scanline effect */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(160 80% 50%) 2px, hsl(160 80% 50%) 3px)", backgroundSize: "100% 4px" }} />
        {/* Corner accents */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t border-l" style={{ borderColor: "hsl(160 80% 45% / 0.5)" }} />
        <div className="absolute top-2 right-2 w-4 h-4 border-t border-r" style={{ borderColor: "hsl(160 80% 45% / 0.5)" }} />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l" style={{ borderColor: "hsl(160 80% 45% / 0.5)" }} />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r" style={{ borderColor: "hsl(160 80% 45% / 0.5)" }} />

        <span className="text-5xl block mb-2 relative z-10">⚠️</span>
        <p className="font-jua text-2xl relative z-10" style={{ color: "hsl(160 70% 55%)" }}>DEEPFAKE DETECTED</p>
        <p className="font-jua text-5xl mt-1 relative z-10" style={{ color: "hsl(0 70% 58%)" }}>87<span className="text-2xl">%</span></p>
        <p className="font-gothic text-xs mt-2 relative z-10 tracking-widest uppercase" style={{ color: "hsl(160 40% 40%)" }}>confidence score</p>
      </motion.div>

      <motion.div
        className="rounded-xl p-5"
        style={{
          background: "hsl(165 25% 5%)",
          border: "1px solid hsl(160 60% 30% / 0.25)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
      >
        <p className="font-jua text-sm mb-4 tracking-wide" style={{ color: "hsl(160 60% 50%)" }}>⚡ AGENT PIPELINE</p>
        <div className="space-y-3">
          {pipelineData.map((p, i) => (
            <div key={p.name}>
              <div className="flex justify-between mb-1">
                <span className="font-gothic text-xs tracking-wide" style={{ color: "hsl(160 40% 55%)" }}>{p.icon} {p.name}</span>
                <span className="font-gothic text-xs tabular-nums" style={{ color: p.progress === 100 ? "hsl(160 60% 45%)" : "hsl(45 80% 55%)" }}>{p.time}</span>
              </div>
              <div className="h-2 rounded-sm overflow-hidden" style={{ background: "hsl(160 20% 10%)", border: "1px solid hsl(160 40% 20% / 0.3)" }}>
                <motion.div
                  className="h-full rounded-sm"
                  style={{
                    background: p.progress === 100
                      ? "hsl(160 70% 40%)"
                      : "linear-gradient(90deg, hsl(160 70% 40%), hsl(45 80% 50%))",
                    boxShadow: p.progress < 100 ? "0 0 10px hsl(160 80% 45% / 0.5)" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.progress}%` }}
                  transition={{ delay: i * 0.15, duration: 0.8 }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="rounded-xl p-5"
        style={{
          background: "hsl(165 25% 5%)",
          border: "1px solid hsl(160 60% 30% / 0.25)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}
      >
        <p className="font-jua text-sm mb-3 tracking-wide" style={{ color: "hsl(160 60% 50%)" }}>📊 ENSEMBLE RADAR</p>
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(160 40% 20%)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(160 40% 50%)", fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="hsl(160 70% 45%)" fill="hsl(160 70% 45%)" fillOpacity={0.15} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        className="rounded-xl p-5"
        style={{
          background: "hsl(165 25% 5%)",
          border: "1px solid hsl(160 60% 30% / 0.25)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }}
      >
        <p className="font-jua text-sm mb-3 tracking-wide" style={{ color: "hsl(160 60% 50%)" }}>💭 REASONING</p>
        <p className="font-gothic text-sm leading-relaxed" style={{ color: "hsl(160 25% 55%)" }}>
          프레임 분석 결과 얼굴 랜드마크의 미세한 불일치가 감지되었습니다. 특히 눈과 입 주변의 텍스처가 GAN 아티팩트 패턴과 일치하며...
        </p>
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   CONCEPT 4 — 별빛 연구소 (Starlight Lab)
   Deep space, aurora gradients, stellar glow
   ────────────────────────────────────────────── */
function Concept4() {
  return (
    <div className="space-y-4">
      <motion.div
        className="rounded-3xl p-6 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, hsl(220 40% 10%), hsl(240 35% 7%), hsl(280 30% 8%))",
          border: "1px solid hsl(220 50% 35% / 0.3)",
          boxShadow: "0 0 80px hsl(220 60% 40% / 0.1), 0 20px 50px hsl(240 40% 5% / 0.5)",
        }}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      >
        {/* Aurora shimmer */}
        <motion.div
          className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(ellipse at 30% 20%, hsl(200 80% 50% / 0.15), transparent 50%), radial-gradient(ellipse at 70% 80%, hsl(280 60% 50% / 0.1), transparent 50%)" }}
          animate={{ opacity: [0.2, 0.35, 0.2] }}
          transition={{ repeat: Infinity, duration: 4 }}
        />
        <span className="text-5xl block mb-2 relative z-10">🌌</span>
        <p className="font-jua text-2xl relative z-10" style={{ color: "hsl(210 70% 75%)" }}>AI 생성 의심</p>
        <p className="font-jua text-5xl mt-1 relative z-10 bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, hsl(350 70% 65%), hsl(20 80% 65%))" }}>87%</p>
        <p className="font-gothic text-xs mt-2 relative z-10" style={{ color: "hsl(220 30% 50%)" }}>종합 신뢰도</p>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(225 35% 10%), hsl(235 30% 7%))",
          border: "1px solid hsl(220 40% 28% / 0.3)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
      >
        <p className="font-jua text-sm mb-4" style={{ color: "hsl(210 60% 72%)" }}>⚡ 에이전트 파이프라인</p>
        <div className="space-y-3">
          {pipelineData.map((p, i) => (
            <div key={p.name}>
              <div className="flex justify-between mb-1">
                <span className="font-jua text-xs" style={{ color: "hsl(215 40% 68%)" }}>{p.icon} {p.name}</span>
                <span className="font-gothic text-xs" style={{ color: "hsl(220 25% 50%)" }}>{p.time}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(230 25% 14%)", border: "1px solid hsl(225 30% 20%)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: p.progress === 100
                      ? "linear-gradient(90deg, hsl(200 70% 50%), hsl(220 60% 60%))"
                      : "linear-gradient(90deg, hsl(280 60% 55%), hsl(320 50% 60%))",
                    boxShadow: p.progress < 100 ? "0 0 14px hsl(280 70% 55% / 0.4)" : "none",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.progress}%` }}
                  transition={{ delay: i * 0.15, duration: 0.8 }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(225 35% 10%), hsl(235 30% 7%))",
          border: "1px solid hsl(220 40% 28% / 0.3)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(210 60% 72%)" }}>📊 앙상블 레이더</p>
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(225 30% 22%)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(215 40% 62%)", fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" stroke="hsl(210 70% 60%)" fill="hsl(210 70% 60%)" fillOpacity={0.18} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, hsl(225 35% 10%), hsl(235 30% 7%))",
          border: "1px solid hsl(220 40% 28% / 0.3)",
        }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.3 }}
      >
        <p className="font-jua text-sm mb-3" style={{ color: "hsl(210 60% 72%)" }}>💭 Chain of Thought</p>
        <p className="font-gothic text-sm leading-relaxed" style={{ color: "hsl(220 25% 60%)" }}>
          프레임 분석 결과 얼굴 랜드마크의 미세한 불일치가 감지되었습니다. 특히 눈과 입 주변의 텍스처가 GAN 아티팩트 패턴과 일치하며...
        </p>
      </motion.div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   MAIN PAGE
   ────────────────────────────────────────────── */
const concepts = [
  { id: "library", label: "마법 서재", icon: "📜", desc: "따뜻한 양피지 톤, 고풍스러운 잉크, 두루마리 테두리", Component: Concept1 },
  { id: "crystal", label: "크리스탈 동굴", icon: "💎", desc: "깊은 보석 빛, 프리즘 반사, 크리스탈 글로우", Component: Concept2 },
  { id: "hud", label: "마법진 HUD", icon: "🖥️", desc: "다크 터미널, 스캔라인, 룬 코너 장식", Component: Concept3 },
  { id: "starlight", label: "별빛 연구소", icon: "🌌", desc: "딥 스페이스, 오로라 그라데이션, 항성 글로우", Component: Concept4 },
];

export default function DesignPreviewPage() {
  const [active, setActive] = useState(0);
  const ActiveComponent = concepts[active].Component;

  return (
    <div className="w-full overflow-y-auto" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="font-jua text-3xl text-foreground text-shadow-glow text-center mb-2">🎨 디자인 컨셉 프리뷰</h1>
        <p className="font-gothic text-sm text-foreground/50 text-center mb-8">분석 페이지에 적용할 디자인을 골라주세요</p>

        {/* Tab selector */}
        <div className="grid grid-cols-4 gap-2 mb-8">
          {concepts.map((c, i) => (
            <motion.button
              key={c.id}
              className="rounded-xl py-3 px-2 text-center cursor-pointer border-none outline-none"
              style={{
                background: active === i
                  ? "linear-gradient(135deg, hsl(var(--primary) / 0.25), hsl(var(--secondary) / 0.15))"
                  : "hsl(var(--card) / 0.5)",
                border: active === i ? "2px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border) / 0.3)",
                boxShadow: active === i ? "0 0 20px hsl(var(--primary) / 0.2)" : "none",
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActive(i)}
            >
              <span className="text-xl block">{c.icon}</span>
              <span className="font-jua text-xs mt-1 block" style={{ color: active === i ? "hsl(var(--foreground))" : "hsl(var(--foreground) / 0.6)" }}>{c.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Description */}
        <motion.div
          className="rounded-xl px-4 py-3 mb-6 text-center"
          style={{ background: "hsl(var(--card) / 0.4)", border: "1px solid hsl(var(--border) / 0.2)" }}
          key={active}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="font-gothic text-sm" style={{ color: "hsl(var(--foreground) / 0.7)" }}>
            {concepts[active].icon} <strong className="font-jua">{concepts[active].label}</strong> — {concepts[active].desc}
          </p>
        </motion.div>

        {/* Live preview */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
          >
            <ActiveComponent />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
