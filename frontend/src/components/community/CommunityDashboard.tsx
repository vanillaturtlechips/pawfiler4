import { useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Badge } from "@/components/ui/badge";

type DashboardProps = {
  featuredPosts: Array<{
    id: string;
    title: string;
    authorNickname: string;
    likes: number;
  }>;
  ranking: Array<{
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
  }>;
  hotTopic: { tag: string; count: number };
  topDetective: {
    authorNickname: string;
    authorEmoji: string;
    totalLikes: number;
  };
  onTagClick: (tag: string) => void;
};

export default function CommunityDashboard({ 
  featuredPosts, 
  ranking, 
  hotTopic, 
  topDetective,
  onTagClick 
}: DashboardProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* 오늘의 추천 글 */}
      <ParchmentPanel className="p-5 rounded-2xl border-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">⭐</span>
          <h3 className="font-jua text-base text-wood-darkest">
            오늘의 추천 글
          </h3>
        </div>
        <div className="space-y-3">
          {featuredPosts.length > 0 ? (
            featuredPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/community/${post.id}`)}
                className="cursor-pointer group"
              >
                <p className="text-sm text-wood-dark group-hover:text-amber-700 transition-colors truncate leading-snug">
                  {post.title}
                </p>
                <p className="text-xs text-wood-light mt-0.5">
                  ❤️ {post.likes} · {post.authorNickname}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-wood-light">게시글이 없습니다</p>
          )}
        </div>
      </ParchmentPanel>

      {/* 명탐정 TOP3 */}
      <ParchmentPanel className="p-5 rounded-2xl border-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏆</span>
          <h3 className="font-jua text-base text-wood-darkest">
            명탐정 TOP3
          </h3>
        </div>
        <div className="space-y-2 mb-4">
          {ranking.slice(0, 3).map((entry, i) => (
            <div
              key={entry.userId}
              className="py-1.5 px-2 rounded-lg bg-parchment-border/30"
            >
              <p className="text-xs text-wood-light mb-0.5">
                {["🥇 1등", "🥈 2등", "🥉 3등"][i]}
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base shrink-0">
                    {entry.avatarEmoji ||
                      (entry.tier === "불사조"
                        ? "🦅"
                        : entry.tier === "맹금닭"
                        ? "🐓"
                        : entry.tier === "삐약이"
                        ? "🐥"
                        : "🥚")}
                  </span>
                  <p className="font-jua text-sm text-wood-darkest truncate">
                    {entry.nickname ||
                      `탐정#${entry.userId.slice(0, 4).toUpperCase()}`}
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-700 shrink-0">
                  {entry.tier || "알"} Lv.{entry.level ?? 1}
                </span>
              </div>
            </div>
          ))}
          {ranking.length === 0 && (
            <p className="text-xs text-wood-light text-center py-2">
              데이터 없음
            </p>
          )}
        </div>
        <button
          onClick={() => navigate("/ranking")}
          className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-parchment font-jua text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          🏅 전체 랭킹 보기
        </button>
      </ParchmentPanel>

      {/* 오늘의 핫토픽 */}
      <ParchmentPanel className="p-5 rounded-2xl border-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🔥</span>
          <h3 className="font-jua text-base text-wood-darkest">
            오늘의 핫토픽
          </h3>
        </div>
        <div
          className="inline-block text-sm font-jua text-amber-700 cursor-pointer hover:text-amber-800 transition-colors mb-2"
          onClick={() => {
            if (hotTopic.tag !== "없음") onTagClick(hotTopic.tag);
          }}
        >
          #{hotTopic.tag}
        </div>
        <p className="text-xs text-wood-light">
          {hotTopic.count > 0
            ? `${hotTopic.count}개 게시글에서 언급`
            : "데이터 없음"}
        </p>
        {hotTopic.count > 0 && (
          <div className="flex gap-2 mt-3">
            <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-xs">
              +{hotTopic.count}
            </Badge>
            <Badge className="bg-orange-100 text-wood-dark border border-orange-200 text-xs">
              인기급상승
            </Badge>
          </div>
        )}
      </ParchmentPanel>
    </div>
  );
}