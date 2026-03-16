import { motion } from "framer-motion";
import WoodPanel from "./WoodPanel";
import type { AudioAnalysis } from "@/lib/types";

interface AudioPanelProps {
  audio: AudioAnalysis;
}

const AudioPanel = ({ audio }: AudioPanelProps) => {
  const getMethodEmoji = (method: string) => {
    if (method.includes("Real")) return "🎤";
    if (method.includes("TTS")) return "🤖";
    if (method.includes("Clone")) return "👥";
    return "🔊";
  };

  const getMethodColor = (isSynthetic: boolean) => {
    return isSynthetic ? "hsl(var(--destructive))" : "hsl(var(--magic-green))";
  };

  return (
    <WoodPanel className="p-5">
      <h3 className="font-jua text-xl mb-4 text-shadow-deep">🎵 음성 분석 결과</h3>
      
      <motion.div
        className="rounded-xl p-4"
        style={{
          background: audio.isSynthetic 
            ? "linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)"
            : "linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)",
          border: "4px solid hsl(var(--wood-darkest))",
        }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="text-5xl">{getMethodEmoji(audio.method)}</span>
          <div className="flex-1">
            <div className="font-jua text-2xl" style={{ color: "hsl(var(--wood-darkest))" }}>
              {audio.method}
            </div>
            <div 
              className="font-jua text-lg"
              style={{ color: getMethodColor(audio.isSynthetic) }}
            >
              {audio.isSynthetic ? "합성 음성 감지!" : "진짜 목소리예요"}
            </div>
          </div>
        </div>

        {/* 신뢰도 */}
        <div className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-jua opacity-70">신뢰도</span>
            <span className="font-bold">{(audio.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/50 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: getMethodColor(audio.isSynthetic) }}
              initial={{ width: 0 }}
              animate={{ width: `${audio.confidence * 100}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* 세그먼트 정보 */}
        {audio.segments && audio.segments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-wood-darkest/20">
            <div className="font-jua text-xs opacity-70 mb-2">
              의심 구간: {audio.segments.length}개
            </div>
            {audio.segments.slice(0, 3).map((seg, i) => (
              <div key={i} className="text-xs py-1 flex justify-between">
                <span>{(seg.startMs / 1000).toFixed(1)}s ~ {(seg.endMs / 1000).toFixed(1)}s</span>
                <span className="font-bold">{(seg.syntheticScore * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </WoodPanel>
  );
};

export default AudioPanel;
