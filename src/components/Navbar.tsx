import { Link } from "react-router-dom";
import { Coins, Clover, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-3">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-wide text-white">
        <Clover size={20} className="text-amber-400" />
        Texas Slots
      </Link>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-sm text-amber-400">
              <Coins size={14} />
              {user.balance.toFixed(2)}
            </span>
            <Link to="/panel" className="text-sm text-slate-300 hover:text-white">
              {user.username}
            </Link>
            {user.role === "admin" && (
              <Link
                to="/admin"
                className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <ShieldCheck size={14} />
                Admin
              </Link>
            )}
            <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-300">
              Log out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="rounded-lg bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}
