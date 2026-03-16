import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ParchmentPanel from "@/components/ParchmentPanel";
import { useAuth } from "@/contexts/AuthContext";
import {
  Edit2,
  Trash2,
  Heart,
  MessageCircle,
} from "lucide-react";
import type { CommunityPost } from "@/lib/types";

type PostTableProps = {
  posts: CommunityPost[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  onEdit: (e: React.MouseEvent, post: CommunityPost) => void;
  onDelete: (e: React.MouseEvent, postId: string) => void;
};

export default function CommunityPostTable({
  posts,
  loading,
  page,
  pageSize,
  totalCount,
  onEdit,
  onDelete,
}: PostTableProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <ParchmentPanel className="rounded-3xl border-[6px] overflow-hidden">
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-6 w-16 bg-parchment-border/50" />
              <Skeleton className="h-6 flex-1 bg-parchment-border/50" />
              <Skeleton className="h-6 w-24 bg-parchment-border/50" />
              <Skeleton className="h-6 w-20 bg-parchment-border/50" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Table Header */}
          <div className="bg-wood-dark/30 border-b-4 border-wood-darkest">
            <div className="grid grid-cols-[80px_1fr_150px_120px_100px_80px] gap-4 p-4 font-jua text-lg text-wood-darkest">
              <div className="text-center">번호</div>
              <div>제목</div>
              <div className="text-center">작성자</div>
              <div className="text-center">작성일</div>
              <div className="text-center">반응</div>
              <div className="text-center">관리</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y-2 divide-parchment-border/50">
            {posts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-20 text-center"
              >
                <div className="text-8xl mb-6">🔍</div>
                <div className="opacity-50 font-jua text-3xl text-wood-dark">
                  게시글이 없습니다
                </div>
                <p className="text-muted-foreground font-jua mt-2">
                  첫 번째 글을 작성해보세요!
                </p>
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
                    className="grid grid-cols-[80px_1fr_150px_120px_100px_80px] gap-4 p-4 hover:bg-orange-50/30 transition-colors cursor-pointer group relative"
                    onClick={() => navigate(`/community/${post.id}`)}
                  >
                    {/* 번호 */}
                    <div className="text-center font-jua text-lg text-wood-dark flex items-center justify-center">
                      {totalCount - (page - 1) * pageSize - index}
                    </div>

                    {/* 제목 */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-jua text-xl text-wood-darkest group-hover:text-orange-600 transition-colors truncate flex-1">
                          {post.title}
                        </h3>
                        {post.comments > 0 && (
                          <span className="text-blue-600 font-jua text-sm flex-shrink-0">
                            [{post.comments}]
                          </span>
                        )}
                        {post.likes > 50 && (
                          <Badge className="bg-red-100 text-red-600 border-none px-2 py-0 text-xs font-jua flex-shrink-0">
                            HOT
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs text-orange-600 font-jua"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 작성자 */}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl">{post.authorEmoji}</span>
                      <span className="font-jua text-base text-wood-dark truncate">
                        {post.authorNickname}
                      </span>
                    </div>

                    {/* 작성일 */}
                    <div className="text-center font-medium text-sm text-wood-dark/70 flex items-center justify-center">
                      {new Date(post.createdAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </div>

                    {/* 반응 */}
                    <div className="flex items-center justify-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-red-500">
                        <Heart size={14} />
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1 text-blue-500">
                        <MessageCircle size={14} />
                        {post.comments}
                      </span>
                    </div>

                    {/* 액션 버튼 */}
                    <div
                      className="flex items-center justify-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user &&
                      (post.userId === user.id ||
                        post.authorNickname === user.nickname) ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50"
                            onClick={(e) => onEdit(e, post)}
                          >
                            <Edit2 size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50"
                            onClick={(e) => onDelete(e, post.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </>
      )}
    </ParchmentPanel>
  );
}