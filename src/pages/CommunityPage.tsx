import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { config } from "@/lib/config";
import {
  fetchCommunityFeed,
  createCommunityPost,
  updateCommunityPost,
  deleteCommunityPost,
} from "@/lib/api";

import type { CommunityPost } from "@/lib/types";
import { toast } from "sonner";
import { 
  Edit2, 
  Trash2, 
  PlusCircle, 
  Search, 
  X, 
  Heart, 
  MessageCircle,
  Loader2
} from "lucide-react";

const CommunityPage = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Feed & Pagination State
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Search State
  const [query, setQuery] = useState("");

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formTags, setFormTags] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFeed = async (p: number, reset = false) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const feed = await fetchCommunityFeed(p, config.communityPageSize);
      setTotalCount(feed.totalCount);
      
      if (reset) {
        setPage(1);
        setPosts(feed.posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } else {
        setPage(p);
        setPosts((prev) => {
          const merged = [...prev, ...feed.posts];
          const unique = Array.from(new Map(merged.map((p) => [p.id, p])).values());
          return unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchFeed(1, true);
  }, [token]);

  const handleOpenCreate = () => {
    setEditingPost(null);
    setFormTitle("");
    setFormBody("");
    setFormTags("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    setEditingPost(post);
    setFormTitle(post.title);
    setFormBody(post.body);
    setFormTags(post.tags.join(", "));
    setIsModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!confirm("정말 이 게시글을 삭제하시겠습니까?")) return;

    try {
      await deleteCommunityPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("게시글이 삭제되었습니다.");
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error("제목과 내용을 입력해주세요.");
      return;
    }

    const tags = formTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");

    setIsSubmitting(true);
    try {
      if (editingPost) {
        const updated = await updateCommunityPost({
          postId: editingPost.id,
          title: formTitle,
          body: formBody,
          tags,
        });
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast.success("게시글이 수정되었습니다.");
      } else {
        if (!user) return;
        const created = await createCommunityPost({
          userId: user.id,
          authorNickname: user.nickname || "익명 탐정",
          authorEmoji: user.avatarEmoji || "🕵️",
          title: formTitle,
          body: formBody,
          tags,
        });
        setPosts((prev) => [created, ...prev]);
        toast.success("새 게시글이 등록되었습니다.");
      }
      setIsModalOpen(false);
      setFormTitle("");
      setFormBody("");
      setFormTags("");
    } catch (error) {
      console.error('Failed to submit post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePosts = normalizedQuery
    ? posts.filter((p) => {
        const hay = `${p.title} ${p.body} ${p.tags.join(" ")}`.toLowerCase();
        return hay.includes(normalizedQuery);
      })
    : posts;

  useEffect(() => {
    if (!token) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const canLoadMore = posts.length < totalCount;
        if (entry.isIntersecting && !loading && !loadingMore && canLoadMore) {
          fetchFeed(page + 1);
        }
      },
      { threshold: 0.1 }
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [token, loading, loadingMore, posts.length, totalCount, page]);

  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
      <motion.div
        className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header Section */}
        <header className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="text-6xl">📜</div>
              <div className="flex flex-col">
                <h1 className="font-jua text-5xl text-foreground text-shadow-glow tracking-tight">동물들의 광장</h1>
                <p className="text-muted-foreground font-jua text-lg opacity-80">탐정들의 비밀 정보 교환소</p>
              </div>
            </div>
            <Button
              onClick={handleOpenCreate}
              size="lg"
              className="font-jua text-xl bg-orange-500 hover:bg-orange-600 text-white gap-3 shadow-lg hover:shadow-orange-500/20 transform hover:-translate-y-1 transition-all rounded-2xl px-8 py-6"
            >
              <PlusCircle size={24} />
              글쓰기
            </Button>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors" size={22} />
            <Input
              placeholder="제목, 내용, 태그로 검색..."
              className="pl-12 py-6 text-lg rounded-2xl border-4 border-parchment-border bg-white text-gray-900 placeholder:text-gray-400 backdrop-blur-sm focus-visible:ring-orange-500/50 font-jua"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </header>

        {/* Notice & Info Panels */}
        <div className="grid grid-cols-3 gap-4">
          {/* 공지사항 */}
          <ParchmentPanel className="p-5 rounded-2xl border-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-3xl">📌</div>
              <h3 className="font-jua text-xl text-wood-darkest">공지사항</h3>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-wood-dark hover:text-orange-600 cursor-pointer transition-colors truncate">
                • 커뮤니티 이용 규칙 안내
              </div>
              <div className="text-sm text-wood-dark hover:text-orange-600 cursor-pointer transition-colors truncate">
                • 신규 탐정 환영 이벤트
              </div>
              <div className="text-sm text-wood-dark hover:text-orange-600 cursor-pointer transition-colors truncate">
                • 주간 우수 제보자 시상
              </div>
            </div>
          </ParchmentPanel>

          {/* 이달의 명탐정 */}
          <ParchmentPanel className="p-5 rounded-2xl border-4 bg-gradient-to-br from-yellow-50/50 to-orange-50/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-3xl">🏆</div>
              <h3 className="font-jua text-xl text-wood-darkest">이달의 명탐정</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-yellow-100 border-2 border-yellow-400 flex items-center justify-center text-3xl shadow-lg">
                🦉
              </div>
              <div>
                <div className="font-jua text-lg text-wood-darkest">수리 부엉이</div>
                <div className="text-xs text-orange-600 font-bold">정확도 98.5% 달성</div>
              </div>
            </div>
          </ParchmentPanel>

          {/* 오늘의 핫토픽 */}
          <ParchmentPanel className="p-5 rounded-2xl border-4 bg-gradient-to-br from-red-50/50 to-pink-50/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-3xl">🔥</div>
              <h3 className="font-jua text-xl text-wood-darkest">오늘의 핫토픽</h3>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-red-600">#딥페이크탐지</div>
              <div className="text-xs text-wood-dark">
                오늘 가장 많이 언급된 주제
              </div>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-red-100 text-red-600 text-xs">+24</Badge>
                <Badge className="bg-orange-100 text-orange-600 text-xs">인기급상승</Badge>
              </div>
            </div>
          </ParchmentPanel>
        </div>

        {/* Board Table */}
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
                {visiblePosts.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-20 text-center"
                  >
                    <div className="text-8xl mb-6">🔍</div>
                    <div className="opacity-50 font-jua text-3xl text-wood-dark">
                      게시글이 없습니다
                    </div>
                    <p className="text-muted-foreground font-jua mt-2">첫 번째 글을 작성해보세요!</p>
                  </motion.div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {visiblePosts.map((post, index) => (
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
                          {totalCount - index}
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
                              <span key={tag} className="text-xs text-orange-600 font-jua">
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
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {user && (post.userId === user.id || post.authorNickname === user.nickname) ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50"
                                onClick={(e) => handleOpenEdit(e, post)}
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50"
                                onClick={(e) => handleDelete(e, post.id)}
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

        <div ref={sentinelRef} className="h-10 w-full" />
        {loadingMore && (
          <div className="flex justify-center py-10">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="text-4xl"
            >
              🦉
            </motion.div>
          </div>
        )}

        {/* Write/Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setFormTitle("");
            setFormBody("");
            setFormTags("");
            setEditingPost(null);
          }
        }}>
          <DialogContent className="bg-parchment border-parchment-border sm:max-w-[700px] rounded-[2.5rem] p-0 overflow-hidden border-[8px] max-h-[90vh] flex flex-col">
            <div className="p-10 flex flex-col max-h-[90vh]">
              <DialogHeader className="mb-6">
                <DialogTitle className="font-jua text-4xl text-wood-darkest text-shadow-glow">
                  {editingPost ? "📝 게시글 수정" : "✍️ 새 글 작성"}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground font-jua text-lg mt-1">
                  다른 탐정들과 정보를 공유해보세요
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-6 py-4 overflow-y-auto flex-1">
                <div className="flex flex-col gap-3">
                  <label className="font-jua text-2xl text-wood-dark tracking-tight">제목</label>
                  <Input
                    placeholder="제목을 입력하세요"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="py-6 text-xl rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label className="font-jua text-2xl text-wood-dark tracking-tight">내용</label>
                  <Textarea
                    placeholder="내용을 입력하세요"
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    className="min-h-[300px] text-lg py-4 rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400 leading-relaxed resize-none"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label className="font-jua text-2xl text-wood-dark tracking-tight">태그 (쉼표로 구분)</label>
                  <Input
                    placeholder="예: 팁, 분석, 주의사항"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    className="py-6 text-xl rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <DialogFooter className="mt-8 gap-4 flex-shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="font-jua text-xl h-14 px-8 rounded-2xl border-4 border-wood-darkest bg-white hover:bg-wood-dark/10 text-wood-darkest"
                  disabled={isSubmitting}
                >
                  취소
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="font-jua text-xl h-14 px-12 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-lg hover:shadow-orange-500/30 transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  disabled={isSubmitting || !formTitle.trim() || !formBody.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    editingPost ? "수정 완료" : "등록하기"
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
};

export default CommunityPage;
