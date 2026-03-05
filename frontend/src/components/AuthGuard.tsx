import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import WoodPanel from "@/components/WoodPanel";
import GameButton from "@/components/GameButton";
import type { ReactNode } from "react";

interface AuthGuardProps {
  children: ReactNode;
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  if (!isLoggedIn) {
    return (
      <motion.div
        className="flex h-full items-center justify-center p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <WoodPanel className="flex flex-col items-center justify-center text-center max-w-md w-full py-12 gap-5">
          <motion.div
            className="text-8xl"
            animate={{ y: [-5, 5, -5], rotate: [-3, 3, -3] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            🔒
          </motion.div>
          <h2 className="font-jua text-3xl text-shadow-deep">
            탐정 자격증이 필요해요!
          </h2>
          <p className="text-lg leading-relaxed opacity-80">
            이 구역에 들어가려면 먼저 로그인해야 해요.<br />
            탐정 사무소에서 등록하세요!
          </p>
          <GameButton variant="green" onClick={() => navigate("/login")}>
            🦊 로그인하러 가기
          </GameButton>
        </WoodPanel>
      </motion.div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;
