import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { adminApi, PaytableConfig, TierKey, TierRow, CelebrationTier, computeRtpPercent, computeSizzlingSevensStats } from "./adminApi";
import { gameRegistry } from "../games/registry";

const CELEBRATION_OPTIONS: { value: CelebrationTier | null; label: string }[] = [
  { value: null, label: "Simple Win (no overlay)" },
  { value: "BIG WIN", label: "Big Win" },
  { value: "MEGA WIN", label: "Mega Win" },
  { value: "JACKPOT", label: "Jackpot" },
];

const TIER_LABELS: Record<TierKey, string> = {
  loss: "Loss",
  freeSpin: "Free Spin",
  simpleWin: "Simple Win",
  bigWin: "Big Win",
  megaWin: "Mega Win",
  jackpot: "Jackpot",
  zeroRespin: "Zero Respin",
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
  sevenLow: "3x 7",
  sevenMid: "3x 77",
  sevenHigh: "3x 777",
  anySeven: "Any 3 Sevens (mixed)",
  anyGlobal: "Any mix of 7s & Bars",
  multiplier2x: "Special: 2X",
  multiplier5x: "Special: 5X",
  multiplier10x: "Special: 10X",
  dollarPlus: "Special: $+",
  doubleDollarPlus: "Special: $$+",
  respin: "Special: RESPIN",
  specialEmpty: "Special: — (no bonus)",
  whiteBar: "WHITE-BAR x3",
  sevenBar: "7-BAR (WHITE 7-BAR) x3",
  redBar: "RED-BAR x3",
  purpleBar: "PURPLE-BAR x3",
  red7: "RED-7 x3",
  purple7: "PURPLE-7 x3",
  blue7: "BLUE-7 x3",
  any3BarOnly: "Any 3 Bar (no 7-BAR, mixed)",
  any3BarWithSevenBar: "Any 3 Bar + 7-BAR (mixed)",
  any3Sevens: "Any 3 Sevens (mixed)",
  noCoin: "No coin (this reel)",
  coin2x: "2X coin",
  coin3x: "3X coin",
  coin4x: "4X coin",
  coin5x: "5X coin",
  RED_7: "RED 7 (weight + 3x pay)",
  BLUE_7: "BLUE 7 (weight + 3x pay)",
  BAR: "BAR (weight + 3x pay)",
  DOUBLE_BAR: "DOUBLE BAR (weight + 3x pay)",
  TRIPLE_BAR: "TRIPLE BAR (weight + 3x pay)",
  WILD_2X: "2X WILD (weight + 3-Wild pay)",
  BONUS: "BONUS (weight + scatter pay)",
};

const SHAMROCK_RULE_LABELS: Record<string, string> = {
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

/** Buffalo 777 only — the actual reel symbol image for each tier, where one exists 1:1
 * ("Any Bar"/"Loss" have no single symbol, so no image). */
const TIER_IMAGES: Partial<Record<TierKey, string>> = {
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
  sevenLow: "/symbols/carzy777/7.png",
  sevenMid: "/symbols/carzy777/77.png",
  sevenHigh: "/symbols/carzy777/777.png",
  multiplier2x: "/symbols/carzy777/2X.png",
  multiplier5x: "/symbols/carzy777/5X.png",
  multiplier10x: "/symbols/carzy777/10X.png",
  dollarPlus: "/symbols/carzy777/singleDollar.png",
  doubleDollarPlus: "/symbols/carzy777/doubleDollar.png",
  respin: "/symbols/carzy777/respin.png",
  whiteBar: "/symbols/5xRewind/WHITE-BAR.png",
  sevenBar: "/symbols/5xRewind/7-BAR.png",
  redBar: "/symbols/5xRewind/RED-BAR.png",
  purpleBar: "/symbols/5xRewind/PURPLE-BAR.png",
  red7: "/symbols/5xRewind/RED-7.png",
  purple7: "/symbols/5xRewind/PURPLE-7.png",
  blue7: "/symbols/5xRewind/BLUE-7.png",
  coin2x: "/symbols/5xRewind/2X-coin.png",
  coin3x: "/symbols/5xRewind/3X-coin.png",
  coin4x: "/symbols/5xRewind/4X-coin.png",
  coin5x: "/symbols/5xRewind/5X-coin.png",
  any3BarOnly: "/symbols/5xRewind/WHITE-BAR.png",
  any3BarWithSevenBar: "/symbols/5xRewind/7-BAR.png",
  any3Sevens: "/symbols/5xRewind/RED-7.png",
  RED_7: "/symbols/sizzling7s/red-7.png",
  BLUE_7: "/symbols/sizzling7s/blue-7.png",
  BAR: "/symbols/sizzling7s/bar.png",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.png",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.png",
  WILD_2X: "/symbols/sizzling7s/2xWild.png",
  BONUS: "/symbols/sizzling7s/bonus.png",
};

/** Shamrock Spin only — the reel symbol image for each win rule. */
const SHAMROCK_RULE_IMAGES: Record<string, string> = {
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

const WIN_TIER_KEYS: TierKey[] = ["simpleWin", "bigWin", "megaWin", "jackpot"];

function inputClass(invalid = false): string {
  return `w-24 rounded-lg border bg-slate-950 px-2 py-1.5 text-sm text-white ${
    invalid ? "border-rose-500" : "border-slate-700"
  }`;
}

export function AdminRtpPage() {
  const [gameId, setGameId] = useState(gameRegistry[0]?.slug ?? "");
  const [config, setConfig] = useState<PaytableConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    setConfig(null);
    setSaveErrors([]);
    setSavedOk(false);
    adminApi.getPaytable(gameId).then((res) => setConfig(res.config));
  }, [gameId]);

  const hasFreeSpin = config?.tiers.some((t) => t.key === "freeSpin") ?? false;
  // Sizzling 7s' RTP and loss% both come from the same (expensive, 200k-sim) Monte Carlo pass
  // — compute it once here and reuse, rather than calling computeRtpPercent (which would
  // re-run the whole simulation a second time) separately below.
  const sizzlingStats = config && gameId === "sizzling-7s" ? computeSizzlingSevensStats(config) : null;
  const computedRtp = sizzlingStats ? sizzlingStats.rtpPercent : config ? computeRtpPercent(config) : 0;
  const frequencySum = config ? config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0) : 0;
  const frequencyValid = Math.abs(frequencySum - 100) <= 0.01;
  const rtpValid = config ? Math.abs(computedRtp - config.targetRtpPercent) <= 0.5 : false;
  const specialFrequencySum = config?.specialReelTiers?.reduce((sum, t) => sum + t.frequencyPercent, 0) ?? 100;
  const specialFrequencyValid = !config?.specialReelTiers || Math.abs(specialFrequencySum - 100) <= 0.01;
  const isValid = frequencyValid && rtpValid && specialFrequencyValid;

  function updateTier(key: TierKey, patch: Partial<TierRow>) {
    if (!config) return;
    setSavedOk(false);
    setConfig({
      ...config,
      tiers: config.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    });
  }

  function updateCelebration(key: TierKey, value: CelebrationTier | null) {
    if (!config) return;
    setSavedOk(false);
    setConfig({ ...config, celebrationMap: { ...config.celebrationMap, [key]: value } });
  }

  // Crazy 777 only — specialReelTiers is a fully independent weighted table (reel 4), so it
  // gets its own update helper and its own 100%-sum check, separate from `tiers`.
  function updateSpecialTier(key: TierKey, patch: Partial<TierRow>) {
    if (!config?.specialReelTiers) return;
    setSavedOk(false);
    setConfig({
      ...config,
      specialReelTiers: config.specialReelTiers.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    });
  }

  function updateRespinRange(patch: Partial<{ min: number; max: number }>) {
    if (!config?.respinRange) return;
    setSavedOk(false);
    setConfig({ ...config, respinRange: { ...config.respinRange, ...patch } });
  }


  // Changing the Target RTP re-scales the win-tier frequencies (proportionally, keeping their
  // relative rarity the same) so the config is instantly valid again at the new target — the
  // freeSpin row's own trigger frequency and every payout multiplier are left untouched, since
  // RTP is linear in the win-tier frequencies alone (see computeRtpPercent). Editing a tier's
  // frequency/payout directly (via updateTier) still shows the real-time error as before.
  //
  // Crazy 777 (config.specialReelTiers present) is the one exception to "linear": its RESPIN
  // retrigger term depends on pLineWin *and* jointEV, both of which move when we scale line
  // frequencies, so a single rescale pass lands close but not exact (a small quadratic
  // residual). Iterating the same rescale step a few times converges on the target almost
  // exactly — each pass shrinks the residual by roughly the same factor that caused it.
  function rescaleLineTiers(tiers: TierRow[], scale: number): TierRow[] {
    let scaled = tiers.map((t) =>
      t.payoutMultiplier !== null ? { ...t, frequencyPercent: Math.max(0, t.frequencyPercent * scale) } : t
    );
    const nonLossSum = scaled.filter((t) => t.key !== "loss").reduce((sum, t) => sum + t.frequencyPercent, 0);
    const newLoss = Math.max(0, 100 - nonLossSum);
    return scaled.map((t) => (t.key === "loss" ? { ...t, frequencyPercent: newLoss } : t));
  }

  function setTargetRtp(newTarget: number) {
    if (!config) return;
    setSavedOk(false);

    const oldRtp = computeRtpPercent(config);
    if (!Number.isFinite(oldRtp) || oldRtp <= 0) {
      setConfig({ ...config, targetRtpPercent: newTarget });
      return;
    }

    // Scale every tier that actually contributes to RTP — same condition computeRtpPercent
    // itself uses, so this works for any game's tier set, not just the shared simpleWin/
    // bigWin/megaWin/jackpot bucket names (Buffalo 777's tiers are named differently).
    let tiers = rescaleLineTiers(config.tiers, newTarget / oldRtp);

    if (config.specialReelTiers) {
      for (let i = 0; i < 6; i++) {
        const current = computeRtpPercent({ ...config, tiers });
        if (!Number.isFinite(current) || current <= 0 || Math.abs(current - newTarget) < 0.005) break;
        tiers = rescaleLineTiers(tiers, newTarget / current);
      }
    }

    setConfig({ ...config, targetRtpPercent: newTarget, tiers });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setSaveErrors([]);
    try {
      const res = await adminApi.updatePaytable(gameId, config);
      setConfig(res.config);
      setSavedOk(true);
    } catch (err: unknown) {
      const errors =
        (err as { response?: { data?: { errors?: string[]; error?: string } } })?.response?.data?.errors ??
        [(err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Save failed"];
      setSaveErrors(errors);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="RTP Control"
        description="Set exact odds and payouts per outcome tier — this is the RTP control for both games now."
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 max-w-md">
        {gameRegistry.map((g) => (
          <button
            key={g.slug}
            onClick={() => setGameId(g.slug)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              gameId === g.slug ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {!config ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : (
        <div className="max-w-3xl space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-white">Target RTP %</label>
              <input
                type="number"
                step="0.01"
                value={config.targetRtpPercent}
                onChange={(e) => setTargetRtp(Number(e.target.value))}
                className={inputClass(!rtpValid)}
              />
              <div className={`text-sm font-medium ${isValid ? "text-emerald-400" : "text-rose-400"}`}>
                Effective RTP: {computedRtp.toFixed(2)}%
                {isValid ? " ✓" : ""}
              </div>
              {sizzlingStats && (
                <div className="text-sm font-medium text-slate-400">Loss: {sizzlingStats.lossPercent.toFixed(2)}%</div>
              )}
            </div>

            {!frequencyValid && (
              <p className="mt-3 text-sm text-rose-400">
                Frequencies must sum to 100% — currently {frequencySum.toFixed(2)}%.
              </p>
            )}
            {frequencyValid && !rtpValid && (
              <p className="mt-3 text-sm text-rose-400">
                Computed RTP ({computedRtp.toFixed(2)}%) doesn't match the target ({config.targetRtpPercent.toFixed(2)}%,
                ±0.5%). Adjust frequencies or payout multipliers below.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Frequency %</th>
                  <th className="px-3 py-2">Payout (x bet)</th>
                  {hasFreeSpin && <th className="px-3 py-2">Free-spin payout (x bet)</th>}
                </tr>
              </thead>
              <tbody>
                {config.tiers.map((tier) => (
                  <tr key={tier.key} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-medium text-white">
                      <div className="flex items-center gap-2">
                        {TIER_IMAGES[tier.key] && (
                          <img src={TIER_IMAGES[tier.key]} alt="" className="h-8 w-8 rounded object-contain bg-slate-800" />
                        )}
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
                      {tier.payoutMultiplier === null ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            value={tier.payoutMultiplier}
                            onChange={(e) => updateTier(tier.key, { payoutMultiplier: Number(e.target.value) })}
                            className={inputClass()}
                          />
                          {config.amountThresholds && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              Estimate only — real payout is the number shown on the reels (range below)
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    {hasFreeSpin && (
                      <td className="px-3 py-2">
                        {tier.freeSpinPayoutMultiplier === null ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={tier.freeSpinPayoutMultiplier}
                            onChange={(e) =>
                              updateTier(tier.key, { freeSpinPayoutMultiplier: Number(e.target.value) })
                            }
                            className={inputClass()}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              Which celebration each win shows (cosmetic only — payout comes from the table above)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {config.tiers
                .filter((t) => t.payoutMultiplier !== null)
                .map((tier) => (
                  <div key={tier.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-300">
                      {TIER_IMAGES[tier.key] && (
                        <img src={TIER_IMAGES[tier.key]} alt="" className="h-6 w-6 rounded object-contain bg-slate-800" />
                      )}
                      {TIER_LABELS[tier.key]}
                    </span>
                    <select
                      value={config.celebrationMap?.[tier.key] ?? ""}
                      onChange={(e) => updateCelebration(tier.key, (e.target.value || null) as CelebrationTier | null)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
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

          {hasFreeSpin && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <label className="text-sm font-semibold text-white">Free spins granted</label>
              <p className="mt-1 text-xs text-slate-500">
                Bonus spins awarded when the "Free Spin" tier hits. Each bonus spin independently rolls its own
                outcome using the frequencies above (with the free-spin payout column).
              </p>
              <input
                type="number"
                step="1"
                value={config.freeSpinsGranted ?? 0}
                onChange={(e) => setConfig({ ...config, freeSpinsGranted: Number(e.target.value) })}
                className={`${inputClass()} mt-2`}
              />
            </div>
          )}

          {config.ruleTierMap && (
            <details className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Which symbols render for each tier (cosmetic only — payout comes from the table above)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(config.ruleTierMap).map(([ruleId, tierKey]) => (
                  <div key={ruleId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-300">
                      {SHAMROCK_RULE_IMAGES[ruleId] && (
                        <img src={SHAMROCK_RULE_IMAGES[ruleId]} alt="" className="h-6 w-6 rounded object-contain bg-slate-800" />
                      )}
                      {SHAMROCK_RULE_LABELS[ruleId] ?? ruleId}
                    </span>
                    <select
                      value={tierKey}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          ruleTierMap: { ...config.ruleTierMap, [ruleId]: e.target.value },
                        })
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
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
          )}

          {config.amountThresholds && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="text-sm font-semibold text-white">Amount thresholds</div>
              <p className="mt-1 text-xs text-slate-500">
                The value range for each tier — this is the real payout control: whatever number the reels land on
                within a tier's range is exactly what gets paid (scaled by bet). The payout "x" fields above are
                only an estimate for the RTP preview.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["simpleWinMax", "Simple Win max"],
                    ["bigWinMin", "Big Win min"],
                    ["megaWinMin", "Mega Win min"],
                    ["jackpotMin", "Jackpot min"],
                    ["zeroRespinMin", "Zero Respin min"],
                    ["zeroRespinMax", "Zero Respin max"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-xs text-slate-500">{label}</label>
                    <input
                      type="number"
                      value={config.amountThresholds![field]}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          amountThresholds: { ...config.amountThresholds!, [field]: Number(e.target.value) },
                        })
                      }
                      className={`${inputClass()} mt-1 w-full`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.specialReelTiers && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="text-sm font-semibold text-white">
                {config.gameId === "5x-rewind" ? "Coin overlay (rolled per reel)" : "Special reel (reel 4)"}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {config.gameId === "5x-rewind"
                  ? "Rolled independently for each of the 3 reels — a coin can replace that reel's line symbol regardless of what the line tier above rolled. Frequencies here must separately sum to 100%."
                  : "Fully independent from the table above — this is reel 4's own odds and effects, applied on top of the base win whenever reels 1-2-3 win. Frequencies here must separately sum to 100%."}
              </p>
              {!specialFrequencyValid && (
                <p className="mt-2 text-sm text-rose-400">
                  Special reel frequencies must sum to 100% — currently {specialFrequencySum.toFixed(2)}%.
                </p>
              )}
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">Frequency %</th>
                      <th className="px-3 py-2">Effect value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.specialReelTiers.map((tier) => (
                      <tr key={tier.key} className="border-t border-slate-800">
                        <td className="px-3 py-2 font-medium text-white">
                          <div className="flex items-center gap-2">
                            {TIER_IMAGES[tier.key] && (
                              <img src={TIER_IMAGES[tier.key]} alt="" className="h-8 w-8 rounded object-contain bg-slate-800" />
                            )}
                            {TIER_LABELS[tier.key]}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={tier.frequencyPercent}
                            onChange={(e) => updateSpecialTier(tier.key, { frequencyPercent: Number(e.target.value) })}
                            className={inputClass(!specialFrequencyValid)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {tier.payoutMultiplier === null ? (
                            <span className="text-slate-600">
                              {config.gameId === "5x-rewind" ? "—" : "— (respin count set below)"}
                            </span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              value={tier.payoutMultiplier}
                              onChange={(e) => updateSpecialTier(tier.key, { payoutMultiplier: Number(e.target.value) })}
                              className={inputClass()}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {config.gameId !== "5x-rewind" && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Multiplier symbols (2X/5X/10X): effect value is the ×N applied to base win. Dollar symbols
                  ($+/$$+): effect value is a flat ×bet bonus added on top of base win.
                </p>
              )}

              {config.respinRange && (
                <div className="mt-4">
                  <label className="text-sm font-semibold text-white">Respin count range</label>
                  <p className="mt-1 text-xs text-slate-500">
                    When RESPIN lands, the player is awarded a random number of free re-spins within this range.
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div>
                      <label className="block text-xs text-slate-500">Min</label>
                      <input
                        type="number"
                        step="1"
                        value={config.respinRange.min}
                        onChange={(e) => updateRespinRange({ min: Number(e.target.value) })}
                        className={`${inputClass()} mt-1`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500">Max</label>
                      <input
                        type="number"
                        step="1"
                        value={config.respinRange.max}
                        onChange={(e) => updateRespinRange({ max: Number(e.target.value) })}
                        className={`${inputClass()} mt-1`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {saveErrors.length > 0 && (
            <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
              {saveErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          {savedOk && <div className="text-sm font-medium text-emerald-400">Saved.</div>}

          <button
            onClick={save}
            disabled={!isValid || saving}
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
