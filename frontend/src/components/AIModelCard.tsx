import { motion } from "framer-motion";
import WoodPanel from "./WoodPanel";
import type { AIModelPrediction } from "@/lib/types";

interface AIModelCardProps {
  prediction: AIModelPrediction;
}

const AIModelCard = ({ prediction }: AIModelCardProps) => {
  const getModelEmoji = (name: string) => {
    if (name.includes("Sora")) return "🎬";
    if (name.includes("Runway")) return "🎥";
    if (name.includes("Pika")) return "⚡";
    if (name.includes("Gen")) return "🎞️";
    return "🤖";
  };

  return (
    <WoodPanel className="p-5">
      <h3 className="font-jua text-xl mb-4 text-shadow-deep">🔍 AI 모델 탐정 결과</h3>
      
      {/* 메인 용의자 */}
      <motion.div
        className="rounded-xl p-4 mb-4"
        style={{
          background: "linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)",
          border: "4px solid hsl(var(--wood-darkest))",
        }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-5xl">{getModelEmoji(prediction.modelName)}</span>
          <div className="flex-1">
            <div className="font-jua text-2xl" style={{ color: "hsl(var(--wood-darkest))" }}>
              {prediction.modelName}
            </div>
            <div className="font-jua text-lg" style={{ color: "hsl(var(--magic-orange))" }}>
              {(prediction.confidence * 100).toFixed(0)}% 확률로 범인!
            </div>
          </div>
        </div>
        
        {/* 신뢰도 바 */}
        <div className="w-full h-3 rounded-full bg-white/50 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "hsl(var(--magic-orange))" }}
            initial={{ width: 0 }}
            animate={{ width: `${prediction.confidence * 100}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* 다른 용의자들 */}
      {prediction.candidates && prediction.candidates.length > 1 && (
        <div>
          <div className="font-jua text-sm mb-2 opacity-70">다른 용의자들</div>
          {prediction.candidates.slice(1, 4).map((candidate, i) => (
            <motion.div
              key={candidate.name}
              className="flex items-center justify-between py-2 border-b border-wood-darkest/20"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getModelEmoji(candidate.name)}</span>
                <span className="font-jua text-sm">{candidate.name}</span>
              </div>
              <span className="font-bold text-sm opacity-60">
                {(candidate.score * 100).toFixed(0)}%
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </WoodPanel>
  );
};

export default AIModelCard;
