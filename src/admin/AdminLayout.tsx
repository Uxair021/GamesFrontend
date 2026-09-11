import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, TrendingUp, Users, Zap, Sliders, Radio, ArrowLeft, LogOut, Gauge } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/earnings", label: "Earnings", icon: TrendingUp },
  { to: "/admin/users", label: "Players", icon: Users },
  { to: "/admin/force-outcome", label: "Force Outcome", icon: Zap },
  { to: "/admin/rtp", label: "RTP Control", icon: Sliders },
  { to: "/admin/buffalo-rtp", label: "Buffalo RTP", icon: Gauge },
  { to: "/admin/live-feed", label: "Live Feed", icon: Radio },
];

/** Longest-`to`-first match against the current path, so e.g. "/admin/users/123" still
 * resolves to the "Players" nav entry rather than falling through to nothing. */
function currentSectionLabel(pathname: string): string {
  const match = [...NAV].sort((a, b) => b.to.length - a.to.length).find((item) => pathname.startsWith(item.to));
  return match?.label ?? "Overview";
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col bg-slate-100">
      <div className="flex-shrink-0 border-b border-slate-300 bg-[#D9D9D9] px-6 py-2 text-sm font-medium text-slate-700">
        Admin / {currentSectionLabel(location.pathname)}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 flex-shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-sky-50 py-4">
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    isActive
                      ? "bg-sky-200 font-medium text-sky-800"
                      : "text-slate-600 hover:bg-sky-100 hover:text-slate-800"
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-1 border-t border-slate-200 px-3 pt-4">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-sky-100 hover:text-slate-800"
            >
              <ArrowLeft size={16} />
              Back to lobby
            </Link>
            <div className="px-3 py-1 text-xs text-slate-500">{user?.username}</div>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-sky-100 hover:text-slate-800"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto overflow-x-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
