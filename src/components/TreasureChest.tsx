import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const TreasureChest = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // HomePage에서만 표시
  if (location.pathname !== "/") return null;

  return (
    <motion.div
      className="fixed bottom-[5vh] right-[2vw] z-50 cursor-pointer"
      onClick={() => navigate("/shop")}
      whileHover={{ scale: 1.1, y: -10 }}
      whileTap={{ scale: 0.95 }}
      animate={{ 
        y: [0, -8, 0],
      }}
      transition={{ 
        y: { repeat: Infinity, duration: 2.5, ease: "easeInOut" }
      }}
    >
      <motion.div
        className="relative flex flex-col items-center gap-2 rounded-2xl p-[clamp(16px,1.5vw,20px)] wood-grain"
        style={{
          background: "hsl(var(--wood-base))",
          border: "6px solid hsl(var(--wood-darkest))",
          boxShadow: "10px 10px 20px rgba(0,0,0,0.7), inset 0 5px 10px rgba(255,255,255,0.1)",
        }}
        whileHover={{
          boxShadow: "10px 20px 30px rgba(0,0,0,0.8), 0 0 30px rgba(255, 215, 0, 0.5)",
        }}
      >
        {/* 반짝이는 효과 */}
        <motion.div
          className="absolute -top-2 -right-2 text-[clamp(1.5rem,2.5vw,2rem)]"
          animate={{ 
            scale: [1, 1.3, 1],
            rotate: [0, 20, 0]
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 1.5,
            ease: "easeInOut"
          }}
        >
          ✨
        </motion.div>

        {/* 보물상자 */}
        <span className="text-[clamp(3rem,5vw,4rem)] drop-shadow-lg">🎁</span>
        
        {/* 텍스트 */}
        <span className="font-jua text-[clamp(0.875rem,1.2vw,1.125rem)] text-foreground text-shadow-deep whitespace-nowrap">
          상점
        </span>
      </motion.div>
    </motion.div>
  );
};

export default TreasureChest;
