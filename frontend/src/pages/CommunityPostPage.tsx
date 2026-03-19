import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { CommunityPost, CommunityComment } from "@/lib/types";
import { toast } from "sonner";
import {
  fetchCommunityComments, createCommunityComment, deleteCommunityComment,
  likePost, unlikePost, getPost, votePost, getVoteResult, getUserVote, checkLike,
} from "@/lib/communityApi";
import { ArrowLeft, Heart, Share2, Send, Trash2, Calendar, Copy, Check, Maximize2, MessageCircle, Users } from "lucide-react";

const card = {
  background: "hsl(var(--parchment))",
  border: "2px solid hsl(var(--parchment-border))",
  borderRadius: "1rem",
  boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
} as const;

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trueVotes, setTrueVotes] = useState(0);
  const [falseVotes, setFalseVotes] = useState(0);
  const [userVote, setUserVote] = useState<boolean | null>(null);
  const [votingLoading, setVotingLoading] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  // 선택 중 상태 (결과 공개 전 로컬 선택)
  const [pendingVote, setPendingVote] = useState<boolean | null>(null);
  const [resultRevealed, setResultRevealed] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!postId) { toast.error("잘못된 게시글 ID입니다."); setLoading(false); return; }
      setLoading(true);
      try {
        const [loadedPost, loadedComments] = await Promise.all([getPost(postId), fetchCommunityComments(postId)]);
        setPost(loadedPost);
        setComments(loadedComments);
        if (user) {
          const [isLiked, myVote] = await Promise.all([
            checkLike(postId, user.id),
            getUserVote(postId, user.id).catch(() => ({ voted: false, vote: undefined as boolean | undefined })),
          ]);
          setLiked(isLiked);
          if (myVote.voted && myVote.vote !== undefined) {
            setUserVote(myVote.vote);
            setResultRevealed(true);
          }
        }
        try {
          const voteResult = await getVoteResult(postId);
          setTrueVotes(voteResult.trueVotes);
          setFalseVotes(voteResult.falseVotes);
        } catch {}
      } catch {
        toast.error("게시글을 불러오는데 실패했습니다.");
        setPost(null);
      } finally { setLoading(false); }
    };
    load();
  }, [postId, user?.id]);

  // 선택지 클릭: 로컬 pendingVote만 변경 (API 호출 없음)
  const handleVote = (vote: boolean) => {
    if (!user) { toast.error("로그인이 필요합니다."); return; }
    if (resultRevealed) return; // 결과 공개 후 변경 불가
    setPendingVote(prev => prev === vote ? null : vote); // 같은 거 누르면 해제
  };

  // 결과 확인하기: API 호출 + 결과 공개
  const handleReveal = async () => {
    if (!user) { toast.error("로그인이 필요합니다."); return; }
    if (pendingVote === null) { toast.error("선택지를 먼저 골라주세요."); return; }
    if (votingLoading || !postId) return;
    setVotingLoading(true);
    try {
      const result = await votePost(postId, user.id, pendingVote);
      if (result.success) {
        // 최신 결과 다시 fetch
        const voteResult = await getVoteResult(postId);
        setTrueVotes(voteResult.trueVotes);
        setFalseVotes(voteResult.falseVotes);
        setUserVote(pendingVote);
        setResultRevealed(true);
        if (result.xpEarned > 0) toast.success(`참여 완료! +${result.xpEarned} XP`);
        else toast.success("결과를 확인하세요!");
      }
    } catch { toast.error("참여에 실패했습니다."); }
    finally { setVotingLoading(false); }
  };

  const handleLike = useCallback(async () => {
    if (!user) { toast.error("로그인이 필요합니다."); return; }
    setPost(prev => {
      if (!prev) return prev;
      const newLiked = !liked;
      setLiked(newLiked);
      return { ...prev, likes: prev.likes + (newLiked ? 1 : -1) };
    });
    try {
      if (liked) {
        await unlikePost(post!.id, user.id);
      } else {
        const r = await likePost(post!.id, user.id);
        if (r.alreadyLiked) {
          setLiked(true);
          setPost(prev => prev ? { ...prev, likes: prev.likes } : prev);
        }
      }
    } catch {
      toast.error("좋아요 처리에 실패했습니다.");
      setLiked(liked);
      setPost(prev => prev ? { ...prev, likes: prev.likes + (liked ? 1 : -1) } : prev);
    }
  }, [user, liked, post]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !user) { toast.error("댓글 내용을 입력해주세요."); return; }
    setSubmitting(true);
    try {
      const newComment = await createCommunityComment({
        postId: postId!, userId: user.id,
        authorNickname: user.nickname || "익명 탐정", authorEmoji: user.avatarEmoji || "🕵️", body: commentText,
      });
      setComments(prev => [...prev, newComment]);
      setCommentText("");
      toast.success("댓글이 등록되었습니다.");
      if (post) setPost({ ...post, comments: post.comments + 1 });
    } catch { toast.error("댓글 등록에 실패했습니다."); }
    finally { setSubmitting(false); }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    if (!confirm("정말 이 댓글을 삭제하시겠습니까?")) return;
    try {
      await deleteCommunityComment(commentId, user!.id);
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success("댓글이 삭제되었습니다.");
      if (post) setPost({ ...post, comments: post.comments - 1 });
    } catch { toast.error("댓글 삭제에 실패했습니다."); }
  };

  if (loading) {
    return (
      <div className="w-full p-4 flex flex-col gap-4 max-w-[1200px] mx-auto">
        <Skeleton className="h-5 w-20 rounded" style={{ background: "hsl(var(--parchment-border))" }} />
        <Skeleton className="h-14 w-full rounded-2xl" style={{ background: "hsl(var(--parchment-border))" }} />
        <Skeleton className="h-[50vh] w-full rounded-2xl" style={{ background: "hsl(var(--parchment-border))" }} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="h-[calc(100vh-5rem)] w-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-7xl mb-4">🔍</div>
          <div className="font-jua text-2xl text-foreground">게시글을 찾을 수 없습니다</div>
          <Button onClick={() => navigate('/community')} className="mt-4 font-jua bg-orange-500 hover:bg-orange-600 text-white">광장으로 돌아가기</Button>
        </div>
      </div>
    );
  }

  const total = trueVotes + falseVotes;
  const trueRatio = total > 0 ? Math.round((trueVotes / total) * 100) : 50;
  const falseRatio = total > 0 ? 100 - trueRatio : 50;

  return (
    <div className="w-full">
      <div className="max-w-[1200px] mx-auto px-4 py-4 pb-20 flex flex-col gap-3">

        {/* 목록으로 */}
        <button
          onClick={() => navigate('/community')}
          className="flex items-center gap-1.5 text-foreground/40 hover:text-foreground/70 transition-colors text-xs font-jua w-fit"
        >
          <ArrowLeft size={12} />
          목록으로
        </button>

        {/* 게시글 헤더 */}
        <div className="flex flex-col gap-1">
          <h1 className="font-jua text-2xl md:text-[1.65rem] leading-snug text-foreground break-words">{post.title}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">{post.authorEmoji}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground) / 0.65)" }}>{post.authorNickname}</span>
            </div>
            <span style={{ color: "hsl(var(--foreground) / 0.2)" }}>·</span>
            <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--foreground) / 0.4)" }}>
              <Calendar size={10} />
              {new Date(post.createdAt).toLocaleDateString("ko-KR", { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ color: "hsl(var(--foreground) / 0.2)" }}>·</span>
            <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--foreground) / 0.4)" }}>
              <MessageCircle size={10} />
              댓글 {comments.length}
            </span>
            {post.tags.map((t) => (
              <Badge key={t} variant="secondary" className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0 text-xs font-jua rounded-md">#{t}</Badge>
            ))}
          </div>
        </div>

        {/* 메인: 미디어 + 참여 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-[58%_42%] gap-3 items-start">

          {/* 미디어 카드 */}
          <div
            className="relative overflow-hidden flex items-center justify-center"
            style={{
              ...card,
              minHeight: isPortrait ? "60vh" : "40vh",
              maxHeight: isPortrait ? "80vh" : "56vh",
              padding: "4px",
            }}
          >
            {post.mediaUrl ? (
              <>
                {post.mediaType === "video" ? (
                  <video src={post.mediaUrl} controls className="w-full h-full object-contain" style={{ maxHeight: isPortrait ? "80vh" : "56vh" }} />
                ) : (
                  <img
                    src={post.mediaUrl} alt={post.title}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: isPortrait ? "80vh" : "56vh" }}
                    onLoad={(e) => { const img = e.currentTarget; setIsPortrait(img.naturalHeight > img.naturalWidth * 1.2); }}
                  />
                )}
                {post.mediaType !== "video" && (
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="absolute top-2 right-2 bg-white/80 hover:bg-white rounded-lg p-1.5 transition-all"
                    style={{ border: "1px solid hsl(var(--parchment-border))" }}
                    aria-label="이미지 확대"
                  >
                    <Maximize2 size={12} className="text-wood-dark" />
                  </button>
                )}
              </>
            ) : (
              <div className="text-5xl opacity-20">🖼️</div>
            )}
          </div>

          {/* 참여 카드 */}
          <div style={card} className="p-5 flex flex-col gap-3">
            {/* 헤더 */}
            <div className="pb-3" style={{ borderBottom: "1px solid hsl(var(--parchment-border))" }}>
              <span className="text-[10px] font-jua uppercase tracking-widest text-orange-500 opacity-80">
                {resultRevealed ? "참여 완료" : "참여하기"}
              </span>
              <p className="font-jua text-base text-wood-darkest leading-snug mt-1">
                이 장면, 어떻게 생각하세요?
              </p>
              {/* 고정 높이 서브라벨 — 두 상태 모두 한 줄 차지 */}
              <p className="text-xs mt-1 transition-opacity duration-200" style={{ color: "hsl(var(--wood-light))", opacity: resultRevealed ? 0.5 : 1 }}>
                {resultRevealed
                  ? `총 ${total}명이 참여했어요`
                  : pendingVote !== null
                    ? "결과 확인 전까지 선택을 변경할 수 있어요"
                    : "선택지를 골라보세요"}
              </p>
            </div>

            {/* 선택지 버튼 */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => handleVote(true)}
                disabled={resultRevealed}
                className={`w-full py-2.5 px-3.5 rounded-xl text-sm font-jua text-left transition-all focus:outline-none
                  ${resultRevealed
                    ? userVote === true ? 'text-wood-darkest' : 'text-wood-light opacity-60 cursor-default'
                    : pendingVote === true ? 'text-wood-darkest' : 'text-wood-darkest hover:bg-orange-50 active:scale-[0.99]'}`}
                style={resultRevealed
                  ? userVote === true
                    ? { background: "#f0fdf4", border: "1px solid #86efac" }
                    : { background: "hsl(var(--parchment))", border: "1px solid hsl(var(--parchment-border))" }
                  : pendingVote === true
                    ? { background: "#fff7ed", border: "1.5px solid #fb923c" }
                    : { background: "hsl(var(--parchment))", border: "1.5px solid hsl(var(--parchment-border))" }}
              >
                <span className="flex items-center justify-between">
                  <span>✅ 정답인 것 같아요</span>
                  {resultRevealed && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--wood-light))" }}>
                      <Users size={10} />{trueVotes}명
                    </span>
                  )}
                </span>
              </button>

              <button
                onClick={() => handleVote(false)}
                disabled={resultRevealed}
                className={`w-full py-2.5 px-3.5 rounded-xl text-sm font-jua text-left transition-all focus:outline-none
                  ${resultRevealed
                    ? userVote === false ? 'text-wood-darkest' : 'text-wood-light opacity-60 cursor-default'
                    : pendingVote === false ? 'text-wood-darkest' : 'text-wood-darkest hover:bg-orange-50 active:scale-[0.99]'}`}
                style={resultRevealed
                  ? userVote === false
                    ? { background: "#fef2f2", border: "1px solid #fca5a5" }
                    : { background: "hsl(var(--parchment))", border: "1px solid hsl(var(--parchment-border))" }
                  : pendingVote === false
                    ? { background: "#fff7ed", border: "1.5px solid #fb923c" }
                    : { background: "hsl(var(--parchment))", border: "1.5px solid hsl(var(--parchment-border))" }}
              >
                <span className="flex items-center justify-between">
                  <span>❌ 오답인 것 같아요</span>
                  {resultRevealed && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--wood-light))" }}>
                      <Users size={10} />{falseVotes}명
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* 하단 고정 슬롯 — 투표 전/후 동일 높이 유지 */}
            <div className="flex flex-col gap-1.5" style={{ minHeight: "4.5rem" }}>
              {resultRevealed ? (
                /* 결과 바 */
                total > 0 ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex justify-between text-xs font-jua" style={{ color: "hsl(var(--wood-light))" }}>
                      <span>정답 {trueRatio}%</span>
                      <span>오답 {falseRatio}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "hsl(var(--parchment-border))" }}>
                      <div className="bg-orange-400 transition-all duration-700 rounded-full" style={{ width: `${trueRatio}%` }} />
                    </div>
                    <p className="text-[11px] font-jua text-center pt-0.5" style={{ color: "hsl(var(--wood-light))", opacity: 0.6 }}>
                      투표가 완료되었어요
                    </p>
                  </div>
                ) : null
              ) : (
                /* 결과 확인하기 버튼 */
                <>
                  <button
                    onClick={handleReveal}
                    disabled={pendingVote === null || votingLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-jua transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    style={pendingVote !== null
                      ? { background: "#f97316", color: "#fff", border: "none" }
                      : { background: "hsl(var(--parchment-border))", color: "hsl(var(--wood-light))", border: "none" }}
                  >
                    {votingLoading ? "확인 중..." : "결과 확인하기"}
                  </button>
                  <p className="text-[11px] font-jua text-center" style={{ color: "hsl(var(--wood-light))", opacity: 0.6 }}>
                    선택 후 결과를 확인할 수 있어요
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 작성자의 설명 — 이미지 아래 자연스럽게 이어지는 섹션 */}
        {post.body && (
          <div
            style={{ ...card, boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}
            className="px-4 py-3"
          >
            <div className="flex items-center gap-1.5 mb-2" style={{ borderBottom: "1px solid hsl(var(--parchment-border))", paddingBottom: "0.5rem" }}>
              <span className="text-orange-500 text-xs">✏️</span>
              <p className="text-xs text-orange-600 font-jua uppercase tracking-wide">작성자의 설명</p>
            </div>
            <p className="text-sm leading-relaxed text-wood-dark whitespace-pre-wrap break-words">{post.body}</p>
          </div>
        )}

        {/* 반응 버튼 */}
        <div className="flex items-center gap-2">
          <button
          onClick={handleLike}
            className={`flex items-center gap-1.5 font-jua text-sm rounded-xl px-3 py-1.5 transition-all
              ${liked ? 'text-red-500' : 'text-wood-dark hover:text-orange-600'}`}
            style={{ background: "hsl(var(--parchment))", border: "1px solid hsl(var(--parchment-border))" }}
          >
            <Heart size={13} fill={liked ? "currentColor" : "none"} />
            좋아요 {post.likes}
          </button>
          <button
            onClick={() => setShareModalOpen(true)}
            className="flex items-center gap-1.5 font-jua text-sm text-wood-dark hover:text-orange-600 rounded-xl px-3 py-1.5 transition-all"
            style={{ background: "hsl(var(--parchment))", border: "1px solid hsl(var(--parchment-border))" }}
          >
            <Share2 size={13} />
            공유하기
          </button>
        </div>

        {/* 댓글 섹션 */}
        <div style={card} className="px-5 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2" style={{ borderBottom: "1px solid hsl(var(--parchment-border))" }}>
            <MessageCircle size={13} className="text-orange-500" />
            <span className="font-jua text-sm text-wood-darkest">댓글 {comments.length}개</span>
            <span className="text-xs ml-1" style={{ color: "hsl(var(--wood-light))" }}>· 왜 그렇게 생각했는지 남겨보세요</span>
          </div>

          {user ? (
            <div className="flex gap-2 items-center">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "hsl(var(--parchment-border))" }}>{user.avatarEmoji}</div>
              <Input
                placeholder="의견을 남겨보세요..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmitComment(); } }}
                className="text-sm rounded-xl text-wood-darkest placeholder:text-wood-base focus-visible:ring-orange-400 flex-1 h-8 px-3"
                style={{ background: "hsl(var(--parchment))", border: "1px solid hsl(var(--parchment-border))" }}
                disabled={submitting}
              />
              <Button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || submitting}
                className="font-jua bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-3 py-1.5 h-auto gap-1 disabled:opacity-40 text-sm flex-shrink-0"
              >
                <Send size={12} />등록
              </Button>
            </div>
          ) : (
            <p className="text-xs font-jua py-1" style={{ color: "hsl(var(--wood-light))" }}>댓글을 남기려면 로그인이 필요합니다</p>
          )}

          {comments.length === 0 ? (
            <p className="text-xs font-jua py-1 text-wood-dark">아직 댓글이 없습니다. 첫 의견을 남겨보세요!</p>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: "hsl(var(--parchment-border))" }}>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 py-2.5 first:pt-0"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5" style={{ background: "hsl(var(--parchment-border))" }}>{comment.authorEmoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-wood-darkest">{comment.authorNickname}</span>
                        <span className="text-xs" style={{ color: "hsl(var(--wood-light))" }}>
                          {new Date(comment.createdAt).toLocaleDateString("ko-KR", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {user && comment.userId === user.id && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded text-wood-light hover:text-red-500 hover:bg-red-50" onClick={() => handleDeleteComment(comment.id)}>
                          <Trash2 size={11} />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-wood-dark break-words">{comment.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 라이트박스 */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[92vw] max-h-[92vh] p-2 bg-black/95 border-none rounded-2xl flex items-center justify-center">
          <DialogHeader className="sr-only">
            <DialogTitle>{post.title}</DialogTitle>
          </DialogHeader>
          <img src={post.mediaUrl || ""} alt={post.title} className="max-w-full max-h-[88vh] object-contain rounded-xl" />
        </DialogContent>
      </Dialog>

      {/* 공유 모달 */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-parchment border-parchment-border sm:max-w-[480px] rounded-2xl p-6 border-4">
          <DialogHeader className="mb-3">
            <DialogTitle className="font-jua text-2xl text-wood-darkest">🔗 게시글 공유하기</DialogTitle>
            <DialogDescription className="font-jua text-sm text-wood-dark/60 mt-1">링크를 복사해서 공유하세요</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={window.location.href} readOnly className="flex-1 text-sm rounded-lg border-2 border-parchment-border bg-white text-gray-900 font-mono" onClick={(e) => e.currentTarget.select()} />
            <Button
              onClick={async () => { await navigator.clipboard.writeText(window.location.href); setCopied(true); toast.success("링크가 복사되었습니다!"); setTimeout(() => setCopied(false), 2000); }}
              className={`font-jua rounded-lg px-4 transition-all ${copied ? "bg-green-500 hover:bg-green-600 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"}`}
            >
              {copied ? <><Check size={15} className="mr-1" />복사됨</> : <><Copy size={15} className="mr-1" />복사</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunityPostPage;
