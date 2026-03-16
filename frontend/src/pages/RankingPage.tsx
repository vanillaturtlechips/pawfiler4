import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ParchmentPanel from "@/components/ParchmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import { fetchRanking } from "@/lib/api";
import { ArrowLeft, Trophy, Medal, Award } from "lucide-react";

type RankingEntry = {
  rank: number;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  tier: string;
  level: number;
  totalExp: number;
  totalCoins: number;
  totalAnswered: number;
  correctCount: number;
  accuracy: number;
};

const RankingPage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"correct" | "accuracy" | "level">("correct");

  useEffect(() => {
    if (!token) return;
    loadRanking();
  }, [token, sortBy]);

  const loadRanking = async () => {
    try {
      setLoading(true);
      const data = await fetchRanking(sortBy);
      setRanking(data);
    } catch (error) {
      console.error("Failed to load ranking:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="text-yellow-500" size={24} />;
    if (rank === 2) return <Medal className="text-gray-400" size={24} />;
    if (rank === 3) return <Award className="text-amber-600" size={24} />;
    return <span className="text-lg font-bold text-wood-dark">#{rank}</span>;
  };

  const getTierEmoji = (tier: string) => {
    switch (tier) {
      case "불사조": return "🦅";
      case "맹금닭": return "🐓";
      case "삐약이": return "🐥";
      default: return "🥚";
    }
  };

  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
      <motion.div
        className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate("/community")}
              variant="ghost"
              size="lg"
              className="font-jua text-lg gap-2 rounded-2xl px-6 py-6"
            >
              <ArrowLeft size={20} />
              돌아가기
            </Button>
            <div className="flex items-center gap-4">
              <div className="text-6xl">🏆</div>
              <div className="flex flex-col">
                <h1 className="font-jua text-5xl text-foreground text-shadow-glow tracking-tight">
                  명탐정 랭킹
                </h1>
                <p className="text-muted-foreground font-jua text-lg opacity-80">
                  최고의 탐정들을 만나보세요
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Sort Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => setSortBy("correct")}
            variant={sortBy === "correct" ? "default" : "outline"}
            className={`font-jua text-lg rounded-2xl px-6 py-3 border-4 border-wood-darkest transition-all ${
              sortBy === "correct"
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-white hover:bg-orange-50 text-wood-darkest"
            }`}
          >
            정답 수
          </Button>
          <Button
            onClick={() => setSortBy("accuracy")}
            variant={sortBy === "accuracy" ? "default" : "outline"}
            className={`font-jua text-lg rounded-2xl px-6 py-3 border-4 border-wood-darkest transition-all ${
              sortBy === "accuracy"
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-white hover:bg-orange-50 text-wood-darkest"
            }`}
          >
            정확도
          </Button>
          <Button
            onClick={() => setSortBy("level")}
            variant={sortBy === "level" ? "default" : "outline"}
            className={`font-jua text-lg rounded-2xl px-6 py-3 border-4 border-wood-darkest transition-all ${
              sortBy === "level"
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-white hover:bg-orange-50 text-wood-darkest"
            }`}
          >
            레벨
          </Button>
        </div>

        {/* Ranking List */}
        <ParchmentPanel className="rounded-3xl border-[6px] overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">⏳</div>
              <p className="font-jua text-xl text-wood-dark">랭킹을 불러오는 중...</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-parchment-border/50">
              {ranking.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="text-8xl mb-6">🏆</div>
                  <div className="opacity-50 font-jua text-3xl text-wood-dark">
                    랭킹 데이터가 없습니다
                  </div>
                </div>
              ) : (
                ranking.map((entry, index) => (
                  <motion.div
                    key={entry.userId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-6 hover:bg-orange-50/30 transition-colors ${
                      entry.rank <= 3 ? "bg-gradient-to-r from-amber-50/50 to-orange-50/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-6">
                      {/* Rank */}
                      <div className="flex items-center justify-center w-16">
                        {getRankIcon(entry.rank)}
                      </div>

                      {/* Avatar & Name */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-4xl">
                          {entry.avatarEmoji || getTierEmoji(entry.tier)}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <h3 className="font-jua text-xl text-wood-darkest truncate">
                            {entry.nickname || `탐정#${entry.userId.slice(0, 4).toUpperCase()}`}
                          </h3>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-sm font-jua">
                              {entry.tier || "알"} Lv.{entry.level ?? 1}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-8 text-center">
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold text-green-600">
                            {entry.correctCount || 0}
                          </span>
                          <span className="text-sm text-wood-light font-jua">정답</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold text-blue-600">
                            {entry.accuracy ? `${entry.accuracy.toFixed(1)}%` : "0%"}
                          </span>
                          <span className="text-sm text-wood-light font-jua">정확도</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold text-purple-600">
                            {entry.totalExp || 0}
                          </span>
                          <span className="text-sm text-wood-light font-jua">경험치</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold text-orange-600">
                            {entry.totalCoins || 0}
                          </span>
                          <span className="text-sm text-wood-light font-jua">코인</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </ParchmentPanel>
      </motion.div>
    </div>
  );
};

export default RankingPage;