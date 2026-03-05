import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface MagicDoorProps {
  icon: string;
  title: string;
  description: string;
  color: "green" | "blue" | "orange";
  to: string;
  scenery?: "playground" | "detective" | "plaza";
  backgroundImage?: string;
}

const colorMap = {
  green: {
    bg: "radial-gradient(circle, hsl(122,52%,33%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(122,38%,64%)",
    titleColor: "hsl(var(--magic-green))",
    hoverShadow: "0 0 40px hsl(122,38%,64%), 0 0 80px hsl(122,52%,33%)",
  },
  blue: {
    bg: "radial-gradient(circle, hsl(199,97%,37%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(199,90%,64%)",
    titleColor: "hsl(var(--magic-blue))",
    hoverShadow: "0 0 40px hsl(199,90%,64%), 0 0 80px hsl(199,97%,37%)",
  },
  orange: {
    bg: "radial-gradient(circle, hsl(27,100%,47%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(28,100%,65%)",
    titleColor: "hsl(var(--magic-orange))",
    hoverShadow: "0 0 40px hsl(28,100%,65%), 0 0 80px hsl(27,100%,47%)",
  },
};

const MagicDoor = ({ icon, title, description, color, to, scenery, backgroundImage }: MagicDoorProps) => {
  const [isHovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const c = colorMap[color];

  // 풍경 이모지 설정
  const getSceneryEmojis = () => {
    switch (scenery) {
      case "playground":
        return ["🎪", "🎠", "🎡", "🎢", "🎈"];
      case "detective":
        return ["🔍", "🕵️", "📋", "🔦", "🗂️"];
      case "plaza":
        return ["⛲", "🌳", "🏛️", "🕊️", "🌸"];
      default:
        return [];
    }
  };

  const sceneryEmojis = getSceneryEmojis();

  return (
    <motion.div
      className="relative flex cursor-pointer flex-col items-center"
      style={{ perspective: 1200 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => navigate(to)}
      whileTap={{ scale: 0.97 }}
    >
      {/* Door frame */}
      <motion.div
        className="relative overflow-hidden"
        style={{
          width: 280,
          height: 380,
          borderRadius: "140px 140px 0 0",
          background: "#000",
          boxShadow: isHovered
            ? `0 40px 60px rgba(0,0,0,0.9), ${c.hoverShadow}`
            : "0 20px 40px rgba(0,0,0,0.7), inset 0 0 30px rgba(0,0,0,0.8)",
          border: "16px solid hsl(var(--wood-darkest))",
          borderBottom: "0",
        }}
        animate={{
          y: isHovered ? -15 : 0,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Portal glow inside */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: c.bg, boxShadow: c.glow }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* 배경 이미지 */}
          {backgroundImage && (
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={isHovered ? { scale: 1, opacity: 1 } : { scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          )}
          
          {/* 그라데이션 오버레이 (이미지가 있을 때 더 잘 보이도록) */}
          {backgroundImage && (
            <div 
              className="absolute inset-0" 
              style={{ 
                background: `radial-gradient(circle, transparent 30%, ${c.bg.split(',')[0].split('(')[1]} 100%)`,
                opacity: 0.4
              }} 
            />
          )}
          
          {/* 풍경 배경 (이미지가 없을 때만) */}
          {scenery && isHovered && !backgroundImage && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {sceneryEmojis.map((emoji, idx) => (
                <motion.span
                  key={idx}
                  className="absolute text-4xl opacity-60"
                  initial={{ 
                    x: (idx - 2) * 60,
                    y: 50,
                    scale: 0.5,
                    opacity: 0 
                  }}
                  animate={{ 
                    y: [50, -20, 50],
                    scale: [0.5, 1, 0.5],
                    opacity: [0, 0.6, 0]
                  }}
                  transition={{
                    duration: 3,
                    delay: idx * 0.2,
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                >
                  {emoji}
                </motion.span>
              ))}
            </div>
          )}
          
          {/* 아이콘 (이미지가 없을 때만) */}
          {!backgroundImage && (
            <motion.span
              className="text-[90px] drop-shadow-[0_0_20px_white] relative z-10"
              animate={
                isHovered
                  ? { scale: 1.15, y: [-5, 5, -5] }
                  : { scale: 0.5, y: 0 }
              }
              transition={
                isHovered
                  ? { y: { repeat: Infinity, duration: 2 }, scale: { type: "spring", stiffness: 300 } }
                  : { duration: 0.3 }
              }
            >
              {icon}
            </motion.span>
          )}
        </motion.div>

        {/* Left door panel */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1/2 wood-grain"
          style={{
            background: "hsl(var(--wood-base))",
            borderRight: "2px solid #111",
            borderRadius: "124px 0 0 0",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
            transformOrigin: "left",
          }}
          animate={{ rotateY: isHovered ? -105 : 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Door knob */}
          <div
            className="absolute right-4 top-1/2 h-3.5 w-3.5 rounded-full"
            style={{
              background: "#FFCC80",
              boxShadow: "1px 1px 3px #000",
            }}
          />
        </motion.div>

        {/* Right door panel */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-1/2 wood-grain"
          style={{
            background: "hsl(var(--wood-base))",
            borderLeft: "2px solid #111",
            borderRadius: "0 124px 0 0",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
            transformOrigin: "right",
          }}
          animate={{ rotateY: isHovered ? 105 : 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <div
            className="absolute left-4 top-1/2 h-3.5 w-3.5 rounded-full"
            style={{
              background: "#FFCC80",
              boxShadow: "1px 1px 3px #000",
            }}
          />
        </motion.div>
      </motion.div>

      {/* Description tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute -bottom-24 w-[280px] rounded-2xl border-4 p-4 text-center"
            style={{
              background: "hsl(var(--parchment))",
              borderColor: "hsl(var(--parchment-border))",
              boxShadow: "0 10px 20px rgba(0,0,0,0.6)",
              zIndex: 20,
            }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <div className="font-jua text-2xl mb-1" style={{ color: c.titleColor }}>
              {title}
            </div>
            <div className="text-sm font-bold" style={{ color: "hsl(var(--parchment-text))" }}>
              {description}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default MagicDoor;
