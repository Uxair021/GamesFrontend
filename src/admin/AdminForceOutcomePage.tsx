import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import { adminApi, AdminUser, ForcedOutcomeEntry } from "./adminApi";
import { formatRelativeTime } from "./format";
import { gameRegistry } from "../games/registry";

const TIERS = ["BIG WIN", "MEGA WIN", "JACKPOT"] as const;

export function AdminForceOutcomePage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userId, setUserId] = useState("");
  const [gameId, setGameId] = useState(gameRegistry[0]?.slug ?? "");
  const [targetTier, setTargetTier] = useState<(typeof TIERS)[number]>("BIG WIN");
  const [directives, setDirectives] = useState<ForcedOutcomeEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadDirectives = () => {
    adminApi.listForcedOutcomes().then(setDirectives);
  };

  useEffect(() => {
    adminApi.listUsers("active").then(setUsers);
    loadDirectives();
  }, []);

  const usernameFor = (id: string) => users.find((u) => u._id === id)?.username ?? id;
  const gameNameFor = (id: string) => gameRegistry.find((g) => g.slug === id)?.name ?? id;

  const submit = async () => {
    if (!userId || !gameId) return;
    setSubmitting(true);
    try {
      await adminApi.createForcedOutcome(userId, gameId, targetTier);
      loadDirectives();
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    await adminApi.cancelForcedOutcome(id);
    loadDirectives();
  };

  return (
    <div>
      <AdminPageHeader
        title="Force Outcome"
        description="Queue a directive that makes a player's next spin, on a specific game, land on a specific win tier."
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-5">
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select player...</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {u.username}
              {u.fullName ? ` (${u.fullName})` : ""}
            </option>
          ))}
        </select>
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          {gameRegistry.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={targetTier}
          onChange={(e) => setTargetTier(e.target.value as (typeof TIERS)[number])}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!userId || !gameId || submitting}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50 sm:col-span-2"
        >
          <Zap size={16} />
          {submitting ? "Queuing..." : "Queue directive"}
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Game</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Queued</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {directives.map((d) => (
              <tr key={d._id} className="border-t border-slate-800 hover:bg-slate-900/80">
                <td className="px-3 py-2 text-slate-300">{usernameFor(d.userId)}</td>
                <td className="px-3 py-2 text-slate-400">{gameNameFor(d.gameId)}</td>
                <td className="px-3 py-2 text-amber-400">{d.targetTier}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      d.status === "pending"
                        ? "bg-indigo-500/10 text-indigo-400"
                        : d.status === "consumed"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-700/50 text-slate-400"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatRelativeTime(d.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  {d.status === "pending" && (
                    <button onClick={() => cancel(d._id)} className="text-xs text-rose-400 hover:text-rose-300">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {directives.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No directives yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
