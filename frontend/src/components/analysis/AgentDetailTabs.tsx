import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import StreamingText from "./StreamingText";
import type { UnifiedReport } from "@/lib/types";

const spring = { type: "spring" as const, stiffness: 300, damping: 20 };

interface Props {
  report: UnifiedReport;
}

export default function AgentDetailTabs({ report }: Props) {
  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="w-full grid grid-cols-4 rounded-2xl h-12" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
        {[
          { value: "visual", icon: "🎬", label: "Visual" },
          { value: "audio", icon: "🎙️", label: "Audio" },
          { value: "llm", icon: "🧠", label: "LLM" },
          { value: "metadata", icon: "📦", label: "Meta" },
        ].map(t => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="font-jua text-xs rounded-xl data-[state=active]:bg-[rgba(0,137,188,0.25)] data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {t.icon} {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Visual Agent */}
      <TabsContent value="visual">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.visual && (
            <>
              <InfoRow label="판정" value={report.visual.verdict === "FAKE" ? "AI 생성 의심" : "실제 영상"} isBad={report.visual.verdict === "FAKE"} />
              <InfoRow label="신뢰도" value={`${(report.visual.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="분석 프레임" value={`${report.visual.framesAnalyzed}개`} />

              {report.visual.aiModel && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/70">🤖 AI 모델 추정</p>
                  <p className="font-jua text-sm text-foreground/90">{report.visual.aiModel.modelName} ({(report.visual.aiModel.confidence * 100).toFixed(0)}%)</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {report.visual.aiModel.candidates.map(c => (
                      <span key={c.name} className="text-[10px] font-gothic px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                        {c.name}: {(c.score * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {report.visual.frames && report.visual.frames.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="font-jua text-xs mb-3 text-foreground/70">📊 프레임별 딥페이크 점수</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={report.visual.frames.map(f => ({ frame: f.frameNumber, score: +(f.deepfakeScore * 100).toFixed(0) }))}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="frame" hide />
                      <YAxis domain={[0, 100]} hide />
                      <ReferenceLine y={70} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(v: number) => [`${v}%`, "점수"]}
                        labelFormatter={(l) => `프레임 ${l}`}
                      />
                      <Area type="monotone" dataKey="score" stroke="#ef4444" fill="url(#scoreGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </motion.div>
      </TabsContent>

      {/* Audio Agent */}
      <TabsContent value="audio">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.audio ? (
            <>
              <InfoRow label="판정" value={report.audio.isSynthetic ? "합성 음성 의심" : "자연 음성"} isBad={report.audio.isSynthetic} />
              <InfoRow label="신뢰도" value={`${(report.audio.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="합성 방식" value={report.audio.method === "TTS" ? "TTS (텍스트→음성)" : report.audio.method === "natural" ? "자연 녹음" : report.audio.method} />

              {report.audio.segments && report.audio.segments.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="font-jua text-xs mb-3 text-foreground/70">🎵 구간별 합성 점수</p>
                  <div className="flex gap-1 items-end h-16">
                    {report.audio.segments.map((seg, i) => {
                      const h = seg.syntheticScore * 100;
                      const color = seg.syntheticScore > 0.7 ? "#ef4444" : seg.syntheticScore > 0.4 ? "#eab308" : "#22c55e";
                      return (
                        <motion.div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{ background: color, minHeight: 4 }}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          title={`${(seg.startMs / 1000).toFixed(1)}s ~ ${(seg.endMs / 1000).toFixed(1)}s: ${(seg.syntheticScore * 100).toFixed(0)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] mt-1 text-foreground/40">
                    <span>0초</span>
                    <span>{((report.audio.segments[report.audio.segments.length - 1]?.endMs || 0) / 1000).toFixed(0)}초</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/40 text-center py-8">오디오 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>

      {/* LLM Agent */}
      <TabsContent value="llm">
        <motion.div className="space-y-4 pt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {report.llm ? (
            <>
              <InfoRow label="판정" value={report.llm.verdict} isBad={report.llm.verdict.includes("FAKE") || report.llm.verdict.includes("가짜")} />
              <InfoRow label="신뢰도" value={`${(report.llm.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="사용 모델" value={report.llm.modelUsed} />

              <div className="rounded-xl p-4" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <p className="font-jua text-xs mb-2 text-foreground/70">💭 Chain of Thought</p>
                <StreamingText
                  text={report.llm.reasoning}
                  speed={15}
                  className="font-gothic text-xs text-foreground/60 leading-relaxed"
                />
              </div>

              {report.llm.keyFindings.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/70">🔑 핵심 발견</p>
                  <ul className="space-y-1.5">
                    {report.llm.keyFindings.map((f, i) => (
                      <motion.li
                        key={i}
                        className="font-gothic text-xs text-foreground/60 flex items-start gap-2"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <span className="text-foreground/30 mt-0.5">•</span>
                        {f}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/40 text-center py-8">LLM 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>

      {/* Metadata Agent */}
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

              {/* Compression artifacts */}
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="flex justify-between items-center mb-2">
                  <p className="font-jua text-xs text-foreground/70">🔍 압축 아티팩트 수준</p>
                  <span className="font-jua text-sm" style={{ color: report.metadata.compressionArtifacts > 0.5 ? "#ef4444" : "#22c55e" }}>
                    {(report.metadata.compressionArtifacts * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: report.metadata.compressionArtifacts > 0.5
                        ? "linear-gradient(90deg, #ef4444, #f87171)"
                        : "linear-gradient(90deg, #22c55e, #4ade80)",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${report.metadata.compressionArtifacts * 100}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="font-jua text-xs mb-2 text-foreground/70">📜 인코딩 이력</p>
                <div className="space-y-1.5">
                  {report.metadata.encodingHistory.map((h, i) => (
                    <div key={i} className="font-gothic text-xs text-foreground/50 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: i === 0 ? "#22c55e" : "rgba(255,255,255,0.2)" }} />
                      {h}
                    </div>
                  ))}
                </div>
              </div>

              {report.metadata.tamperingIndicators.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}>
                  <p className="font-jua text-xs mb-2" style={{ color: "#fca5a5" }}>⚠️ 변조 지표</p>
                  <ul className="space-y-1">
                    {report.metadata.tamperingIndicators.map((t, i) => (
                      <li key={i} className="font-gothic text-xs text-foreground/60">• {t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Object.keys(report.metadata.exifData).length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="font-jua text-xs mb-2 text-foreground/70">📸 EXIF 데이터</p>
                  <div className="space-y-1.5">
                    {Object.entries(report.metadata.exifData).map(([k, v]) => (
                      <div key={k} className="flex justify-between font-gothic text-xs">
                        <span className="text-foreground/40">{k}</span>
                        <span className="text-foreground/60">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="font-gothic text-sm text-foreground/40 text-center py-8">메타데이터 분석 데이터 없음</p>
          )}
        </motion.div>
      </TabsContent>
    </Tabs>
  );
}

function InfoRow({ label, value, isBad }: { label: string; value: string; isBad?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <span className="font-gothic text-sm text-foreground/50">{label}</span>
      <span
        className="font-jua text-sm"
        style={{ color: isBad === true ? "#fca5a5" : isBad === false ? "#86efac" : "inherit" }}
      >
        {value}
      </span>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="font-gothic text-[10px] text-foreground/40">{label}</p>
      <p className="font-jua text-sm text-foreground/80 mt-0.5">{value}</p>
    </div>
  );
}
