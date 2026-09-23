import { useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  SizzlingRtpConfig,
  SizzlingTierRow,
  SizzlingSymbol,
  getSizzlingDefaultConfig,
  getSizzlingRtpConfig,
  setSizzlingRtpConfig,
} from "../games/SizzlingSevens/api";
import { PaytableConfig, TierKey, computeSizzlingSevensStats, solveSizzlingSevensRtpPercent } from "./adminApi";

const TIER_LABELS: Record<SizzlingSymbol, string> = {
  RED_7: "3x Red 7",
  BLUE_7: "3x Blue 7",
  TRIPLE_BAR: "3x Triple Bar",
  DOUBLE_BAR: "3x Double Bar",
  BAR: "3x Bar",
  BONUS: "3x Bonus (scatter)",
  WILD_2X: "3x Wild (pure, see below)",
};

/** Same reel-symbol art the game itself uses, for a quick visual reference per row. */
const TIER_IMAGES: Record<SizzlingSymbol, string> = {
  RED_7: "/symbols/sizzling7s/red-7.png",
  BLUE_7: "/symbols/sizzling7s/blue-7.png",
  BAR: "/symbols/sizzling7s/bar.png",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.png",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.png",
  WILD_2X: "/symbols/sizzling7s/2xWild.png",
  BONUS: "/symbols/sizzling7s/bonus.png",
};

function inputClass(invalid = false): string {
  return `w-24 rounded-lg border bg-white px-2 py-1.5 text-sm text-slate-800 ${
    invalid ? "border-rose-500" : "border-slate-300"
  }`;
}

/** Builds the generic PaytableConfig shape adminApi.ts's Monte Carlo simulator expects, from
 * our local SizzlingRtpConfig — only the fields the sizzling-specific simulator actually reads
 * (tiers, targetRtpPercent) are populated; everything else is null/unused for this game. */
function toSimConfig(config: SizzlingRtpConfig): PaytableConfig {
  return {
    gameId: "sizzling-7s",
    targetRtpPercent: config.targetRtpPercent,
    targetLossPercent: null,
    freeSpinsGranted: null,
    tiers: config.tiers.map((t) => ({
      key: t.key as TierKey,
      frequencyPercent: t.frequencyPercent,
      payoutMultiplier: t.payoutMultiplier,
      freeSpinPayoutMultiplier: null,
    })),
    ruleTierMap: null,
    celebrationMap: null,
    amountThresholds: null,
    specialReelTiers: null,
    respinRange: null,
    reelStateConfig: null,
    wildRules: null,
    symbolPayouts: null,
    scatterRules: null,
  };
}

/**
 * Sizzling 7s is a fully offline, client-side test game (no backend) — this tab is its own
 * separate RTP control, saved to localStorage instead of PUT to the server (mirrors
 * AdminBuffaloRtpPage.tsx). Unlike Buffalo777's simple per-tier table, `tiers` here is a 7-row
 * *reel-strip weight* table with no dedicated "loss" row (every row is a real, always-drawn
 * symbol), so RTP/loss% can't be read off with a plain formula — this page reuses the same
 * seeded Monte Carlo simulator (computeSizzlingSevensStats/solveSizzlingSevensRtpPercent) the
 * old shared AdminRtpPage.tsx used for this game, just fed from localStorage instead of the
 * (now-deleted) backend paytable service.
 */
export function AdminSizzlingRtpPage() {
  const [config, setConfig] = useState<SizzlingRtpConfig>(() => getSizzlingRtpConfig());
  const [savedOk, setSavedOk] = useState(false);
  const [solving, setSolving] = useState(false);

  const stats = computeSizzlingSevensStats(toSimConfig(config));
  const frequencySum = config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const frequencyValid = Math.abs(frequencySum - 100) <= 0.01;
  const rtpValid = Math.abs(stats.rtpPercent - config.targetRtpPercent) <= 0.5;
  const isValid = frequencyValid && rtpValid && !solving;

  function updateTier(key: SizzlingSymbol, patch: Partial<SizzlingTierRow>) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }));
  }

  function updateThreshold(patch: Partial<SizzlingRtpConfig["amountThresholds"]>) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, amountThresholds: { ...prev.amountThresholds, ...patch } }));
  }

  // Sizzling 7s has no dedicated "loss" tier for a plain proportional rescale to absorb slack
  // into (all 7 rows are real, always-drawn symbols) — reshape the weight *distribution*
  // instead, via the same gamma search the old shared admin page used, and never touch payout
  // multipliers (those are the admin's own fixed numbers). Runs a couple dozen Monte Carlo
  // passes, so defer it a tick behind a "Solving..." state instead of freezing the page.
  function setTargetRtp(newTarget: number) {
    setSavedOk(false);
    setSolving(true);
    window.setTimeout(() => {
      const solved = solveSizzlingSevensRtpPercent(toSimConfig(config), newTarget);
      const tiers: SizzlingTierRow[] = solved.map((t) => ({
        key: t.key as SizzlingSymbol,
        frequencyPercent: t.frequencyPercent,
        payoutMultiplier: t.payoutMultiplier ?? 0,
      }));
      setConfig((prev) => ({ ...prev, targetRtpPercent: newTarget, tiers }));
      setSolving(false);
    }, 0);
  }

  function save() {
    if (!isValid) return;
    setSizzlingRtpConfig(config);
    setSavedOk(true);
    window.setTimeout(() => setSavedOk(false), 2000);
  }

  function resetToDefault() {
    setSavedOk(false);
    setConfig(getSizzlingDefaultConfig());
  }

  return (
    <div>
      <AdminPageHeader
        title="Sizzling RTP"
        description="Sizzling 7s is a fully offline, client-side test game — this control lives entirely in the browser (no backend involved) and takes effect on the very next spin."
      />

      <div className="max-w-3xl space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-800">Target RTP %</label>
            <input
              type="number"
              step="0.1"
              value={config.targetRtpPercent}
              onChange={(e) => setTargetRtp(Number(e.target.value))}
              disabled={solving}
              className={inputClass(!rtpValid)}
            />
            <div className={`text-sm font-medium ${rtpValid ? "text-emerald-600" : "text-rose-600"}`}>
              {solving ? "Solving…" : `Effective RTP: ${stats.rtpPercent.toFixed(2)}%${rtpValid ? " ✓" : ""}`}
            </div>
            <div className="text-sm text-slate-500">Loss frequency: {stats.lossPercent.toFixed(2)}%</div>
          </div>

          {!frequencyValid && (
            <p className="mt-3 text-sm text-rose-600">
              Frequencies must sum to 100% — currently {frequencySum.toFixed(2)}%.
            </p>
          )}
          {frequencyValid && !rtpValid && (
            <p className="mt-3 text-sm text-rose-600">
              Computed RTP ({stats.rtpPercent.toFixed(2)}%) doesn't match the target ({config.targetRtpPercent.toFixed(2)}%,
              ±0.5%). Adjust frequencies or payout multipliers below, or re-enter the target to auto-solve again.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-sky-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Frequency %</th>
                <th className="px-3 py-2">Payout (x line bet)</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {config.tiers.map((tier) => (
                <tr key={tier.key} className="border-t border-slate-200 even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <img src={TIER_IMAGES[tier.key]} alt="" className="h-8 w-8 rounded object-contain bg-slate-100" />
                      {TIER_LABELS[tier.key]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={tier.frequencyPercent}
                      onChange={(e) => updateTier(tier.key, { frequencyPercent: Number(e.target.value) })}
                      className={inputClass(!frequencyValid)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={tier.payoutMultiplier}
                      onChange={(e) => updateTier(tier.key, { payoutMultiplier: Number(e.target.value) })}
                      className={inputClass()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-800">2X Wild (pure, no matching symbol)</div>
          <p className="mt-1 text-xs text-slate-500">
            1 Wild and 2 Wilds pay fixed consolation amounts (x0.1163 / x0.4653, not editable here); the WILD_2X row
            above sets only the 3-Wild payout.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-800">Celebration thresholds (multiple of total bet)</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Big Win at
              <input
                type="number"
                step="0.1"
                value={config.amountThresholds.bigWinMin}
                onChange={(e) => updateThreshold({ bigWinMin: Number(e.target.value) })}
                className={inputClass()}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Mega Win at
              <input
                type="number"
                step="0.1"
                value={config.amountThresholds.megaWinMin}
                onChange={(e) => updateThreshold({ megaWinMin: Number(e.target.value) })}
                className={inputClass()}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Jackpot at
              <input
                type="number"
                step="0.1"
                value={config.amountThresholds.jackpotMin}
                onChange={(e) => updateThreshold({ jackpotMin: Number(e.target.value) })}
                className={inputClass()}
              />
            </label>
          </div>
        </div>

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
            Reset to default (85% RTP)
          </button>
          {savedOk && <div className="text-sm font-medium text-emerald-600">Saved — takes effect on the next spin.</div>}
        </div>
      </div>
    </div>
  );
}
