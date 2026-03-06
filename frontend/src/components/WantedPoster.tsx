import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const WantedPoster = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      className="absolute top-28 left-8 z-10 w-56 cursor-pointer rounded-br-2xl p-5 text-center"
      style={{
        background: "hsl(var(--parchment))",
        border: "3px solid hsl(var(--parchment-border))",
        boxShadow: "5px 10px 15px rgba(0,0,0,0.6)",
        color: "hsl(var(--wood-darkest))",
      }}
      animate={{ rotate: [-4, -1, -4] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      whileHover={{
        scale: 1.15,
        rotate: 0,
        zIndex: 30,
        boxShadow: "10px 15px 25px rgba(0,0,0,0.7)",
      }}
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate("/game")}
    >
      {/* Pin */}
      <div
        className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full"
        style={{
          background: "#D32F2F",
          boxShadow: "inset -3px -3px 5px rgba(0,0,0,0.5), 2px 5px 5px rgba(0,0,0,0.6)",
        }}
      />

      <div className="font-jua text-xl border-b-2 border-dashed border-parchment-border pb-2 mb-3">
        오늘의 수배지 📜
      </div>
      <div className="text-sm font-bold mb-1">가짜 영상 3번 찾기</div>
      <div className="text-xs text-muted-foreground mb-3">( 1 / 3 완료 )</div>
      <div
        className="font-jua rounded-xl border-2 border-parchment-border bg-white p-2 text-base"
        style={{ color: "hsl(var(--magic-orange))" }}
      >
        보상: 🪙 50닢
      </div>
    </motion.div>
  );
};

export default WantedPoster;
