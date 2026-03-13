import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
import { useState } from "react";
import GameProfilePanel from "./GameProfilePanel";

const navItems = [
  { id: "/", label: "🏠 마을 입구", key: "home" },
  { id: "/game", label: "🎮 게임", key: "game" },
  { id: "/analysis", label: "🔮 분석", key: "anal" },
  { id: "/community", label: "📜 광장", key: "comm" },
  { id: "/shop", label: "🛒 상점", key: "shop" },
];

interface HeaderProps {
  isVisible?: boolean;
}

const Header = ({ isVisible = true }: HeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, user, logout } = useAuth();
  const { quizProfile, isPlaying, setPendingNav } = useQuizProfile();
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  const handleNav = (path: string) => {
    if (isPlaying && location.pathname === "/game" && path !== "/game") {
      setPendingNav(path);
    } else {
      navigate(path);
    }
  };

  const getTierEmoji = (level: number): string => {
    if (level >= 21) return "🦅"; // 불사조
    if (level >= 16) return "🐓"; // 맹금닭
    if (level >= 11) return "🐥"; // 삐약이
    if (level >= 6) return "🐣";  // 알병아리
    return "🥚"; // 알
  };
  
  const displayTierEmoji = getTierEmoji(quizProfile?.level ?? 1);
  const displayTierName = quizProfile?.tierName ?? '알';
  const displayCoins = quizProfile?.totalCoins ?? user?.coins ?? 0;

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: isVisible ? 0 : -80 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="fixed top-0 left-0 right-0 z-50 flex h-20 flex-shrink-0 items-center justify-between px-6 md:px-10 wood-texture"
        style={{
          backgroundColor: "hsl(var(--wood-dark))",
          borderBottom: "6px solid hsl(var(--wood-darkest))",
          boxShadow: "0 15px 30px rgba(0,0,0,0.7)",
        }}
      >
      <motion.div
        className="font-jua cursor-pointer flex items-center gap-2.5 text-3xl text-foreground text-shadow-deep"
        onClick={() => handleNav("/")}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="text-4xl drop-shadow-lg">🐾</span> PawFiler
      </motion.div>

      <nav className="flex gap-2.5 items-center">
        {navItems.map((item) => {
          const isActive = location.pathname === item.id;
          return (
            <motion.button
              key={item.key}
              onClick={() => handleNav(item.id)}
              className={`font-jua rounded-xl px-4 py-2.5 text-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-wood-base text-foreground border-2 border-wood-darkest"
                  : "bg-black/40 text-amber-100 border-2 border-transparent"
              }`}
              style={{
                boxShadow: isActive
                  ? "0 8px 15px rgba(0,0,0,0.5)"
                  : "inset 0 2px 5px rgba(0,0,0,0.3)",
              }}
              whileHover={{ y: -2, scale: 1.05 }}
              whileTap={{ scale: 0.95, y: 2 }}
            >
              {item.label}
            </motion.button>
          );
        })}

        {/* Auth area */}
        <div className="ml-3 pl-3 border-l-2 border-wood-base flex items-center gap-2">
          <AnimatePresence mode="wait">
            {isLoggedIn && user ? (
              <motion.div
                key="user"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-3"
              >
                {/* Game-style Profile Button */}
                <motion.button
                  className="font-jua rounded-xl px-4 py-2 cursor-pointer flex items-center gap-3 relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--wood-base)), hsl(var(--wood-dark)))",
                    border: "3px solid hsl(var(--wood-darkest))",
                    boxShadow: "0 4px 0 hsl(var(--wood-darkest)), inset 0 2px 5px rgba(255,255,255,0.1)",
                  }}
                  whileHover={{
                    y: -2,
                    scale: 1.05,
                    boxShadow: "0 6px 0 hsl(var(--wood-darkest)), 0 0 15px rgba(255,215,0,0.3)"
                  }}
                  whileTap={{ scale: 0.95, y: 2 }}
                  onClick={() => navigate("/profile")}
                >
                  {/* Glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Avatar */}
                  <div className="relative">
                    <span className="text-3xl drop-shadow-lg">{user.avatarEmoji}</span>
                  </div>

                  {/* User info */}
                  <div className="flex flex-col items-start">
                    <span className="font-jua text-sm text-foreground text-shadow-deep leading-tight">
                      {user.nickname}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold" style={{ color: "#FFD54F" }}>
                        {displayTierEmoji} {displayTierName}
                      </span>
                      <span className="text-xs font-bold" style={{ color: "#FFD700" }}>
                        💰{displayCoins.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Premium badge */}
                  {user.subscriptionType === "premium" && (
                    <div className="ml-1 px-2 py-0.5 rounded-full text-xs font-jua"
                      style={{
                        background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                        color: "#333",
                        boxShadow: "inset 0 1px 3px rgba(255,255,255,0.5)"
                      }}
                    >
                      PRO
                    </div>
                  )}

                  {/* Dropdown arrow */}
                  <span className="text-lg transition-transform group-hover:rotate-180">▼</span>
                </motion.button>

                {/* Logout button */}
                <motion.button
                  className="font-jua rounded-lg px-3 py-1.5 text-sm cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--destructive)), #D32F2F)",
                    color: "white",
                    border: "2px solid hsl(var(--destructive-foreground))",
                    boxShadow: "0 3px 0 hsl(var(--destructive-foreground))"
                  }}
                  whileHover={{ y: -1, scale: 1.05 }}
                  whileTap={{ scale: 0.95, y: 2 }}
                  onClick={logout}
                >
                  로그아웃
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="login"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="font-jua rounded-xl px-4 py-2.5 text-lg cursor-pointer bg-primary text-primary-foreground"
                style={{ boxShadow: "0 4px 0 hsl(122,52%,20%)" }}
                whileHover={{ y: -2, scale: 1.05 }}
                whileTap={{ scale: 0.95, y: 2 }}
                onClick={() => navigate("/login")}
              >
                🦊 로그인
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </nav>
    </motion.header>

    {/* Game-style Profile Panel */}
    {isLoggedIn && user && (
      <GameProfilePanel
        isOpen={showProfilePanel}
        onClose={() => setShowProfilePanel(false)}
      />
    )}
  </>
  );
};

export default Header;
