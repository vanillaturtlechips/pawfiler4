import { motion, type HTMLMotionProps } from "framer-motion";
import { type ReactNode } from "react";

interface WoodPanelProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
}

const WoodPanel = ({ children, className = "", ...props }: WoodPanelProps) => (
  <motion.div
    className={`rounded-3xl p-7 text-foreground shadow-fairy wood-grain relative overflow-hidden ${className}`}
    style={{
      background: "hsl(var(--wood-base))",
      border: "6px solid hsl(var(--wood-darkest))",
    }}
    initial={{ opacity: 0, y: 30, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    {...props}
  >
    {children}
  </motion.div>
);

export default WoodPanel;
