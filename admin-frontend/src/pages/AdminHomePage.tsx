import { Link } from "react-router-dom";
import { BookOpen, Users, ShoppingBag } from "lucide-react";

const cards = [
  { title: "퀴즈 관리", desc: "문제 등록/수정, 통계 확인", to: "/admin/quiz", icon: BookOpen },
  { title: "커뮤니티", desc: "게시글 검색/수정/삭제", to: "/admin/community", icon: Users },
  { title: "상점 관리", desc: "아이템 등록/수정/삭제", to: "/admin/shop", icon: ShoppingBag },
];

export default function AdminHomePage() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(({ title, desc, to, icon: Icon }) => (
        <Link key={to} to={to} className="border rounded-xl p-6 bg-white hover:shadow-md transition-shadow flex items-start gap-4">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Icon className="h-5 w-5 text-gray-700" />
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground mt-1">{desc}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}