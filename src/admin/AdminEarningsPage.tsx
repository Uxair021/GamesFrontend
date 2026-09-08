import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Coins, Percent, Hash } from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatTile } from "./StatTile";
import { adminApi, EarningsResponse, EarningsRange } from "./adminApi";
import { formatBalance, formatCount } from "./format";
import { gameRegistry } from "../games/registry";

const RANGES: { value: EarningsRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function AdminEarningsPage() {
  const [range, setRange] = useState<EarningsRange>("today");
  const [gameId, setGameId] = useState<string>("");
  const [data, setData] = useState<EarningsResponse | null>(null);

  useEffect(() => {
    adminApi.getEarnings(range, gameId || undefined).then(setData);
  }, [range, gameId]);

  const chartData =
    data?.series.map((point) => ({
      ...point,
      label: new Date(point.bucket).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: range === "today" ? "numeric" : undefined,
      }),
    })) ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Earnings"
        description="Wagered, paid out, and net position over time."
        actions={
          <div className="flex gap-2">
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300"
            >
              <option value="">All games</option>
              {gameRegistry.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    range === r.value ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Wagered" value={formatBalance(data.summary.wagered)} icon={Coins} accent="indigo" />
          <StatTile label="Paid out" value={formatBalance(data.summary.paidOut)} icon={TrendingUp} accent="amber" />
          <StatTile
            label="Net"
            value={formatBalance(data.summary.net)}
            icon={Coins}
            accent={data.summary.net >= 0 ? "emerald" : "rose"}
          />
          <StatTile label="Hold %" value={`${data.summary.holdPercent.toFixed(1)}%`} icon={Percent} accent="indigo" />
        </div>
      )}

      {data && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile label="Spin count" value={formatCount(data.summary.spinCount)} icon={Hash} accent="indigo" />
          <StatTile label="Actual RTP" value={`${data.summary.rtpActual.toFixed(1)}%`} icon={Percent} accent="amber" />
        </div>
      )}

      <div className="mt-6 h-80 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
              labelStyle={{ color: "#cbd5e1" }}
            />
            <Line type="monotone" dataKey="wagered" stroke="#818cf8" strokeWidth={2} dot={false} name="Wagered" />
            <Line type="monotone" dataKey="totalWin" stroke="#fbbf24" strokeWidth={2} dot={false} name="Paid out" />
            <Line type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} dot={false} name="Net" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
