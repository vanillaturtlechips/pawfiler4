import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Heart, TrendingUp } from "lucide-react";

type DashboardProps = {
  featuredPosts: Array<{ id: string; title: string; authorNickname: string; likes: number }>;
  ranking: Array<{
    rank: number; userId: string; nickname: string; avatarEmoji: string;
    tier: string; level: number; totalExp: number; totalCoins: number;
    totalAnswered: number; correctCount: number; accuracy: number;
  }>;
  hotTopic: { tag: string; count: number };
  topDetective: { authorNickname: string; authorEmoji: string; totalLikes: number };
  onTagClick: (tag: string) => void;
};

const card: React.CSSProperties = {
  background: "hsl(var(--parchment))",
  border: "2px solid hsl(var(--parchment-border))",
  borderRadius: "0.875rem",
  boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
};

// 카드 헤더: 모든 카드 동일 규칙
const cardHeader: React.CSSProperties = {
  borderBottom: "1px solid hsl(var(--parchment-border))",
  paddingBottom: "0.625rem",
  marginBottom: "0.875rem",
};

export default function CommunityDashboard({ featuredPosts, ranking, hotTopic, onTagClick }: DashboardProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-4">

      {/* 오늘의 추천 글 */}
      <div style={card} className="p-4 flex flex-col">
        <div style={cardHeader} className="flex items-center gap-1.5">
          <span className="text-sm leading-none">⭐</span>
          <h3 className="font-jua text-sm text-wood-darkest leading-none">오늘의 추천 글</h3>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {featuredPosts.length > 0 ? featuredPosts.map((post, i) => (
            <div
              key={post.id}
              onClick={() => navigate(`/community/${post.id}`)}
              className="cursor-pointer group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-orange-50"
            >
              <span
                className="text-xs font-jua shrink-0 mt-px w-3.5 text-center leading-snug"
                style={{ color: ["#f97316", "#fb923c", "#fdba74"][i] }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-wood-darkest group-hover:text-orange-600 transition-colors truncate font-jua leading-snug">
                  {post.title}
                </p>
                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: "hsl(var(--wood-light))" }}>
                  <Heart size={9} className="text-red-400 shrink-0" />
                  <span>{post.likes}</span>
                  <span className="opacity-40">·</span>
                  <span className="truncate">{post.authorNickname}</span>
                </p>
              </div>
            </div>
          )) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs font-jua" style={{ color: "hsl(var(--wood-light))" }}>게시글이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 명탐정 TOP3 */}
      <div style={card} className="p-4 flex flex-col">
        <div style={cardHeader} className="flex items-center gap-1.5">
          <span className="text-sm leading-none">🏆</span>
          <h3 className="font-jua text-sm text-wood-darkest leading-none">명탐정 TOP3</h3>
        </div>
        <div className="flex flex-col gap-2 flex-1">
          {ranking.slice(0, 3).map((entry, i) => (
            <div
              key={entry.userId}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
              style={{ background: "hsl(var(--parchment-border))" }}
            >
              <span className="text-base shrink-0 leading-none">{["🥇", "🥈", "🥉"][i]}</span>
              <span className="text-base shrink-0 leading-none">{entry.avatarEmoji || "🥚"}</span>
              <span className="font-jua text-sm text-wood-darkest truncate flex-1 leading-snug">
                {entry.nickname || `탐정#${entry.userId.slice(0, 4).toUpperCase()}`}
              </span>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <span className="text-xs text-amber-700 font-jua leading-none">Lv.{entry.level ?? 1}</span>
                <span className="text-xs font-jua leading-none" style={{ color: "hsl(var(--wood-light))" }}>
                  {entry.accuracy ?? 0}%
                </span>
              </div>
            </div>
          ))}
          {ranking.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs font-jua" style={{ color: "hsl(var(--wood-light))" }}>데이터 없음</p>
            </div>
          )}
        </div>
        <button
          onClick={() => navigate("/ranking")}
          className="mt-3 w-full py-1.5 rounded-lg font-jua text-xs transition-colors"
          style={{
            background: "hsl(var(--parchment-border))",
            color: "hsl(var(--wood-dark))",
            border: "1px solid hsl(var(--parchment-border))",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(35 60% 72%)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--parchment-border))";
          }}
        >
          전체 랭킹 보기 →
        </button>
      </div>

      {/* 오늘의 핫토픽 */}
      <div style={card} className="p-4 flex flex-col">
        <div style={cardHeader} className="flex items-center gap-1.5">
          <span className="text-sm leading-none">🔥</span>
          <h3 className="font-jua text-sm text-wood-darkest leading-none">오늘의 핫토픽</h3>
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <button
            onClick={() => { if (hotTopic.tag !== "없음") onTagClick(hotTopic.tag); }}
            className="text-left group"
          >
            <span className="font-jua text-2xl text-orange-600 group-hover:text-orange-700 transition-colors leading-tight">
              #{hotTopic.tag}
            </span>
          </button>
          <p className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--wood-light))" }}>
            <TrendingUp size={10} className="text-orange-400 shrink-0" />
            {hotTopic.count > 0 ? `${hotTopic.count}개 게시글에서 언급됨` : "데이터 없음"}
          </p>
          {hotTopic.count > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs font-jua">인기급상승</Badge>
              <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-xs font-jua">+{hotTopic.count}개</Badge>
            </div>
          )}
        </div>
        <p
          className="text-xs font-jua mt-3 pt-2.5"
          style={{
            borderTop: "1px solid hsl(var(--parchment-border))",
            color: "hsl(var(--wood-light))",
          }}
        >
          태그를 클릭하면 관련 글을 볼 수 있어요
        </p>
      </div>

    </div>
  );
}
