import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import type { UnifiedReport } from "@/lib/types";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

interface Props {
  report: UnifiedReport;
}

interface AttackResult {
  name: string;
  icon: string;
  description: string;
  bypassRate: number;
  difficultyLevel: "easy" | "medium" | "hard";
}

function generateMockAttacks(report: UnifiedReport): AttackResult[] {
  const isFake = report.finalVerdict === "FAKE";
  const conf = report.confidence;

  return [
    {
      name: "가우시안 노이즈 주입",
      icon: "🌫️",
      description: "영상 전체에 미세한 노이즈를 추가하여 AI 탐지 패턴을 교란",
      bypassRate: isFake ? 0.15 + (1 - conf) * 0.3 : 0.05,
      difficultyLevel: "easy",
    },
    {
      name: "프레임 리샘플링",
      icon: "🎞️",
      description: "FPS를 변경하고 프레임을 재배열하여 시간적 일관성 분석을 우회",
      bypassRate: isFake ? 0.25 + (1 - conf) * 0.25 : 0.08,
      difficultyLevel: "easy",
    },
    {
      name: "적대적 패치 (Adversarial Patch)",
      icon: "🎯",
      description: "특정 영역에 최적화된 노이즈 패턴을 삽입하여 모델의 판단을 역전",
      bypassRate: isFake ? 0.45 + (1 - conf) * 0.2 : 0.15,
      difficultyLevel: "medium",
    },
    {
      name: "JPEG 압축 공격",
      icon: "📦",
      description: "반복적인 압축/해제로 GAN 아티팩트를 제거",
      bypassRate: isFake ? 0.35 + (1 - conf) * 0.15 : 0.1,
      difficultyLevel: "easy",
    },
    {
      name: "스펙트럴 디노이징",
      icon: "🔊",
      description: "주파수 도메인에서 합성 음성의 특징적 패턴을 제거",
      bypassRate: isFake ? 0.3 + (1 - conf) * 0.2 : 0.12,
      difficultyLevel: "medium",
    },
    {
      name: "C&W L2 공격 (White-box)",
      icon: "⚔️",
      description: "모델 그래디언트 기반의 정교한 적대적 perturbation 생성",
      bypassRate: isFake ? 0.7 + (1 - conf) * 0.15 : 0.35,
      difficultyLevel: "hard",
    },
  ];
}

function getRobustnessScore(attacks: AttackResult[]): number {
  const avgBypass = attacks.reduce((sum, a) => sum + a.bypassRate, 0) / attacks.length;
  return Math.max(0, Math.min(1, 1 - avgBypass));
}

const difficultyColors: Record<string, string> = {
  easy: "#22c55e",
  medium: "#eab308",
  hard: "#ef4444",
};

const difficultyLabels: Record<string, string> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};

export default function AdversarialSimulation({ report }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [attacks, setAttacks] = useState<AttackResult[] | null>(null);

  const runSimulation = async () => {
    setSimulating(true);
    setAttacks(null);
    await new Promise(r => setTimeout(r, 1500));
    setAttacks(generateMockAttacks(report));
    setSimulating(false);
  };

  const robustness = attacks ? getRobustnessScore(attacks) : 0;
  const robustnessColor = robustness > 0.7 ? "#22c55e" : robustness > 0.4 ? "#eab308" : "#ef4444";
  const robustnessLabel = robustness > 0.7 ? "강건" : robustness > 0.4 ? "보통" : "취약";

  const gaugeData = [{ value: +(robustness * 100).toFixed(0), fill: robustnessColor }];

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
        className="w-full flex items-center justify-between px-6 py-5 cursor-pointer bg-transparent border-none text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🕵️</span>
          <div>
            <span className="font-jua text-lg block" style={{ color: "#e8eaf6" }}>
              적대적 공격 시뮬레이션
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
              다양한 적대적 공격이 현재 탐지 결과를 우회할 수 있는지 시뮬레이션합니다
            </p>

            {!attacks && (
              <motion.button
                className="w-full py-4 rounded-xl font-jua text-base cursor-pointer border-none relative overflow-hidden"
                style={{
                  background: simulating
                    ? "hsl(232 28% 22%)"
                    : "linear-gradient(135deg, #e11d48, #f97316)",
                  color: simulating ? "#7986cb" : "white",
                  boxShadow: !simulating ? "0 6px 24px rgba(225,29,72,0.35)" : "none",
                  border: !simulating ? "1px solid rgba(249,115,22,0.4)" : "1px solid hsl(228 28% 35% / 0.4)",
                  pointerEvents: simulating ? "none" : "auto",
                }}
                whileHover={!simulating ? { scale: 1.02, boxShadow: "0 8px 32px rgba(225,29,72,0.5)" } : {}}
                whileTap={!simulating ? { scale: 0.97 } : {}}
                onClick={runSimulation}
              >
                {!simulating && (
                  <motion.div
                    className="absolute inset-0 opacity-30"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }}
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  />
                )}
                <span className="relative z-10">
                  {simulating ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>⚙️</motion.span>
                      공격 벡터 시뮬레이션 중...
                    </span>
                  ) : (
                    "⚔️ 시뮬레이션 시작"
                  )}
                </span>
              </motion.button>
            )}

            {attacks && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* Robustness Score */}
                <div
                  className="flex items-center gap-4 mb-5 rounded-xl p-4"
                  style={{
                    background: "hsl(232 28% 20% / 0.9)",
                    border: "1px solid hsl(228 28% 38% / 0.5)",
                    boxShadow: "inset 0 1px 0 hsl(228 28% 40% / 0.15)",
                  }}
                >
                  <div className="w-24 h-24 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="70%"
                        outerRadius="100%"
                        startAngle={90}
                        endAngle={-270}
                        data={gaugeData}
                      >
                        <RadialBar
                          dataKey="value"
                          cornerRadius={10}
                          background={{ fill: "hsl(228 28% 30% / 0.5)" }}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="relative -mt-16 text-center">
                      <span className="font-jua text-xl font-bold" style={{ color: robustnessColor }}>
                        {(robustness * 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="font-jua text-lg font-bold" style={{ color: robustnessColor }}>
                      강건도: {robustnessLabel}
                    </p>
                    <p className="font-gothic text-sm mt-1 font-medium" style={{ color: "#b0bec5" }}>
                      {robustness > 0.7
                        ? "대부분의 적대적 공격에 대해 탐지가 유지됩니다"
                        : robustness > 0.4
                          ? "일부 공격 기법에 의해 탐지가 우회될 수 있습니다"
                          : "다수의 공격 기법에 의해 탐지가 우회될 위험이 높습니다"
                      }
                    </p>
                  </div>
                </div>

                {/* Attack list */}
                <div className="space-y-3">
                  {attacks.map((attack, i) => (
                    <motion.div
                      key={attack.name}
                      className="rounded-xl px-5 py-4"
                      style={{
                        background: "hsl(232 28% 20% / 0.9)",
                        border: "1px solid hsl(228 28% 38% / 0.4)",
                        boxShadow: "inset 0 1px 0 hsl(228 28% 40% / 0.1)",
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      whileHover={{ 
                        borderColor: "hsl(228 28% 50% / 0.6)",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{attack.icon}</span>
                          <span className="font-jua text-base font-bold" style={{ color: "#e8eaf6" }}>
                            {attack.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className="text-xs font-gothic font-bold px-2.5 py-1 rounded-full"
                            style={{
                              background: `${difficultyColors[attack.difficultyLevel]}22`,
                              color: difficultyColors[attack.difficultyLevel],
                              border: `1px solid ${difficultyColors[attack.difficultyLevel]}33`,
                            }}
                          >
                            {difficultyLabels[attack.difficultyLevel]}
                          </span>
                          <span
                            className="font-gothic text-sm font-extrabold tabular-nums"
                            style={{ color: attack.bypassRate > 0.5 ? "#ef4444" : attack.bypassRate > 0.3 ? "#eab308" : "#22c55e" }}
                          >
                            {(attack.bypassRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <p className="font-gothic text-sm font-medium" style={{ color: "#90a4ae" }}>
                        {attack.description}
                      </p>
                      <div
                        className="w-full h-2.5 rounded-full mt-3 overflow-hidden"
                        style={{ background: "hsl(228 28% 25% / 0.8)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: attack.bypassRate > 0.5
                              ? "linear-gradient(90deg, #ef4444, #f87171)"
                              : attack.bypassRate > 0.3
                                ? "linear-gradient(90deg, #eab308, #facc15)"
                                : "linear-gradient(90deg, #22c55e, #4ade80)",
                            boxShadow: `0 0 8px ${attack.bypassRate > 0.5 ? "#ef444466" : attack.bypassRate > 0.3 ? "#eab30866" : "#22c55e66"}`,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${attack.bypassRate * 100}%` }}
                          transition={{ delay: i * 0.1 + 0.3, duration: 0.6 }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.button
                  className="w-full mt-5 text-center font-gothic text-sm cursor-pointer bg-transparent border-none py-3 font-bold rounded-xl"
                  style={{ color: "#7986cb", border: "1px solid hsl(228 28% 35% / 0.4)" }}
                  whileHover={{ color: "#9fa8da", borderColor: "hsl(228 28% 50% / 0.6)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={runSimulation}
                >
                  🔄 다시 시뮬레이션
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
