import { motion } from "framer-motion";
import { type ReactNode, useRef, useState } from "react";

interface GameButtonProps {
  children: ReactNode;
  variant?: "green" | "blue" | "orange";
  className?: string;
  onClick?: () => void;
}

const variantConfig = {
  green: {
    bg: "linear-gradient(135deg, hsl(142 60% 45%), hsl(160 55% 40%))",
    shadow: "0 6px 0 hsl(142 55% 28%), 0 8px 25px hsl(142 60% 30% / 0.4)",
    shadowActive: "0 2px 0 hsl(142 55% 28%)",
    glow: "0 0 30px hsl(142 60% 45% / 0.4)",
    ripple: "hsl(142 60% 70% / 0.4)",
  },
  blue: {
    bg: "linear-gradient(135deg, hsl(210 80% 55%), hsl(225 70% 50%))",
    shadow: "0 6px 0 hsl(210 75% 32%), 0 8px 25px hsl(210 80% 35% / 0.4)",
    shadowActive: "0 2px 0 hsl(210 75% 32%)",
    glow: "0 0 30px hsl(210 80% 55% / 0.4)",
    ripple: "hsl(210 80% 75% / 0.4)",
  },
  orange: {
    bg: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 50%))",
    shadow: "0 6px 0 hsl(25 90% 32%), 0 8px 25px hsl(25 95% 35% / 0.4)",
    shadowActive: "0 2px 0 hsl(25 90% 32%)",
    glow: "0 0 30px hsl(25 95% 55% / 0.4)",
    ripple: "hsl(25 90% 75% / 0.4)",
  },
};

interface Ripple {
  x: number;
  y: number;
  id: number;
}

const GameButton = ({ children, variant = "green", className = "", onClick }: GameButtonProps) => {
  const config = variantConfig[variant];
  const btnRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const id = ++idRef.current;
      setRipples(prev => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
      setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
    }
    onClick?.();
  };

  return (
    <motion.button
      ref={btnRef}
      className={`relative flex w-full items-center justify-center gap-2.5 rounded-2xl border-none px-7 py-4 text-xl cursor-pointer font-jua text-white overflow-hidden ${className}`}
      style={{
        background: config.bg,
        boxShadow: config.shadow,
        textShadow: "1px 2px 3px rgba(0,0,0,0.3)",
      }}
      whileHover={{
        scale: 1.03,
        y: -2,
        boxShadow: `${config.shadow}, ${config.glow}`,
      }}
      whileTap={{
        scale: 0.97,
        y: 3,
        boxShadow: config.shadowActive,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      onClick={handleClick}
    >
      {/* Shine sweep */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)",
        }}
        initial={{ x: "-100%" }}
        whileHover={{ x: "100%" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      {/* Ripple effects */}
      {ripples.map(r => (
        <motion.span
          key={r.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: r.x,
            top: r.y,
            background: config.ripple,
            transform: "translate(-50%, -50%)",
          }}
          initial={{ width: 0, height: 0, opacity: 0.7 }}
          animate={{ width: 300, height: 300, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
};

export default GameButton;
