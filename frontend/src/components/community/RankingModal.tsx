import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRanking } from "@/lib/api";
import { useState } from "react";

type RankingEntry = {
  rank: number;
  userId: string;
  tier: string;
  totalExp: number;
  totalCoins: number;
  totalAnswered: number;
  correctCount: number;
  accuracy: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ranking: RankingEntry[];
  setRanking: (r: RankingEntry[]) => void;
};

export default function RankingModal({ open, onOpenChange, ranking, setRanking }: Props) {
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingSort, setRankingSort] = useState("correct");
  const [rankingSearch, setRankingSearch] = useState("");

  const tierEmoji = (tier: string) =>
    tier === "불사조" ? "🦅" : tier === "맹금닭" ? "🐓" : tier === "삐약이" ? "🐥" : "🥚";

  const tierColor = (tier: string) =>
    tier === "불사조" ? "bg-red-100 text-red-600" :
    tier === "맹금닭" ? "bg-orange-100 text-orange-600" :
    tier === "삐약이" ? "bg-yellow-100 text-yellow-600" :
    "bg-gray-100 text-gray-500";

  const rankBg = (rank: number) =>
    rank === 1 ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-400" :
    rank === 2 ? "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300" :
    rank === 3 ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300" :
    "bg-white border-gray-100";

  const rankCircle = (rank: number) =>
    rank === 1 ? "bg-yellow-400 text-white" :
    rank === 2 ? "bg-gray-300 text-white" :
    rank === 3 ? "bg-orange-400 text-white" :
    "bg-gray-100 text-gray-500 text-sm";

  const filtered = ranking.filter(e =>
    !rankingSearch || e.userId.toLowerCase().includes(rankingSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white shrink-0">
          <DialogTitle className="font-jua text-3xl mb-1">🏆 탐정 명예의 전당</DialogTitle>
          <DialogDescription className="text-amber-100 text-sm">퀴즈 실력으로 순위를 겨뤄보세요</DialogDescription>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50 shrink-0 flex-wrap">
          {[
            { key: "correct", label: "🎯 정답 수" },
            { key: "accuracy", label: "📊 정답률" },
            { key: "tier", label: "⭐ 티어" },
            { key: "coins", label: "💰 코인" },
          ].map(tab => (
            <button key={tab.key}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${rankingSort === tab.key ? "bg-amber-500 text-white shadow-md scale-105" : "bg-white text-gray-600 border border-gray-200 hover:border-amber-300"}`}
              onClick={async () => {
                setRankingSort(tab.key);
                setRankingLoading(true);
                try { setRanking(await fetchRanking(tab.key)); }
                catch { setRanking([]); }
                finally { setRankingLoading(false); }
              }}
            >{tab.label}</button>
          ))}
          <input
            className="ml-auto px-3 py-1.5 text-xs border-2 rounded-full border-amber-200 outline-none focus:border-amber-400 w-32 bg-white"
            placeholder="🔍 유저 검색"
            value={rankingSearch}
            onChange={e => setRankingSearch(e.target.value)}
          />
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {rankingLoading ? (
            [...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-lg">😢 데이터가 없습니다</p>
          ) : filtered.map((entry) => (
            <div key={entry.userId} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all hover:shadow-md ${rankBg(entry.rank)}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-jua text-lg shrink-0 ${rankCircle(entry.rank)}`}>
                {entry.rank <= 3 ? ["🥇","🥈","🥉"][entry.rank-1] : entry.rank}
              </div>
              <div className="text-2xl shrink-0">{tierEmoji(entry.tier)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-jua text-sm truncate">{entry.userId.slice(0, 12)}...</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${tierColor(entry.tier)}`}>{entry.tier || "알"}</span>
                  <span className="text-xs text-gray-400">{entry.totalExp} XP</span>
                </div>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <div className="font-bold text-green-600 text-sm">✅ {entry.correctCount}개</div>
                <div className="text-xs text-gray-400">{entry.accuracy}% · 💰{entry.totalCoins}</div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
