/**
 * Buffalo777 is a fully offline, client-side test game — there is no backend for it.
 * Everything below is a faithful port of what used to live in `backEnd/src/games/Buffalo777/
 * engine.ts`, using the exact same tier weights/payout multipliers that previously came from
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

type TierKey =
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

interface TierRow {
  key: TierKey;
  frequencyPercent: number;
  payoutMultiplier: number | null;
  celebration: WinTierName | null;
}

/** Ported verbatim from paytableConfig.ts's DEFAULT_CONFIGS["buffalo-777"] — the actual live
 * odds (not the cosmetic REFERENCE_PAYTABLE below). frequencyPercent sums to exactly 100;
 * targetRtpPercent ≈ 92.98%. */
const TIERS: TierRow[] = [
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

/** Weighted-random pick of one tier by frequencyPercent. */
function rollTier(): TierRow {
  const total = TIERS.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = Math.random() * total;
  for (const tier of TIERS) {
    roll -= tier.frequencyPercent;
    if (roll < 0) return tier;
  }
  return TIERS[TIERS.length - 1];
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
