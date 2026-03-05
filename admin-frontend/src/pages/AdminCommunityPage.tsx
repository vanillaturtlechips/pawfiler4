import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";

type Post = {
  id: string; title: string; body: string; authorNickname: string; authorEmoji: string;
  likes: number; comments: number; createdAt: string; tags: string[];
};
type Feed = { posts: Post[]; totalCount: number; page: number; };

const BASE = (import.meta.env.VITE_COMMUNITY_API_URL || "http://localhost:50053");

export default function AdminCommunityPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
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
      const url = `${BASE}/community.CommunityService/GetFeed?page=${page}&pageSize=${pageSize}` +
        (search ? `&search=${encodeURIComponent(search)}&searchType=${searchType}` : "");
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setFeed(await res.json());
    } catch (e:any) { toast.error(e.message ?? "피드 로드 실패"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFeed(); }, [page, pageSize, search, searchType]);

  const openEdit = (p: Post) => {
    setEditing(p); setEditTitle(p.title); setEditBody(p.body); setEditTags(p.tags.join(", "));
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const tags = editTags.split(",").map(t=>t.trim()).filter(Boolean);
      const res = await fetch(`${BASE}/community.CommunityService/UpdatePost`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: editing.id, title: editTitle, body: editBody, tags }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("수정 완료");
      setEditing(null); fetchFeed();
    } catch (e:any) { toast.error(e.message ?? "수정 실패"); }
  };

  const deletePost = async (postId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE}/community.CommunityService/DeletePost`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("삭제 완료"); fetchFeed();
    } catch (e:any) { toast.error(e.message ?? "삭제 실패"); }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(feed.totalCount / pageSize)), [feed.totalCount, pageSize]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">커뮤니티 관리</h1>

      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="검색어" value={search} onChange={(e)=>setSearch(e.target.value)} className="w-64" />
        <Select value={searchType} onValueChange={(v)=>setSearchType(v as any)}>
          <option value="title">제목</option><option value="body">본문</option><option value="all">전체</option>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v)=>setPageSize(Number(v))}>
          <option value="10">10개</option><option value="20">20개</option><option value="50">50개</option>
        </Select>
        <Button onClick={()=>{ setPage(1); fetchFeed(); }} disabled={loading}>검색</Button>
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="p-2 text-left">제목</th><th className="p-2 text-left">작성자</th><th className="p-2 text-left">좋아요</th><th className="p-2 text-left">댓글</th><th className="p-2 text-left">태그</th><th className="p-2 text-left">작성일</th><th className="p-2 text-left">액션</th></tr>
          </thead>
          <tbody>
            {feed.posts.map(p=>(
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.title}</td>
                <td className="p-2">{p.authorNickname} {p.authorEmoji}</td>
                <td className="p-2">{p.likes}</td>
                <td className="p-2">{p.comments}</td>
                <td className="p-2">{p.tags.join(", ")}</td>
                <td className="p-2">{p.createdAt}</td>
                <td className="p-2 space-x-2">
                  <Button variant="secondary" onClick={()=>openEdit(p)}>수정</Button>
                  <Button variant="destructive" onClick={()=>deletePost(p.id)}>삭제</Button>
                </td>
              </tr>
            ))}
            {feed.posts.length === 0 && (<tr><td className="p-3 text-center" colSpan={7}>결과가 없습니다</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1||loading}>이전</Button>
        <span>{page} / {totalPages}</span>
        <Button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages||loading}>다음</Button>
      </div>

      <Dialog open={!!editing} onOpenChange={(o)=>!o&&setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>게시글 수정</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} placeholder="제목" />
            <textarea value={editBody} onChange={(e)=>setEditBody(e.target.value)} placeholder="본문" className="w-full border rounded-md p-2 h-40" />
            <Input value={editTags} onChange={(e)=>setEditTags(e.target.value)} placeholder="태그 (쉼표로 구분)" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={()=>setEditing(null)}>취소</Button>
              <Button onClick={saveEdit}>저장</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}