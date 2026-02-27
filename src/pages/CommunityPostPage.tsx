import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import WoodPanel from "@/components/WoodPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import type { CommunityPost, CommunityComment } from "@/lib/types";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Heart, 
  MessageCircle, 
  Share2, 
  Send,
  Trash2,
  Eye,
  Calendar
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

  useEffect(() => {
    const loadPost = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockPost: CommunityPost = {
        id: postId || "1",
        authorNickname: "영리한 여우",
        authorEmoji: "🦊",
        title: "딥페이크 탐지 100% 활용법",
        body: "안녕하세요 여러분! 오늘은 딥페이크를 효과적으로 탐지하는 방법에 대해 공유하려고 합니다.\n\n1. 눈 깜빡임 패턴 확인\n딥페이크 영상은 자연스러운 눈 깜빡임이 부족한 경우가 많습니다. 실제 사람은 평균 15-20회/분 깜빡이지만, 딥페이크는 이 패턴이 불규칙합니다.\n\n2. 얼굴 경계선 체크\n얼굴과 배경의 경계선이 부자연스럽거나 흐릿한 경우가 많습니다. 특히 머리카락 주변을 주의깊게 살펴보세요.\n\n3. 조명 일관성\n얼굴의 조명이 주변 환경과 일치하지 않는 경우가 있습니다. 그림자의 방향과 강도를 확인하세요.\n\n4. 입술 싱크\n말하는 내용과 입 모양이 정확히 일치하는지 확인하세요. 딥페이크는 종종 립싱크가 어긋납니다.\n\n5. 피부 질감\n지나치게 매끄럽거나 인공적인 피부 질감은 딥페이크의 신호일 수 있습니다.\n\n여러분도 이런 팁들을 활용해서 딥페이크를 잘 찾아내시길 바랍니다!",
        likes: 1240,
        comments: 82,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        tags: ["팁", "딥페이크", "탐지기법"],
        userId: "user_fox"
      };

      const mockComments: CommunityComment[] = [
        {
          id: "c1",
          postId: postId || "1",
          authorNickname: "수리 부엉이",
          authorEmoji: "🦉",
          body: "정말 유용한 정보네요! 특히 눈 깜빡임 패턴은 몰랐던 부분이에요. 감사합니다!",
          createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          userId: "user_owl"
        },
        {
          id: "c2",
          postId: postId || "1",
          authorNickname: "발 빠른 치타",
          authorEmoji: "🐆",
          body: "조명 일관성 체크는 정말 중요한 것 같아요. 저도 이걸로 여러 번 딥페이크를 찾아냈습니다.",
          createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
          userId: "user_cheetah"
        },
        {
          id: "c3",
          postId: postId || "1",
          authorNickname: "똑똑한 돌고래",
          authorEmoji: "🐬",
          body: "입술 싱크 부분 추가 설명 부탁드려요! 어떻게 정확히 확인하나요?",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          userId: "user_dolphin"
        }
      ];

      setPost(mockPost);
      setComments(mockComments);
      setLoading(false);
    };

    loadPost();
  }, [postId]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !user) {
      toast.error("댓글 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newComment: CommunityComment = {
        id: `c_${Date.now()}`,
        postId: postId || "1",
        authorNickname: user.nickname || "익명 탐정",
        authorEmoji: user.avatarEmoji || "🕵️",
        body: commentText,
        createdAt: new Date().toISOString(),
        userId: user.id
      };

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
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
      <div className="h-[calc(100vh-5rem)] w-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        <motion.div
          className="flex flex-col gap-6 p-6 max-w-[1100px] mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Skeleton className="h-12 w-32 rounded-2xl bg-parchment-border/50" />
          <ParchmentPanel className="p-8 rounded-[2rem]">
            <Skeleton className="h-10 w-3/4 rounded bg-parchment-border/50 mb-4" />
            <Skeleton className="h-64 w-full rounded bg-parchment-border/50" />
          </ParchmentPanel>
        </motion.div>
      </div>
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
              <Button className="gap-2 font-jua text-xl bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl px-10 py-7 border-2 border-red-200">
                <Heart size={24} />
                <span>좋아요 {post.likes}</span>
              </Button>
              <Button className="gap-2 font-jua text-xl bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-2xl px-10 py-7 border-2 border-orange-200">
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
                        if (e.key === 'Enter' && !e.shiftKey) {
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
    </div>
  );
};

export default CommunityPostPage;
