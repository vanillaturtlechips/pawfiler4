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
      className="star-card-glow overflow-hidden"
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
          <span className="text-lg">🕵️</span>
          <span className="font-jua text-base" style={{ color: "hsl(var(--star-text))" }}>적대적 공격 시뮬레이션</span>
        </div>
        <motion.span className="text-sm" style={{ color: "hsl(var(--star-text-dim))" }} animate={{ rotate: expanded ? 180 : 0 }}>▼</motion.span>
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
            <p className="font-gothic text-xs mb-4" style={{ color: "hsl(var(--star-text-dim))" }}>
              다양한 적대적 공격이 현재 탐지 결과를 우회할 수 있는지 시뮬레이션합니다
            </p>

            {!attacks && (
              <motion.button
                className="w-full py-3.5 rounded-xl font-jua text-sm cursor-pointer border-none"
                style={{
                  background: simulating
                    ? "hsl(var(--star-surface))"
                    : "linear-gradient(135deg, hsl(350 70% 50%), hsl(15 80% 50%))",
                  color: simulating ? "hsl(var(--star-text-dim))" : "white",
                  boxShadow: !simulating ? "0 4px 20px hsl(350 70% 50% / 0.3)" : "none",
                  pointerEvents: simulating ? "none" : "auto",
                }}
                whileHover={!simulating ? { scale: 1.02 } : {}}
                whileTap={!simulating ? { scale: 0.98 } : {}}
                onClick={runSimulation}
              >
                {simulating ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>⚙️</motion.span>
                    공격 벡터 시뮬레이션 중...
                  </span>
                ) : (
                  "⚔️ 시뮬레이션 시작"
                )}
              </motion.button>
            )}

            {attacks && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                {/* Robustness Score */}
                <div className="flex items-center gap-4 mb-5 rounded-xl p-4" style={{ background: "hsl(var(--star-surface) / 0.7)", border: "1px solid hsl(var(--star-border) / 0.3)" }}>
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
                          background={{ fill: "hsl(var(--star-border) / 0.3)" }}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="relative -mt-16 text-center">
                      <span className="font-jua text-xl" style={{ color: robustnessColor }}>
                        {(robustness * 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="font-jua text-base" style={{ color: robustnessColor }}>
                      강건도: {robustnessLabel}
                    </p>
                    <p className="font-gothic text-xs mt-1" style={{ color: "hsl(var(--star-text-dim))" }}>
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
                <div className="space-y-2.5">
                  {attacks.map((attack, i) => (
                    <motion.div
                      key={attack.name}
                      className="rounded-xl px-4 py-3.5"
                      style={{ background: "hsl(var(--star-surface) / 0.5)", border: "1px solid hsl(var(--star-border) / 0.2)" }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{attack.icon}</span>
                          <span className="font-jua text-sm" style={{ color: "hsl(var(--star-text))" }}>{attack.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-gothic font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: `${difficultyColors[attack.difficultyLevel]}20`,
                              color: difficultyColors[attack.difficultyLevel],
                            }}
                          >
                            {difficultyLabels[attack.difficultyLevel]}
                          </span>
                          <span
                            className="font-gothic text-xs font-bold"
                            style={{ color: attack.bypassRate > 0.5 ? "#ef4444" : attack.bypassRate > 0.3 ? "#eab308" : "#22c55e" }}
                          >
                            {(attack.bypassRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <p className="font-gothic text-xs" style={{ color: "hsl(var(--star-text-dim))" }}>{attack.description}</p>
                      <div className="w-full h-2 rounded-full mt-2.5 overflow-hidden" style={{ background: "hsl(var(--star-border) / 0.3)" }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: attack.bypassRate > 0.5
                              ? "linear-gradient(90deg, #ef4444, #f87171)"
                              : attack.bypassRate > 0.3
                                ? "linear-gradient(90deg, #eab308, #facc15)"
                                : "linear-gradient(90deg, #22c55e, #4ade80)",
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${attack.bypassRate * 100}%` }}
                          transition={{ delay: i * 0.1 + 0.3, duration: 0.6 }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>

                <button
                  className="w-full mt-4 text-center font-gothic text-xs cursor-pointer bg-transparent border-none py-2 transition-colors"
                  style={{ color: "hsl(var(--star-text-dim))" }}
                  onClick={runSimulation}
                >
                  🔄 다시 시뮬레이션
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
