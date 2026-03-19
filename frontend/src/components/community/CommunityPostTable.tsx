import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { Edit2, Trash2, Heart, MessageCircle } from "lucide-react";
import type { CommunityPost } from "@/lib/types";

type PostTableProps = {
  posts: CommunityPost[];
  loading: boolean;
  initialized: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  onEdit: (e: React.MouseEvent, post: CommunityPost) => void;
  onDelete: (e: React.MouseEvent, postId: string) => void;
};

const tableStyle: React.CSSProperties = {
  background: "hsl(var(--parchment))",
  border: "2px solid hsl(var(--parchment-border))",
  borderRadius: "0.875rem",
  boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
  overflow: "hidden",
};

const HOVER_BG = "hsl(30 70% 96%)";
const ROW_BORDER = "1px solid hsl(var(--parchment-border))";

export default function CommunityPostTable({ posts, loading, initialized, page, pageSize, totalCount, onEdit, onDelete }: PostTableProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div
      style={{ ...tableStyle, opacity: (loading || !initialized) ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: (loading || !initialized) ? "none" : "auto" }}
    >
      <>
        {/* 헤더 */}
          <div
            className="grid grid-cols-[52px_1fr_120px_88px_80px_64px] gap-3 px-4 py-2.5 font-jua text-xs"
            style={{
              borderBottom: "2px solid hsl(var(--parchment-border))",
              background: "hsl(var(--parchment-border))",
              color: "hsl(var(--wood-dark))",
            }}
          >
            <div className="text-center">번호</div>
            <div>제목</div>
            <div className="text-center">작성자</div>
            <div className="text-center">작성일</div>
            <div className="text-center">반응</div>
            <div className="text-center">관리</div>
          </div>

          {/* 바디 */}
          <div>
            {posts.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-14 text-center">
                <div className="text-5xl mb-3">🔍</div>
                <p className="font-jua text-base text-wood-dark opacity-60">게시글이 없습니다</p>
                <p className="font-jua text-sm mt-1" style={{ color: "hsl(var(--wood-light))" }}>첫 번째 글을 작성해보세요!</p>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                {posts.map((post, index) => (
                  <motion.div
                    key={post.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-[52px_1fr_120px_88px_80px_64px] gap-3 px-4 py-2.5 cursor-pointer group"
                    style={{ borderBottom: ROW_BORDER, transition: "background 120ms ease" }}
                    onClick={() => navigate(`/community/${post.id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    {/* 번호 */}
                    <div
                      className="text-center font-jua text-xs flex items-center justify-center"
                      style={{ color: "hsl(var(--wood-light))" }}
                    >
                      {totalCount - (page - 1) * pageSize - index}
                    </div>

                    {/* 제목 */}
                    <div className="flex flex-col gap-0.5 min-w-0 justify-center">
                      <div className="flex items-center gap-2">
                        <h3 className="font-jua text-sm text-wood-darkest group-hover:text-orange-600 transition-colors truncate flex-1 leading-snug">
                          {post.title}
                        </h3>
                        {post.comments > 0 && (
                          <span className="font-jua text-xs shrink-0" style={{ color: "hsl(var(--wood-light))" }}>
                            [{post.comments}]
                          </span>
                        )}
                        {post.likes > 50 && (
                          <Badge className="bg-red-100 text-red-600 border-none px-1.5 py-0 text-xs font-jua shrink-0">HOT</Badge>
                        )}
                      </div>
                      {post.tags.length > 0 && (
                        <div className="flex gap-1.5">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs font-jua" style={{ color: "hsl(var(--wood-light))" }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 작성자 */}
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm leading-none">{post.authorEmoji}</span>
                      <span className="font-jua text-xs text-wood-dark truncate">{post.authorNickname}</span>
                    </div>

                    {/* 작성일 */}
                    <div
                      className="text-center text-xs flex items-center justify-center font-jua"
                      style={{ color: "hsl(var(--wood-light))" }}
                    >
                      {new Date(post.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </div>

                    {/* 반응 */}
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="flex items-center gap-0.5 text-red-400">
                        <Heart size={11} />{post.likes}
                      </span>
                      <span className="flex items-center gap-0.5 text-blue-400">
                        <MessageCircle size={11} />{post.comments}
                      </span>
                    </div>

                    {/* 관리 */}
                    <div
                      className="flex items-center justify-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user && (post.userId === user.id || post.authorNickname === user.nickname) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md transition-all"
                            style={{ color: "hsl(var(--wood-light))" }}
                            onClick={(e) => onEdit(e, post)}
                            title="수정"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#3b82f6";
                              e.currentTarget.style.background = "#eff6ff";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "hsl(var(--wood-light))";
                              e.currentTarget.style.background = "";
                            }}
                          >
                            <Edit2 size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md transition-all"
                            style={{ color: "hsl(var(--wood-light))" }}
                            onClick={(e) => onDelete(e, post.id)}
                            title="삭제"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#ef4444";
                              e.currentTarget.style.background = "#fef2f2";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "hsl(var(--wood-light))";
                              e.currentTarget.style.background = "";
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </>
    </div>
  );
}
