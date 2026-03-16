import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
import { ArrowLeft, Coins, Sparkles, Gift, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { purchaseItem, fetchShopItems, type ShopCatalog } from "@/lib/api";
import { config } from "@/lib/config";

type ShopTab = "subscription" | "coins" | "packages";

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
  badge?: string;
  type: "subscription" | "coins" | "avatar" | "item";
  quantity?: number;
  bonus?: number;
}

const ShopPage = () => {
  const { user, updateUser } = useAuth();
  const { quizProfile, refreshQuizProfile } = useQuizProfile();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ShopTab>("packages");
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ShopCatalog>({
    subscriptions: [],
    coin_packages: [],
    packages: [],
  });

  const userCoins = quizProfile?.totalCoins ?? user?.coins ?? 0;

  useEffect(() => {
    refreshQuizProfile();
    fetchShopItems()
      .then(setCatalog)
      .catch(() => {});
  }, []);

  const handlePurchase = async (item: ShopItem) => {
    if (!user) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    const userId = localStorage.getItem(config.storageKeys.quizUserId);
    if (!userId) {
      toast.error("사용자 정보를 찾을 수 없습니다.");
      return;
    }

    if (userCoins < item.price) {
      toast.error("코인이 부족합니다!");
      return;
    }

    setPurchasing(item.id);
    try {
      const result = await purchaseItem(userId, item.id);
      toast.success(`${result.item_name}을(를) 구매했습니다!`);
      updateUser({ coins: result.total_coins });
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || "구매 실패";
      toast.error(msg);
    } finally {
      setPurchasing(null);
    }
  };

  const getCurrentItems = (): ShopItem[] => {
    switch (activeTab) {
      case "subscription":
        return catalog.subscriptions;
      case "coins":
        return catalog.coin_packages;
      case "packages":
        return catalog.packages;
      default:
        return catalog.packages;
    }
  };


  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-hidden">
      <motion.div
        className="flex flex-col h-full gap-3 p-3 max-w-[1400px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="font-jua text-base hover:bg-wood-dark/20 rounded-xl px-3 py-1.5"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            뒤로
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-3xl">🏪</span>
            <h1 className="font-jua text-3xl text-foreground text-shadow-glow">
              비밀 상점
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-[260px_1fr] gap-3 flex-1 min-h-0">
          {/* Left - Character Display */}
          <div className="flex flex-col h-full">
            <ParchmentPanel className="rounded-2xl border-4 p-3 h-full flex flex-col shadow-xl">
              <div className="flex flex-col items-center space-y-2 flex-1">
                {/* Character Display with Level */}
                <div className="relative w-full">
                  {/* Level Display on Top */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1 rounded-full border-3 border-white shadow-lg">
                      <span className="font-jua text-sm">{quizProfile?.tierName ?? 'Lv. 1'}</span>
                    </div>
                  </div>
                  
                  <div className="relative w-full aspect-square bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100 rounded-2xl border-4 border-amber-400 overflow-hidden shadow-lg mt-4">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        className="text-[90px]"
                        animate={{ 
                          y: [0, -6, 0],
                          rotate: [-2, 2, -2]
                        }}
                        transition={{ 
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        {user?.avatarEmoji || "🦊"}
                      </motion.div>
                    </div>
                    
                    {/* XP Bar at Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/30 to-transparent">
                      <div className="h-2 rounded-full overflow-hidden bg-black/30 border border-white/50">
                        <motion.div
                          className="h-full bg-gradient-to-r from-yellow-400 to-orange-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${(() => {
                            const tierName = quizProfile?.tierName ?? '알 Lv.1';
                            const exp = quizProfile?.totalExp ?? 0;
                            let maxXP = 100;
                            if (tierName.startsWith('불사조')) {
                              if (exp >= 4000) maxXP = 5000;
                              else if (exp >= 3000) maxXP = 4000;
                              else if (exp >= 2000) maxXP = 3000;
                              else if (exp >= 1000) maxXP = 2000;
                              else maxXP = 1000;
                            } else if (tierName.startsWith('맹금닭')) {
                              if (exp >= 1600) maxXP = 2000;
                              else if (exp >= 1200) maxXP = 1600;
                              else if (exp >= 800) maxXP = 1200;
                              else if (exp >= 400) maxXP = 800;
                              else maxXP = 400;
                            } else if (tierName.startsWith('삐약이')) {
                              if (exp >= 800) maxXP = 1000;
                              else if (exp >= 600) maxXP = 800;
                              else if (exp >= 400) maxXP = 600;
                              else if (exp >= 200) maxXP = 400;
                              else maxXP = 200;
                            } else {
                              if (exp >= 400) maxXP = 500;
                              else if (exp >= 300) maxXP = 400;
                              else if (exp >= 200) maxXP = 300;
                              else if (exp >= 100) maxXP = 200;
                              else maxXP = 100;
                            }
                            return Math.min(100, (exp / maxXP) * 100);
                          })()}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* User Info */}
                <div className="w-full text-center">
                  <h2 className="font-jua text-lg text-wood-darkest mb-0.5">
                    {user?.nickname || "탐정"}
                  </h2>
                  <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-400 inline-block">
                    <span className="font-jua text-xs text-amber-900">
                      {user?.levelTitle || "초보"} 탐정
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-parchment-border to-transparent"></div>

                {/* Coins - Game Style */}
                <div className="w-full p-2.5 rounded-xl bg-gradient-to-br from-yellow-100 via-amber-100 to-orange-100 border-3 border-amber-400 shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                  <div className="relative flex items-center justify-between mb-0.5">
                    <span className="font-jua text-xs text-amber-800">보유 코인</span>
                    <Coins className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="relative flex items-center justify-center">
                    <span className="font-jua text-2xl font-bold text-amber-900 drop-shadow-sm">
                      {userCoins.toLocaleString()}
                    </span>
                    <span className="font-jua text-sm text-amber-800 ml-1">코인</span>
                  </div>
                </div>

                {/* Premium Status - Game Style */}
                {user?.subscriptionType === "premium" ? (
                  <div className="w-full p-2.5 rounded-xl bg-gradient-to-br from-yellow-200 via-orange-200 to-red-200 border-3 border-orange-400 shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent"></div>
                    <div className="relative flex items-center justify-center gap-1.5">
                      <Crown className="w-5 h-5 text-orange-700" />
                      <p className="font-jua text-base text-orange-900 drop-shadow-sm">프리미엄</p>
                    </div>
                    <p className="relative text-xs text-center text-orange-800 font-semibold">무제한 혜택</p>
                  </div>
                ) : (
                  <div className="w-full p-2.5 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 border-3 border-gray-400 shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent"></div>
                    <div className="relative flex items-center justify-center gap-1.5">
                      <Crown className="w-4 h-4 text-gray-600" />
                      <p className="font-jua text-sm text-gray-800">무료 회원</p>
                    </div>
                    <p className="relative text-xs text-center text-gray-700">업그레이드!</p>
                  </div>
                )}

                {/* Divider */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-parchment-border to-transparent"></div>

                {/* Today's Deals - Compact */}
                <div className="w-full">
                  <h3 className="font-jua text-xs text-wood-darkest mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-orange-600" />
                    오늘의 추천
                  </h3>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">🔥</span>
                        <span className="text-xs text-orange-800 font-bold">인기 패키지</span>
                      </div>
                      <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 shadow-md">HOT</Badge>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">💎</span>
                        <span className="text-xs text-blue-800 font-bold">프리미엄 할인</span>
                      </div>
                      <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0 shadow-md">30%</Badge>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-parchment-border to-transparent"></div>

                {/* My Benefits - Compact */}
                <div className="w-full">
                  <h3 className="font-jua text-xs text-wood-darkest mb-1 flex items-center gap-1">
                    <Gift className="w-3 h-3 text-pink-600" />
                    나의 혜택
                  </h3>
                  <div className="space-y-0.5">
                    <div className="flex justify-between items-center p-1 rounded-lg bg-green-50 border border-green-300">
                      <span className="text-xs text-green-800">보유 쿠폰</span>
                      <span className="font-jua text-xs text-green-900 font-bold">2장</span>
                    </div>
                    <div className="flex justify-between items-center p-1 rounded-lg bg-yellow-50 border border-yellow-300">
                      <span className="text-xs text-yellow-800">적립 포인트</span>
                      <span className="font-jua text-xs text-yellow-900 font-bold">1,250P</span>
                    </div>
                  </div>
                </div>

                {/* Special Offer Banner */}
                <motion.div 
                  className="w-full p-2 rounded-xl bg-gradient-to-r from-red-200 via-pink-200 to-purple-200 border-3 border-red-400 shadow-lg cursor-pointer mt-auto relative overflow-hidden"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent"></div>
                  <div className="relative flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">🎉</span>
                    <p className="font-jua text-xs text-red-900 font-bold">특별 할인!</p>
                  </div>
                  <p className="relative text-xs text-red-800 font-semibold">프리미엄 첫 구매 30% 할인</p>
                </motion.div>
              </div>
            </ParchmentPanel>
          </div>

          {/* Right - Shop Items */}
          <div className="flex flex-col h-full min-h-0 gap-2">
            {/* Tab Navigation */}
            <div className="grid grid-cols-3 gap-2 flex-shrink-0">
              <Button
                onClick={() => setActiveTab("subscription")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-all shadow-md ${
                  activeTab === "subscription"
                    ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-orange-50"
                }`}
              >
                <Crown className="w-4 h-4 mr-1" />
                월정액
              </Button>
              <Button
                onClick={() => setActiveTab("coins")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-all shadow-md ${
                  activeTab === "coins"
                    ? "bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-yellow-50"
                }`}
              >
                <Coins className="w-4 h-4 mr-1" />
                충전
              </Button>
              <Button
                onClick={() => setActiveTab("packages")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-all shadow-md ${
                  activeTab === "packages"
                    ? "bg-pink-500 hover:bg-pink-600 text-white border-pink-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-pink-50"
                }`}
              >
                <Gift className="w-4 h-4 mr-1" />
                패키지
              </Button>
            </div>

            {/* Items Grid */}
            <ParchmentPanel className="rounded-2xl border-4 p-3 flex-1 min-h-0 overflow-hidden shadow-xl">
              <div
                key={activeTab}
                className="grid grid-cols-4 gap-3 h-full content-start"
              >
                {getCurrentItems().map((item, index) => (
                  <div
                    key={item.id}
                    className="relative"
                  >
                    <ParchmentPanel className="p-3 rounded-xl border-3 hover:border-orange-400 cursor-pointer group relative overflow-visible h-full flex flex-col shadow-lg transition-colors">
                      {/* Badge */}
                      {item.badge && (
                        <div className="absolute -top-2 -right-2 z-20">
                          <Badge className="bg-red-500 text-white font-jua text-xs px-2 py-0.5 shadow-lg rounded-full border-2 border-white">
                            {item.badge}
                          </Badge>
                        </div>
                      )}

                      {/* Icon */}
                      <div className="text-5xl text-center mb-2">
                        {item.icon}
                      </div>

                      {/* Name */}
                      <h3 className="font-jua text-sm text-wood-darkest text-center mb-1 leading-tight line-clamp-1">
                        {item.name}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-wood-dark text-center mb-2 line-clamp-1 flex-1">
                        {item.description}
                        {item.quantity && (
                          <span className="block font-bold text-amber-700 text-xs mt-0.5">
                            {item.quantity}코인 {item.bonus && `+${item.bonus}`}
                          </span>
                        )}
                      </p>

                      {/* Price */}
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span className="font-jua text-lg text-amber-700">
                          {item.price.toLocaleString()}
                        </span>
                      </div>

                      {/* Buy Button */}
                      <Button
                        onClick={() => handlePurchase(item)}
                        disabled={purchasing === item.id}
                        className="w-full font-jua text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2 h-auto shadow-md disabled:opacity-60"
                      >
                        {purchasing === item.id ? "처리중..." : "구매"}
                      </Button>
                    </ParchmentPanel>
                  </div>
                ))}
              </div>
            </ParchmentPanel>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ShopPage;
