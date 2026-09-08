import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatTile } from "./StatTile";
import { adminApi, AdminUser, BalanceAdjustmentEntry, SpinEntry, ForcedOutcomeEntry } from "./adminApi";
import { formatBalance, formatRelativeTime } from "./format";
import { Coins, Wifi, WifiOff } from "lucide-react";

export function AdminPlayerDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<BalanceAdjustmentEntry[]>([]);
  const [spins, setSpins] = useState<SpinEntry[]>([]);
  const [pending, setPending] = useState<ForcedOutcomeEntry[]>([]);
  const [newBalance, setNewBalance] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    adminApi.getUser(id).then((data) => {
      setUser(data.user);
      setBalanceHistory(data.balanceHistory);
      setSpins(data.spins);
      setPending(data.pendingForcedOutcomes);
    });
  };

  useEffect(load, [id]);

  const saveBalance = async () => {
    if (!id) return;
    const value = Number(newBalance);
    if (!Number.isFinite(value) || value < 0) return;
    setSaving(true);
    try {
      const updated = await adminApi.setBalance(id, value);
      setUser(updated);
      setNewBalance("");
      load();
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="text-slate-500">Loading...</div>;

  return (
    <div>
      <AdminPageHeader title={user.username} description={user.fullName ?? undefined} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Balance" value={formatBalance(user.balance)} icon={Coins} accent="amber" />
        <StatTile
          label="Status"
          value={user.online ? "Online" : "Offline"}
          icon={user.online ? Wifi : WifiOff}
          accent={user.online ? "emerald" : "indigo"}
        />
        <StatTile label="Pending forced outcomes" value={String(pending.length)} icon={Coins} accent="indigo" />
      </div>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Set balance</h2>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={user.balance.toFixed(2)}
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button
            onClick={saveBalance}
            disabled={saving || !newBalance}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Set"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Balance history</h2>
          <div className="divide-y divide-slate-800">
            {balanceHistory.map((b) => (
              <div key={b._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className={b.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {b.delta >= 0 ? "+" : ""}
                  {formatBalance(b.delta)}
                </span>
                <span className="text-slate-500">{formatBalance(b.newBalance)} after</span>
                <span className="text-xs text-slate-600">{formatRelativeTime(b.createdAt)}</span>
              </div>
            ))}
            {balanceHistory.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">No balance changes yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Recent spins</h2>
          <div className="divide-y divide-slate-800">
            {spins.map((s) => (
              <div key={s._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-400">bet {formatBalance(s.betAmount)}</span>
                <span className={s.winAmount > 0 ? "text-emerald-400" : "text-slate-500"}>
                  {s.winAmount > 0 ? `+${formatBalance(s.winAmount)}` : "-"}
                </span>
                {s.tier && <span className="text-xs text-amber-400">{s.tier}</span>}
                {s.forced && <span className="text-xs text-indigo-400">forced</span>}
                <span className="text-xs text-slate-600">{formatRelativeTime(s.createdAt)}</span>
              </div>
            ))}
            {spins.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-500">No spins yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
