import { motion } from "framer-motion";
import MagicDoor from "@/components/MagicDoor";
import WantedPoster from "@/components/WantedPoster";
import DetectiveDesk from "@/components/DetectiveDesk";

const HomePage = () => {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-10">
      <WantedPoster />
      <DetectiveDesk />

      <motion.h1
        className="font-jua text-5xl text-foreground text-shadow-glow animate-glow-text"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        어느 문으로 모험을 떠날까요?
      </motion.h1>

      <div className="flex items-center justify-center gap-10 w-full max-w-[1100px]">
        <MagicDoor
          icon="🎮"
          title="탐정 훈련소"
          description="동물들이 숨겨놓은 가짜를 찾아라! 눈썰미를 키우는 미니 게임"
          color="green"
          to="/game"
        />
        <MagicDoor
          icon="🔮"
          title="마법 구슬 분석"
          description="의심되는 영상 파일이나 주소를 주면 마법으로 진짜인지 분석해드려요"
          color="blue"
          to="/analysis"
        />
        <MagicDoor
          icon="📜"
          title="동물들의 광장"
          description="다른 탐정 친구들을 만나 정보와 꿀팁을 나누는 커뮤니티"
          color="orange"
          to="/community"
        />
      </div>
    </div>
  );
};

export default HomePage;
