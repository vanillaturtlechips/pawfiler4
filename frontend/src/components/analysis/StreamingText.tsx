import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  text: string;
  speed?: number; // ms per character
  className?: string;
  onComplete?: () => void;
}

export default function StreamingText({ text, speed = 25, className, onComplete }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    idx.current = 0;
    setDisplayed("");
    setDone(false);

    const interval = setInterval(() => {
      idx.current++;
      if (idx.current >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(interval);
        onComplete?.();
      } else {
        setDisplayed(text.slice(0, idx.current));
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  // Auto scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayed]);

  return (
    <div ref={containerRef} className={className}>
      <span>{displayed}</span>
      {!done && (
        <motion.span
          className="inline-block w-1.5 h-4 ml-0.5 align-middle rounded-sm"
          style={{ background: "hsl(199,97%,47%)" }}
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
      )}
    </div>
  );
}
