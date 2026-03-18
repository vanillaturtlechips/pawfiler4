import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface MagicDoorProps {
  icon: string;
  title: string;
  description: string;
  label: string;        // 기본 상태 짧은 라벨
  tagline: string;      // hover 시 한 줄 요약
  color: "green" | "blue" | "orange";
  to: string;
  scenery?: "playground" | "detective" | "plaza";
  backgroundImage?: string;
  onHoverChange?: (hovered: boolean) => void;
}

const colorMap = {
  green: {
    bg: "radial-gradient(circle, hsl(122,52%,33%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(122,38%,64%)",
    titleColor: "hsl(var(--magic-green))",
    hoverShadow: "0 0 40px hsl(122,38%,64%), 0 0 80px hsl(122,52%,33%)",
    labelColor: "hsl(122,50%,70%)",
    crackColor: "hsl(122,60%,55%)",
  },
  blue: {
    bg: "radial-gradient(circle, hsl(199,97%,37%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(199,90%,64%)",
    titleColor: "hsl(var(--magic-blue))",
    hoverShadow: "0 0 40px hsl(199,90%,64%), 0 0 80px hsl(199,97%,37%)",
    labelColor: "hsl(199,80%,70%)",
    crackColor: "hsl(199,90%,60%)",
  },
  orange: {
    bg: "radial-gradient(circle, hsl(27,100%,47%) 0%, #111 80%)",
    glow: "inset 0 0 60px hsl(28,100%,65%)",
    titleColor: "hsl(var(--magic-orange))",
    hoverShadow: "0 0 40px hsl(28,100%,65%), 0 0 80px hsl(27,100%,47%)",
    labelColor: "hsl(28,100%,72%)",
    crackColor: "hsl(28,100%,60%)",
  },
};

const MagicDoor = ({
  icon, title, description, label, tagline,
  color, to, scenery, backgroundImage, onHoverChange,
}: MagicDoorProps) => {
  const [isHovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const c = colorMap[color];

  const handleHoverStart = () => {
    setHovered(true);
    onHoverChange?.(true);
  };
  const handleHoverEnd = () => {
    setHovered(false);
    onHoverChange?.(false);
  };

  const getSceneryEmojis = () => {
    switch (scenery) {
      case "playground": return ["🎪", "🎠", "🎡", "🎢", "🎈"];
      case "detective":  return ["🔍", "🕵️", "📋", "🔦", "🗂️"];
      case "plaza":      return ["⛲", "🌳", "🏛️", "🕊️", "🌸"];
      default:           return [];
    }
  };
  const sceneryEmojis = getSceneryEmojis();

  return (
    <motion.div
      className="relative flex cursor-pointer flex-col items-center"
      style={{ perspective: 1200, zIndex: isHovered ? 100 : 1 }}
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
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
        animate={{ y: isHovered ? -15 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Portal glow inside */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: c.bg, boxShadow: c.glow }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
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
          {backgroundImage && (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle, transparent 30%, ${c.bg.split(',')[0].split('(')[1]} 100%)`,
                opacity: 0.4,
              }}
            />
          )}
          {scenery && isHovered && !backgroundImage && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {sceneryEmojis.map((emoji, idx) => (
                <motion.span
                  key={idx}
                  className="absolute text-4xl opacity-60"
                  initial={{ x: (idx - 2) * 60, y: 50, scale: 0.5, opacity: 0 }}
                  animate={{ y: [50, -20, 50], scale: [0.5, 1, 0.5], opacity: [0, 0.6, 0] }}
                  transition={{ duration: 3, delay: idx * 0.2, repeat: Infinity, repeatDelay: 1 }}
                >
                  {emoji}
                </motion.span>
              ))}
            </div>
          )}
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

        {/* 문 틈 빛 (hover 전 은은하게 새어나오는 빛) */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent 40%, ${c.crackColor}18 100%)`,
          }}
          animate={{ opacity: isHovered ? 0 : 1 }}
          transition={{ duration: 0.4 }}
        />

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
          <div
            className="absolute right-4 top-1/2 h-3.5 w-3.5 rounded-full"
            style={{ background: "#FFCC80", boxShadow: "1px 1px 3px #000" }}
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
            style={{ background: "#FFCC80", boxShadow: "1px 1px 3px #000" }}
          />
        </motion.div>

        {/* 기본 상태 아이콘 (문 닫혔을 때 중앙 상단에 은은하게) */}
        <motion.div
          className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none"
          animate={{ opacity: isHovered ? 0 : 0.65 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-2xl">{icon}</span>
        </motion.div>
      </motion.div>

      {/* 기본 상태 라벨 (문 아래) */}
      <motion.div
        className="mt-3 px-4 py-1 rounded-full font-jua text-xs tracking-wide"
        style={{
          background: "rgba(0,0,0,0.55)",
          border: `1px solid ${c.labelColor}70`,
          color: c.labelColor,
          backdropFilter: "blur(6px)",
          textShadow: `0 0 8px ${c.labelColor}60`,
        }}
        animate={{ opacity: isHovered ? 0 : 1, y: isHovered ? 3 : 0 }}
        transition={{ duration: 0.2 }}
      >
        {label}
      </motion.div>

      {/* hover 설명 카드 */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute w-[280px] rounded-2xl p-3.5 text-center"
            style={{
              bottom: "-88px",
              background: "hsl(var(--parchment))",
              border: `3px solid hsl(var(--parchment-border))`,
              boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
              zIndex: 50,
            }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            {/* 제목 */}
            <div className="font-jua text-lg leading-tight mb-1" style={{ color: c.titleColor }}>
              {title}
            </div>
            {/* 한 줄 태그라인 */}
            <div className="font-jua text-xs mb-1.5" style={{ color: "hsl(var(--wood-base))" }}>
              {tagline}
            </div>
            {/* 구분선 */}
            <div className="w-full h-px mb-1.5" style={{ background: "hsl(var(--parchment-border))" }} />
            {/* 설명 */}
            <div className="text-xs leading-relaxed break-keep" style={{ color: "hsl(var(--parchment-text))" }}>
              {description}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default MagicDoor;
