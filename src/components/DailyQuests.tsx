import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface Quest {
  id: number;
  title: string;
  description: string;
  progress: number;
  total: number;
  reward: string;
  icon: string;
  route: string;
}

const quests: Quest[] = [
  {
    id: 1,
    title: "가짜 영상 찾기",
    description: "퀴즈 게임에서 가짜 영상 찾기",
    progress: 1,
    total: 3,
    reward: "🪙 50닢",
    icon: "🎮",
    route: "/game"
  },
  {
    id: 2,
    title: "영상 분석하기",
    description: "의심스러운 영상 1개 분석",
    progress: 0,
    total: 1,
    reward: "⭐ 100 XP",
    icon: "🔮",
    route: "/analysis"
  },
  {
    id: 3,
    title: "커뮤니티 활동",
    description: "게시글에 댓글 달기",
    progress: 0,
    total: 2,
    reward: "🪙 30닢",
    icon: "📜",
    route: "/community"
  }
];

const DailyQuests = () => {
  const navigate = useNavigate();

  return (
    <div className="fixed top-[12vh] left-[2vw] z-10 flex flex-col gap-[2vh] w-[clamp(180px,15vw,250px)]">
      {quests.map((quest, index) => (
        <motion.div
          key={quest.id}
          className="cursor-pointer rounded-br-2xl p-[clamp(12px,1vw,16px)] text-center"
          style={{
            background: "hsl(var(--parchment))",
            border: "3px solid hsl(var(--parchment-border))",
            boxShadow: "5px 10px 15px rgba(0,0,0,0.6)",
            color: "hsl(var(--wood-darkest))",
          }}
          initial={{ opacity: 0, x: -50 }}
          animate={{ 
            opacity: 1, 
            x: 0,
            rotate: [-3 + index, -1 + index, -3 + index]
          }}
          transition={{ 
            opacity: { duration: 0.5, delay: index * 0.1 },
            x: { duration: 0.5, delay: index * 0.1 },
            rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" }
          }}
          whileHover={{
            scale: 1.08,
            rotate: 0,
            zIndex: 30,
            boxShadow: "10px 15px 25px rgba(0,0,0,0.7)",
          }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(quest.route)}
        >
          {/* Pin */}
          <div
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full"
            style={{
              background: "#D32F2F",
              boxShadow: "inset -3px -3px 5px rgba(0,0,0,0.5), 2px 5px 5px rgba(0,0,0,0.6)",
            }}
          />

          {/* Icon */}
          <div className="text-[clamp(1.5rem,2.5vw,2rem)] mb-2">{quest.icon}</div>

          {/* Title */}
          <div className="font-jua text-[clamp(0.875rem,1.2vw,1rem)] border-b-2 border-dashed border-parchment-border pb-2 mb-2">
            {quest.title}
          </div>

          {/* Description */}
          <div className="text-[clamp(0.625rem,0.9vw,0.75rem)] font-bold mb-2">{quest.description}</div>

          {/* Progress */}
          <div className="text-[clamp(0.625rem,0.9vw,0.75rem)] mb-2" style={{ color: "hsl(var(--magic-blue))" }}>
            진행도: {quest.progress} / {quest.total}
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-full mb-3 overflow-hidden" style={{ background: "hsl(var(--wood-darkest))" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #4CAF50, #8BC34A)" }}
              initial={{ width: 0 }}
              animate={{ width: `${(quest.progress / quest.total) * 100}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>

          {/* Reward */}
          <div
            className="font-jua rounded-xl border-2 border-parchment-border bg-white p-1.5 text-[clamp(0.75rem,1vw,0.875rem)]"
            style={{ color: "hsl(var(--magic-orange))" }}
          >
            보상: {quest.reward}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default DailyQuests;
