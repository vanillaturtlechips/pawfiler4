import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { useAuth } from "@/contexts/AuthContext";
import { getSubscriptionPlans, checkout } from "@/lib/api";
import type { SubscriptionPlan } from "@/lib/types";

const ShopPage = () => {
  const { token, user, updateUser } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const loadedPlans = await getSubscriptionPlans();
        setPlans(loadedPlans);
        if (loadedPlans.length > 0) {
          setSelectedPlan(loadedPlans[0]);
        }
      } catch (error) {
        console.error('Failed to load plans:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  const handleCheckout = async () => {
    if (!token || !selectedPlan) return;
    setProcessing(true);
    try {
      const res = await checkout({ planId: selectedPlan.id });
      if (res.success) {
        updateUser({ subscriptionType: res.newSubscriptionType });
        setSuccess(true);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRestart = () => {
    setSuccess(false);
  };

  return (
    <motion.div
      className="flex h-[calc(100vh-5rem)] items-center justify-center gap-7 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <WoodPanel className="flex flex-col items-center text-center max-w-md py-12 gap-5">
              <motion.div
                className="text-8xl"
                animate={{ y: [-8, 8, -8], rotate: [-5, 5, -5] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                🎉
              </motion.div>
              <h2 className="font-jua text-4xl text-shadow-deep">프리미엄 탐정!</h2>
              <p className="text-lg opacity-80">
                축하해요! 이제 {user?.nickname}님은 프리미엄 탐정이에요!
              </p>
              <div className="font-jua text-2xl" style={{ color: "#FFD54F" }}>
                ⭐ Premium Member
              </div>
              <GameButton variant="blue" onClick={handleRestart}>
                다시 둘러보기
              </GameButton>
            </WoodPanel>
          </motion.div>
        ) : loading ? (
          <WoodPanel className="flex flex-col items-center text-center max-w-sm w-full py-10 gap-5">
            <div className="text-5xl animate-spin">⏳</div>
            <p className="font-jua text-xl">플랜 로딩 중...</p>
          </WoodPanel>
        ) : (
          <>
            <motion.div key="plans" className="flex flex-col gap-5 max-w-sm w-full">
              {plans.map((plan) => (
                <motion.div
                  key={plan.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedPlan(plan)}
                >
                  <ParchmentPanel
                    className={`cursor-pointer p-5 ${
                      selectedPlan?.id === plan.id ? "ring-4 ring-primary" : ""
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-jua text-2xl" style={{ color: "hsl(var(--wood-darkest))" }}>
                        {plan.name}
                      </h3>
                      <span className="font-jua text-xl" style={{ color: "hsl(var(--magic-orange))" }}>
                        ₩{plan.price.toLocaleString()}
                      </span>
                    </div>
                    <ul className="text-sm space-y-1" style={{ color: "hsl(var(--wood-dark))" }}>
                      {plan.features.map((f) => (
                        <li key={f}>✨ {f}</li>
                      ))}
                    </ul>
                  </ParchmentPanel>
                </motion.div>
              ))}
            </motion.div>

            <WoodPanel className="flex flex-col items-center text-center max-w-sm w-full py-10 gap-5">
              <motion.div
                className="text-7xl"
                animate={{ y: [-5, 5, -5], rotate: [-3, 3, -3] }}
                transition={{ repeat: Infinity, duration: 3 }}
              >
                🛒
              </motion.div>
              <h2 className="font-jua text-3xl text-shadow-deep">비밀 상점</h2>
              {selectedPlan && (
                <p className="text-lg leading-relaxed opacity-80">
                  {selectedPlan.name} 플랜을 선택했어요!<br />
                  프리미엄 탐정이 되어 무제한 분석을 즐기세요!
                </p>
              )}
              {user?.subscriptionType === "premium" ? (
                <div className="font-jua text-xl" style={{ color: "#FFD54F" }}>
                  ⭐ 이미 프리미엄이에요!
                </div>
              ) : selectedPlan ? (
                <GameButton
                  variant="orange"
                  onClick={handleCheckout}
                  className={processing ? "opacity-50 pointer-events-none" : ""}
                >
                  {processing ? "⏳ 결제 중..." : `💳 ₩${selectedPlan.price.toLocaleString()} 결제하기`}
                </GameButton>
              ) : null}
            </WoodPanel>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ShopPage;
