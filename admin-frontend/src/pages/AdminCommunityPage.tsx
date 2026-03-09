import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Loader2, Search, Eye, Edit, Trash2, Home } from "lucide-react";
import { toast } from "sonner";

type Post = {
  id: string; title: string; body: string; authorNickname: string; authorEmoji: string;
  likes: number; comments: number; createdAt: string; tags: string[];
};
type Comment = {
  id: string; postId: string; userId: string; authorNickname: string; authorEmoji: string; body: string; createdAt: string;
};
type Feed = { posts: Post[]; totalCount: number; page: number; };

const BASE = (import.meta.env.VITE_ADMIN_API_URL || "http://localhost:8082");

export default function AdminCommunityPage() {
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

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (searchInput) { params.set("search", searchInput); params.set("search_type", searchType); }
      const res = await fetch(`${BASE}/admin/community/posts?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setFeed({
        posts: data.posts || [],
        totalCount: data.totalCount || 0,
        page: data.page || 1
      });
    } catch (e:any) { toast.error(e.message ?? "피드 로드 실패"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchFeed(), 300);
    return () => clearTimeout(timer);
  }, [page, pageSize, searchInput, searchType]);

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(feed.totalCount / pageSize)), [feed.totalCount, pageSize]);

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
        <div className="flex items-center gap-4">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              <Home className="h-4 w-4 mr-2" />
              메인으로
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">커뮤니티 관리</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          총 {feed.totalCount}개 게시글
        </div>
      </div>

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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
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
                <TableHead className="w-[40%]">제목</TableHead>
                <TableHead>작성자</TableHead>
                <TableHead className="text-center">좋아요</TableHead>
                <TableHead className="text-center">댓글</TableHead>
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
                  <TableCell className="text-center">{p.likes}</TableCell>
                  <TableCell className="text-center">{p.comments}</TableCell>
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
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={()=>{ setSelectedPost(p); fetchComments(p.id); setDetailOpen(true); }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={()=>openEdit(p)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={()=>deletePost(p.id)}
                      >
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
        <div className="text-sm text-muted-foreground">
          {page} / {totalPages} 페이지
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={()=>setPage(p=>Math.max(1,p-1))} 
            disabled={page===1||loading}
          >
            이전
          </Button>
          <Button 
            variant="outline"
            onClick={()=>setPage(p=>Math.min(totalPages,p+1))} 
            disabled={page>=totalPages||loading}
          >
            다음
          </Button>
        </div>
      </div>

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
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={()=>deleteComment(c.id)}
                            >
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
              <Textarea 
                value={editBody} 
                onChange={(e)=>setEditBody(e.target.value)} 
                className="min-h-[200px]"
              />
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
    </div>
  );
}
