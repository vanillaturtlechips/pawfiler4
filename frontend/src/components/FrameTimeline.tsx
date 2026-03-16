import { motion } from "framer-motion";
import type { FrameScore } from "@/lib/types";

interface FrameTimelineProps {
  frames: FrameScore[];
}

const FrameTimeline = ({ frames }: FrameTimelineProps) => {
  const maxScore = Math.max(...frames.map(f => f.deepfakeScore));

  return (
    <div className="rounded-xl p-4" style={{ background: "hsl(var(--wood-dark))" }}>
      <div className="font-jua text-sm mb-3 opacity-70">프레임별 딥페이크 점수</div>
      
      <div className="flex items-end gap-1 h-24 overflow-x-auto">
        {frames.map((frame, i) => {
          const height = (frame.deepfakeScore / maxScore) * 100;
          const color = frame.deepfakeScore > 0.7 
            ? "hsl(var(--destructive))" 
            : frame.deepfakeScore > 0.4
            ? "hsl(var(--magic-orange))"
            : "hsl(var(--magic-green))";
          
          return (
            <motion.div
              key={frame.frameNumber}
              className="flex-shrink-0 w-2 rounded-t cursor-pointer hover:opacity-80"
              style={{ 
                height: `${height}%`,
                background: color,
                minHeight: "4px"
              }}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: i * 0.02, duration: 0.3 }}
              title={`프레임 ${frame.frameNumber}: ${(frame.deepfakeScore * 100).toFixed(0)}%`}
            />
          );
        })}
      </div>
      
      <div className="flex justify-between text-xs mt-2 opacity-50">
        <span>0초</span>
        <span>{(frames[frames.length - 1]?.timestampMs / 1000).toFixed(0)}초</span>
      </div>
    </div>
  );
};

export default FrameTimeline;
