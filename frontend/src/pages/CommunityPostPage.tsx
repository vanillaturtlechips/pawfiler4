import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import WoodPanel from "@/components/WoodPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { CommunityPost, CommunityComment } from "@/lib/types";
import { toast } from "sonner";
import {
  fetchCommunityComments,
  createCommunityComment,
  deleteCommunityComment,
  likePost,
  unlikePost,
  getPost,
  checkLike,
} from "@/lib/api";
import { 
  ArrowLeft, 
  Heart, 
  MessageCircle, 
  Share2, 
  Send,
  Trash2,
  Calendar,
  Copy,
  Check
} from "lucide-react";

const CommunityPostPage = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      if (!postId) {
        toast.error("잘못된 게시글 ID입니다.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 실제 API에서 게시글 데이터 로드
        const loadedPost = await getPost(postId);
        setPost(loadedPost);

        // 실제 API에서 댓글 로드
        const loadedComments = await fetchCommunityComments(postId);
        setComments(loadedComments);

        // 좋아요 상태 확인
        if (user) {
          const isLiked = await checkLike(postId, user.id);
          setLiked(isLiked);
        }
      } catch (error) {
        console.error('Failed to load post:', error);
        toast.error("게시글을 불러오는데 실패했습니다.");
        setPost(null);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [postId, user]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !user) {
      toast.error("댓글 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const newComment = await createCommunityComment({
        postId: postId || "1",
        userId: user.id,
        authorNickname: user.nickname || "익명 탐정",
        authorEmoji: user.avatarEmoji || "🕵️",
        body: commentText,
      });

      setComments(prev => [...prev, newComment]);
      setCommentText("");
      toast.success("댓글이 등록되었습니다.");
      
      if (post) {
        setPost({ ...post, comments: post.comments + 1 });
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      toast.error("댓글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("정말 이 댓글을 삭제하시겠습니까?")) return;

    try {
      await deleteCommunityComment(commentId);
      
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success("댓글이 삭제되었습니다.");
      
      if (post) {
        setPost({ ...post, comments: post.comments - 1 });
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
      toast.error("댓글 삭제에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <motion.div 
        className="h-[calc(100vh-5rem)] w-full overflow-y-auto" 
        style={{ scrollbarGutter: 'stable' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="flex flex-col gap-6 p-6 max-w-[1100px] mx-auto">
          <Skeleton className="h-12 w-32 rounded-2xl bg-parchment-border/50" />
          <ParchmentPanel className="p-8 rounded-[2rem]">
            <Skeleton className="h-10 w-3/4 rounded bg-parchment-border/50 mb-4" />
            <Skeleton className="h-64 w-full rounded bg-parchment-border/50" />
          </ParchmentPanel>
        </div>
      </motion.div>
    );
  }

  if (!post) {
    return (
      <div className="h-[calc(100vh-5rem)] w-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-8xl mb-6">🔍</div>
          <div className="font-jua text-3xl text-wood-dark">게시글을 찾을 수 없습니다</div>
          <Button onClick={() => navigate('/community')} className="mt-6 font-jua text-xl">
            광장으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
      <motion.div
        className="flex flex-col gap-8 p-8 max-w-[1400px] mx-auto pb-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* 뒤로 가기 버튼 */}
        <Button
          variant="ghost"
          onClick={() => navigate('/community')}
          className="font-jua text-xl gap-2 w-fit hover:bg-parchment-border/30 rounded-2xl px-6 py-6"
        >
          <ArrowLeft size={24} />
          목록으로
        </Button>

        {/* 게시글 본문 */}
        <ParchmentPanel className="rounded-3xl border-[6px] overflow-hidden">
          {/* 게시글 헤더 */}
          <div className="bg-wood-dark/20 border-b-4 border-wood-darkest p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="font-jua text-5xl leading-tight text-wood-darkest mb-4">
                  {post.title}
                </h1>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((t) => (
                    <Badge 
                      key={t} 
                      variant="secondary" 
                      className="bg-orange-100 text-orange-700 border-none px-4 py-2 text-base font-jua rounded-xl"
                    >
                      #{t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* 작성자 정보 */}
            <div className="flex items-center justify-between pt-6 border-t-2 border-wood-darkest/10">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-white/70 border-3 border-parchment-border flex items-center justify-center text-5xl shadow-lg">
                  {post.authorEmoji}
                </div>
                <div className="flex flex-col">
                  <span className="font-jua text-2xl tracking-tight text-wood-darkest">
                    {post.authorNickname}
                  </span>
                  <div className="flex items-center gap-3 text-base opacity-70 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar size={16} />
                      {new Date(post.createdAt).toLocaleDateString("ko-KR", { 
                        year: 'numeric',
                        month: 'long', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* 통계 */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/50">
                  <Heart size={20} className="text-red-500" />
                  <span className="font-jua text-xl">{post.likes}</span>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/50">
                  <MessageCircle size={20} className="text-blue-500" />
                  <span className="font-jua text-xl">{post.comments}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 본문 */}
          <div className="p-12">
            <div className="text-xl leading-relaxed text-wood-dark whitespace-pre-wrap font-medium min-h-[400px] max-w-[900px] mx-auto">
              {post.body}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="border-t-4 border-wood-darkest/20 p-8 bg-wood-dark/10">
            <div className="flex items-center justify-center gap-6">
              <Button 
                onClick={async () => {
                  if (!user) {
                    toast.error("로그인이 필요합니다.");
                    return;
                  }
                  try {
                    if (liked) {
                      await unlikePost(post.id, user.id);
                      setPost({ ...post, likes: post.likes - 1 });
                      setLiked(false);
                      toast.success("좋아요가 취소되었습니다.");
                    } else {
                      const result = await likePost(post.id, user.id);
                      if (result.alreadyLiked) {
                        toast.info("이미 좋아요를 누른 게시글입니다.");
                        setLiked(true);
                      } else {
                        setPost({ ...post, likes: post.likes + 1 });
                        setLiked(true);
                        toast.success("좋아요를 눌렀습니다.");
                      }
                    }
                  } catch (error) {
                    console.error('Failed to like/unlike:', error);
                    toast.error("좋아요 처리에 실패했습니다.");
                  }
                }}
                className={`gap-2 font-jua text-xl rounded-2xl px-10 py-7 border-2 transition-all ${
                  liked
                    ? 'bg-red-100 hover:bg-red-200 text-red-600 border-red-300'
                    : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                }`}
              >
                <Heart size={24} fill={liked ? "currentColor" : "none"} />
                <span>좋아요 {post.likes}</span>
              </Button>
              <Button 
                onClick={() => setShareModalOpen(true)}
                className="gap-2 font-jua text-xl bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-2xl px-10 py-7 border-2 border-orange-200"
              >
                <Share2 size={24} />
                <span>공유하기</span>
              </Button>
            </div>
          </div>
        </ParchmentPanel>

        {/* 댓글 섹션 */}
        <ParchmentPanel className="rounded-3xl border-[6px] overflow-hidden">
          {/* 댓글 헤더 */}
          <div className="bg-wood-dark/20 border-b-4 border-wood-darkest p-8">
            <h2 className="font-jua text-4xl flex items-center gap-3 text-wood-darkest">
              <MessageCircle size={36} className="text-blue-500" />
              댓글 {comments.length}개
            </h2>
          </div>

          <div className="p-8">
            {/* 댓글 작성 */}
            {user && (
              <WoodPanel className="mb-8 p-6">
                <div className="flex gap-5">
                  <div className="w-14 h-14 rounded-full bg-white/70 border-2 border-wood-darkest flex items-center justify-center text-4xl shadow-inner flex-shrink-0">
                    {user.avatarEmoji}
                  </div>
                  <div className="flex-1 flex flex-col gap-4">
                    <Input
                      placeholder="댓글을 입력하세요..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleSubmitComment();
                        }
                      }}
                      className="flex-1 py-7 text-xl rounded-2xl border-4 border-wood-darkest focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400"
                      disabled={submitting}
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSubmitComment}
                        disabled={!commentText.trim() || submitting}
                        className="font-jua text-xl bg-orange-500 hover:bg-orange-600 text-white rounded-2xl px-8 py-6 disabled:opacity-50 gap-2"
                      >
                        <Send size={20} />
                        댓글 등록
                      </Button>
                    </div>
                  </div>
                </div>
              </WoodPanel>
            )}

            {/* 댓글 목록 */}
            <div className="flex flex-col gap-5">
              {comments.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                  <div className="text-8xl mb-6">💬</div>
                  <p className="font-jua text-3xl text-wood-dark">아직 댓글이 없습니다</p>
                  <p className="text-lg mt-3">첫 댓글을 남겨보세요!</p>
                </div>
              ) : (
                comments.map((comment, index) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <WoodPanel className="p-6 bg-wood-dark/80 border-2 border-wood-darkest">
                      <div className="flex gap-5">
                        <div className="w-14 h-14 rounded-full bg-orange-100 border-2 border-wood-darkest flex items-center justify-center text-4xl shadow-inner flex-shrink-0">
                          {comment.authorEmoji}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <span className="font-jua text-2xl text-orange-100">
                                {comment.authorNickname}
                              </span>
                              <span className="text-base opacity-70 font-medium text-orange-200">
                                {new Date(comment.createdAt).toLocaleDateString("ko-KR", { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </span>
                            </div>
                            {user && comment.userId === user.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 rounded-full text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                <Trash2 size={18} />
                              </Button>
                            )}
                          </div>
                          <p className="text-lg leading-relaxed text-orange-50 font-semibold">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    </WoodPanel>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </ParchmentPanel>
      </motion.div>

      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-parchment border-parchment-border sm:max-w-[500px] rounded-[2rem] p-8 border-[6px]">
          <DialogHeader className="mb-4">
            <DialogTitle className="font-jua text-3xl text-wood-darkest text-shadow-glow">
              🔗 게시글 공유하기
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-jua text-base mt-2">
              아래 링크를 복사해서 친구들과 공유하세요!
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                value={window.location.href}
                readOnly
                className="flex-1 py-6 text-base rounded-xl border-4 border-parchment-border bg-white text-gray-900 font-mono"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    toast.success("링크가 복사되었습니다!");
                    setTimeout(() => setCopied(false), 2000);
                  } catch (error) {
                    // Fallback
                    const input = document.querySelector('input[readonly]') as HTMLInputElement;
                    input?.select();
                    document.execCommand('copy');
                    setCopied(true);
                    toast.success("링크가 복사되었습니다!");
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className={`font-jua text-lg rounded-xl px-6 py-6 transition-all ${
                  copied 
                    ? "bg-green-500 hover:bg-green-600 text-white" 
                    : "bg-orange-500 hover:bg-orange-600 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={20} className="mr-2" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={20} className="mr-2" />
                    복사
                  </>
                )}
              </Button>
            </div>
            
            <div className="text-center text-sm text-wood-dark/70 font-jua">
              링크를 복사하여 카카오톡, 메신저 등으로 공유할 수 있습니다
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunityPostPage;
