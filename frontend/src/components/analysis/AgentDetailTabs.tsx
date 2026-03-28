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
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenSimilarity = (left: string, right: string) => {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 1));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
};

export default function AgentDetailTabs({ report }: Props) {
  const distinctFindings = report.llm?.keyFindings.filter((finding, index, source) => {
    const isDuplicateFinding = source.findIndex((candidate) => normalizeText(candidate) === normalizeText(finding)) !== index;
    const overlapsReasoning = tokenSimilarity(finding, report.llm?.reasoning ?? "") >= 0.42;
    const overlapsExplanation = tokenSimilarity(finding, report.explanation ?? "") >= 0.48;
    return !isDuplicateFinding && !overlapsReasoning && !overlapsExplanation;
  }) ?? [];

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="w-full grid grid-cols-4 rounded-2xl h-12 p-1" style={{ background: "hsl(var(--muted) / 0.72)", border: "1px solid hsl(var(--border) / 0.45)" }}>
        {[
          { value: "visual", icon: "🎬", label: "Visual" },
          { value: "audio", icon: "🎙️", label: "Audio" },
          { value: "llm", icon: "🧠", label: "LLM" },
          { value: "metadata", icon: "📦", label: "Meta" },
        ].map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="font-jua text-xs rounded-xl text-foreground/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
          >
            {t.icon} {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="visual">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.visual && (
            <>
              <InfoRow label="판정" value={report.visual.verdict === "FAKE" ? "AI 생성 의심" : "실제 영상"} isBad={report.visual.verdict === "FAKE"} />
              <InfoRow label="신뢰도" value={`${(report.visual.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="분석 프레임" value={`${report.visual.framesAnalyzed}개`} />

              {report.visual.aiModel && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/80">🤖 AI 모델 추정</p>
                  <p className="font-jua text-sm text-foreground">{report.visual.aiModel.modelName} ({(report.visual.aiModel.confidence * 100).toFixed(0)}%)</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {report.visual.aiModel.candidates.map((c) => (
                      <span key={c.name} className="text-xs font-gothic px-2.5 py-1 rounded-full text-foreground/80" style={{ background: "hsl(var(--background) / 0.35)", border: "1px solid hsl(var(--border) / 0.3)" }}>
                        {c.name}: {(c.score * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.visual.frames && report.visual.frames.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                  <p className="font-jua text-xs mb-3 text-foreground/80">📊 프레임별 딥페이크 점수</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={report.visual.frames.map((f) => ({ frame: f.frameNumber, score: +(f.deepfakeScore * 100).toFixed(0) }))}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="frame" hide />
                      <YAxis domain={[0, 100]} hide />
                      <ReferenceLine y={70} stroke="hsl(var(--destructive) / 0.55)" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background) / 0.96)", border: "1px solid hsl(var(--border) / 0.45)", borderRadius: "12px", fontSize: "11px", color: "hsl(var(--foreground))" }}
                        formatter={(v: number) => [`${v}%`, "점수"]}
                        labelFormatter={(l) => `프레임 ${l}`}
                      />
                      <Area type="monotone" dataKey="score" stroke="hsl(var(--destructive))" fill="url(#scoreGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="audio">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.audio ? (
            <>
              <InfoRow label="판정" value={report.audio.isSynthetic ? "합성 음성 의심" : "자연 음성"} isBad={report.audio.isSynthetic} />
              <InfoRow label="신뢰도" value={`${(report.audio.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="합성 방식" value={report.audio.method === "TTS" ? "TTS (텍스트→음성)" : report.audio.method === "natural" ? "자연 녹음" : report.audio.method} />

              {report.audio.segments && report.audio.segments.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                  <p className="font-jua text-xs mb-3 text-foreground/80">🎵 구간별 합성 점수</p>
                  <div className="flex gap-1 items-end h-20 rounded-xl p-2" style={{ background: "hsl(var(--background) / 0.28)" }}>
                    {report.audio.segments.map((seg, i) => {
                      const h = seg.syntheticScore * 100;
                      const color = seg.syntheticScore > 0.7 ? "hsl(var(--destructive))" : seg.syntheticScore > 0.4 ? "hsl(var(--accent))" : "hsl(var(--primary))";
                      return (
                        <motion.div
                          key={i}
                          className="flex-1 rounded-t-md"
                          style={{ background: color, minHeight: 6 }}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          title={`${(seg.startMs / 1000).toFixed(1)}s ~ ${(seg.endMs / 1000).toFixed(1)}s: ${(seg.syntheticScore * 100).toFixed(0)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs mt-2 text-foreground/65">
                    <span>0초</span>
                    <span>{((report.audio.segments[report.audio.segments.length - 1]?.endMs || 0) / 1000).toFixed(0)}초</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/55 text-center py-8">오디오 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="llm">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.llm ? (
            <>
              <InfoRow label="판정" value={report.llm.verdict} isBad={report.llm.verdict.includes("FAKE") || report.llm.verdict.includes("가짜")} />
              <InfoRow label="신뢰도" value={`${(report.llm.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="사용 모델" value={report.llm.modelUsed} />

              <div className="rounded-2xl p-4" style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.28)" }}>
                <p className="font-jua text-xs mb-2 text-foreground/85">💭 Chain of Thought</p>
                <StreamingText
                  text={report.llm.reasoning}
                  speed={15}
                  className="font-gothic text-sm text-foreground/82 leading-relaxed"
                />
              </div>

              {distinctFindings.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/80">🔑 핵심 발견</p>
                  <ul className="space-y-2">
                    {distinctFindings.map((f, i) => (
                      <motion.li
                        key={i}
                        className="font-gothic text-sm text-foreground/78 flex items-start gap-2"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                      >
                        <span className="text-primary mt-0.5">•</span>
                        {f}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/55 text-center py-8">LLM 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>

      <TabsContent value="metadata">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.metadata ? (
            <>
              <InfoRow label="판정" value={report.metadata.verdict} isBad={report.metadata.tamperingIndicators.length > 0} />
              <InfoRow label="신뢰도" value={`${(report.metadata.confidence * 100).toFixed(1)}%`} />

              <div className="grid grid-cols-2 gap-2">
                <MetaChip label="코덱" value={report.metadata.codec} />
                <MetaChip label="해상도" value={report.metadata.resolution} />
                <MetaChip label="FPS" value={`${report.metadata.fps}`} />
                <MetaChip label="비트레이트" value={report.metadata.bitrate} />
              </div>

              <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-jua text-xs text-foreground/80">🔍 압축 아티팩트 수준</p>
                  <span className="font-jua text-sm" style={{ color: report.metadata.compressionArtifacts > 0.5 ? "hsl(var(--destructive))" : "hsl(var(--primary))" }}>
                    {(report.metadata.compressionArtifacts * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--background) / 0.28)", border: "1px solid hsl(var(--border) / 0.25)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: report.metadata.compressionArtifacts > 0.5
                        ? "linear-gradient(90deg, hsl(var(--destructive)), hsl(var(--destructive) / 0.65))"
                        : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${report.metadata.compressionArtifacts * 100}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                <p className="font-jua text-xs mb-2 text-foreground/80">📜 인코딩 이력</p>
                <div className="space-y-1.5">
                  {report.metadata.encodingHistory.map((h, i) => (
                    <div key={i} className="font-gothic text-sm text-foreground/74 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: i === 0 ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.24)" }} />
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              {report.metadata.tamperingIndicators.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--destructive) / 0.12)", border: "1px solid hsl(var(--destructive) / 0.26)" }}>
                  <p className="font-jua text-xs mb-2" style={{ color: "hsl(var(--destructive))" }}>⚠️ 변조 지표</p>
                  <ul className="space-y-1.5">
                    {report.metadata.tamperingIndicators.map((t, i) => (
                      <li key={i} className="font-gothic text-sm text-foreground/78">• {t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Object.keys(report.metadata.exifData).length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border) / 0.35)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/80">📸 EXIF 데이터</p>
                  <div className="space-y-2">
                    {Object.entries(report.metadata.exifData).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 font-gothic text-sm">
                        <span className="text-foreground/62">{k}</span>
                        <span className="text-foreground/84 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/55 text-center py-8">메타데이터 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>
    </Tabs>
  );
}

function InfoRow({ label, value, isBad }: { label: string; value: string; isBad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl" style={{ background: "hsl(var(--muted) / 0.52)", border: "1px solid hsl(var(--border) / 0.35)" }}>
      <span className="font-gothic text-sm text-foreground/72">{label}</span>
      <span
        className="font-jua text-sm text-right"
        style={{ color: isBad === true ? "hsl(var(--destructive))" : isBad === false ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
      >
        {value}
      </span>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "hsl(var(--muted) / 0.52)", border: "1px solid hsl(var(--border) / 0.35)" }}>
      <p className="font-gothic text-xs text-foreground/62">{label}</p>
      <p className="font-jua text-sm text-foreground mt-1">{value}</p>
    </div>
  );
}
