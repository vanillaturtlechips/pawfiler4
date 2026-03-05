import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

const Card = ({ title, desc, to }: { title: string; desc: string; to: string }) => (
  <div className="border rounded-xl p-6 flex flex-col gap-3">
    <div className="text-xl font-bold">{title}</div>
    <div className="text-sm text-muted-foreground">{desc}</div>
    <div>
      <Link to={to}><Button>열기</Button></Link>
    </div>
  </div>
);

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">어드민 메인</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="퀴즈 관리" desc="문제 등록/수정, 통계 확인" to="/admin/quiz" />
        <Card title="커뮤니티 관리" desc="게시글 검색/수정/삭제" to="/admin/community" />
      </div>
    </div>
  );
}