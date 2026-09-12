/**
 * Buffalo777 is a fully offline, client-side test game — RNG, paytable, and balance are all
 * computed entirely in the browser, no backend involved at all. Everything below is a
 * faithful port of what used to live in `backEnd/src/games/Buffalo777/engine.ts`, using the
 * exact same tier weights/payout multipliers that previously came from
 * `backEnd/src/services/paytableConfig.ts`'s `DEFAULT_CONFIGS["buffalo-777"]` (the live odds —
 * `REFERENCE_PAYTABLE` below is/was the *display* table only). Kept as the same exported
 * function names/signatures as the old network calls (`spinRequest`, `getBuffalo777Config`) so
 * `Buffalo777Game.tsx` didn't need to change how it calls them — they just resolve locally now,
 * on the same tick, instead of over the network.
 */

export type BuffaloSymbol =
  | "TEN"
  | "JACK"
  | "QUEEN"
  | "KING"
  | "ACE"
  | "BULL"
  | "SINGLE_BAR"
  | "DOUBLE_BAR"
  | "TRIPLE_BAR"
  | "MONEY_BAG"
  | "COIN";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  symbol: BuffaloSymbol | "ANY_BAR";
  payout: number;
}

export interface SpinResponse {
  reels: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol][];
  lineSymbols: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol];
  winTierKey: string | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
}

export interface Buffalo777ConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  betLevels: number[];
}

export type Buffalo777TierKey =
  | "loss"
  | "ten"
  | "jack"
  | "queen"
  | "king"
  | "ace"
  | "bull"
  | "anyBar"
  | "singleBar"
  | "doubleBar"
  | "tripleBar"
  | "moneyBag"
  | "coin";

export interface Buffalo777TierRow {
  key: Buffalo777TierKey;
  frequencyPercent: number;
  payoutMultiplier: number | null;
  celebration: WinTierName | null;
}

export interface Buffalo777RtpConfig {
  targetRtpPercent: number;
  tiers: Buffalo777TierRow[];
}

const DISPLAY_SYMBOLS: BuffaloSymbol[] = [
  "TEN",
  "JACK",
  "QUEEN",
  "KING",
  "ACE",
  "BULL",
  "SINGLE_BAR",
  "DOUBLE_BAR",
  "TRIPLE_BAR",
  "MONEY_BAG",
  "COIN",
];

const BAR_SYMBOLS: ReadonlySet<BuffaloSymbol> = new Set(["SINGLE_BAR", "DOUBLE_BAR", "TRIPLE_BAR"]);

const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];

type TierKey = Buffalo777TierKey;
type TierRow = Buffalo777TierRow;

/** Ported verbatim from paytableConfig.ts's DEFAULT_CONFIGS["buffalo-777"] — the actual live
 * odds this game shipped with (not the cosmetic REFERENCE_PAYTABLE below), frequencyPercent
 * summing to exactly 100 at a ~92.98% RTP. This is the fixed "shape"/relative rarity of every
 * tier — used only to build the very first default config (see getBuffaloDefaultConfig) the
 * first time the admin page loads; after that, the admin's own saved tiers are the live odds,
 * edited directly rather than always re-derived from this table. */
const BASE_TIERS: TierRow[] = [
  { key: "loss", frequencyPercent: 72.6187, payoutMultiplier: null, celebration: null },
  { key: "ten", frequencyPercent: 10.0904, payoutMultiplier: 1, celebration: null },
  { key: "jack", frequencyPercent: 6.7269, payoutMultiplier: 2, celebration: null },
  { key: "queen", frequencyPercent: 4.4846, payoutMultiplier: 3, celebration: null },
  { key: "king", frequencyPercent: 2.8029, payoutMultiplier: 4, celebration: null },
  { key: "ace", frequencyPercent: 1.5696, payoutMultiplier: 5, celebration: null },
  { key: "bull", frequencyPercent: 0.7848, payoutMultiplier: 10, celebration: null },
  { key: "anyBar", frequencyPercent: 0.6166, payoutMultiplier: 15, celebration: null },
  { key: "singleBar", frequencyPercent: 0.2018, payoutMultiplier: 50, celebration: "BIG WIN" },
  { key: "doubleBar", frequencyPercent: 0.0729, payoutMultiplier: 75, celebration: "BIG WIN" },
  { key: "tripleBar", frequencyPercent: 0.0247, payoutMultiplier: 100, celebration: "MEGA WIN" },
  { key: "moneyBag", frequencyPercent: 0.005, payoutMultiplier: 250, celebration: "MEGA WIN" },
  { key: "coin", frequencyPercent: 0.0011, payoutMultiplier: 500, celebration: "JACKPOT" },
];

// --- Admin-adjustable RTP control (fully client-side — no backend for this game) ---
//
// Mirrors the exact data model AdminRtpPage.tsx uses for every other game's (backend-driven)
// PaytableConfig — a `targetRtpPercent` plus a `tiers` array the admin edits directly
// (frequency % and payout multiplier per row) — except this one is persisted to localStorage
// instead of POSTed to the server. The saved `tiers` themselves ARE the live odds `rollTier()`
// draws from (see below) — there's no separate "base table" involved once something's been
// saved; BASE_TIERS below is only ever used to build the very first default.

const RTP_CONFIG_STORAGE_KEY = "texas-slots-buffalo777-rtp-config";
export const DEFAULT_BUFFALO_TARGET_RTP_PERCENT = 60;

/** Sum of (frequencyPercent/100 * payoutMultiplier) across every tier, as a percent — the
 * same formula AdminRtpPage.tsx's computeRtpPercent uses for every other game. */
export function computeBuffaloRtpPercent(tiers: TierRow[]): number {
  return (
    tiers.reduce((sum, t) => (t.payoutMultiplier !== null ? sum + (t.frequencyPercent / 100) * t.payoutMultiplier : sum), 0) *
    100
  );
}

/** Rescales `tiers` to land on `targetRtpPercent` — identical technique to AdminRtpPage.tsx's
 * own `rescaleLineTiers`: every winning tier's frequency is multiplied by `scale` (clamped at
 * 0, payout multipliers left untouched), then `loss` absorbs whatever's left so frequencies
 * still sum to exactly 100%. Callers pass `targetRtpPercent / computeBuffaloRtpPercent(tiers)`
 * as the effective scale, same as the admin page does. */
export function rescaleBuffaloTiers(tiers: TierRow[], scale: number): TierRow[] {
  const scaled = tiers.map((t) =>
    t.key === "loss" ? t : { ...t, frequencyPercent: Math.max(0, t.frequencyPercent * scale) }
  );
  const nonLossSum = scaled.reduce((sum, t) => (t.key === "loss" ? sum : sum + t.frequencyPercent), 0);
  return scaled.map((t) => (t.key === "loss" ? { ...t, frequencyPercent: Math.max(0, 100 - nonLossSum) } : t));
}

/** The fresh, first-time-ever default config — BASE_TIERS' shape rescaled to the 60% default
 * target. Used both as the fallback when nothing's saved yet and by the admin page's "Reset to
 * default" action. */
export function getBuffaloDefaultConfig(): Buffalo777RtpConfig {
  const baseRtp = computeBuffaloRtpPercent(BASE_TIERS);
  const scale = baseRtp > 0 ? DEFAULT_BUFFALO_TARGET_RTP_PERCENT / baseRtp : 0;
  return { targetRtpPercent: DEFAULT_BUFFALO_TARGET_RTP_PERCENT, tiers: rescaleBuffaloTiers(BASE_TIERS, scale) };
}

function isValidTierRow(row: unknown): row is TierRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    typeof r.frequencyPercent === "number" &&
    (r.payoutMultiplier === null || typeof r.payoutMultiplier === "number") &&
    (r.celebration === null || typeof r.celebration === "string")
  );
}

/** Reads the admin's saved RTP config from localStorage — falls back to the fresh default if
 * nothing's been saved yet, the stored value is corrupt/malformed, or localStorage itself is
 * unavailable (private browsing, etc.). */
export function getBuffaloRtpConfig(): Buffalo777RtpConfig {
  try {
    const raw = localStorage.getItem(RTP_CONFIG_STORAGE_KEY);
    if (raw === null) return getBuffaloDefaultConfig();
    const parsed = JSON.parse(raw) as Partial<Buffalo777RtpConfig>;
    if (
      typeof parsed.targetRtpPercent !== "number" ||
      !Array.isArray(parsed.tiers) ||
      parsed.tiers.length === 0 ||
      !parsed.tiers.every(isValidTierRow)
    ) {
      return getBuffaloDefaultConfig();
    }
    return { targetRtpPercent: parsed.targetRtpPercent, tiers: parsed.tiers };
  } catch {
    return getBuffaloDefaultConfig();
  }
}

/** Persists a new RTP config — takes effect on the very next spin (rollTier() re-reads this
 * on every call, see below), no reload or cross-tab wiring needed. Silently no-ops if
 * localStorage isn't available. */
export function setBuffaloRtpConfig(config: Buffalo777RtpConfig): void {
  try {
    localStorage.setItem(RTP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private browsing / storage disabled — setting just won't persist */
  }
}

/** Every win tier maps 1:1 to a single symbol/combo — anyBar has no fixed symbol (it's a
 * mixed combination, handled separately in buildLineForTier/evaluateLine). */
const TIER_SYMBOL: Partial<Record<TierKey, BuffaloSymbol>> = {
  ten: "TEN",
  jack: "JACK",
  queen: "QUEEN",
  king: "KING",
  ace: "ACE",
  bull: "BULL",
  singleBar: "SINGLE_BAR",
  doubleBar: "DOUBLE_BAR",
  tripleBar: "TRIPLE_BAR",
  moneyBag: "MONEY_BAG",
  coin: "COIN",
};

const SYMBOL_TIER: Partial<Record<BuffaloSymbol, TierKey>> = Object.fromEntries(
  (Object.entries(TIER_SYMBOL) as [TierKey, BuffaloSymbol][]).map(([tier, symbol]) => [symbol, tier])
);

/** Cosmetic/display paytable for the paytable modal — payout amounts here already match each
 * tier's payoutMultiplier above, so this stays valid as pure display data. */
const REFERENCE_PAYTABLE: PayoutRow[] = [
  { symbol: "COIN", payout: 500 },
  { symbol: "MONEY_BAG", payout: 250 },
  { symbol: "TRIPLE_BAR", payout: 100 },
  { symbol: "DOUBLE_BAR", payout: 75 },
  { symbol: "SINGLE_BAR", payout: 50 },
  { symbol: "ANY_BAR", payout: 15 },
  { symbol: "BULL", payout: 10 },
  { symbol: "ACE", payout: 5 },
  { symbol: "KING", payout: 4 },
  { symbol: "QUEEN", payout: 3 },
  { symbol: "JACK", payout: 2 },
  { symbol: "TEN", payout: 1 },
];

function randomSymbol(): BuffaloSymbol {
  return DISPLAY_SYMBOLS[Math.floor(Math.random() * DISPLAY_SYMBOLS.length)];
}

function randomBar(): BuffaloSymbol {
  const bars = [...BAR_SYMBOLS];
  return bars[Math.floor(Math.random() * bars.length)];
}

/** Classifies a 3-symbol line into the tier it satisfies, if any — used only as a
 * rejection-sampling guard for synthesizing a genuine "loss" line. */
function evaluateLine(line: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol]): TierKey | null {
  if (line[0] === line[1] && line[1] === line[2]) {
    return SYMBOL_TIER[line[0]] ?? null;
  }
  if (line.every((s) => BAR_SYMBOLS.has(s))) {
    return "anyBar";
  }
  return null;
}

/** A line that genuinely matches nothing — rejection-sampled, converges in 1-2 tries. */
function buildLossLine(): [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol] {
  let line: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol];
  do {
    line = [randomSymbol(), randomSymbol(), randomSymbol()];
  } while (evaluateLine(line) !== null);
  return line;
}

/** Constructs the exact 3-symbol line for a given tier. */
function buildLineForTier(tierKey: TierKey): [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol] {
  const symbol = TIER_SYMBOL[tierKey];
  if (symbol) return [symbol, symbol, symbol];

  if (tierKey === "anyBar") {
    let line: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol];
    do {
      line = [randomBar(), randomBar(), randomBar()];
    } while (line[0] === line[1] && line[1] === line[2]);
    return line;
  }

  return buildLossLine();
}

/** Weighted-random pick of one tier by frequencyPercent — reads the admin's saved tier table
 * fresh on every call, so a change saved from the "Buffalo RTP" admin tab takes effect on the
 * very next spin. */
function rollTier(): TierRow {
  const tiers = getBuffaloRtpConfig().tiers;
  const total = tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = Math.random() * total;
  for (const tier of tiers) {
    roll -= tier.frequencyPercent;
    if (roll < 0) return tier;
  }
  return tiers[tiers.length - 1];
}

/** Runs one local, outcome-first spin: the tier is decided first (by frequency), then the
 * payline and each reel's cosmetic above/below filler are built to match it exactly — same
 * algorithm as the old backend's engine.ts. Resolves on the same tick (no network involved),
 * kept as an async function purely so call sites can keep using `await spinRequest(...)`
 * unchanged. */
export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const tier = rollTier();
  const lineSymbols = tier.key === "loss" ? buildLossLine() : buildLineForTier(tier.key);
  const multiplier = tier.key === "loss" ? 0 : (tier.payoutMultiplier ?? 0);
  const winAmount = Math.round(multiplier * betAmount * 100) / 100;
  const reels = lineSymbols.map((mid) => [randomSymbol(), mid, randomSymbol()]) as [
    BuffaloSymbol,
    BuffaloSymbol,
    BuffaloSymbol,
  ][];

  return {
    reels,
    lineSymbols,
    winTierKey: tier.key === "loss" ? null : tier.key,
    multiplier,
    winAmount,
    tier: tier.key === "loss" ? null : tier.celebration,
  };
}

export async function getBuffalo777Config(): Promise<Buffalo777ConfigResponse> {
  return {
    meta: {
      id: "buffalo-777",
      name: "Buffalo 777",
      description: "Classic 3-reel, single-payline slot",
      minBet: BET_LEVELS[0],
      maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    },
    paytable: REFERENCE_PAYTABLE,
    betLevels: BET_LEVELS,
  };
}
