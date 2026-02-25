import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import ModelViewer from "@/components/ModelViewer";
import { useAuth } from "@/contexts/AuthContext";
import { getSubscriptionPlans, mockCheckout, getCharacterCatalog, purchaseCharacter } from "@/lib/mockApi";
import type { SubscriptionPlan, CharacterModel } from "@/lib/types";

type ShopTab = "premium" | "characters";

const rarityColors: Record<string, string> = {
  common: "hsl(var(--magic-green))",
  rare: "hsl(var(--magic-blue))",
  legendary: "hsl(var(--magic-orange))",
};

const rarityLabels: Record<string, string> = {
  common: "일반",
  rare: "희귀",
  legendary: "전설",
};

const ShopPage = () => {
  const { token, user, updateUser } = useAuth();
  const [tab, setTab] = useState<ShopTab>("characters");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  // Character shop state
  const [characters, setCharacters] = useState<CharacterModel[]>([]);
  const [selectedChar, setSelectedChar] = useState<CharacterModel | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  useEffect(() => {
    setPlans(getSubscriptionPlans());
    setCharacters(getCharacterCatalog().filter((c) => !c.free));
  }, []);

  useEffect(() => {
    if (plans.length > 0 && !selectedPlan) setSelectedPlan(plans[0]);
  }, [plans, selectedPlan]);

  useEffect(() => {
    if (characters.length > 0 && !selectedChar) setSelectedChar(characters[0]);
  }, [characters, selectedChar]);

  const handleCheckout = async () => {
    if (!token || !selectedPlan) return;
    setProcessing(true);
    try {
      const res = await mockCheckout(token, { planId: selectedPlan.id });
      if (res.success) {
        updateUser({ subscriptionType: res.newSubscriptionType });
        setSuccess(true);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handlePurchaseCharacter = async () => {
    if (!token || !selectedChar) return;
    setProcessing(true);
    try {
      const res = await purchaseCharacter(token, selectedChar.id);
      if (res.success) {
        updateUser({
          coins: res.remainingCoins,
          ownedCharacters: [...(user?.ownedCharacters || []), selectedChar.id],
        });
        setPurchaseSuccess(selectedChar.id);
        setTimeout(() => setPurchaseSuccess(null), 3000);
      }
    } finally {
      setProcessing(false);
    }
  };

  const isOwned = (charId: string) => user?.ownedCharacters?.includes(charId);

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-5 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Tab switcher */}
      <div className="flex gap-3">
        {(["characters", "premium"] as const).map((t) => (
          <motion.button
            key={t}
            className={`font-jua text-lg px-6 py-2 rounded-xl cursor-pointer border-3 ${
              tab === t
                ? "bg-wood-base text-foreground border-wood-darkest"
                : "bg-white/80 border-parchment-border"
            }`}
            style={tab === t ? { boxShadow: "0 4px 0 hsl(var(--wood-darkest))", color: "hsl(var(--foreground))" } : { color: "hsl(var(--parchment-text))" }}
            whileTap={{ scale: 0.95, y: 2 }}
            onClick={() => setTab(t)}
          >
            {t === "characters" ? "🐾 캐릭터 상점" : "⭐ 프리미엄"}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "characters" ? (
          <motion.div
            key="characters"
            className="flex items-center justify-center gap-7 w-full"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            {/* Character grid */}
            <ParchmentPanel className="flex flex-col gap-3 max-w-sm w-full max-h-[65vh] overflow-y-auto scrollbar-none">
              <div className="flex justify-between items-center sticky top-0 pb-2 z-10" style={{ background: "hsl(var(--parchment))" }}>
                <h3 className="font-jua text-2xl" style={{ color: "hsl(var(--wood-darkest))" }}>캐릭터 목록</h3>
                <span className="font-jua text-lg" style={{ color: "hsl(var(--magic-orange))" }}>
                  🪙 {user?.coins ?? 0}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {characters.map((char) => {
                  const owned = isOwned(char.id);
                  return (
                    <motion.div
                      key={char.id}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl cursor-pointer relative"
                      style={{
                        background: selectedChar?.id === char.id ? "hsl(var(--wood-base) / 0.2)" : "transparent",
                        border: selectedChar?.id === char.id ? `3px solid ${rarityColors[char.rarity]}` : "3px solid transparent",
                        opacity: owned ? 0.5 : 1,
                      }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedChar(char)}
                    >
                      <span className="text-3xl">{char.emoji}</span>
                      <span className="font-jua text-xs" style={{ color: "hsl(var(--parchment-text))" }}>{char.name}</span>
                      <span className="text-xs font-bold" style={{ color: rarityColors[char.rarity] }}>
                        {owned ? "✅ 보유" : `🪙 ${char.price}`}
                      </span>
                      {purchaseSuccess === char.id && (
                        <motion.div
                          className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        >
                          <span className="text-3xl">🎉</span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </ParchmentPanel>

            {/* 3D Preview */}
            <WoodPanel className="flex flex-col items-center max-w-sm w-full py-6 gap-3">
              {selectedChar && (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedChar.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="w-full"
                    >
                      <ModelViewer modelPath={selectedChar.modelPath} height="280px" />
                    </motion.div>
                  </AnimatePresence>
                  <h3 className="font-jua text-2xl text-shadow-deep">
                    {selectedChar.emoji} {selectedChar.name}
                  </h3>
                  <span
                    className="font-jua text-sm px-3 py-1 rounded-full"
                    style={{ background: rarityColors[selectedChar.rarity], color: "white" }}
                  >
                    {rarityLabels[selectedChar.rarity]}
                  </span>

                  {isOwned(selectedChar.id) ? (
                    <div className="font-jua text-lg" style={{ color: "hsl(var(--magic-green))" }}>
                      ✅ 이미 보유 중!
                    </div>
                  ) : (
                    <GameButton
                      variant="orange"
                      onClick={handlePurchaseCharacter}
                      className={processing ? "opacity-50 pointer-events-none" : ""}
                    >
                      {processing ? "⏳ 구매 중..." : `🪙 ${selectedChar.price} 코인으로 구매`}
                    </GameButton>
                  )}
                </>
              )}
            </WoodPanel>
          </motion.div>
        ) : (
          /* Premium tab - original shop logic */
          <motion.div
            key="premium"
            className="flex items-center justify-center gap-7 w-full"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {success ? (
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
                <div className="font-jua text-2xl" style={{ color: "hsl(var(--magic-orange))" }}>
                  ⭐ Premium Member
                </div>
              </WoodPanel>
            ) : (
              <>
                <motion.div className="flex flex-col gap-5 max-w-sm w-full">
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
                  <p className="text-lg leading-relaxed opacity-80">
                    {selectedPlan?.name} 플랜을 선택했어요!<br />
                    프리미엄 탐정이 되어 무제한 분석을 즐기세요!
                  </p>
                  {user?.subscriptionType === "premium" ? (
                    <div className="font-jua text-xl" style={{ color: "hsl(var(--magic-orange))" }}>
                      ⭐ 이미 프리미엄이에요!
                    </div>
                  ) : (
                    <GameButton
                      variant="orange"
                      onClick={handleCheckout}
                      className={processing ? "opacity-50 pointer-events-none" : ""}
                    >
                      {processing ? "⏳ 결제 중..." : `💳 ₩${selectedPlan?.price.toLocaleString()} 결제하기`}
                    </GameButton>
                  )}
                </WoodPanel>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ShopPage;
