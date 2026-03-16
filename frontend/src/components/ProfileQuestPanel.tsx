import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
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
    reward: "💰 50코인",
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
    reward: "💰 30코인",
    icon: "📜",
    route: "/community"
  }
];

interface ProfileQuestPanelProps {
  isOpen: boolean;
  onClose: () => void;
  position?: "right" | "left";
}

const ProfileQuestPanel = ({ isOpen, onClose, position = "right" }: ProfileQuestPanelProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            className="fixed top-20 right-0 z-50 h-[calc(100vh-5rem)] w-[clamp(300px,25vw,400px)] flex flex-col gap-4 p-4 overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
              background: "hsl(var(--wood-base))",
              borderLeft: "6px solid hsl(var(--wood-darkest))",
              boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
            }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-2 left-2 text-2xl p-1 rounded-full bg-black/20 hover:bg-black/40 transition-colors"
            >
              ✕
            </button>

            {/* Profile Section */}
            <div className="flex flex-col gap-3 rounded-2xl p-4 wood-grain mt-8"
              style={{
                background: "hsl(var(--wood-light))",
                border: "4px solid hsl(var(--wood-darkest))",
                boxShadow: "inset 0 5px 10px rgba(255,255,255,0.1)",
              }}
            >
              <div className="flex items-center gap-4">
                <span className="text-5xl drop-shadow-lg">{user.avatarEmoji}</span>
                <div className="flex flex-col flex-1">
                  <span className="font-jua text-xl text-foreground text-shadow-deep">
                    {user.nickname}
                  </span>
                  <span className="text-sm font-bold mt-1" style={{ color: "#FFCC80" }}>
                    ⭐ Lv. {user.level} ({user.levelTitle})
                  </span>
                </div>
              </div>
              
              {/* 경험치 바 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-bold" style={{ color: "#FFCC80" }}>
                  <span>XP: {user.xp} / {(user.level + 1) * 1000}</span>
                  <span>{Math.floor((user.xp / ((user.level + 1) * 1000)) * 100)}%</span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "hsl(var(--wood-darkest))" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ 
                      background: "linear-gradient(90deg, #FFD54F, #FFA726)",
                      boxShadow: "0 0 10px #FFA726"
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(user.xp / ((user.level + 1) * 1000)) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* 코인 */}
              <div className="font-jua text-lg text-center rounded-lg bg-black/30 px-3 py-2" style={{ color: "#FFD54F" }}>
                💰 {user.coins.toLocaleString()} 코인
              </div>
            </div>

            {/* Daily Quests Section */}
            <div className="flex flex-col gap-3">
              <h3 className="font-jua text-xl text-center" style={{ color: "hsl(var(--wood-darkest))" }}>
                📜 오늘의 퀘스트
              </h3>
              
              {quests.map((quest, index) => (
                <motion.div
                  key={quest.id}
                  className="cursor-pointer rounded-br-2xl p-4 text-center"
                  style={{
                    background: "hsl(var(--parchment))",
                    border: "3px solid hsl(var(--parchment-border))",
                    boxShadow: "5px 10px 15px rgba(0,0,0,0.6)",
                    color: "hsl(var(--wood-darkest))",
                  }}
                  initial={{ opacity: 0, x: 20 }}
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
                    scale: 1.05,
                    rotate: 0,
                    boxShadow: "10px 15px 25px rgba(0,0,0,0.7)",
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    navigate(quest.route);
                    onClose();
                  }}
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
                  <div className="text-3xl mb-2">{quest.icon}</div>

                  {/* Title */}
                  <div className="font-jua text-base border-b-2 border-dashed border-parchment-border pb-2 mb-2">
                    {quest.title}
                  </div>

                  {/* Description */}
                  <div className="text-xs font-bold mb-2">{quest.description}</div>

                  {/* Progress */}
                  <div className="text-xs mb-2" style={{ color: "hsl(var(--magic-blue))" }}>
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
                    className="font-jua rounded-xl border-2 border-parchment-border bg-white p-1.5 text-sm"
                    style={{ color: "hsl(var(--magic-orange))" }}
                  >
                    보상: {quest.reward}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Shop Button */}
            <motion.button
              className="mt-4 font-jua rounded-xl py-3 text-lg cursor-pointer text-center"
              style={{
                background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                color: "#333",
                border: "3px solid hsl(var(--wood-darkest))",
                boxShadow: "0 4px 0 hsl(var(--wood-darkest))",
              }}
              whileHover={{ y: -2, scale: 1.05 }}
              whileTap={{ scale: 0.95, y: 2 }}
              onClick={() => {
                navigate("/shop");
                onClose();
              }}
            >
              🎁 상점 바로가기
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProfileQuestPanel;