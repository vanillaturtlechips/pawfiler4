import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Loader2, Search, Eye, Edit, Trash2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";

type Post = {
  id: string; title: string; body: string; authorNickname: string; authorEmoji: string;
  likes: number; comments: number; createdAt: string; tags: string[];
  mediaUrl: string; mediaType: string; isCorrect: boolean | null;
  trueVotes: number; falseVotes: number; totalVotes: number;
};
type Comment = {
  id: string; postId: string; userId: string; authorNickname: string; authorEmoji: string; body: string; createdAt: string;
};
type Feed = { posts: Post[]; totalCount: number; page: number; };
type ReviewFeed = { posts: Post[]; totalCount: number; page: number; };

const BASE = (import.meta.env.VITE_ADMIN_API_URL || "http://localhost:8082");

export default function AdminCommunityPage() {
  const [activeTab, setActiveTab] = useState<"posts" | "review">("posts");

  // 게시글 관리 상태
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState<"title"|"body"|"all">("title");
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<Feed>({ posts: [], totalCount: 0, page: 1 });

  const [editing, setEditing] = useState<Post|null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");

  // 검토 대기 상태
  const [reviewPage, setReviewPage] = useState(1);
  const [minVotes, setMinVotes] = useState(5);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewFeed, setReviewFeed] = useState<ReviewFeed>({ posts: [], totalCount: 0, page: 1 });

  // 퀴즈 발행 모달 상태
  const [publishTarget, setPublishTarget] = useState<Post | null>(null);
  const [publishDifficulty, setPublishDifficulty] = useState("medium");
  const [publishCategory, setPublishCategory] = useState("ai-generated-detection");
  const [publishExplanation, setPublishExplanation] = useState("");
  const [publishCorrectAnswer, setPublishCorrectAnswer] = useState<boolean | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (searchInput) { params.set("search", searchInput); params.set("search_type", searchType); }
      const res = await fetch(`${BASE}/admin/community/posts?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFeed({ posts: data.posts || [], totalCount: data.totalCount || 0, page: data.page || 1 });
    } catch (e:any) { toast.error(e.message ?? "피드 로드 실패"); }
    finally { setLoading(false); }
  };

  const fetchReview = async () => {
    setReviewLoading(true);
    try {
      const params = new URLSearchParams({ page: String(reviewPage), page_size: "10", min_votes: String(minVotes) });
      const res = await fetch(`${BASE}/admin/community/posts/review?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReviewFeed({ posts: data.posts || [], totalCount: data.totalCount || 0, page: data.page || 1 });
    } catch (e:any) { toast.error(e.message ?? "문제 요청 목록 로드 실패"); }
    finally { setReviewLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchFeed(), 300);
    return () => clearTimeout(timer);
  }, [page, pageSize, searchInput, searchType]);

  useEffect(() => {
    if (activeTab === "review") fetchReview();
  }, [activeTab, reviewPage, minVotes]);

  const openEdit = (p: Post) => {
    setEditing(p); setEditTitle(p.title); setEditBody(p.body); setEditTags(p.tags.join(", "));
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const tags = editTags.split(",").map(t=>t.trim()).filter(Boolean);
      const res = await fetch(`${BASE}/admin/community/posts/${editing.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, body: editBody, tags }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("수정 완료");
      setEditing(null); fetchFeed();
    } catch (e:any) { toast.error(e.message ?? "수정 실패"); }
  };

  const deletePost = async (postId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE}/admin/community/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("삭제 완료"); fetchFeed();
    } catch (e:any) { toast.error(e.message ?? "삭제 실패"); }
  };

  const fetchComments = async (postId: string) => {
    try {
      const res = await fetch(`${BASE}/admin/community/posts/${postId}/comments`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setComments(data.comments || []);
    } catch (e:any) { toast.error(e.message ?? "댓글 로드 실패"); }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE}/admin/community/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("댓글 삭제 완료");
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e:any) { toast.error(e.message ?? "삭제 실패"); }
  };

  const openPublish = (p: Post) => {
    setPublishTarget(p);
    setPublishCorrectAnswer(p.isCorrect ?? null);
    setPublishExplanation("");
  };

  const submitPublish = async () => {
    if (!publishTarget) return;
    if (!publishExplanation.trim()) { toast.error("해설을 입력해주세요"); return; }
    if (publishCorrectAnswer === null) { toast.error("정답을 선택해주세요"); return; }
    setPublishLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/community/posts/${publishTarget.id}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty: publishDifficulty,
          category: publishCategory,
          explanation: publishExplanation,
          correct_answer: publishCorrectAnswer,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("퀴즈 문제로 발행 완료!");
      setPublishTarget(null);
      fetchReview();
    } catch (e:any) { toast.error(e.message ?? "발행 실패"); }
    finally { setPublishLoading(false); }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(feed.totalCount / pageSize)), [feed.totalCount, pageSize]);
  const reviewTotalPages = useMemo(() => Math.max(1, Math.ceil(reviewFeed.totalCount / 10)), [reviewFeed.totalCount]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateStr; }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">커뮤니티 관리</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="posts">전체 게시글</TabsTrigger>
          <TabsTrigger value="review">
            문제 요청
            {reviewFeed.totalCount > 0 && (
              <Badge className="ml-2 h-5 min-w-5 text-xs" variant="destructive">{reviewFeed.totalCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 전체 게시글 탭 */}
        <TabsContent value="posts" className="space-y-4">
          <div className="text-sm text-muted-foreground">총 {feed.totalCount}개 게시글</div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">검색</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="검색어 입력..."
                  value={searchInput}
                  onChange={(e)=>{ setSearchInput(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-[140px]">
              <label className="text-sm font-medium mb-2 block">검색 범위</label>
              <Select value={searchType} onValueChange={(v)=>{ setSearchType(v as any); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">제목</SelectItem>
                  <SelectItem value="body">본문</SelectItem>
                  <SelectItem value="all">전체</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[120px]">
              <label className="text-sm font-medium mb-2 block">페이지 크기</label>
              <Select value={String(pageSize)} onValueChange={(v)=>{ setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10개</SelectItem>
                  <SelectItem value="20">20개</SelectItem>
                  <SelectItem value="50">50개</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">제목</TableHead>
                    <TableHead>작성자</TableHead>
                    <TableHead>미디어</TableHead>
                    <TableHead className="text-center">진짜</TableHead>
                    <TableHead className="text-center">가짜</TableHead>
                    <TableHead className="text-center">총 투표</TableHead>
                    <TableHead>태그</TableHead>
                    <TableHead>작성일</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feed.posts.map(p=>(
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span>{p.authorEmoji}</span>
                          <span className="text-sm">{p.authorNickname}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.mediaUrl ? (
                          <a href={p.mediaUrl} target="_blank" rel="noreferrer">
                            <Badge variant="secondary">{p.mediaType || "media"}</Badge>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">없음</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{p.trueVotes}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-red-500 font-medium">{p.falseVotes}</span>
                      </TableCell>
                      <TableCell className="text-center font-medium">{p.totalVotes}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {p.tags.slice(0, 2).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                          {p.tags.length > 2 && <Badge variant="outline" className="text-xs">+{p.tags.length - 2}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={()=>{ setSelectedPost(p); fetchComments(p.id); setDetailOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={()=>openEdit(p)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={()=>deletePost(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {feed.posts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        검색 결과가 없습니다
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{page} / {totalPages} 페이지</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1||loading}>이전</Button>
              <Button variant="outline" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages||loading}>다음</Button>
            </div>
          </div>
        </TabsContent>

        {/* 검토 대기 탭 */}
        <TabsContent value="review" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">총 {reviewFeed.totalCount}개 게시글</div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">최소 투표 수</label>
              <Select value={String(minVotes)} onValueChange={(v)=>{ setMinVotes(Number(v)); setReviewPage(1); }}>
                <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1표</SelectItem>
                  <SelectItem value="3">3표</SelectItem>
                  <SelectItem value="5">5표</SelectItem>
                  <SelectItem value="10">10표</SelectItem>
                  <SelectItem value="20">20표</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            {reviewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">제목</TableHead>
                    <TableHead>작성자</TableHead>
                    <TableHead>미디어</TableHead>
                    <TableHead className="text-center">진짜</TableHead>
                    <TableHead className="text-center">가짜</TableHead>
                    <TableHead className="text-center">총 투표</TableHead>
                    <TableHead>작성일</TableHead>
                    <TableHead className="text-right">발행</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewFeed.posts.map(p=>(
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span>{p.authorEmoji}</span>
                          <span className="text-sm">{p.authorNickname}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.mediaUrl ? (
                          <a href={p.mediaUrl} target="_blank" rel="noreferrer">
                            <Badge variant="secondary">{p.mediaType || "media"}</Badge>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">없음</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600 font-medium">{p.trueVotes}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-red-500 font-medium">{p.falseVotes}</span>
                      </TableCell>
                      <TableCell className="text-center font-medium">{p.totalVotes}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={()=>openPublish(p)} disabled={!p.mediaUrl}>
                          <SendHorizonal className="h-4 w-4 mr-1" />
                          발행
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reviewFeed.posts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        문제 요청 게시글이 없습니다 (최소 {minVotes}표 이상)
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{reviewPage} / {reviewTotalPages} 페이지</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setReviewPage(p=>Math.max(1,p-1))} disabled={reviewPage===1||reviewLoading}>이전</Button>
              <Button variant="outline" onClick={()=>setReviewPage(p=>Math.min(reviewTotalPages,p+1))} disabled={reviewPage>=reviewTotalPages||reviewLoading}>다음</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 게시글 상세 다이얼로그 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>게시글 상세</DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">제목</div>
                <div className="text-lg font-semibold">{selectedPost.title}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">작성자</div>
                <div>{selectedPost.authorEmoji} {selectedPost.authorNickname}</div>
              </div>
              {selectedPost.mediaUrl && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">미디어</div>
                  {selectedPost.mediaType === "video" ? (
                    <video src={selectedPost.mediaUrl} controls className="w-full max-h-80 rounded-md object-contain bg-black" />
                  ) : (
                    <img src={selectedPost.mediaUrl} alt={selectedPost.title} className="w-full max-h-80 rounded-md object-contain bg-muted" />
                  )}
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground mb-1">투표</div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600 font-medium">진짜 {selectedPost.trueVotes}표</span>
                  <span className="text-red-500 font-medium">가짜 {selectedPost.falseVotes}표</span>
                  <span className="text-muted-foreground">총 {selectedPost.totalVotes}표</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">본문</div>
                <div className="whitespace-pre-wrap bg-muted p-3 rounded-md">{selectedPost.body}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">태그</div>
                <div className="flex gap-1 flex-wrap">
                  {selectedPost.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">댓글 ({comments.length})</div>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>작성자</TableHead>
                        <TableHead>내용</TableHead>
                        <TableHead>작성일</TableHead>
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comments.map((c: Comment) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.authorEmoji} {c.authorNickname}</TableCell>
                          <TableCell>{c.body}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="destructive" onClick={()=>deleteComment(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {comments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            댓글이 없습니다
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 게시글 수정 다이얼로그 */}
      <Dialog open={!!editing} onOpenChange={(o)=>!o&&setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>게시글 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">제목</label>
              <Input value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">본문</label>
              <Textarea value={editBody} onChange={(e)=>setEditBody(e.target.value)} className="min-h-[200px]" />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">태그 (쉼표로 구분)</label>
              <Input value={editTags} onChange={(e)=>setEditTags(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setEditing(null)}>취소</Button>
              <Button onClick={saveEdit}>저장</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 퀴즈 발행 다이얼로그 */}
      <Dialog open={!!publishTarget} onOpenChange={(o)=>!o&&setPublishTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>퀴즈 문제로 발행</DialogTitle>
          </DialogHeader>
          {publishTarget && (
            <div className="space-y-4">
              {/* 게시글 미리보기 (읽기 전용) */}
              <div className="border rounded-lg overflow-hidden">
                {publishTarget.mediaUrl && (
                  <div className="bg-black flex items-center justify-center max-h-60">
                    {publishTarget.mediaType === "video" ? (
                      <video src={publishTarget.mediaUrl} controls className="max-h-60 w-full object-contain" />
                    ) : (
                      <img src={publishTarget.mediaUrl} alt={publishTarget.title} className="max-h-60 w-full object-contain" />
                    )}
                  </div>
                )}
                <div className="p-3 bg-muted text-sm space-y-1">
                  <div className="font-medium">{publishTarget.title}</div>
                  <div className="text-muted-foreground text-xs">{publishTarget.authorEmoji} {publishTarget.authorNickname}</div>
                  <div className="flex gap-3 pt-1">
                    <span className="text-green-600 font-medium">진짜 {publishTarget.trueVotes}표</span>
                    <span className="text-red-500 font-medium">가짜 {publishTarget.falseVotes}표</span>
                    <span className="text-muted-foreground">총 {publishTarget.totalVotes}표</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">정답 <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <Button
                    variant={publishCorrectAnswer === false ? "default" : "outline"}
                    className="flex-1"
                    onClick={()=>setPublishCorrectAnswer(false)}
                  >
                    가짜 (false)
                  </Button>
                  <Button
                    variant={publishCorrectAnswer === true ? "default" : "outline"}
                    className="flex-1"
                    onClick={()=>setPublishCorrectAnswer(true)}
                  >
                    진짜 (true)
                  </Button>
                </div>
                {publishTarget.isCorrect !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    작성자 설정: {publishTarget.isCorrect ? "진짜" : "가짜"}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">난이도</label>
                <Select value={publishDifficulty} onValueChange={setPublishDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">쉬움</SelectItem>
                    <SelectItem value="medium">보통</SelectItem>
                    <SelectItem value="hard">어려움</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">카테고리</label>
                <Select value={publishCategory} onValueChange={setPublishCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai-generated-detection">AI 생성 이미지 탐지</SelectItem>
                    <SelectItem value="video-synthesis-detection">영상 합성 탐지 (딥페이크)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">해설 <span className="text-red-500">*</span></label>
                <Textarea
                  placeholder="이 미디어가 가짜/진짜인 이유를 설명해주세요..."
                  value={publishExplanation}
                  onChange={(e)=>setPublishExplanation(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={()=>setPublishTarget(null)}>취소</Button>
                <Button onClick={submitPublish} disabled={publishLoading}>
                  {publishLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SendHorizonal className="h-4 w-4 mr-2" />}
                  퀴즈로 발행
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
