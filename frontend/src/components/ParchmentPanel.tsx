import { motion, type HTMLMotionProps } from "framer-motion";
import { type ReactNode } from "react";

interface ParchmentPanelProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
}

const ParchmentPanel = ({ children, className = "", ...props }: ParchmentPanelProps) => (
  <motion.div
    className={`rounded-3xl p-7 shadow-fairy relative overflow-hidden ${className}`}
    style={{
      background: "hsl(var(--parchment))",
      border: "6px solid hsl(var(--parchment-border))",
      color: "hsl(var(--parchment-text))",
    }}
    initial={{ opacity: 0, y: 30, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ type: "spring", stiffness: 200, damping: 20 }}
    {...props}
  >
    {children}
  </motion.div>
);

export default ParchmentPanel;
