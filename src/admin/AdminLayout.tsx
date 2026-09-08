import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, TrendingUp, Users, Zap, Sliders, Radio, ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/earnings", label: "Earnings", icon: TrendingUp },
  { to: "/admin/users", label: "Players", icon: Users },
  { to: "/admin/force-outcome", label: "Force Outcome", icon: Zap },
  { to: "/admin/rtp", label: "RTP Control", icon: Sliders },
  { to: "/admin/live-feed", label: "Live Feed", icon: Radio },
];

export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-[calc(100vh-56px)] bg-slate-950">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 py-4">
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-1 border-t border-slate-800 px-3 pt-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft size={16} />
            Back to lobby
          </Link>
          <div className="px-3 py-1 text-xs text-slate-500">{user?.username}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
