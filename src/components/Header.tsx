import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { id: "/", label: "🏠 마을 입구", key: "home" },
  { id: "/game", label: "🎮 게임", key: "game" },
  { id: "/analysis", label: "🔮 분석", key: "anal" },
  { id: "/community", label: "📜 광장", key: "comm" },
  { id: "/shop", label: "🛒 상점", key: "shop" },
];

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, user, logout } = useAuth();

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="relative z-50 flex h-20 flex-shrink-0 items-center justify-between px-6 md:px-10 wood-texture"
      style={{
        backgroundColor: "hsl(var(--wood-dark))",
        borderBottom: "6px solid hsl(var(--wood-darkest))",
        boxShadow: "0 15px 30px rgba(0,0,0,0.7)",
      }}
    >
      <motion.div
        className="font-jua cursor-pointer flex items-center gap-2.5 text-3xl text-foreground text-shadow-deep"
        onClick={() => navigate("/")}
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
              onClick={() => navigate(item.id)}
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
                className="flex items-center gap-2"
              >
                <span className="text-2xl">{user.avatarEmoji}</span>
                <span className="font-jua text-sm text-foreground hidden md:inline">
                  {user.nickname}
                </span>
                {user.subscriptionType === "premium" && (
                  <span className="text-xs rounded-full px-2 py-0.5 font-jua" style={{ background: "#FFD54F", color: "#333" }}>
                    ⭐ PRO
                  </span>
                )}
                <motion.button
                  className="font-jua rounded-lg px-3 py-1.5 text-sm cursor-pointer bg-destructive text-destructive-foreground"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
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
  );
};

export default Header;
