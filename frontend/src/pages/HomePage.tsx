import { motion } from "framer-motion";
import MagicDoor from "@/components/MagicDoor";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { config } from "@/lib/config";

const HomePage = () => {
  const navigate = useNavigate();
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // localStorage에서 첫 접속 여부 확인
    const hasSeenTutorial = localStorage.getItem(config.tutorialStorageKey);
    
    if (!hasSeenTutorial) {
      // 첫 접속이면 튜토리얼 표시
      setShowTutorial(true);
      
      // 30초 후 튜토리얼 자동 숨김
      const timer = setTimeout(() => {
        setShowTutorial(false);
        localStorage.setItem(config.tutorialStorageKey, 'true');
      }, 30000);

      // ESC 키로 튜토리얼 닫기
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowTutorial(false);
          localStorage.setItem(config.tutorialStorageKey, 'true');
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem(config.tutorialStorageKey, 'true');
  };

  return (
    <div className="relative h-[calc(100vh-5rem)] w-full flex items-center justify-center" style={{ paddingTop: "0", marginTop: "-5vh" }}>
      {/* Tutorial Overlay - Full Screen with Dashboard Background */}
      {showTutorial && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: "linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.9))",
            backdropFilter: "blur(4px)"
          }}
        >
          {/* Background image similar to dashboard */}
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "url('/src/assets/game-background.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat"
            }}
          />
          
          {/* Close button */}
          <button
            onClick={handleCloseTutorial}
            className="absolute top-6 right-6 z-20 px-4 py-2 rounded-full text-sm font-jua bg-black/60 text-amber-300 border border-amber-500/50 hover:bg-black/80 transition-colors shadow-lg"
          >
            건너뛰기 (ESC)
          </button>

          {/* Tutorial Content */}
          <div className="w-full max-w-6xl px-4 relative z-10">
            {/* Header */}
            <motion.div
              className="text-center mb-10"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="inline-block p-6 rounded-3xl bg-gradient-to-r from-amber-900/40 to-amber-800/40 border-2 border-amber-700/40 mb-6 shadow-xl">
                <span className="text-7xl">🐾</span>
              </div>
              <h1 className="font-jua text-5xl md:text-6xl text-white mb-3 text-shadow-deep">
                <span className="text-amber-300">PawFiler</span>에 오신 것을 환영합니다!
              </h1>
              <p className="text-xl text-amber-100">
                동물 탐정이 되어 가짜 영상을 찾아보세요
              </p>
            </motion.div>

            {/* Tutorial Steps */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-10">
              {/* Step 1 */}
              <motion.div
                className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-3xl p-8 border-2 border-amber-700/40 shadow-2xl backdrop-blur-sm"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-900/60 text-3xl mb-4">
                    🖱️
                  </div>
                  <h3 className="font-jua text-2xl text-amber-300 mb-3">메뉴 사용법</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">1</div>
                    <p className="text-white text-base leading-relaxed">
                      마우스를 <span className="text-amber-300 font-bold">화면 상단</span>으로 이동
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">2</div>
                    <p className="text-white text-base leading-relaxed">
                      헤더 메뉴가 <span className="text-green-400 font-bold">슬라이드 다운</span>
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">3</div>
                    <p className="text-white text-base leading-relaxed">
                      마우스 치우면 <span className="text-amber-300 font-bold">자동 숨김</span>
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Step 2 */}
              <motion.div
                className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-3xl p-8 border-2 border-amber-700/40 shadow-2xl backdrop-blur-sm"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-900/60 text-3xl mb-4">
                    🚪
                  </div>
                  <h3 className="font-jua text-2xl text-amber-300 mb-3">모험 시작하기</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">1</div>
                    <p className="text-white text-base leading-relaxed">
                      <span className="text-green-400 font-bold">놀이터</span> - 퀴즈 게임
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">2</div>
                    <p className="text-white text-base leading-relaxed">
                      <span className="text-blue-400 font-bold">추리쇼</span> - 영상 분석
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">3</div>
                    <p className="text-white text-base leading-relaxed">
                      <span className="text-orange-400 font-bold">광장</span> - 커뮤니티
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Step 3 */}
              <motion.div
                className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-3xl p-8 border-2 border-amber-700/40 shadow-2xl backdrop-blur-sm"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-900/60 text-3xl mb-4">
                    🦊
                  </div>
                  <h3 className="font-jua text-2xl text-amber-300 mb-3">프로필 & 보상</h3>
                </div>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">1</div>
                    <p className="text-white text-base leading-relaxed">
                      상단 <span className="text-amber-300 font-bold">프로필 버튼</span> 클릭
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">2</div>
                    <p className="text-white text-base leading-relaxed">
                      퀘스트로 <span className="text-yellow-400 font-bold">코인 & 경험치</span> 획득
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center text-base font-bold flex-shrink-0">3</div>
                    <p className="text-white text-base leading-relaxed">
                      레벨업으로 <span className="text-green-400 font-bold">새 칭호</span> 획득
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Start Button */}
            <motion.div
              className="text-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <motion.button
                onClick={handleCloseTutorial}
                className="font-jua px-8 py-4 text-xl rounded-2xl cursor-pointer relative overflow-hidden group"
                style={{
                  background: "linear-gradient(135deg, #FFD54F, #FFA726)",
                  color: "#1B1B1B",
                  border: "3px solid #E65100",
                  boxShadow: "0 6px 0 #E65100, 0 0 30px rgba(255,213,79,0.4)"
                }}
                whileHover={{ y: -3, scale: 1.05 }}
                whileTap={{ scale: 0.98, y: 2 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <span className="text-2xl">🐾</span>
                  모험 시작하기
                </span>
              </motion.button>
              
              <p className="text-amber-200/70 text-sm mt-4">
                튜토리얼은 30초 후 자동으로 사라집니다 • ESC 키로 언제든지 건너뛸 수 있습니다
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center gap-[1.5vh] w-full max-w-[90vw]">
        {/* Tutorial hint (always visible) */}
        <motion.div
          className="mb-1 px-3 py-1 rounded-full text-xs font-jua flex items-center gap-1"
          style={{
            background: "rgba(255,213,79,0.1)",
            border: "1px solid rgba(255,213,79,0.3)",
            color: "#FFD54F"
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <span>💡</span>
          <span>마우스를 화면 상단으로 이동해보세요</span>
        </motion.div>

        <motion.h1
          className="font-jua text-[clamp(1.25rem,2.5vw,2.5rem)] text-foreground text-shadow-glow animate-glow-text"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          어느 문으로 모험을 떠날까요?
        </motion.h1>

        <div className="flex items-center justify-center gap-[1.5vw] w-full max-w-[1100px]">
          <MagicDoor
            icon="🎮"
            title="동물들의 놀이터"
            description="동물들이 숨겨놓은 가짜를 찾아라! 눈썰미를 키우는 미니 게임"
            color="green"
            to="/game"
            scenery="playground"
            backgroundImage="/playground.png"
          />
          <MagicDoor
            icon="🔮"
            title="동물들의 추리쇼"
            description="의심되는 영상 파일이나 주소를 주면 마법으로 진짜인지 분석해드려요"
            color="blue"
            to="/analysis"
            scenery="detective"
            backgroundImage="/detective.png"
          />
          <MagicDoor
            icon="⛲"
            title="동물들의 광장"
            description="다른 탐정 친구들을 만나 정보와 꿀팁을 나누는 커뮤니티"
            color="orange"
            to="/community"
            scenery="plaza"
            backgroundImage="/water.png"
          />
        </div>

        {/* Bottom hint */}
        <motion.div
          className="mt-1 text-center"
          style={{ color: "#FFCC80", position: "relative", zIndex: 1 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <p className="text-xs sm:text-sm">문을 클릭하여 모험을 시작하세요!</p>
          <p className="text-[10px] sm:text-xs mt-0.5" style={{ color: "#BDBDBD" }}>
            각 모험에서는 코인과 경험치를 얻을 수 있습니다
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default HomePage;
