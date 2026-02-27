import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";

const UserProfile = () => {
  const { isLoggedIn, user } = useAuth();
  const location = useLocation();

  // HomePage에서만 표시
  if (!isLoggedIn || !user || location.pathname !== "/") return null;

  return (
    <motion.div
      className="fixed top-[12vh] right-[2vw] z-50 flex flex-col gap-3 rounded-2xl p-[clamp(16px,1.5vw,20px)] wood-grain w-[clamp(240px,18vw,300px)]"
      style={{
        background: "hsl(var(--wood-base))",
        border: "6px solid hsl(var(--wood-darkest))",
        boxShadow: "10px 10px 20px rgba(0,0,0,0.7), inset 0 5px 10px rgba(255,255,255,0.1)",
      }}
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
    >
      <div className="flex items-center gap-4">
        <span className="text-[clamp(2.5rem,4vw,3.5rem)] drop-shadow-lg">{user.avatarEmoji}</span>
        <div className="flex flex-col flex-1">
          <span className="font-jua text-[clamp(1rem,1.5vw,1.25rem)] text-foreground text-shadow-deep">
            {user.nickname}
          </span>
          <span className="text-[clamp(0.75rem,1vw,0.875rem)] font-bold mt-1" style={{ color: "#FFCC80" }}>
            ⭐ Lv. {user.level} ({user.levelTitle})
          </span>
        </div>
      </div>
      
      {/* 경험치 바 */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[clamp(0.625rem,0.9vw,0.75rem)] font-bold" style={{ color: "#FFCC80" }}>
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
      <div className="font-jua text-[clamp(0.875rem,1.2vw,1.125rem)] text-center rounded-lg bg-black/30 px-3 py-2" style={{ color: "#FFD54F" }}>
        💰 {user.coins.toLocaleString()} 닢
      </div>
    </motion.div>
  );
};

export default UserProfile;
