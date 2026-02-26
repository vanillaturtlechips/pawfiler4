<<<<<<< HEAD
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCommunityFeed } from "@/lib/mockApi";
=======
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
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
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCommunityFeed,
  createCommunityPost,
  updateCommunityPost,
  deleteCommunityPost,
} from "@/lib/api";
>>>>>>> ed833e4 (feat: 커뮤니티 페이지 CRUD 및 UI 개선)
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
  Share2, 
  MoreHorizontal,
  TrendingUp,
  Award,
  Users
} from "lucide-react";

const CommunityPage = () => {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formTags, setFormTags] = useState("");

  const fetchFeed = async (p: number, reset = false) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const feed = await fetchCommunityFeed(p, pageSize);
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
      toast.error("피드를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!token) return;
<<<<<<< HEAD
    setLoading(true);
    fetchCommunityFeed(token)
      .then((feed) => setPosts(feed.posts))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <motion.div
      className="flex h-full flex-col gap-5 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h1 className="font-jua text-4xl text-foreground text-shadow-deep">📜 동물들의 광장</h1>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <ParchmentPanel key={i} className="p-5">
              <Skeleton className="h-6 w-1/3 rounded bg-parchment-border mb-3" />
              <Skeleton className="h-4 w-2/3 rounded bg-parchment-border mb-2" />
              <Skeleton className="h-4 w-1/2 rounded bg-parchment-border" />
            </ParchmentPanel>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto flex-1">
          {posts.map((post) => (
            <motion.div key={post.id} whileHover={{ scale: 1.01 }}>
              <ParchmentPanel className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{post.authorEmoji}</span>
                  <div>
                    <span className="font-jua text-lg" style={{ color: "hsl(var(--wood-darkest))" }}>
                      {post.authorNickname}
                    </span>
                    <span className="text-xs ml-2 opacity-50">
                      {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </div>
                <h3 className="font-jua text-xl mb-1" style={{ color: "hsl(var(--wood-darkest))" }}>
                  {post.title}
                </h3>
                <p className="text-sm" style={{ color: "hsl(var(--wood-dark))" }}>{post.body}</p>
                <div className="flex gap-4 mt-3 text-sm" style={{ color: "hsl(var(--wood-light))" }}>
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                  {post.tags.map((t) => (
                    <span key={t} className="rounded-full bg-parchment-border px-2 py-0.5 text-xs">
                      #{t}
                    </span>
                  ))}
                </div>
              </ParchmentPanel>
            </motion.div>
          ))}
=======
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
      toast.error("삭제에 실패했습니다.");
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
    } catch (error) {
      toast.error("저장에 실패했습니다.");
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
    <motion.div
      className="min-h-screen flex flex-col gap-6 p-6 max-w-[1200px] mx-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header Section */}
      <header className="flex flex-col gap-4">
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-1">
            <h1 className="font-jua text-5xl text-foreground text-shadow-glow tracking-tight">📜 동물들의 광장</h1>
            <p className="text-muted-foreground font-jua text-lg opacity-80">탐정들의 비밀 정보와 일상이 공유되는 곳</p>
          </div>
          <Button
            onClick={handleOpenCreate}
            size="lg"
            className="font-jua text-xl bg-orange-500 hover:bg-orange-600 text-white gap-3 shadow-lg hover:shadow-orange-500/20 transform hover:-translate-y-1 transition-all rounded-2xl px-8"
          >
            <PlusCircle size={24} />
            새 정보 제보하기
          </Button>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors" size={22} />
          <Input
            placeholder="어떤 정보를 찾고 계신가요? (제목, 내용, 태그...)"
            className="pl-12 py-7 text-xl rounded-2xl border-2 border-parchment-border bg-white/50 backdrop-blur-sm focus-visible:ring-orange-500/50 font-jua"
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

      {/* Main Content Layout */}
      <div className="flex gap-8 relative">
        {/* Left: Feed */}
        <div className="flex-1 flex flex-col gap-6">
          {loading ? (
            <div className="flex flex-col gap-6">
              {[1, 2, 3].map((i) => (
                <ParchmentPanel key={i} className="p-8 rounded-[2rem]">
                  <div className="flex gap-4 mb-4">
                    <Skeleton className="h-14 w-14 rounded-full bg-parchment-border/50" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-1/4 bg-parchment-border/50" />
                      <Skeleton className="h-4 w-1/6 bg-parchment-border/50" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-3/4 rounded bg-parchment-border/50 mb-4" />
                  <Skeleton className="h-24 w-full rounded bg-parchment-border/50" />
                </ParchmentPanel>
              ))}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="flex flex-col gap-6">
                {visiblePosts.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-32 text-center"
                  >
                    <div className="text-8xl mb-6">🕵️‍♂️🔍</div>
                    <div className="opacity-50 font-jua text-3xl text-wood-dark">
                      아무런 흔적도 찾지 못했어요...
                    </div>
                    <p className="text-muted-foreground font-jua mt-2">새로운 정보를 제보해 주시겠어요?</p>
                  </motion.div>
                ) : (
                  visiblePosts.map((post) => (
                    <motion.div 
                      key={post.id} 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      whileHover={{ y: -4 }}
                      className="w-full"
                    >
                      <ParchmentPanel className="p-0 overflow-hidden rounded-[2rem] border-[6px] group transition-all duration-300 hover:shadow-2xl">
                        <div className="p-8">
                          {/* Post Header */}
                          <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-full bg-white/50 border-2 border-parchment-border flex items-center justify-center text-4xl shadow-inner">
                                {post.authorEmoji}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-jua text-2xl tracking-tight text-wood-darkest">
                                  {post.authorNickname}
                                </span>
                                <span className="text-sm opacity-60 font-medium">
                                  {new Date(post.createdAt).toLocaleDateString("ko-KR", { 
                                    month: 'long', 
                                    day: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex gap-1">
                              {user && (post.userId === user.id || post.authorNickname === user.nickname) && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-full text-blue-600 hover:bg-blue-50/50"
                                    onClick={(e) => handleOpenEdit(e, post)}
                                  >
                                    <Edit2 size={18} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-full text-red-600 hover:bg-red-50/50"
                                    onClick={(e) => handleDelete(e, post.id)}
                                  >
                                    <Trash2 size={18} />
                                  </Button>
                                </>
                              )}
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full opacity-40">
                                <MoreHorizontal size={20} />
                              </Button>
                            </div>
                          </div>

                          {/* Post Content */}
                          <div className="space-y-4 mb-6">
                            <h3 className="font-jua text-3xl leading-tight text-wood-darkest group-hover:text-orange-600 transition-colors">
                              {post.title}
                            </h3>
                            <p className="text-lg leading-relaxed text-wood-dark whitespace-pre-wrap line-clamp-4 font-medium">
                              {post.body}
                            </p>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-2 mb-6">
                            {post.tags.map((t) => (
                              <Badge 
                                key={t} 
                                variant="secondary" 
                                className="bg-white/50 hover:bg-orange-100 text-orange-700 border-none px-4 py-1.5 text-sm font-jua rounded-xl transition-colors cursor-pointer"
                              >
                                #{t}
                              </Badge>
                            ))}
                          </div>

                          {/* Post Footer: Actions */}
                          <div className="flex items-center justify-between pt-6 border-t border-black/5">
                            <div className="flex gap-2">
                              <Button variant="ghost" className="gap-2 font-jua text-lg hover:bg-red-50 hover:text-red-500 rounded-xl px-4 group/btn">
                                <Heart size={20} className="group-hover/btn:fill-current" />
                                <span>{post.likes}</span>
                              </Button>
                              <Button variant="ghost" className="gap-2 font-jua text-lg hover:bg-blue-50 hover:text-blue-500 rounded-xl px-4">
                                <MessageCircle size={20} />
                                <span>{post.comments}</span>
                              </Button>
                            </div>
                            <Button variant="ghost" className="gap-2 font-jua text-lg hover:bg-orange-50 hover:text-orange-500 rounded-xl px-4">
                              <Share2 size={20} />
                              <span>공유</span>
                            </Button>
                          </div>
                        </div>
                      </ParchmentPanel>
                    </motion.div>
                  ))
                )}
              </div>
            </AnimatePresence>
          )}
          
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
>>>>>>> ed833e4 (feat: 커뮤니티 페이지 CRUD 및 UI 개선)
        </div>

        {/* Right: Sidebar */}
        <aside className="hidden lg:flex flex-col gap-6 w-[340px] sticky top-6 h-fit">
          <ParchmentPanel className="p-6 rounded-3xl border-4">
            <h4 className="font-jua text-2xl mb-4 flex items-center gap-2">
              <TrendingUp className="text-orange-500" size={24} />
              인기 탐정 제보
            </h4>
            <div className="flex flex-col gap-4">
              {[
                { title: "딥페이크 탐지기 100% 활용법", likes: 1240, comments: 82 },
                { title: "최근 유행하는 AI 사기 유형", likes: 856, comments: 45 },
                { title: "탐정 등급 빨리 올리는 팁", likes: 620, comments: 31 },
              ].map((item, idx) => (
                <div key={idx} className="group cursor-pointer">
                  <p className="font-jua text-lg group-hover:text-orange-600 transition-colors truncate">{item.title}</p>
                  <div className="flex gap-3 text-sm opacity-50 font-bold mt-1">
                    <span>🔥 {item.likes}</span>
                    <span>💬 {item.comments}</span>
                  </div>
                </div>
              ))}
            </div>
          </ParchmentPanel>

          <ParchmentPanel className="p-6 rounded-3xl border-4 bg-orange-50/30">
            <h4 className="font-jua text-2xl mb-4 flex items-center gap-2">
              <Award className="text-yellow-600" size={24} />
              이달의 명탐정
            </h4>
            <div className="flex flex-col gap-3">
              {[
                { name: "수리 부엉이", emoji: "🦉", rank: "Master" },
                { name: "영리한 여우", emoji: "🦊", rank: "Pro" },
                { name: "발 빠른 치타", emoji: "🐆", rank: "Expert" },
              ].map((detective, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-3xl">{detective.emoji}</span>
                  <div className="flex flex-col">
                    <span className="font-jua text-lg">{detective.name}</span>
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">{detective.rank}</span>
                  </div>
                </div>
              ))}
            </div>
          </ParchmentPanel>

          <ParchmentPanel className="p-6 rounded-3xl border-4">
            <div className="flex items-center gap-3 mb-4">
              <Users className="text-blue-500" size={24} />
              <h4 className="font-jua text-2xl">광장 통계</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-white/40 p-3 rounded-2xl border-2 border-parchment-border">
                <div className="text-2xl font-jua">1,240</div>
                <div className="text-xs opacity-60 font-bold">활동 탐정</div>
              </div>
              <div className="bg-white/40 p-3 rounded-2xl border-2 border-parchment-border">
                <div className="text-2xl font-jua">8.5k</div>
                <div className="text-xs opacity-60 font-bold">누적 제보</div>
              </div>
            </div>
          </ParchmentPanel>

          <footer className="px-4 text-xs opacity-40 font-bold space-y-2">
            <div className="flex gap-3 underline">
              <button className="hover:text-foreground">사무소 정책</button>
              <button className="hover:text-foreground">이용 규칙</button>
              <button className="hover:text-foreground">문의하기</button>
            </div>
            <p>© 2026 PAWFILER Detective Agency. All Rights Reserved.</p>
          </footer>
        </aside>
      </div>

      {/* Write/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-parchment border-parchment-border sm:max-w-[600px] rounded-[2.5rem] p-0 overflow-hidden border-[8px]">
          <div className="p-10">
            <DialogHeader className="mb-6">
              <DialogTitle className="font-jua text-4xl text-wood-darkest text-shadow-glow">
                {editingPost ? "📜 정보 수정하기" : "🖋️ 새로운 제보 접수"}
              </DialogTitle>
              <p className="text-muted-foreground font-jua text-lg mt-1">
                다른 탐정들에게 도움이 될 만한 정확한 정보를 입력해주세요.
              </p>
            </DialogHeader>
            <div className="flex flex-col gap-6 py-4">
              <div className="flex flex-col gap-3">
                <label className="font-jua text-2xl text-wood-dark tracking-tight">정보 제목</label>
                <Input
                  placeholder="무엇에 관한 정보인가요? (예: 딥페이크 판별 꿀팁)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="py-6 text-xl rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white/50"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="font-jua text-2xl text-wood-dark tracking-tight">상세 내용</label>
                <Textarea
                  placeholder="발견하신 단서나 팁을 자세히 적어주세요. 동료 탐정들이 분석할 수 있도록요!"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="min-h-[200px] text-xl py-4 rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white/50 leading-relaxed"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="font-jua text-2xl text-wood-dark tracking-tight">태그 (쉼표로 구분)</label>
                <Input
                  placeholder="예: 팁, 분석결과, 주의사항"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="py-6 text-xl rounded-2xl border-4 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white/50"
                />
              </div>
            </div>
            <DialogFooter className="mt-8 gap-4">
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="font-jua text-xl h-14 px-8 rounded-2xl border-4 border-parchment-border hover:bg-black/5"
              >
                나중에 하기
              </Button>
              <Button
                onClick={handleSubmit}
                className="font-jua text-xl h-14 px-12 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl shadow-lg hover:shadow-orange-500/30 transform hover:-translate-y-1 transition-all"
              >
                {editingPost ? "수정 완료" : "제보하기"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default CommunityPage;
