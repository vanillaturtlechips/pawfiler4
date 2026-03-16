import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRanking } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import { config } from "@/lib/config";

type RankEntry = {
  rank: number; userId: string; nickname: string; avatarEmoji: string;
  tier: string; level: number; totalExp: number; totalCoins: number;
  totalAnswered: number; correctCount: number; accuracy: number;
};

const SORT_TABS = [
  { key: "correct", label: "🎯 정답 수" },
  { key: "accuracy", label: "📊 정답률" },
  { key: "tier", label: "⭐ 티어" },
];

const TIER_STYLE: Record<string, string> = {
  "불사조": "bg-red-100 text-red-600",
  "맹금닭": "bg-orange-100 text-orange-600",
  "삐약이": "bg-yellow-100 text-yellow-700",
  "알": "bg-gray-100 text-gray-500",
};
const TIER_EMOJI: Record<string, string> = {
  "불사조": "🦅", "맹금닭": "🐓", "삐약이": "🐥", "알": "🥚",
};

export default function RankingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myQuizId = localStorage.getItem(config.storageKeys.quizUserId);
  const [sort, setSort] = useState("correct");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (s: string) => {
    setLoading(true);
    try { setData(await fetchRanking(s)); }
    catch { setData([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load("correct"); }, []);

  const getDisplayName = (e: RankEntry) => {
    if (e.nickname) return e.nickname;
    if (e.userId === myQuizId) return user?.nickname || '나';
    return `탐정#${e.userId.slice(0, 4).toUpperCase()}`;
  };

  const getAvatar = (e: RankEntry) => {
    if (e.avatarEmoji && e.avatarEmoji !== '🥚') return e.avatarEmoji;
    if (e.userId === myQuizId && user?.avatarEmoji) return user.avatarEmoji;
    return TIER_EMOJI[e.tier] || '🥚';
  };

  const filtered = data.filter(e =>
    !search || getDisplayName(e).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-parchment flex flex-col">
      {/* 헤더 */}
      <div className="bg-wood-darkest text-parchment px-6 py-5 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="hover:bg-white/10 rounded-full p-1.5 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-jua text-3xl">🏆 탐정 명예의 전당</h1>
          <p className="text-parchment/60 text-sm mt-0.5">퀴즈 실력으로 순위를 겨뤄보세요</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-parchment/60 text-xs">전체 탐정</div>
          <div className="font-jua text-2xl">{data.length}명</div>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="sticky top-0 z-10 bg-parchment border-b-2 border-parchment-border px-6 py-3 flex items-center gap-2 flex-wrap">
        {SORT_TABS.map(tab => (
          <button key={tab.key}
            className={`px-4 py-1.5 rounded-full text-sm font-jua transition-all ${sort === tab.key ? 'bg-amber-600 text-parchment shadow' : 'bg-parchment-border/50 text-wood-dark hover:bg-parchment-border'}`}
            onClick={() => { setSort(tab.key); load(tab.key); }}
          >{tab.label}</button>
        ))}
        <input
          className="ml-auto px-4 py-1.5 text-sm border-2 rounded-full border-parchment-border bg-parchment outline-none focus:border-amber-500 w-40 text-wood-dark"
          placeholder="🔍 닉네임 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 테이블 */}
      <div className="flex-1 px-4 py-4 overflow-auto">
        {loading ? (
          <div className="space-y-2 max-w-4xl mx-auto">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl bg-parchment-border/40" />)}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-[48px_1fr_100px_80px_80px_80px] gap-2 px-4 py-2 text-xs font-bold text-wood-light uppercase tracking-wide">
              <div className="text-center">#</div>
              <div>탐정</div>
              <div className="text-center">티어</div>
              <div className="text-center">정답 수</div>
              <div className="text-center">정답률</div>
              <div className="text-center">풀이 수</div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-wood-light py-20 text-lg">😢 검색 결과가 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((e, i) => (
                  <motion.div
                    key={e.userId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`grid grid-cols-[48px_1fr_100px_80px_80px_80px] gap-2 items-center px-4 py-3 rounded-xl border-2 transition-all hover:shadow-sm ${
                      e.rank === 1 ? 'bg-amber-50 border-amber-400' :
                      e.rank === 2 ? 'bg-parchment-border/20 border-parchment-border' :
                      e.rank === 3 ? 'bg-orange-50 border-orange-200' :
                      'bg-parchment border-parchment-border hover:border-amber-300'
                    }`}
                  >
                    {/* 순위 */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-jua text-base mx-auto ${
                      e.rank === 1 ? 'bg-amber-400 text-white' :
                      e.rank === 2 ? 'bg-parchment-border text-wood-dark' :
                      e.rank === 3 ? 'bg-orange-300 text-white' :
                      'bg-parchment-border/50 text-wood-light text-sm'
                    }`}>
                      {e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank-1] : e.rank}
                    </div>

                    {/* 탐정 */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">{getAvatar(e)}</span>
                      <div className="min-w-0">
                        <div className={`font-jua text-sm truncate ${e.userId === myQuizId ? 'text-amber-700' : 'text-wood-darkest'}`}>
                          {getDisplayName(e)}{e.userId === myQuizId ? ' 👈 나' : ''}
                        </div>
                        <div className="text-xs text-wood-light">{e.tier || '알'} Lv.{e.level ?? 1}</div>
                      </div>
                    </div>

                    {/* 티어 */}
                    <div className="flex justify-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${TIER_STYLE[e.tier] || TIER_STYLE['알']}`}>
                        {TIER_EMOJI[e.tier] || '🥚'} {e.tier || '알'}
                      </span>
                    </div>

                    {/* 정답 수 */}
                    <div className="text-center font-bold text-amber-700">{e.correctCount}</div>

                    {/* 정답률 */}
                    <div className="text-center">
                      <span className={`font-bold text-sm ${e.accuracy >= 70 ? 'text-amber-600' : e.accuracy >= 50 ? 'text-wood-base' : 'text-wood-light'}`}>
                        {e.accuracy}%
                      </span>
                    </div>

                    {/* 풀이 수 */}
                    <div className="text-center text-wood-light text-sm">{e.totalAnswered}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
