import { motion } from "framer-motion";
import { type ReactNode } from "react";

interface GameButtonProps {
  children: ReactNode;
  variant?: "green" | "blue" | "orange";
  className?: string;
  onClick?: () => void;
}

const variantStyles = {
  green: "btn-3d-green",
  blue: "btn-3d-blue",
  orange: "btn-3d-orange",
};

const GameButton = ({ children, variant = "green", className = "", onClick }: GameButtonProps) => (
  <motion.button
    className={`flex w-full items-center justify-center gap-2.5 rounded-2xl border-none px-7 py-4 text-xl cursor-pointer ${variantStyles[variant]} ${className}`}
    style={{
      textShadow: "2px 2px 0 rgba(0,0,0,0.3)",
    }}
    whileHover={{ scale: 1.02, y: -1 }}
    whileTap={{ scale: 0.98, y: 2, boxShadow: "none" }}
    transition={{ type: "spring", stiffness: 400, damping: 17 }}
    onClick={onClick}
  >
    {children}
  </motion.button>
);

export default GameButton;
