import { useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  ShamrockRtpConfig,
  TierKey,
  WinRuleId,
  WinTierName,
  DEFAULT_SHAMROCK_TARGET_RTP_PERCENT,
  computeShamrockRtpPercent,
  getShamrockDefaultConfig,
  getShamrockRtpConfig,
  rescaleShamrockTiers,
  setShamrockRtpConfig,
} from "../games/ShamrockSpin/api";

const CELEBRATION_OPTIONS: { value: WinTierName | null; label: string }[] = [
  { value: null, label: "Simple Win (no overlay)" },
  { value: "BIG WIN", label: "Big Win" },
  { value: "MEGA WIN", label: "Mega Win" },
  { value: "JACKPOT", label: "Jackpot" },
];

const TIER_LABELS: Record<TierKey, string> = {
  loss: "Loss",
  freeSpin: "Free Spin (bonus round trigger)",
  simpleWin: "Simple Win",
  bigWin: "Big Win",
  megaWin: "Mega Win",
  jackpot: "Jackpot",
};

/** The 4 tiers a win rule can actually be mapped to — mirrors AdminRtpPage.tsx's own
 * WIN_TIER_KEYS (loss/freeSpin aren't payout destinations, so they're excluded here). */
const WIN_TIER_KEYS: TierKey[] = ["simpleWin", "bigWin", "megaWin", "jackpot"];

/** Which symbol combo cosmetically renders for each win rule id — purely decorative, payout
 * comes from whichever tier the rule is mapped to below, not from the id itself. Same art/labels
 * AdminRtpPage.tsx's own (now unreachable for this game) SHAMROCK_RULE_IMAGES/LABELS used. */
const RULE_LABELS: Record<WinRuleId, string> = {
  WILD_JACKPOT: "3× Shamrock Spin (wild)",
  GREEN_SEVEN: "3× Green 7",
  ORANGE_SEVEN: "3× Orange 7",
  YELLOW_SEVEN: "3× Yellow 7",
  TRIPLE_BAR: "3× BAR BAR BAR",
  ANY_SEVENS: "Any 3 Sevens",
  ANY_BARS: "Any 3 BARs",
  SINGLE_BAR: "3× BAR",
  TWO_WILDS: "2 Wilds + Any",
  ONE_WILD: "1 Wild + Any + Any",
};

const RULE_IMAGES: Record<WinRuleId, string> = {
  WILD_JACKPOT: "/symbols/shamrockSpin/Shamrock Spin.png",
  GREEN_SEVEN: "/symbols/shamrockSpin/Green 7.png",
  ORANGE_SEVEN: "/symbols/shamrockSpin/Orange 7.png",
  YELLOW_SEVEN: "/symbols/shamrockSpin/Yellow 7.png",
  TRIPLE_BAR: "/symbols/shamrockSpin/BAR BAR BAR.png",
  ANY_SEVENS: "/symbols/shamrockSpin/Green 7.png",
  ANY_BARS: "/symbols/shamrockSpin/BAR.png",
  SINGLE_BAR: "/symbols/shamrockSpin/BAR.png",
  TWO_WILDS: "/symbols/shamrockSpin/Shamrock Spin.png",
  ONE_WILD: "/symbols/shamrockSpin/Shamrock Spin.png",
};

function inputClass(invalid = false): string {
  return `w-24 rounded-lg border bg-white px-2 py-1.5 text-sm text-slate-800 ${
    invalid ? "border-rose-500" : "border-slate-300"
  }`;
}

/**
 * Shamrock Spin is a fully offline, client-side test game (no backend) — this tab is its own
 * separate RTP control, built the same way AdminBuffaloRtpPage.tsx works, plus the extra sections
 * this game's richer shape needs: a free-spin payout column (Buffalo has no free spins), a "free
 * spins granted" number, and a rule-tier-map editor (which of the 10 win rules pays out as which
 * of the 4 winning tiers). Unlike Life of Luxury's page, auto-rescale-to-target works here —
 * Shamrock's winning tiers carry real payoutMultiplier values (Life of Luxury's don't), so the
 * same proportional-rescale technique Buffalo's page uses applies cleanly. The saved config *is*
 * the live odds `spinRequest` reads from (see games/ShamrockSpin/api.ts) — a change here takes
 * effect on the very next spin.
 */
export function AdminShamrockRtpPage() {
  const [config, setConfig] = useState<ShamrockRtpConfig>(() => getShamrockRtpConfig());
  const [savedOk, setSavedOk] = useState(false);

  const computedRtp = computeShamrockRtpPercent(config);
  const frequencySum = config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const frequencyValid = Math.abs(frequencySum - 100) <= 0.01;
  const rtpValid = Math.abs(computedRtp - config.targetRtpPercent) <= 0.5;
  const isValid = frequencyValid && rtpValid;

  function updateTier(key: TierKey, patch: Partial<ShamrockRtpConfig["tiers"][number]>) {
    setSavedOk(false);
    setConfig((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }));
  }

  function updateCelebration(key: TierKey, value: WinTierName | null) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, celebrationMap: { ...prev.celebrationMap, [key]: value } }));
  }

  function updateRule(ruleId: WinRuleId, tierKey: TierKey) {
    setSavedOk(false);
    setConfig((prev) => ({ ...prev, ruleTierMap: { ...prev.ruleTierMap, [ruleId]: tierKey } }));
  }

  // Same mechanism as Buffalo's page / AdminRtpPage.tsx's own setTargetRtp — rescales every
  // winning tier's frequency proportionally so the config is instantly valid again at the new
  // target; payout multipliers, freeSpinsGranted, and the rule/celebration maps are untouched.
  function setTargetRtp(newTarget: number) {
    setSavedOk(false);
    const oldRtp = computeShamrockRtpPercent(config);
    if (!Number.isFinite(oldRtp) || oldRtp <= 0) {
      setConfig((prev) => ({ ...prev, targetRtpPercent: newTarget }));
      return;
    }
    const tiers = rescaleShamrockTiers(config.tiers, newTarget / oldRtp);
    setConfig((prev) => ({ ...prev, targetRtpPercent: newTarget, tiers }));
  }

  function save() {
    if (!isValid) return;
    setShamrockRtpConfig(config);
    setSavedOk(true);
    window.setTimeout(() => setSavedOk(false), 2000);
  }

  function resetToDefault() {
    setSavedOk(false);
    setConfig(getShamrockDefaultConfig());
  }

  return (
    <div>
      <AdminPageHeader
        title="Shamrock RTP"
        description="Shamrock Spin is a fully offline, client-side test game — this control lives entirely in the browser (no backend involved) and takes effect on the very next spin."
      />

      <div className="max-w-4xl space-y-5">
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
          <p className="mt-2 text-xs text-slate-500">
            Every reel stop is a real paying symbol by design (no non-paying filler), which rules out landing near a
            normal ~95% RTP regardless of weighting — a high target here is intentional, not a mistake.
          </p>

          {!frequencyValid && (
            <p className="mt-3 text-sm text-rose-600">
              Frequencies must sum to 100% — currently {frequencySum.toFixed(2)}%.
            </p>
          )}
          {frequencyValid && !rtpValid && (
            <p className="mt-3 text-sm text-rose-600">
              Computed RTP ({computedRtp.toFixed(2)}%) doesn't match the target ({config.targetRtpPercent.toFixed(2)}%,
              ±0.5%). Adjust frequencies or payout multipliers below, or change the target to match.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-sky-700 text-left text-xs font-semibold uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Frequency %</th>
                <th className="px-3 py-2">Base payout (x bet)</th>
                <th className="px-3 py-2">Free-spin payout (x bet)</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {config.tiers.map((tier) => (
                <tr key={tier.key} className="border-t border-slate-200 even:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{TIER_LABELS[tier.key]}</td>
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
                  <td className="px-3 py-2">
                    {tier.freeSpinPayoutMultiplier === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={tier.freeSpinPayoutMultiplier}
                        onChange={(e) => updateTier(tier.key, { freeSpinPayoutMultiplier: Number(e.target.value) })}
                        className={inputClass()}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <label className="text-sm font-semibold text-slate-800">Free spins granted</label>
          <p className="mt-1 text-xs text-slate-500">
            Bonus spins awarded when the "Free Spin" tier hits. Each bonus spin independently rolls its own outcome
            using the frequencies above (with the free-spin payout column) — it can never re-trigger more free
            spins (no retriggering).
          </p>
          <input
            type="number"
            step="1"
            value={config.freeSpinsGranted}
            onChange={(e) => {
              setSavedOk(false);
              setConfig((prev) => ({ ...prev, freeSpinsGranted: Number(e.target.value) }));
            }}
            className={`${inputClass()} mt-2`}
          />
        </div>

        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Which celebration each win shows (cosmetic only — payout comes from the table above)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WIN_TIER_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">{TIER_LABELS[key]}</span>
                <select
                  value={config.celebrationMap[key] ?? ""}
                  onChange={(e) => updateCelebration(key, (e.target.value || null) as WinTierName | null)}
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

        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Which tier each winning line combo pays as (cosmetic id, real payout comes from whichever tier it's
            mapped to)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.entries(config.ruleTierMap) as [WinRuleId, TierKey][]).map(([ruleId, tierKey]) => (
              <div key={ruleId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <img src={RULE_IMAGES[ruleId]} alt="" className="h-6 w-6 rounded object-contain bg-slate-100" />
                  {RULE_LABELS[ruleId]}
                </span>
                <select
                  value={tierKey}
                  onChange={(e) => updateRule(ruleId, e.target.value as TierKey)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                >
                  {WIN_TIER_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {TIER_LABELS[k]}
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
            Reset to default ({DEFAULT_SHAMROCK_TARGET_RTP_PERCENT}%)
          </button>
          {savedOk && <div className="text-sm font-medium text-emerald-600">Saved — takes effect on the next spin.</div>}
        </div>
      </div>
    </div>
  );
}
