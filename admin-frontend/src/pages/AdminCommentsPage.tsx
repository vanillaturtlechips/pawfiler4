import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { toast } from "sonner";

type Post = {
  id: string;
  title: string;
};

type Comment = {
  id: string;
  postId: string;
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  body: string;
  createdAt: string;
};

type Feed = {
  posts: {
    id: string;
    title: string;
  }[];
  totalCount: number;
  page: number;
};

const BASE = (import.meta.env.VITE_ADMIN_API_URL || "http://localhost:8082");

export default function AdminCommentsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState("");
  const [selectedPostId, setSelectedPostId] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [authorFilter, setAuthorFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const spamKeywords = ["spam", "광고", "금칙어"];

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${BASE}/admin/community/posts?page=1&page_size=50`);
      if (!res.ok) throw new Error(await res.text());
      const data: Feed = await res.json();
      const mapped = data.posts.map(p => ({ id: p.id, title: p.title }));
      setPosts(mapped);
    } catch (e: any) {
      toast.error(e.message ?? "게시글 목록 로드 실패");
    }
  };

  const fetchComments = async (pid: string) => {
    if (!pid) {
      toast.error("게시글을 선택하거나 ID를 입력하세요");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/community/posts/${pid}/comments`);
      if (!res.ok) throw new Error(await res.text());
      const data: { comments: Comment[] } = await res.json();
      setComments(data.comments || []);
    } catch (e: any) {
      toast.error(e.message ?? "댓글 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE}/admin/community/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("삭제되었습니다");
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e: any) {
      toast.error(e.message ?? "삭제 실패");
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const filtered = useMemo(() => {
    return comments.filter(c => {
      const authorOk = authorFilter ? c.authorNickname.toLowerCase().includes(authorFilter.toLowerCase()) : true;
      const keywordOk = keywordFilter ? c.body.toLowerCase().includes(keywordFilter.toLowerCase()) : true;
      const dateOk = (() => {
        if (!startDate && !endDate) return true;
        const t = new Date(c.createdAt).getTime();
        const s = startDate ? new Date(startDate).getTime() : -Infinity;
        const e = endDate ? new Date(endDate).getTime() : Infinity;
        return t >= s && t <= e;
      })();
      return authorOk && keywordOk && dateOk;
    });
  }, [comments, authorFilter, keywordFilter, startDate, endDate]);

  const onSelectPost = (v: string) => {
    setSelectedPostId(v);
    setPostId(v);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">댓글 관리</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedPostId} onValueChange={onSelectPost}>
          <option value="">게시글 선택</option>
          {posts.map(p => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Input placeholder="게시글 ID 직접 입력" value={postId} onChange={e => setPostId(e.target.value)} className="w-64" />
        <Button onClick={() => fetchComments(postId)} disabled={loading}>
          댓글 조회
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="작성자 닉네임 필터" value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} className="w-48" />
        <Input placeholder="본문 키워드 필터" value={keywordFilter} onChange={e => setKeywordFilter(e.target.value)} className="w-64" />
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-md p-2" />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-md p-2" />
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">작성자</th>
              <th className="p-2 text-left">내용</th>
              <th className="p-2 text-left">작성일</th>
              <th className="p-2 text-left">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const isSpam = spamKeywords.some(k => c.body.toLowerCase().includes(k.toLowerCase()));
              return (
                <tr key={c.id} className={`border-t ${isSpam ? "bg-red-50" : ""}`}>
                  <td className="p-2">{c.authorNickname} {c.authorEmoji}</td>
                  <td className="p-2">{c.body}</td>
                  <td className="p-2">{c.createdAt}</td>
                  <td className="p-2 space-x-2">
                    <Button variant="destructive" onClick={() => deleteComment(c.id)}>삭제</Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td className="p-3 text-center" colSpan={4}>댓글이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
