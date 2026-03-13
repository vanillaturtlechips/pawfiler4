import { motion } from "framer-motion";
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

const ProfilePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-wood-900 to-black pt-20 pb-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-amber-200 hover:text-amber-100 transition-colors"
        >
          <span>←</span> 뒤로가기
        </button>

        {/* Profile Card */}
        <motion.div
          className="rounded-xl p-6 relative overflow-hidden mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, #5D4037, #3E2723)",
            border: "3px solid #1B1B1B",
            boxShadow: "inset 0 5px 15px rgba(255,255,255,0.1), 0 5px 15px rgba(0,0,0,0.5)"
          }}
        >
          <div className="flex items-center gap-4 relative z-10">
            <div className="relative">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-5xl"
                style={{
                  background: "radial-gradient(circle, #8D6E63, #5D4037)",
                  boxShadow: "0 0 20px rgba(255,215,0,0.3)"
                }}
              >
                {user.avatarEmoji}
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                  color: "#1B1B1B",
                  border: "2px solid #1B1B1B",
                  boxShadow: "0 3px 6px rgba(0,0,0,0.3)"
                }}
              >
                {user.level}
              </div>
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-jua text-2xl text-white text-shadow-deep">
                  {user.nickname}
                </h2>
                {user.subscriptionType === "premium" && (
                  <span className="px-3 py-1 rounded-full text-sm font-jua"
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
                {user.levelTitle} 탐정
              </p>
            </div>
          </div>
          
          {/* XP Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm font-bold mb-2 text-amber-100">
              <span>경험치</span>
              <span>{user.xp} / {(user.level + 1) * 1000} XP</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-gray-800">
              <motion.div
                className="h-full rounded-full"
                style={{ 
                  background: "linear-gradient(90deg, #4CAF50, #8BC34A)",
                  boxShadow: "0 0 10px #4CAF50"
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(user.xp / ((user.level + 1) * 1000)) * 100}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
          
          {/* Coins */}
          <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
            <span className="text-2xl">💰</span>
            <span className="font-jua text-xl font-bold text-amber-300">
              {user.coins.toLocaleString()} 닢
            </span>
          </div>
        </motion.div>

        {/* Daily Quests */}
        <div className="mb-6">
          <h3 className="font-jua text-xl mb-4 text-center font-bold text-white text-shadow-deep">
            📜 오늘의 퀘스트
          </h3>
          
          <div className="space-y-3">
            {quests.map((quest, index) => (
              <motion.div
                key={quest.id}
                className="cursor-pointer rounded-xl p-4 relative overflow-hidden group bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 shadow-md"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 6px 12px rgba(0,0,0,0.5)"
                }}
                onClick={() => {
                  navigate(quest.route);
                }}
              >
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
                
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1 font-bold">
                    <span className="text-blue-700">
                      진행도: {quest.progress}/{quest.total}
                    </span>
                    <span className="text-amber-700">
                      {quest.reward}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-gray-300">
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
        <div className="grid grid-cols-2 gap-3">
          <button
            className="font-jua rounded-lg py-3 text-base cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white border-2 border-green-700 shadow-md hover:shadow-lg transition-shadow"
            onClick={() => navigate("/shop")}
          >
            🎁 상점
          </button>
          <button
            className="font-jua rounded-lg py-3 text-base cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-2 border-blue-700 shadow-md hover:shadow-lg transition-shadow"
            onClick={() => navigate("/community")}
          >
            💬 커뮤니티
          </button>
        </div>

        {/* Logout */}
        <div className="mt-8 text-center">
          <button
            onClick={logout}
            className="text-red-400 hover:text-red-300 text-sm font-medium"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
