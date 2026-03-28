import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import StreamingText from "./StreamingText";
import type { UnifiedReport } from "@/lib/types";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

interface Props {
  report: UnifiedReport;
}

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const tokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((t) => t.length > 1));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((t) => t.length > 1));
  const intersection = [...leftTokens].filter((t) => rightTokens.has(t)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
};

export default function AgentDetailTabs({ report }: Props) {
  const distinctFindings = report.llm?.keyFindings.filter((finding, index, source) => {
    const isDup = source.findIndex((c) => normalizeText(c) === normalizeText(finding)) !== index;
    const overlapsR = tokenSimilarity(finding, report.llm?.reasoning ?? "") >= 0.42;
    const overlapsE = tokenSimilarity(finding, report.explanation ?? "") >= 0.48;
    return !isDup && !overlapsR && !overlapsE;
  }) ?? [];

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList
        className="w-full grid grid-cols-4 rounded-2xl h-14 p-1.5"
        style={{ background: "hsl(var(--star-surface))", border: "1px solid hsl(var(--star-border) / 0.3)" }}
      >
        {[
          { value: "visual", icon: "🎬", label: "Visual" },
          { value: "audio", icon: "🎙️", label: "Audio" },
          { value: "llm", icon: "🧠", label: "LLM" },
          { value: "metadata", icon: "📦", label: "Meta" },
        ].map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="font-jua text-sm rounded-xl data-[state=active]:shadow-none"
            style={{ color: "hsl(var(--star-text-dim))" }}
          >
            {t.icon} {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="visual">
        <motion.div className="space-y-4 pt-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.visual && (
            <>
              <InfoRow label="판정" value={report.visual.verdict === "FAKE" ? "AI 생성 의심" : "실제 영상"} isBad={report.visual.verdict === "FAKE"} />
              <InfoRow label="신뢰도" value={`${(report.visual.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="분석 프레임" value={`${report.visual.framesAnalyzed}개`} />

              {report.visual.aiModel && (
                <StarCard>
                  <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-text))" }}>🤖 AI 모델 추정</p>
                  <p className="font-jua text-base" style={{ color: "hsl(var(--star-accent))" }}>
                    {report.visual.aiModel.modelName} ({(report.visual.aiModel.confidence * 100).toFixed(0)}%)
                  </p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {report.visual.aiModel.candidates.map((c) => (
                      <span key={c.name} className="text-xs font-gothic px-3 py-1.5 rounded-full" style={{ background: "hsl(var(--star-deep))", color: "hsl(var(--star-text-dim))", border: "1px solid hsl(var(--star-border) / 0.2)" }}>
                        {c.name}: {(c.score * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </StarCard>
              )}

              {report.visual.frames && report.visual.frames.length > 0 && (
                <StarCard>
                  <p className="font-jua text-sm mb-4" style={{ color: "hsl(var(--star-text))" }}>📊 프레임별 딥페이크 점수</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={report.visual.frames.map((f) => ({ frame: f.frameNumber, score: +(f.deepfakeScore * 100).toFixed(0) }))}>
                      <defs>
                        <linearGradient id="starScoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(350 70% 65%)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(350 70% 65%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="frame" hide />
                      <YAxis domain={[0, 100]} hide />
                      <ReferenceLine y={70} stroke="hsl(350 60% 55% / 0.5)" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{ background: "hsl(228 32% 14%)", border: "1px solid hsl(222 35% 28%)", borderRadius: "12px", fontSize: "11px", color: "hsl(215 40% 72%)" }}
                        formatter={(v: number) => [`${v}%`, "점수"]}
                        labelFormatter={(l) => `프레임 ${l}`}
                      />
                      <Area type="monotone" dataKey="score" stroke="hsl(350 70% 65%)" fill="url(#starScoreGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </StarCard>
              )}
            </>
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="audio">
        <motion.div className="space-y-4 pt-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.audio ? (
            <>
              <InfoRow label="판정" value={report.audio.isSynthetic ? "합성 음성 의심" : "자연 음성"} isBad={report.audio.isSynthetic} />
              <InfoRow label="신뢰도" value={`${(report.audio.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="합성 방식" value={report.audio.method === "TTS" ? "TTS (텍스트→음성)" : report.audio.method === "natural" ? "자연 녹음" : report.audio.method} />

              {report.audio.segments && report.audio.segments.length > 0 && (
                <StarCard>
                  <p className="font-jua text-sm mb-4" style={{ color: "hsl(var(--star-text))" }}>🎵 구간별 합성 점수</p>
                  <div className="flex gap-1.5 items-end h-24 rounded-xl p-3" style={{ background: "hsl(var(--star-deep))" }}>
                    {report.audio.segments.map((seg, i) => {
                      const h = seg.syntheticScore * 100;
                      const color = seg.syntheticScore > 0.7 ? "hsl(var(--star-warm))" : seg.syntheticScore > 0.4 ? "hsl(var(--star-aurora-b))" : "hsl(var(--star-accent))";
                      return (
                        <motion.div
                          key={i}
                          className="flex-1 rounded-t-md"
                          style={{ background: color, minHeight: 6 }}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: i * 0.05, duration: 0.4 }}
                          title={`${(seg.startMs / 1000).toFixed(1)}s ~ ${(seg.endMs / 1000).toFixed(1)}s: ${(seg.syntheticScore * 100).toFixed(0)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs mt-2" style={{ color: "hsl(var(--star-text-dim))" }}>
                    <span>0초</span>
                    <span>{((report.audio.segments[report.audio.segments.length - 1]?.endMs || 0) / 1000).toFixed(0)}초</span>
                  </div>
                </StarCard>
              )}
            </>
          ) : (
            <EmptyState text="오디오 분석 데이터 없음" />
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="llm">
        <motion.div className="space-y-4 pt-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.llm ? (
            <>
              <InfoRow label="판정" value={report.llm.verdict} isBad={report.llm.verdict.includes("FAKE") || report.llm.verdict.includes("가짜")} />
              <InfoRow label="신뢰도" value={`${(report.llm.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="사용 모델" value={report.llm.modelUsed} />

              <div className="rounded-2xl p-5" style={{ background: "hsl(var(--star-accent) / 0.08)", border: "1px solid hsl(var(--star-accent) / 0.2)" }}>
                <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-accent))" }}>💭 Chain of Thought</p>
                <StreamingText text={report.llm.reasoning} speed={15} className="font-gothic text-sm leading-relaxed" />
              </div>

              {distinctFindings.length > 0 && (
                <StarCard>
                  <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-text))" }}>🔑 핵심 발견</p>
                  <ul className="space-y-2.5">
                    {distinctFindings.map((f, i) => (
                      <motion.li key={i} className="font-gothic text-sm flex items-start gap-2.5" style={{ color: "hsl(var(--star-text-dim))" }}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                        <span style={{ color: "hsl(var(--star-accent))" }} className="mt-0.5">•</span>{f}
                      </motion.li>
                    ))}
                  </ul>
                </StarCard>
              )}
            </>
          ) : (
            <EmptyState text="LLM 분석 데이터 없음" />
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="metadata">
        <motion.div className="space-y-4 pt-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.metadata ? (
            <>
              <InfoRow label="판정" value={report.metadata.verdict} isBad={report.metadata.tamperingIndicators.length > 0} />
              <InfoRow label="신뢰도" value={`${(report.metadata.confidence * 100).toFixed(1)}%`} />

              <div className="grid grid-cols-2 gap-3">
                <MetaChip label="코덱" value={report.metadata.codec} />
                <MetaChip label="해상도" value={report.metadata.resolution} />
                <MetaChip label="FPS" value={`${report.metadata.fps}`} />
                <MetaChip label="비트레이트" value={report.metadata.bitrate} />
              </div>

              <StarCard>
                <div className="flex justify-between items-center mb-3">
                  <p className="font-jua text-sm" style={{ color: "hsl(var(--star-text))" }}>🔍 압축 아티팩트 수준</p>
                  <span className="font-jua text-base" style={{ color: report.metadata.compressionArtifacts > 0.5 ? "hsl(var(--star-warm))" : "hsl(var(--star-accent))" }}>
                    {(report.metadata.compressionArtifacts * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden star-bar">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: report.metadata.compressionArtifacts > 0.5
                        ? "linear-gradient(90deg, hsl(var(--star-warm)), hsl(var(--star-warm-b)))"
                        : "linear-gradient(90deg, hsl(var(--star-accent)), hsl(var(--star-accent-glow)))",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${report.metadata.compressionArtifacts * 100}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </StarCard>

              <StarCard>
                <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-text))" }}>📜 인코딩 이력</p>
                <div className="space-y-2">
                  {report.metadata.encodingHistory.map((h, i) => (
                    <div key={i} className="font-gothic text-sm flex items-center gap-2.5" style={{ color: "hsl(var(--star-text-dim))" }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: i === 0 ? "hsl(var(--star-accent))" : "hsl(var(--star-border))" }} />
                      {h}
                    </div>
                  ))}
                </div>
              </StarCard>

              {report.metadata.tamperingIndicators.length > 0 && (
                <div className="rounded-2xl p-5" style={{ background: "hsl(var(--star-warm) / 0.08)", border: "1px solid hsl(var(--star-warm) / 0.2)" }}>
                  <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-warm))" }}>⚠️ 변조 지표</p>
                  <ul className="space-y-2">
                    {report.metadata.tamperingIndicators.map((t, i) => (
                      <li key={i} className="font-gothic text-sm" style={{ color: "hsl(var(--star-text-dim))" }}>• {t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Object.keys(report.metadata.exifData).length > 0 && (
                <StarCard>
                  <p className="font-jua text-sm mb-3" style={{ color: "hsl(var(--star-text))" }}>📸 EXIF 데이터</p>
                  <div className="space-y-2.5">
                    {Object.entries(report.metadata.exifData).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 font-gothic text-sm">
                        <span style={{ color: "hsl(var(--star-text-dim))" }}>{k}</span>
                        <span className="text-right" style={{ color: "hsl(var(--star-text))" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </StarCard>
              )}
            </>
          ) : (
            <EmptyState text="메타데이터 분석 데이터 없음" />
          )}
        </motion.div>
      </TabsContent>
    </Tabs>
  );
}

/* ── Sub-components ── */

function StarCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "hsl(var(--star-surface))", border: "1px solid hsl(var(--star-border) / 0.25)" }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value, isBad }: { label: string; value: string; isBad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-2xl" style={{ background: "hsl(var(--star-surface))", border: "1px solid hsl(var(--star-border) / 0.25)" }}>
      <span className="font-gothic text-sm" style={{ color: "hsl(var(--star-text-dim))" }}>{label}</span>
      <span className="font-jua text-sm text-right" style={{ color: isBad === true ? "hsl(var(--star-warm))" : isBad === false ? "hsl(var(--star-accent))" : "hsl(var(--star-text))" }}>
        {value}
      </span>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "hsl(var(--star-surface))", border: "1px solid hsl(var(--star-border) / 0.25)" }}>
      <p className="font-gothic text-xs" style={{ color: "hsl(var(--star-text-dim))" }}>{label}</p>
      <p className="font-jua text-base mt-1.5" style={{ color: "hsl(var(--star-text))" }}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="font-gothic text-sm text-center py-10" style={{ color: "hsl(var(--star-text-dim))" }}>{text}</p>;
}
