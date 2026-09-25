/**
 * Shamrock Spin's RNG, paytable, and balance are all computed entirely in the browser — RTP and
 * odds are configured client-side (see the RTP control below) and every spin resolves locally, on
 * the same tick, instead of over the network. Everything below (other than `logSpinResult`) is a
 * faithful port of what used to live in
 * `backEnd/src/games/ShamrockSpin/{config,engine,winTiers}.ts`, using the exact same tier
 * weights/payout multipliers/rule-tier map that previously came from
 * `backEnd/src/services/paytableConfig.ts`'s `DEFAULT_CONFIGS["shamrock-spin"]`. Kept as the same
 * exported function names/signatures as the old network calls (`spinRequest`,
 * `getShamrockConfig`) so `ShamrockSpinGame.tsx` didn't need type changes — `spinRequest` gains
 * one new parameter (`currentBalance`), the same shape Life of Luxury's/SizzlingSevens' already-
 * offline `spinRequest` uses, since this game's `SpinResponse` (like theirs) already carries a
 * `balance` field.
 *
 * Unlike Life of Luxury, there's no free-spin *round* state to track here at all: the server
 * never tracked one either (no FreeSpinRound-equivalent doc) — free-spin remaining/total/winnings
 * bookkeeping has always lived entirely in ShamrockSpinGame.tsx's own React state, one spin at a
 * time, so this file stays a fully stateless, self-contained per-call function.
 *
 * The one exception is `logSpinResult`: a write-only, fire-and-forget call to a minimal backend
 * endpoint (`backEnd/src/games/ShamrockSpin/routes.ts`) that just records the already-decided
 * result into the same `SpinHistory` collection every other game uses, so Shamrock Spin spins show
 * up in the admin dashboard (Earnings, Player Detail, Live Feed) like every other game's. It never
 * influences gameplay — the spin itself is fully decided above before this is called.
 */

import { apiClient } from "../../api/client";

export type SlotSymbol =
  | "SHAMROCK_WILD"
  | "SHAMROCK_1"
  | "SHAMROCK_2"
  | "SHAMROCK_3"
  | "SHAMROCK_4"
  | "GREEN_SEVEN"
  | "ORANGE_SEVEN"
  | "YELLOW_SEVEN"
  | "TRIPLE_BAR"
  | "DOUBLE_BAR"
  | "SINGLE_BAR";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export type WinRuleId =
  | "WILD_JACKPOT"
  | "GREEN_SEVEN"
  | "ORANGE_SEVEN"
  | "YELLOW_SEVEN"
  | "TRIPLE_BAR"
  | "ANY_SEVENS"
  | "ANY_BARS"
  | "SINGLE_BAR"
  | "TWO_WILDS"
  | "ONE_WILD";

export interface WinRule {
  id: WinRuleId;
  basePayout: number;
  freeSpinPayout: number;
}

export interface SpinResponse {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol][];
  lineSymbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  winRuleId: WinRuleId | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  freeSpinsAwarded: number;
  balance: number;
  meta: { forced: boolean };
}

export interface ShamrockConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  winRules: WinRule[];
  betLevels: number[];
  maxTotalFreeSpins: number;
}

// --- Game shape — ported verbatim from backEnd/src/games/ShamrockSpin/config.ts ------------

const DISPLAY_SYMBOLS: SlotSymbol[] = [
  "SHAMROCK_WILD",
  "SHAMROCK_1",
  "SHAMROCK_2",
  "SHAMROCK_3",
  "SHAMROCK_4",
  "GREEN_SEVEN",
  "ORANGE_SEVEN",
  "YELLOW_SEVEN",
  "TRIPLE_BAR",
  "DOUBLE_BAR",
  "SINGLE_BAR",
];

/** All 5 Shamrock Spin variants are wild, substituting for Seven- and Bar-family symbols. */
const WILD_SYMBOLS: ReadonlySet<SlotSymbol> = new Set([
  "SHAMROCK_WILD",
  "SHAMROCK_1",
  "SHAMROCK_2",
  "SHAMROCK_3",
  "SHAMROCK_4",
]);

const SEVEN_SYMBOLS: ReadonlySet<SlotSymbol> = new Set(["GREEN_SEVEN", "ORANGE_SEVEN", "YELLOW_SEVEN"]);
const BAR_SYMBOLS: ReadonlySet<SlotSymbol> = new Set(["TRIPLE_BAR", "DOUBLE_BAR", "SINGLE_BAR"]);

/** Cosmetic/display paytable for the paytable modal — not admin-tunable, matches every other
 * offline game's REFERENCE_PAYTABLE-style constant. */
const WIN_RULES: WinRule[] = [
  { id: "WILD_JACKPOT", basePayout: 400, freeSpinPayout: 4000 },
  { id: "GREEN_SEVEN", basePayout: 100, freeSpinPayout: 100 },
  { id: "ORANGE_SEVEN", basePayout: 50, freeSpinPayout: 50 },
  { id: "YELLOW_SEVEN", basePayout: 30, freeSpinPayout: 30 },
  { id: "TRIPLE_BAR", basePayout: 20, freeSpinPayout: 20 },
  { id: "ANY_SEVENS", basePayout: 15, freeSpinPayout: 15 },
  { id: "ANY_BARS", basePayout: 3, freeSpinPayout: 10 },
  { id: "SINGLE_BAR", basePayout: 5, freeSpinPayout: 5 },
  { id: "TWO_WILDS", basePayout: 2, freeSpinPayout: 2 },
  { id: "ONE_WILD", basePayout: 1, freeSpinPayout: 1 },
];

const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10];
const MAX_TOTAL_FREE_SPINS = 29;

// --- Admin-adjustable RTP control (fully client-side — no backend for this game) ------------

export type TierKey = "loss" | "freeSpin" | "simpleWin" | "bigWin" | "megaWin" | "jackpot";

export interface ShamrockTierRow {
  key: TierKey;
  frequencyPercent: number;
  payoutMultiplier: number | null;
  freeSpinPayoutMultiplier: number | null;
}

export interface ShamrockRtpConfig {
  targetRtpPercent: number;
  freeSpinsGranted: number;
  tiers: ShamrockTierRow[];
  ruleTierMap: Record<WinRuleId, TierKey>;
  celebrationMap: Partial<Record<TierKey, WinTierName | null>>;
}

const RTP_CONFIG_STORAGE_KEY = "texas-slots-shamrockspin-rtp-config";
export const DEFAULT_SHAMROCK_TARGET_RTP_PERCENT = 330.32;

/** Ported verbatim from paytableConfig.ts's DEFAULT_CONFIGS["shamrock-spin"] — the actual live
 * odds this game shipped with. Every reel stop is a real paying symbol by design (no non-paying
 * filler — see the backend config.ts's own comment), which mathematically rules out landing near
 * a normal ~95% RTP regardless of weighting; this high target is intentional, not a bug. */
const BASE_TIERS: ShamrockTierRow[] = [
  { key: "loss", frequencyPercent: 54.79, payoutMultiplier: null, freeSpinPayoutMultiplier: null },
  { key: "freeSpin", frequencyPercent: 8.0, payoutMultiplier: null, freeSpinPayoutMultiplier: null },
  { key: "simpleWin", frequencyPercent: 34.91, payoutMultiplier: 4.5, freeSpinPayoutMultiplier: 6 },
  { key: "bigWin", frequencyPercent: 1.91, payoutMultiplier: 29, freeSpinPayoutMultiplier: 29 },
  { key: "megaWin", frequencyPercent: 0.37, payoutMultiplier: 59, freeSpinPayoutMultiplier: 59 },
  { key: "jackpot", frequencyPercent: 0.02, payoutMultiplier: 400, freeSpinPayoutMultiplier: 4000 },
];

const BASE_RULE_TIER_MAP: Record<WinRuleId, TierKey> = {
  WILD_JACKPOT: "jackpot",
  GREEN_SEVEN: "megaWin",
  ORANGE_SEVEN: "megaWin",
  YELLOW_SEVEN: "bigWin",
  TRIPLE_BAR: "bigWin",
  ANY_SEVENS: "simpleWin",
  ANY_BARS: "simpleWin",
  SINGLE_BAR: "simpleWin",
  TWO_WILDS: "simpleWin",
  ONE_WILD: "simpleWin",
};

const BASE_CELEBRATION_MAP: Partial<Record<TierKey, WinTierName | null>> = {
  simpleWin: null,
  bigWin: "BIG WIN",
  megaWin: "MEGA WIN",
  jackpot: "JACKPOT",
};

const DEFAULT_FREE_SPINS_GRANTED = 3;

export function getShamrockDefaultConfig(): ShamrockRtpConfig {
  return {
    targetRtpPercent: DEFAULT_SHAMROCK_TARGET_RTP_PERCENT,
    freeSpinsGranted: DEFAULT_FREE_SPINS_GRANTED,
    tiers: BASE_TIERS.map((t) => ({ ...t })),
    ruleTierMap: { ...BASE_RULE_TIER_MAP },
    celebrationMap: { ...BASE_CELEBRATION_MAP },
  };
}

function isValidConfig(value: unknown): value is ShamrockRtpConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.targetRtpPercent === "number" &&
    typeof v.freeSpinsGranted === "number" &&
    Array.isArray(v.tiers) &&
    v.tiers.length > 0 &&
    typeof v.ruleTierMap === "object" &&
    v.ruleTierMap !== null &&
    typeof v.celebrationMap === "object" &&
    v.celebrationMap !== null
  );
}

/** Reads the admin's saved RTP config from localStorage — falls back to the fresh default if
 * nothing's been saved yet, the stored value is corrupt/malformed, or localStorage itself is
 * unavailable (private browsing, etc.). */
export function getShamrockRtpConfig(): ShamrockRtpConfig {
  try {
    const raw = localStorage.getItem(RTP_CONFIG_STORAGE_KEY);
    if (raw === null) return getShamrockDefaultConfig();
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConfig(parsed)) return getShamrockDefaultConfig();
    return parsed;
  } catch {
    return getShamrockDefaultConfig();
  }
}

/** Persists a new RTP config — takes effect on the very next spin (spinRequest re-reads this on
 * every call, see below), no reload or cross-tab wiring needed. Silently no-ops if localStorage
 * isn't available. */
export function setShamrockRtpConfig(config: ShamrockRtpConfig): void {
  try {
    localStorage.setItem(RTP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private browsing / storage disabled — setting just won't persist */
  }
}

/** Mirrors the backend's generic computeRtpPercent fallback (services/paytableConfig.ts) exactly
 * — the same formula every not-specially-handled game uses, Shamrock included (no dedicated
 * per-game RTP function ever existed for it). */
export function computeShamrockRtpPercent(config: ShamrockRtpConfig): number {
  const winTiers = config.tiers.filter((t) => t.payoutMultiplier !== null);
  const baseRtp = winTiers.reduce((sum, t) => sum + (t.frequencyPercent / 100) * (t.payoutMultiplier ?? 0), 0);

  const freeSpinRow = config.tiers.find((t) => t.key === "freeSpin");
  if (!freeSpinRow || !config.freeSpinsGranted) {
    return baseRtp * 100;
  }

  const freeSpinTierSum = winTiers.reduce(
    (sum, t) => sum + (t.frequencyPercent / 100) * (t.freeSpinPayoutMultiplier ?? t.payoutMultiplier ?? 0),
    0
  );
  const freeSpinRtp = (freeSpinRow.frequencyPercent / 100) * config.freeSpinsGranted * freeSpinTierSum;

  return (baseRtp + freeSpinRtp) * 100;
}

/** Rescales `tiers` to land on a new target — identical technique to the generic admin page's own
 * `rescaleLineTiers`: every tier with a real payoutMultiplier has its frequency scaled by `scale`
 * (clamped at 0; `freeSpin`'s own frequency is untouched, same as any other non-payout tier),
 * then `loss` absorbs whatever's left so frequencies still sum to exactly 100%. */
export function rescaleShamrockTiers(tiers: ShamrockTierRow[], scale: number): ShamrockTierRow[] {
  const scaled = tiers.map((t) =>
    t.payoutMultiplier !== null ? { ...t, frequencyPercent: Math.max(0, t.frequencyPercent * scale) } : t
  );
  const nonLossSum = scaled.reduce((sum, t) => (t.key === "loss" ? sum : sum + t.frequencyPercent), 0);
  return scaled.map((t) => (t.key === "loss" ? { ...t, frequencyPercent: Math.max(0, 100 - nonLossSum) } : t));
}

// --- Win-line logic — ported verbatim from backEnd/src/games/ShamrockSpin/engine.ts ---------

function randomSymbol(): SlotSymbol {
  return DISPLAY_SYMBOLS[Math.floor(Math.random() * DISPLAY_SYMBOLS.length)];
}

function randomWild(): SlotSymbol {
  const wilds = [...WILD_SYMBOLS];
  return wilds[Math.floor(Math.random() * wilds.length)];
}

function randomSeven(exclude?: SlotSymbol): SlotSymbol {
  const sevens = [...SEVEN_SYMBOLS].filter((s) => s !== exclude);
  return sevens[Math.floor(Math.random() * sevens.length)];
}

function randomBar(exclude?: SlotSymbol): SlotSymbol {
  const bars = [...BAR_SYMBOLS].filter((s) => s !== exclude);
  return bars[Math.floor(Math.random() * bars.length)];
}

/** Wilds substitute freely for Seven- or Bar-family symbols (never bridging the two families).
 * Used only as a rejection-sampling guard for synthesizing a genuine "loss" line. */
function evaluateLine(line: [SlotSymbol, SlotSymbol, SlotSymbol]): WinRuleId | null {
  const wildCount = line.filter((s) => WILD_SYMBOLS.has(s)).length;
  if (wildCount === 3) return "WILD_JACKPOT";

  const nonWild = line.filter((s) => !WILD_SYMBOLS.has(s));
  const allSevenFamily = nonWild.every((s) => SEVEN_SYMBOLS.has(s));
  if (allSevenFamily && nonWild.length > 0) {
    const distinctColors = new Set(nonWild);
    if (distinctColors.size === 1) {
      const color = nonWild[0];
      if (color === "GREEN_SEVEN") return "GREEN_SEVEN";
      if (color === "ORANGE_SEVEN") return "ORANGE_SEVEN";
      if (color === "YELLOW_SEVEN") return "YELLOW_SEVEN";
    }
    return "ANY_SEVENS";
  }

  const allBarFamily = nonWild.every((s) => BAR_SYMBOLS.has(s));
  if (allBarFamily && nonWild.length > 0) {
    const distinctBars = new Set(nonWild);
    if (distinctBars.size === 1) {
      const bar = nonWild[0];
      if (bar === "TRIPLE_BAR") return "TRIPLE_BAR";
      if (bar === "SINGLE_BAR") return "SINGLE_BAR";
      return "ANY_BARS";
    }
    return "ANY_BARS";
  }

  if (wildCount >= 1) return "ONE_WILD"; // covers the (unreachable via natural draw) 2-wild case too
  return null;
}

/** A line that genuinely matches nothing — rejection-sampled, converges in 1-2 tries. */
function buildLossLine(): [SlotSymbol, SlotSymbol, SlotSymbol] {
  let line: [SlotSymbol, SlotSymbol, SlotSymbol];
  do {
    line = [randomSymbol(), randomSymbol(), randomSymbol()];
  } while (evaluateLine(line) !== null);
  return line;
}

/** Constructs the exact 3-symbol line for a given rule, guaranteed correct regardless of
 * evaluateLine's own quirks. */
function buildLineForRule(ruleId: WinRuleId): [SlotSymbol, SlotSymbol, SlotSymbol] {
  switch (ruleId) {
    case "WILD_JACKPOT":
      return [randomWild(), randomWild(), randomWild()];
    case "GREEN_SEVEN":
      return ["GREEN_SEVEN", "GREEN_SEVEN", "GREEN_SEVEN"];
    case "ORANGE_SEVEN":
      return ["ORANGE_SEVEN", "ORANGE_SEVEN", "ORANGE_SEVEN"];
    case "YELLOW_SEVEN":
      return ["YELLOW_SEVEN", "YELLOW_SEVEN", "YELLOW_SEVEN"];
    case "TRIPLE_BAR":
      return ["TRIPLE_BAR", "TRIPLE_BAR", "TRIPLE_BAR"];
    case "SINGLE_BAR":
      return ["SINGLE_BAR", "SINGLE_BAR", "SINGLE_BAR"];
    case "ANY_SEVENS": {
      const a = randomSeven();
      const b = randomSeven(a);
      return [a, b, a];
    }
    case "ANY_BARS": {
      const a = randomBar();
      const b = randomBar(a);
      return [a, b, a];
    }
    case "TWO_WILDS":
      return [randomWild(), randomWild(), Math.random() < 0.5 ? randomSeven() : randomBar()];
    case "ONE_WILD": {
      // Must be exactly 1 wild + 1 seven + 1 bar — any 2-non-wild-same-family combo would
      // instead read as that family's own rule (see evaluateLine).
      const positions: SlotSymbol[] = [randomWild(), randomSeven(), randomBar()];
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      return positions as [SlotSymbol, SlotSymbol, SlotSymbol];
    }
  }
}

function buildReel(middle: SlotSymbol): [SlotSymbol, SlotSymbol, SlotSymbol] {
  return [randomSymbol(), middle, randomSymbol()];
}

/** Weighted-random pick of one tier row by frequencyPercent — plain Math.random(), not
 * cryptographically secure (the backend used secureRandomInt; this is a fully offline test game,
 * same precedent as Buffalo777/Life of Luxury's ports). Optionally excludes "freeSpin" (a
 * bonus-round spin doesn't re-trigger itself — no retriggering). */
function rollTier(tiers: ShamrockTierRow[], excludeFreeSpin: boolean): ShamrockTierRow {
  const pool = excludeFreeSpin ? tiers.filter((t) => t.key !== "freeSpin") : tiers;
  const total = pool.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = Math.random() * total;
  for (const tier of pool) {
    roll -= tier.frequencyPercent;
    if (roll < 0) return tier;
  }
  return pool[pool.length - 1];
}

/** Admin-configured celebration for this tier, falling back to the shipped default map for any
 * tier the admin hasn't set. */
function getCelebration(tierKey: TierKey, config: ShamrockRtpConfig): WinTierName | null {
  const configured = config.celebrationMap[tierKey];
  return configured !== undefined ? configured : (BASE_CELEBRATION_MAP[tierKey] ?? null);
}

function pickRuleForTier(ruleTierMap: Record<WinRuleId, TierKey>, tierKey: TierKey): WinRuleId {
  const candidates = (Object.entries(ruleTierMap) as [WinRuleId, TierKey][])
    .filter(([, v]) => v === tierKey)
    .map(([k]) => k);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Runs one local, outcome-first spin: the tier is decided first (by frequency), then the line is
 * synthesized to match it exactly — same algorithm as the old backend's engine.ts. `betAmount` is
 * the total bet (0 during a free spin). `currentBalance` is the player's balance right before this
 * spin — the new balance (bet deducted, win credited) is computed here and returned, mirroring
 * Life of Luxury's/SizzlingSevens' already-offline `spinRequest`. Resolves on the same tick (no
 * network involved), kept as an async function purely so call sites can keep using
 * `await spinRequest(...)` unchanged. */
export async function spinRequest(betAmount: number, freeSpin = false, currentBalance = 0): Promise<SpinResponse> {
  const config = getShamrockRtpConfig();
  const tier = rollTier(config.tiers, freeSpin);

  let lineSymbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  let winRuleId: WinRuleId | null = null;
  let multiplier = 0;
  let freeSpinsAwarded = 0;

  if (tier.key === "loss") {
    lineSymbols = buildLossLine();
  } else if (tier.key === "freeSpin") {
    lineSymbols = buildLossLine();
    freeSpinsAwarded = config.freeSpinsGranted ?? 0;
  } else {
    winRuleId = pickRuleForTier(config.ruleTierMap, tier.key);
    lineSymbols = buildLineForRule(winRuleId);
    multiplier = (freeSpin ? tier.freeSpinPayoutMultiplier : tier.payoutMultiplier) ?? 0;
  }

  const winAmount = Math.round(multiplier * betAmount * 100) / 100;
  const reels: [SlotSymbol, SlotSymbol, SlotSymbol][] = [
    buildReel(lineSymbols[0]),
    buildReel(lineSymbols[1]),
    buildReel(lineSymbols[2]),
  ];

  const stakedAmount = freeSpin ? 0 : betAmount;
  const balance = Math.round((currentBalance - stakedAmount + winAmount) * 100) / 100;

  return {
    reels,
    lineSymbols,
    winRuleId,
    multiplier,
    winAmount,
    tier: tier.key === "loss" ? null : getCelebration(tier.key, config),
    freeSpinsAwarded,
    balance,
    meta: { forced: false },
  };
}

export async function getShamrockConfig(): Promise<ShamrockConfigResponse> {
  return {
    meta: {
      id: "shamrock-spin",
      name: "Shamrock Spin",
      description: "Classic 3-reel, single-payline slot",
      minBet: BET_LEVELS[0],
      maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    },
    winRules: WIN_RULES,
    betLevels: BET_LEVELS,
    maxTotalFreeSpins: MAX_TOTAL_FREE_SPINS,
  };
}

/** Fire-and-forget: records a spin that already happened (locally) into the backend's
 * SpinHistory, purely for admin record-keeping — see the module doc comment above. */
export async function logSpinResult(params: {
  betAmount: number;
  winAmount: number;
  reelSymbols: SlotSymbol[][];
  balanceAfter: number;
  tier: WinTierName | null;
}): Promise<void> {
  await apiClient.post("/api/games/shamrock-spin/spin-log", params);
}
