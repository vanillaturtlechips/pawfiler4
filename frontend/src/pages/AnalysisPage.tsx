import { useState } from "react";
import { motion } from "framer-motion";
import AnalysisVariant1 from "@/components/analysis/AnalysisVariant1";
import AnalysisVariant2 from "@/components/analysis/AnalysisVariant2";
import AnalysisVariant3 from "@/components/analysis/AnalysisVariant3";
import AnalysisVariant4 from "@/components/analysis/AnalysisVariant4";

const variants = [
  { id: 1, label: "센터 포커스", emoji: "🎯", Component: AnalysisVariant1 },
  { id: 2, label: "스테이지 전환", emoji: "🃏", Component: AnalysisVariant2 },
  { id: 3, label: "대시보드", emoji: "📊", Component: AnalysisVariant3 },
  { id: 4, label: "스크롤 스토리", emoji: "📜", Component: AnalysisVariant4 },
];

const AnalysisPage = () => {
  const [active, setActive] = useState(1);
  const ActiveComponent = variants.find(v => v.id === active)!.Component;

  return (
    <div className="relative w-full">
      {/* Variant switcher (floating) */}
      <div className="sticky top-0 z-50 flex justify-center py-2">
        <motion.div
          className="flex gap-1 rounded-2xl p-1"
          style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {variants.map(v => (
            <button
              key={v.id}
              className="relative px-4 py-2 rounded-xl text-sm font-jua transition-colors"
              style={{
                color: active === v.id ? "white" : "rgba(255,255,255,0.5)",
              }}
              onClick={() => setActive(v.id)}
            >
              {active === v.id && (
                <motion.div
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "hsl(var(--magic-blue))" }}
                  layoutId="activeTab"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              <span className="relative z-10">{v.emoji} {v.label}</span>
            </button>
          ))}
        </motion.div>
      </div>

      <ActiveComponent />
    </div>
  );
};

export default AnalysisPage;
