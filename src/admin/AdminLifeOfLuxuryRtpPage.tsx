import { useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  LifeOfLuxuryRtpConfig,
  LifeOfLuxurySymbol,
  DEFAULT_LOL_TARGET_RTP_PERCENT,
  computeLifeOfLuxuryRtpPercent,
  getLifeOfLuxuryDefaultConfig,
  getLifeOfLuxuryRtpConfig,
  setLifeOfLuxuryRtpConfig,
} from "../games/LifeOfLuxury/api";

type RegularSymbol = Exclude<LifeOfLuxurySymbol, "COIN" | "WILD">;

const TIER_LABELS: Record<LifeOfLuxurySymbol, string> = {
  AEROPLANE: "Aeroplane",
  BOAT: "Boat",
  CAR: "Car",
  RING: "Ring",
  MONEY: "Money",
  WATCH: "Watch",
  GOLD_BAR: "Gold Bar",
  SILVER_BAR: "Silver Bar",
  BRONZE_BAR: "Bronze Bar",
  WILD: "WILD (substitutes on reels 2-4 only, no payout of its own)",
  COIN: "Coin (independent scatter chance, below)",
};

/** Same reel-symbol art the game itself uses. */
const TIER_IMAGES: Record<LifeOfLuxurySymbol, string> = {
  AEROPLANE: "/symbols/lifeOfLuxury/aeroplane.png",
  BOAT: "/symbols/lifeOfLuxury/boat.png",
  CAR: "/symbols/lifeOfLuxury/car.png",
  RING: "/symbols/lifeOfLuxury/ring.png",
  MONEY: "/symbols/lifeOfLuxury/money.png",
  WATCH: "/symbols/lifeOfLuxury/watch.png",
  GOLD_BAR: "/symbols/lifeOfLuxury/goldBar.png",
  SILVER_BAR: "/symbols/lifeOfLuxury/silverBar.png",
  BRONZE_BAR: "/symbols/lifeOfLuxury/bronzeBar.png",
  WILD: "/symbols/lifeOfLuxury/daimond.png",
  COIN: "/symbols/lifeOfLuxury/coin.png",
};

const REGULAR_SYMBOLS: RegularSymbol[] = [
  "AEROPLANE",
  "BOAT",
  "CAR",
  "RING",
  "MONEY",
  "WATCH",
  "GOLD_BAR",
  "SILVER_BAR",
  "BRONZE_BAR",
];

function inputClass(invalid = false): string {
  return `w-24 rounded-lg border bg-white px-2 py-1.5 text-sm text-slate-800 ${
    invalid ? "border-rose-500" : "border-slate-300"
  }`;
}

/**
 * Life of Luxury is a fully offline, client-side test game (no backend) — this tab is its own
 * separate RTP control, built the same way AdminBuffaloRtpPage.tsx works, except this game splits
 * reel-strip weight (`tiers`) and payout (`symbolPayouts`) into two independent tables instead of
 * one, plus a scatter-rules and celebration-thresholds section. No auto-rescale-to-target button:
 * unlike Buffalo's single weight+payout `TierRow`, there's no single well-defined lever to scale
 * here (weights? payouts? both?), so Target RTP is a validated number the admin tunes toward
 * manually while watching the live "Effective RTP" readout, same as any other Save-blocked
 * mismatch. The saved config *is* the live odds `spinRequest` reads from (see games/LifeOfLuxury/
 * api.ts) — a change here takes effect on the very next spin.
 */
export function AdminLifeOfLuxuryRtpPage() {
  const [config, setConfig] = useState<LifeOfLuxuryRtpConfig>(() => getLifeOfLuxuryRtpConfig());
  const [savedOk, setSavedOk] = useState(false);

  const computedRtp = computeLifeOfLuxuryRtpPercent(config);
  const frequencySum = config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const frequencyValid = Math.abs(frequencySum - 100) <= 0.01;
  const rtpValid = Math.abs(computedRtp - config.targetRtpPercent) <= 0.5;
  const isValid = frequencyValid && rtpValid;

  function updateTier(key: LifeOfLuxurySymbol, frequencyPercent: number) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.key === key ? { ...t, frequencyPercent } : t)),
    }));
  }

  function updateSymbolPayout(symbol: RegularSymbol, patch: Partial<{ x3: number; x4: number; x5: number }>) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      symbolPayouts: { ...prev.symbolPayouts, [symbol]: { ...prev.symbolPayouts[symbol], ...patch } },
    }));
  }

  function updateScatterRules(patch: Partial<LifeOfLuxuryRtpConfig["scatterRules"]>) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, scatterRules: { ...prev.scatterRules, ...patch } }));
  }

  function updateThresholds(patch: Partial<LifeOfLuxuryRtpConfig["amountThresholds"]>) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, amountThresholds: { ...prev.amountThresholds, ...patch } }));
  }

  function setTargetRtp(newTarget: number) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, targetRtpPercent: newTarget }));
  }

  function save() {
    if (!isValid) return;
    setLifeOfLuxuryRtpConfig(config);
    setSavedOk(true);
    window.setTimeout(() => setSavedOk(false), 2000);
  }

  function resetToDefault() {
    setSavedOk(false);
    setConfig(getLifeOfLuxuryDefaultConfig());
  }

  return (
    <div>
      <AdminPageHeader
        title="Life of Luxury RTP"
        description="Life of Luxury is a fully offline, client-side test game — this control lives entirely in the browser (no backend involved) and takes effect on the very next spin."
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
              ±0.5%). Adjust weights, symbol payouts, or scatter rules below.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-sky-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Frequency % (reel-strip weight)</th>
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
                      onChange={(e) => updateTier(tier.key, Number(e.target.value))}
                      className={inputClass(!frequencyValid)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-800">Symbol payouts (x line bet)</div>
          <p className="mt-1 text-xs text-slate-500">
            Each symbol's own 3/4/5-of-a-kind payout — matched left-to-right on an active line, minimum 3. These
            don't correspond to the Frequency % rows above (those are reel-strip draw weight); this is the actual
            paytable.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sky-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="py-1 pr-3">Symbol</th>
                  <th className="py-1 pr-3">X3</th>
                  <th className="py-1 pr-3">X4</th>
                  <th className="py-1 pr-3">X5</th>
                </tr>
              </thead>
              <tbody>
                {REGULAR_SYMBOLS.map((symbol) => (
                  <tr key={symbol} className="border-t border-slate-200">
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <img src={TIER_IMAGES[symbol]} alt="" className="h-8 w-8 rounded object-contain bg-slate-100" />
                        {TIER_LABELS[symbol]}
                      </div>
                    </td>
                    {(["x3", "x4", "x5"] as const).map((field) => (
                      <td key={field} className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={config.symbolPayouts[symbol][field]}
                          onChange={(e) => updateSymbolPayout(symbol, { [field]: Number(e.target.value) })}
                          className={`${inputClass()} w-24`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-800">Coin scatter rules</div>
          <p className="mt-1 text-xs text-slate-500">
            Coin is rolled independently on every cell at its own Chance % below — it is NOT one of the Frequency %
            rows above. Coin counts anywhere on the 5x3 grid (no payline needed). X3/X4/X5 are multiples of the bet
            (this game has no per-line split). X5 also covers 5 or more. A 3+ trigger on a base spin awards the
            free spins below; a coin during an already-active free-spins round still pays its cash prize but never
            awards more free spins (no retriggering).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <label className="block text-xs text-slate-500">Chance % (per cell)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={config.scatterRules.chancePercent}
                onChange={(e) => updateScatterRules({ chancePercent: Number(e.target.value) })}
                className={`${inputClass()} mt-1 w-28`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">X3 (bet)</label>
              <input
                type="number"
                step="0.01"
                value={config.scatterRules.x3}
                onChange={(e) => updateScatterRules({ x3: Number(e.target.value) })}
                className={`${inputClass()} mt-1 w-28`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">X4 (bet)</label>
              <input
                type="number"
                step="0.01"
                value={config.scatterRules.x4}
                onChange={(e) => updateScatterRules({ x4: Number(e.target.value) })}
                className={`${inputClass()} mt-1 w-28`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">X5+ (bet)</label>
              <input
                type="number"
                step="0.01"
                value={config.scatterRules.x5}
                onChange={(e) => updateScatterRules({ x5: Number(e.target.value) })}
                className={`${inputClass()} mt-1 w-28`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Free spins awarded</label>
              <input
                type="number"
                step="1"
                min={0}
                value={config.scatterRules.freeSpinsAwarded}
                onChange={(e) => updateScatterRules({ freeSpinsAwarded: Number(e.target.value) })}
                className={`${inputClass()} mt-1 w-28`}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-800">Celebration thresholds</div>
          <p className="mt-1 text-xs text-slate-500">
            Cosmetic only — the real payout comes from the tables above. These are just the win-size cutoffs (as a
            multiple of bet) that decide which celebration overlay (Big Win / Mega Win / Jackpot) a spin shows.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["bigWinMin", "Big Win min (x bet)"],
                ["megaWinMin", "Mega Win min (x bet)"],
                ["jackpotMin", "Jackpot min (x bet)"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs text-slate-500">{label}</label>
                <input
                  type="number"
                  value={config.amountThresholds[field]}
                  onChange={(e) => updateThresholds({ [field]: Number(e.target.value) })}
                  className={`${inputClass()} mt-1 w-full`}
                />
              </div>
            ))}
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
            Reset to default ({DEFAULT_LOL_TARGET_RTP_PERCENT}%)
          </button>
          {savedOk && <div className="text-sm font-medium text-emerald-600">Saved — takes effect on the next spin.</div>}
        </div>
      </div>
    </div>
  );
}
