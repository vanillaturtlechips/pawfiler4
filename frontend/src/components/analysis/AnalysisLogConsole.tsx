import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import type { LogEntry } from "@/hooks/useAnalysis";

const typeColor: Record<string, string> = {
  info: "text-foreground/50",
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
};

export default function AnalysisLogConsole({ logs, isOpen }: { logs: LogEntry[]; isOpen: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (!isOpen || logs.length === 0) return null;

  return (
    <motion.div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: "rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="text-[10px] font-mono text-foreground/30 ml-2">pawfiler-mcp-pipeline</span>
        <motion.div
          className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
      </div>

      {/* Logs */}
      <div className="px-4 py-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
        <AnimatePresence>
          {logs.map((log, i) => (
            <motion.div
              key={i}
              className="flex gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-foreground/20 flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString("ko-KR", { hour12: false })}
              </span>
              <span className={typeColor[log.type] || "text-foreground/50"}>
                {log.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
