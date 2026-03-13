import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
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

interface GameProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const GameProfilePanel = ({ isOpen, onClose }: GameProfilePanelProps) => {
  const { user } = useAuth();
  const { quizProfile } = useQuizProfile();
  const navigate = useNavigate();

  if (!user) return null;

  const displayLevel = quizProfile?.level ?? user.level ?? 1;
  const displayTierName = quizProfile?.tierName ?? user.levelTitle ?? '알 껍데기 병아리';
  const displayXp = quizProfile?.totalExp ?? user.xp ?? 0;
  const displayCoins = quizProfile?.totalCoins ?? user.coins ?? 0;
  const displayEnergy = quizProfile?.energy ?? 100;
  const displayMaxEnergy = quizProfile?.maxEnergy ?? 100;
  // 다음 레벨까지 필요한 XP: 150, 400, 800, 1500 기준
  const xpThresholds = [0, 150, 400, 800, 1500, 9999];
  const currentThreshold = xpThresholds[displayLevel - 1] ?? 0;
  const nextThreshold = xpThresholds[displayLevel] ?? 9999;
  const xpProgress = Math.min(100, ((displayXp - currentThreshold) / (nextThreshold - currentThreshold)) * 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Panel Container */}
          <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-md h-full"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel */}
              <div className="h-full flex flex-col bg-gradient-to-b from-wood-800 to-wood-900 border-l-4 border-wood-700 shadow-2xl"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--wood-dark)) 0%, hsl(var(--wood-darkest)) 100%)",
                  boxShadow: "-10px 0 40px rgba(0,0,0,0.7)"
                }}
              >
                {/* Header */}
                <div className="p-4 border-b-2 border-wood-700 relative"
                  style={{
                    background: "linear-gradient(to right, hsl(var(--wood-base)), hsl(var(--wood-dark)))"
                  }}
                >
                  <button
                    onClick={onClose}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-black/20 transition-colors"
                    style={{
                      background: "hsl(var(--wood-darkest))",
                      color: "hsl(var(--wood-light))"
                    }}
                  >
                    ✕
                  </button>
                  <h2 className="font-jua text-xl text-center text-foreground text-shadow-deep">
                    🎮 탐정 정보
                  </h2>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Profile Card */}
                  <motion.div
                    className="rounded-xl p-4 relative overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #5D4037, #3E2723)",
                      border: "3px solid #1B1B1B",
                      boxShadow: "inset 0 5px 15px rgba(255,255,255,0.1), 0 5px 15px rgba(0,0,0,0.5)"
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/5 to-transparent" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      {/* Avatar with level ring */}
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center text-4xl"
                          style={{
                            background: "radial-gradient(circle, #8D6E63, #5D4037)",
                            boxShadow: "0 0 20px rgba(255,215,0,0.3)"
                          }}
                        >
                          {user.avatarEmoji}
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                            color: "#1B1B1B",
                            border: "2px solid #1B1B1B",
                            boxShadow: "0 3px 6px rgba(0,0,0,0.3)"
                          }}
                        >
                          {displayLevel}
                        </div>
                      </div>
                      
                      {/* User info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-jua text-lg text-white text-shadow-deep">
                            {user.nickname}
                          </h3>
                          {user.subscriptionType === "premium" && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-jua"
                              style={{
                                background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                                color: "#1B1B1B"
                              }}
                            >
                              ⭐ PRO
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-amber-200">
                          {displayTierName}
                        </p>
                      </div>
                    </div>
                    
                    {/* XP Bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-bold mb-1 text-amber-100">
                        <span>경험치 ✨</span>
                        <span>{displayXp} / {nextThreshold} XP</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-gray-800">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: "linear-gradient(90deg, #4CAF50, #8BC34A)",
                            boxShadow: "0 0 10px #4CAF50"
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${xpProgress}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Energy Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-bold mb-1 text-amber-100">
                        <span>동물 식량 ⚡</span>
                        <span>{displayEnergy} / {displayMaxEnergy}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-gray-800">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: displayEnergy > 30
                              ? "linear-gradient(90deg, #FACC15, #FCD34D)"
                              : "linear-gradient(90deg, #EF4444, #F87171)",
                            boxShadow: displayEnergy > 30 ? "0 0 8px #FACC15" : "0 0 8px #EF4444"
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(displayEnergy / displayMaxEnergy) * 100}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Coins */}
                    <div className="mt-3 flex items-center justify-center gap-2 p-2 rounded-lg bg-amber-900/30 border border-amber-700/50">
                      <span className="text-xl">🪙</span>
                      <span className="font-jua text-lg font-bold text-amber-300">
                        {displayCoins.toLocaleString()} 닢
                      </span>
                    </div>
                  </motion.div>

                  {/* Daily Quests */}
                  <div>
                    <h3 className="font-jua text-lg mb-3 text-center font-bold text-white text-shadow-deep">
                      📜 오늘의 퀘스트
                    </h3>
                    
                    <div className="space-y-3">
                      {quests.map((quest, index) => (
                        <motion.div
                          key={quest.id}
                          className="cursor-pointer rounded-xl p-3 relative overflow-hidden group bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 shadow-md"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + index * 0.1 }}
                          whileHover={{
                            scale: 1.03,
                            boxShadow: "0 6px 12px rgba(0,0,0,0.5)"
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            navigate(quest.route);
                            onClose();
                          }}
                        >
                          {/* Red pin */}
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-600 shadow-inner shadow-black/50" />
                          
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">{quest.icon}</div>
                            <div className="flex-1">
                              <h4 className="font-jua text-sm font-bold text-gray-800">
                                {quest.title}
                              </h4>
                              <p className="text-xs mt-1 font-medium text-gray-600">
                                {quest.description}
                              </p>
                            </div>
                          </div>
                          
                          {/* Progress */}
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1 font-bold">
                              <span className="text-blue-700">
                                진행도: {quest.progress}/{quest.total}
                              </span>
                              <span className="text-amber-700">
                                {quest.reward}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden bg-gray-300">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${(quest.progress / quest.total) * 100}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <motion.div
                    className="grid grid-cols-2 gap-2"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <button
                      className="font-jua rounded-lg py-2 text-sm cursor-pointer flex items-center justify-center gap-1 bg-gradient-to-r from-green-500 to-green-600 text-white border-2 border-green-700 shadow-md hover:shadow-lg transition-shadow"
                      onClick={() => {
                        navigate("/shop");
                        onClose();
                      }}
                    >
                      🎁 상점
                    </button>
                    <button
                      className="font-jua rounded-lg py-2 text-sm cursor-pointer flex items-center justify-center gap-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-2 border-blue-700 shadow-md hover:shadow-lg transition-shadow"
                      onClick={() => {
                        navigate("/community");
                        onClose();
                      }}
                    >
                      💬 커뮤니티
                    </button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default GameProfilePanel;