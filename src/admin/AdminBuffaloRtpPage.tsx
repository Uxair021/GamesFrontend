import { useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  Buffalo777RtpConfig,
  Buffalo777TierKey,
  DEFAULT_BUFFALO_TARGET_RTP_PERCENT,
  computeBuffaloRtpPercent,
  getBuffaloDefaultConfig,
  getBuffaloRtpConfig,
  rescaleBuffaloTiers,
  setBuffaloRtpConfig,
  WinTierName,
} from "../games/Buffalo777/api";

const CELEBRATION_OPTIONS: { value: WinTierName | null; label: string }[] = [
  { value: null, label: "Simple Win (no overlay)" },
  { value: "BIG WIN", label: "Big Win" },
  { value: "MEGA WIN", label: "Mega Win" },
  { value: "JACKPOT", label: "Jackpot" },
];

const TIER_LABELS: Record<Buffalo777TierKey, string> = {
  loss: "Loss",
  ten: "3x 10",
  jack: "3x Jack",
  queen: "3x Queen",
  king: "3x King",
  ace: "3x Ace",
  bull: "3x Bull",
  anyBar: "3x Any Bar",
  singleBar: "3x Single Bar",
  doubleBar: "3x Double Bar",
  tripleBar: "3x Triple Bar",
  moneyBag: "3x Money Bag",
  coin: "3x Gold Coins",
};

/** Same reel-symbol art the game itself uses, for a quick visual reference per row. */
const TIER_IMAGES: Partial<Record<Buffalo777TierKey, string>> = {
  ten: "/symbols/buffalo777/10.png",
  jack: "/symbols/buffalo777/J.png",
  queen: "/symbols/buffalo777/Q.png",
  king: "/symbols/buffalo777/K.png",
  ace: "/symbols/buffalo777/A.png",
  anyBar: "/symbols/buffalo777/ANY.png",
  bull: "/symbols/buffalo777/bull.png",
  singleBar: "/symbols/buffalo777/SingleBar.png",
  doubleBar: "/symbols/buffalo777/DoubleBar.png",
  tripleBar: "/symbols/buffalo777/TripleBar.png",
  moneyBag: "/symbols/buffalo777/MoneyBag.png",
  coin: "/symbols/buffalo777/Coin.png",
};

function inputClass(invalid = false): string {
  return `w-24 rounded-lg border bg-white px-2 py-1.5 text-sm text-slate-800 ${
    invalid ? "border-rose-500" : "border-slate-300"
  }`;
}

/**
 * Buffalo 777 is a fully offline, client-side test game (no backend) — this tab is its own
 * separate RTP control, built the same way AdminRtpPage.tsx works for every other game (a
 * `targetRtpPercent` + a directly-editable `tiers` table, frequencies validated to sum to
 * 100%, computed RTP validated against the target), except this one is saved to localStorage
 * instead of PUT to the server. The saved tiers themselves are the live odds Buffalo777's
 * local RNG (`games/Buffalo777/api.ts`'s `rollTier`) draws from — a change here takes effect
 * on the very next spin.
 */
export function AdminBuffaloRtpPage() {
  const [config, setConfig] = useState<Buffalo777RtpConfig>(() => getBuffaloRtpConfig());
  const [savedOk, setSavedOk] = useState(false);

  const computedRtp = computeBuffaloRtpPercent(config.tiers);
  const frequencySum = config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const frequencyValid = Math.abs(frequencySum - 100) <= 0.01;
  const rtpValid = Math.abs(computedRtp - config.targetRtpPercent) <= 0.5;
  const isValid = frequencyValid && rtpValid;

  function updateTier(key: Buffalo777TierKey, patch: Partial<Buffalo777RtpConfig["tiers"][number]>) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }));
  }

  function updateCelebration(key: Buffalo777TierKey, value: WinTierName | null) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.key === key ? { ...t, celebration: value } : t)),
    }));
  }

  // Same mechanism as AdminRtpPage.tsx's setTargetRtp — rescales every winning tier's
  // frequency proportionally so the config is instantly valid again at the new target; payout
  // multipliers and the freeSpin-less shape here are left untouched.
  function setTargetRtp(newTarget: number) {
    setSavedOk(false);
    const oldRtp = computeBuffaloRtpPercent(config.tiers);
    if (!Number.isFinite(oldRtp) || oldRtp <= 0) {
      setConfig((prev) => ({ ...prev, targetRtpPercent: newTarget }));
      return;
    }
    const tiers = rescaleBuffaloTiers(config.tiers, newTarget / oldRtp);
    setConfig({ targetRtpPercent: newTarget, tiers });
  }

  function save() {
    if (!isValid) return;
    setBuffaloRtpConfig(config);
    setSavedOk(true);
    window.setTimeout(() => setSavedOk(false), 2000);
  }

  function resetToDefault() {
    setSavedOk(false);
    setConfig(getBuffaloDefaultConfig());
  }

  return (
    <div>
      <AdminPageHeader
        title="Buffalo RTP"
        description="Buffalo 777 is a fully offline, client-side test game — this control lives entirely in the browser (no backend involved) and takes effect on the very next spin."
      />

      <div className="max-w-3xl space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-800">Target RTP %</label>
            <input
              type="number"
              step="0.01"
              value={config.targetRtpPercent}
              onChange={(e) => setTargetRtp(Number(e.target.value))}
              className={inputClass(!rtpValid)}
            />
            <div className={`text-sm font-medium ${rtpValid ? "text-emerald-600" : "text-rose-600"}`}>
              Effective RTP: {computedRtp.toFixed(2)}%
              {rtpValid ? " ✓" : ""}
            </div>
          </div>

          {!frequencyValid && (
            <p className="mt-3 text-sm text-rose-600">
              Frequencies must sum to 100% — currently {frequencySum.toFixed(2)}%.
            </p>
          )}
          {frequencyValid && !rtpValid && (
            <p className="mt-3 text-sm text-rose-600">
              Computed RTP ({computedRtp.toFixed(2)}%) doesn't match the target ({config.targetRtpPercent.toFixed(2)}%,
              ±0.5%). Adjust frequencies or payout multipliers below.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-sky-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Frequency %</th>
                <th className="px-3 py-2">Payout (x bet)</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {config.tiers.map((tier) => (
                <tr key={tier.key} className="border-t border-slate-200 even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      {TIER_IMAGES[tier.key] && (
                        <img src={TIER_IMAGES[tier.key]} alt="" className="h-8 w-8 rounded object-contain bg-slate-100" />
                      )}
                      {TIER_LABELS[tier.key]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={tier.frequencyPercent}
                      onChange={(e) => updateTier(tier.key, { frequencyPercent: Number(e.target.value) })}
                      className={inputClass(!frequencyValid)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {tier.payoutMultiplier === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={tier.payoutMultiplier}
                        onChange={(e) => updateTier(tier.key, { payoutMultiplier: Number(e.target.value) })}
                        className={inputClass()}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Which celebration each win shows (cosmetic only — payout comes from the table above)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {config.tiers
              .filter((t) => t.payoutMultiplier !== null)
              .map((tier) => (
                <div key={tier.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    {TIER_IMAGES[tier.key] && (
                      <img src={TIER_IMAGES[tier.key]} alt="" className="h-6 w-6 rounded object-contain bg-slate-100" />
                    )}
                    {TIER_LABELS[tier.key]}
                  </span>
                  <select
                    value={tier.celebration ?? ""}
                    onChange={(e) => updateCelebration(tier.key, (e.target.value || null) as WinTierName | null)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                  >
                    {CELEBRATION_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value ?? ""}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={!isValid}
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={resetToDefault}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Reset to default ({DEFAULT_BUFFALO_TARGET_RTP_PERCENT}%)
          </button>
          {savedOk && <div className="text-sm font-medium text-emerald-600">Saved — takes effect on the next spin.</div>}
        </div>
      </div>
    </div>
  );
}
