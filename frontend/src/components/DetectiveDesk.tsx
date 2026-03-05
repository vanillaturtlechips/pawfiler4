import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const DetectiveDesk = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      className="absolute bottom-8 right-8 z-10 flex cursor-pointer items-center gap-4 rounded-2xl p-4 px-6 wood-grain"
      style={{
        background: "hsl(var(--wood-base))",
        border: "6px solid hsl(var(--wood-darkest))",
        boxShadow: "10px 10px 20px rgba(0,0,0,0.7), inset 0 5px 10px rgba(255,255,255,0.1)",
      }}
      whileHover={{
        y: -10,
        scale: 1.02,
        boxShadow: "10px 20px 30px rgba(0,0,0,0.8)",
        zIndex: 30,
      }}
      whileTap={{ scale: 0.97, y: 2 }}
      animate={{ y: [0, -3, 0] }}
      transition={{ y: { repeat: Infinity, duration: 4, ease: "easeInOut" } } as any}
      onClick={() => navigate("/shop")}
    >
      <span className="text-5xl drop-shadow-lg">🦊</span>
      <div className="flex flex-col">
        <span className="font-jua text-xl text-foreground text-shadow-deep">
          날쌘 여우 탐정
        </span>
        <span className="text-sm font-bold mt-1" style={{ color: "#FFCC80" }}>
          ⭐ Lv. 5 (전문가)
        </span>
        <span className="font-jua text-base mt-2 inline-block rounded-lg bg-black/30 px-2 py-0.5" style={{ color: "#FFD54F" }}>
          💰 1,200 닢
        </span>
      </div>
    </motion.div>
  );
};

export default DetectiveDesk;
