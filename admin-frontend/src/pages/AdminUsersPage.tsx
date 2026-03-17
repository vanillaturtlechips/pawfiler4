import { useEffect, useMemo, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type User = {
  id: string; email: string; nickname: string; avatarEmoji: string;
  subscriptionType: string; coins: number; level: number; levelTitle: string;
  xp: number; createdAt: string;
};

const BASE = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:8082";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search) params.set("search", search);
      const res = await fetch(`${BASE}/admin/users?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data.users || []);
      setTotalCount(data.totalCount || 0);
    } catch (e: any) { toast.error(e.message ?? "로드 실패"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [page, pageSize, search]);

  const deleteUser = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE}/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("삭제 완료");
      fetchUsers();
    } catch (e: any) { toast.error(e.message ?? "삭제 실패"); }
  };

  const updateSubscription = async (id: string, subType: string) => {
    try {
      const res = await fetch(`${BASE}/admin/users/${id}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionType: subType }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("구독 변경 완료");
      fetchUsers();
    } catch (e: any) { toast.error(e.message ?? "변경 실패"); }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("ko-KR"); } catch { return d; }
  };

  const subBadge = (type: string) => {
    if (type === "premium") return <Badge className="bg-yellow-500 text-white">프리미엄</Badge>;
    return <Badge variant="secondary">무료</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {totalCount}명</span>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="이메일 또는 닉네임 검색" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10개</SelectItem>
            <SelectItem value="20">20개</SelectItem>
            <SelectItem value="50">50개</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회원</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>구독</TableHead>
                <TableHead className="text-center">레벨</TableHead>
                <TableHead className="text-center">코인</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{u.avatarEmoji}</span>
                      <div>
                        <div className="font-medium text-sm">{u.nickname}</div>
                        <div className="text-xs text-muted-foreground">{u.levelTitle}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.subscriptionType} onValueChange={v => updateSubscription(u.id, v)}>
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue>{subBadge(u.subscriptionType)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">무료</SelectItem>
                        <SelectItem value="premium">프리미엄</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center text-sm">{u.level}</TableCell>
                  <TableCell className="text-center text-sm">{u.coins.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => deleteUser(u.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">검색 결과가 없습니다</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{page} / {totalPages} 페이지</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>이전</Button>
          <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>다음</Button>
        </div>
      </div>
    </div>
  );
}
