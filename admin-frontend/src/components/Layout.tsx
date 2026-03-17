import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, BookOpen, Users, ShoppingBag, UserCircle, Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/admin", label: "대시보드", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "회원 관리", icon: UserCircle },
  { to: "/admin/quiz", label: "퀴즈 관리", icon: BookOpen },
  { to: "/admin/community", label: "커뮤니티", icon: Users },
  { to: "/admin/shop", label: "상점 관리", icon: ShoppingBag },
];

const pageTitles: Record<string, string> = {
  "/admin": "대시보드",
  "/admin/users": "회원 관리",
  "/admin/quiz": "퀴즈 관리",
  "/admin/community": "커뮤니티 관리",
  "/admin/shop": "상점 관리",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "어드민";

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-white border-r transition-all duration-200 ${collapsed ? "w-16" : "w-56"}`}>
        <div className="flex items-center justify-between px-4 h-14 border-b">
          {!collapsed && <span className="font-bold text-lg">🐾 Pawfiler</span>}
          <button onClick={() => setCollapsed(c => !c)} className="p-1 rounded hover:bg-gray-100">
            {collapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-14 bg-white border-b flex items-center px-6">
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}