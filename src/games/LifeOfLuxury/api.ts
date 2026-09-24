/**
 * Life of Luxury's RNG, paytable, and balance are all computed entirely in the browser — RTP and
 * odds are configured client-side (see the RTP control below) and every spin resolves locally, on
 * the same tick, instead of over the network. Everything below (other than `logSpinResult`) is a
 * faithful port of what used to live in `backEnd/src/games/LifeOfLuxury/{config,winCalc,engine}.ts`
 * and `backEnd/src/games/LifeOfLuxury/routes.ts`'s free-spin-round bookkeeping, using the exact
 * same tier weights/symbol payouts/scatter rules that previously came from
 * `backEnd/src/services/paytableConfig.ts`'s `DEFAULT_CONFIGS["life-of-luxury"]`. Kept as the same
 * exported function names/signatures as the old network calls (`getLifeOfLuxuryConfig`) so
 * `LifeOfLuxuryGame.tsx` didn't need type changes — `spinRequest` gains one new parameter
 * (`currentBalance`), the same shape SizzlingSevens' already-offline `spinRequest` uses, since this
 * game's `SpinResponse` (like Sizzling's, unlike Buffalo777's) already carries a `balance` field.
 *
 * The one exception is `logSpinResult`: a write-only, fire-and-forget call to a minimal backend
 * endpoint (`backEnd/src/games/LifeOfLuxury/routes.ts`) that just records the already-decided
 * result into the same `SpinHistory` collection every other game uses, so Life of Luxury spins
 * show up in the admin dashboard (Earnings, Player Detail, Live Feed) like every other game's. It
 * never influences gameplay — the spin itself is fully decided above before this is called.
 */

import { apiClient } from "../../api/client";

export type LifeOfLuxurySymbol =
  | "AEROPLANE"
  | "BOAT"
  | "CAR"
  | "RING"
  | "MONEY"
  | "WATCH"
  | "GOLD_BAR"
  | "SILVER_BAR"
  | "BRONZE_BAR"
  | "WILD"
  | "COIN";

/** grid[reelIndex][rowIndex] — row 0 = TOP, 1 = MIDDLE, 2 = BOTTOM. Every cell is always
 * filled (plain classic 5x3 grid). */
export type Grid = LifeOfLuxurySymbol[][];

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface LineWin {
  lineNumber: number;
  symbol: Exclude<LifeOfLuxurySymbol, "COIN" | "WILD">;
  count: 3 | 4 | 5;
  multiplier: number;
  finalWin: number;
  positions: [number, number][];
}

export interface ScatterResult {
  count: number;
  win: number;
  positions: [number, number][];
  triggered: boolean;
}

export interface SpinEvaluation {
  lineWins: LineWin[];
  scatter: ScatterResult;
  finalWin: number;
  winningPositions: [number, number][];
}

export interface SpinResponse {
  grid: Grid;
  evaluation: SpinEvaluation;
  winAmount: number;
  tier: WinTierName | null;
  /** Present only for a base (non-free) spin's Coin trigger — a coin during an already-active
   * free-spins round still pays its scatter cash prize but never re-awards more free spins. */
  freeSpinsAwarded: number | null;
  /** Present only on the free spin that finishes the round — "total win × wilds seen across the
   * round" bonus (see the module-level `activeRound` bookkeeping below). bonusWin is already
   * folded into `balance` above; totalWin is the round's pre-bonus sum for display. */
  freeSpinRoundResult: {
    totalWin: number;
    wildCount: number;
    multiplier: number;
    bonusWin: number;
    finalWin: number;
  } | null;
  balance: number;
  meta: { forced: boolean };
}

export interface SymbolPayoutRow {
  symbol: Exclude<LifeOfLuxurySymbol, "COIN" | "WILD">;
  x3: number;
  x4: number;
  x5: number;
}

export interface ScatterConfig {
  symbol: "COIN";
  triggerCount: number;
  /** Coin's own independent per-cell chance (0-100) — separate from the reel-strip weights. */
  chancePercent: number;
  x3: number;
  x4: number;
  x5: number;
  freeSpinsAwarded: number;
}

export interface LifeOfLuxuryConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  lineCount: number;
  betLevels: number[];
  minBet: number;
  maxBet: number;
  paylines: [number, number, number, number, number][];
  symbolPayouts: SymbolPayoutRow[];
  symbolWeights: Partial<Record<LifeOfLuxurySymbol, number>>;
  scatter: ScatterConfig;
}

// --- Game shape — ported verbatim from backEnd/src/games/LifeOfLuxury/config.ts -------------

type RegularSymbol = Exclude<LifeOfLuxurySymbol, "COIN" | "WILD">;

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

const WILD_SYMBOL: LifeOfLuxurySymbol = "WILD";
const SCATTER_SYMBOL: LifeOfLuxurySymbol = "COIN";

/** 0-indexed reels the wild is allowed to land on — reels 2/3/4 in player-facing (1-indexed)
 * terms, never reel 1 or reel 5. */
const WILD_ALLOWED_REELS: readonly number[] = [1, 2, 3];

const REEL_COUNT = 5;
const ROW_COUNT = 3;
const LINE_COUNT = 15;
const SCATTER_TRIGGER_COUNT = 3;

const BET_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];

/** The 15 fixed payline patterns — one row index (0=top/1=mid/2=bottom) per reel. */
const PAYLINES: [number, number, number, number, number][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [2, 1, 0, 1, 2],
  [0, 1, 2, 1, 0],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
  [1, 0, 1, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

// --- Admin-adjustable RTP control (fully client-side — no backend for this game) ------------
//
// Mirrors the exact data model Buffalo777's AdminBuffaloRtpPage.tsx uses (a `targetRtpPercent`
// plus admin-edited rows), adapted to this game's richer shape — weight (`tiers`) and payout
// (`symbolPayouts`) are two independent tables here, unlike Buffalo's single `TierRow`, which is
// also why (unlike Buffalo's page) there's no "auto-rescale to target" button: there's no single
// well-defined lever to scale (weights? payouts? both?), so Target RTP is a validated number the
// admin tunes toward manually while watching the live "Effective RTP" readout, same as they'd
// have to for any Save-blocked mismatch. Persisted to localStorage instead of the server; the
// saved config *is* the live odds `drawGrid`/`calculateSpinWin`/`celebrationTier` read below —
// there's no separate "base table" once something's been saved.

export interface LifeOfLuxuryRtpConfig {
  targetRtpPercent: number;
  /** 9 regular symbols + WILD, summing to 100% — reel-strip draw weight only. COIN is
   * deliberately not a row here: it's rolled as its own independent per-cell chance
   * (scatterRules.chancePercent), never a share of this table. */
  tiers: { key: LifeOfLuxurySymbol; frequencyPercent: number }[];
  symbolPayouts: Record<RegularSymbol, { x3: number; x4: number; x5: number }>;
  scatterRules: { chancePercent: number; x3: number; x4: number; x5: number; freeSpinsAwarded: number };
  amountThresholds: { bigWinMin: number; megaWinMin: number; jackpotMin: number };
}

const RTP_CONFIG_STORAGE_KEY = "texas-slots-lifeofluxury-rtp-config";
export const DEFAULT_LOL_TARGET_RTP_PERCENT = 90.33;

/** Ported verbatim from paytableConfig.ts's DEFAULT_CONFIGS["life-of-luxury"] — the actual live
 * weights this game shipped with, summing to exactly 100. */
const BASE_TIERS: { key: LifeOfLuxurySymbol; frequencyPercent: number }[] = [
  { key: "AEROPLANE", frequencyPercent: 0.4 },
  { key: "BOAT", frequencyPercent: 1.98 },
  { key: "CAR", frequencyPercent: 3.97 },
  { key: "RING", frequencyPercent: 9.92 },
  { key: "MONEY", frequencyPercent: 9.92 },
  { key: "WATCH", frequencyPercent: 13.22 },
  { key: "GOLD_BAR", frequencyPercent: 13.22 },
  { key: "SILVER_BAR", frequencyPercent: 16.53 },
  { key: "BRONZE_BAR", frequencyPercent: 19.84 },
  { key: "WILD", frequencyPercent: 11 },
];

const DEFAULT_SYMBOL_PAYOUTS: Record<RegularSymbol, { x3: number; x4: number; x5: number }> = {
  AEROPLANE: { x3: 2.7, x4: 26.97, x5: 269.69 },
  BOAT: { x3: 1.62, x4: 10.79, x5: 53.94 },
  CAR: { x3: 1.08, x4: 5.39, x5: 26.97 },
  RING: { x3: 0.81, x4: 4.05, x5: 10.79 },
  MONEY: { x3: 0.54, x4: 2.7, x5: 10.79 },
  WATCH: { x3: 0.54, x4: 1.62, x5: 8.09 },
  GOLD_BAR: { x3: 0.27, x4: 1.62, x5: 8.09 },
  SILVER_BAR: { x3: 0.27, x4: 1.08, x5: 6.47 },
  BRONZE_BAR: { x3: 0.27, x4: 1.08, x5: 5.39 },
};

const DEFAULT_SCATTER_RULES = { chancePercent: 3, x3: 0.37, x4: 2.79, x5: 18.57, freeSpinsAwarded: 10 };

const DEFAULT_THRESHOLDS = { bigWinMin: 100, megaWinMin: 200, jackpotMin: 1000 };

export function getLifeOfLuxuryDefaultConfig(): LifeOfLuxuryRtpConfig {
  return {
    targetRtpPercent: DEFAULT_LOL_TARGET_RTP_PERCENT,
    tiers: BASE_TIERS.map((t) => ({ ...t })),
    symbolPayouts: Object.fromEntries(
      Object.entries(DEFAULT_SYMBOL_PAYOUTS).map(([k, v]) => [k, { ...v }])
    ) as Record<RegularSymbol, { x3: number; x4: number; x5: number }>,
    scatterRules: { ...DEFAULT_SCATTER_RULES },
    amountThresholds: { ...DEFAULT_THRESHOLDS },
  };
}

function isValidConfig(value: unknown): value is LifeOfLuxuryRtpConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.targetRtpPercent === "number" &&
    Array.isArray(v.tiers) &&
    v.tiers.length > 0 &&
    typeof v.symbolPayouts === "object" &&
    v.symbolPayouts !== null &&
    typeof v.scatterRules === "object" &&
    v.scatterRules !== null &&
    typeof v.amountThresholds === "object" &&
    v.amountThresholds !== null
  );
}

/** Reads the admin's saved RTP config from localStorage — falls back to the fresh default if
 * nothing's been saved yet, the stored value is corrupt/malformed, or localStorage itself is
 * unavailable (private browsing, etc.). */
export function getLifeOfLuxuryRtpConfig(): LifeOfLuxuryRtpConfig {
  try {
    const raw = localStorage.getItem(RTP_CONFIG_STORAGE_KEY);
    if (raw === null) return getLifeOfLuxuryDefaultConfig();
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConfig(parsed)) return getLifeOfLuxuryDefaultConfig();
    return parsed;
  } catch {
    return getLifeOfLuxuryDefaultConfig();
  }
}

/** Persists a new RTP config — takes effect on the very next spin (spinRequest re-reads this on
 * every call, see below), no reload or cross-tab wiring needed. Silently no-ops if localStorage
 * isn't available. */
export function setLifeOfLuxuryRtpConfig(config: LifeOfLuxuryRtpConfig): void {
  try {
    localStorage.setItem(RTP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private browsing / storage disabled — setting just won't persist */
  }
}

function nChooseK(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * Closed-form, not simulated — ported verbatim from the backend's computeLifeOfLuxuryRtpPercent
 * (services/paytableConfig.ts), with one addition: a `wildBonusEV` term for the free-spin round's
 * end-of-round "totalWin × wildCount" bonus, which the original formula omitted entirely (it only
 * ever accounted for the average per-spin win during free spins, never the round-end bonus on top
 * of it). Every one of the 15 cells independently rolls: is this COIN (its own admin-configured
 * chance, NOT a share of `tiers`)? If not, draw from `tiers` (9 payers + WILD, WILD confined to
 * reels 2-4 — reels 1/5 draw only the 9 real symbols, renormalized). Because every line pays the
 * full bet (no per-line split) and every line shares the same reel-index structure, the total is
 * LINE_COUNT times one line's own expectation:
 *
 *   pOuter_s  = weight_s / (100 - wildWeight)      — symbol s's share on reels 1/5 (no WILD there)
 *   pMiddle_s = (weight_s + wildWeight) / 100       — symbol s's match share on reels 2-4
 *   m0(s)=m4(s) = (1-coinChance) * pOuter_s          — match prob at reel 1 / reel 5
 *   m1(s)=m2(s)=m3(s) = (1-coinChance) * pMiddle_s   — match prob at reels 2/3/4
 *   lineRTP = LINE_COUNT * sum over regular symbols s of
 *               [ m0*m1*m2*(1-m3)*x3 + m0*m1*m2*m3*(1-m4)*x4 + m0*m1*m2*m3*m4*x5 ]
 *   scatterRTP = sum_{k=3..15} C(15,k) coinChance^k (1-coinChance)^(15-k) * mult(k)
 *   freeSpinEV = triggerProb * freeSpinsAwarded * (lineRTP + scatterRTP) — average per-spin win
 *                across the round, exact (no retriggering to compound)
 *
 *   wildBonusEV (new): the round-end bonus is bonusWin = totalWin × wildCount (see spinRequest
 *   below), where totalWin and wildCount both accumulate across freeSpinsAwarded free spins.
 *   Treating them as independent (a first-order approximation — in reality a spin with more
 *   wilds also has slightly better odds of winning, so this modestly understates the true EV,
 *   in the same spirit as this file's other documented first-order approximations elsewhere in
 *   this codebase):
 *     expectedWildsPerSpin = 9 * (1-coinChance) * (wildWeight/100)   — 9 = the 3 middle reels x 3 rows,
 *                                                                        the only cells WILD can occupy
 *     expectedWildCountPerRound = freeSpinsAwarded * expectedWildsPerSpin
 *     expectedTotalWinPerRound  = freeSpinsAwarded * (lineRTP + scatterRTP)
 *     expectedBonusWinPerRound ~= expectedTotalWinPerRound * expectedWildCountPerRound
 *     wildBonusEV = triggerProb * expectedBonusWinPerRound
 */
export function computeLifeOfLuxuryRtpPercent(config: LifeOfLuxuryRtpConfig): number {
  const weightOf = (symbol: LifeOfLuxurySymbol): number => config.tiers.find((t) => t.key === symbol)?.frequencyPercent ?? 0;
  const payoutOf = (symbol: RegularSymbol) => config.symbolPayouts[symbol];

  const scatterRules = config.scatterRules;
  const coinChance = scatterRules.chancePercent / 100;
  const wildWeight = weightOf(WILD_SYMBOL);
  const outerDenom = 100 - wildWeight;
  const isMiddle = (reelIndex: number) => WILD_ALLOWED_REELS.includes(reelIndex);

  let perLineSum = 0;
  for (const symbol of REGULAR_SYMBOLS) {
    const weight = weightOf(symbol);
    const pOuter = outerDenom > 0 ? weight / outerDenom : 0;
    const pMiddle = (weight + wildWeight) / 100;
    const matchAt = (reelIndex: number) => (1 - coinChance) * (isMiddle(reelIndex) ? pMiddle : pOuter);
    const m = [0, 1, 2, 3, 4].map(matchAt);

    const payout = payoutOf(symbol);
    const P3 = m[0] * m[1] * m[2] * (1 - m[3]);
    const P4 = m[0] * m[1] * m[2] * m[3] * (1 - m[4]);
    const P5 = m[0] * m[1] * m[2] * m[3] * m[4];
    perLineSum += P3 * payout.x3 + P4 * payout.x4 + P5 * payout.x5;
  }
  const lineRTP = LINE_COUNT * perLineSum;

  const cellCount = REEL_COUNT * ROW_COUNT;
  let scatterRTP = 0;
  let triggerProb = 0;
  for (let k = SCATTER_TRIGGER_COUNT; k <= cellCount; k++) {
    const prob = nChooseK(cellCount, k) * Math.pow(coinChance, k) * Math.pow(1 - coinChance, cellCount - k);
    const multiplier = k === 3 ? scatterRules.x3 : k === 4 ? scatterRules.x4 : scatterRules.x5;
    scatterRTP += prob * multiplier;
    triggerProb += prob;
  }

  const freeSpinEV = triggerProb * scatterRules.freeSpinsAwarded * (lineRTP + scatterRTP);

  const expectedWildsPerSpin = 9 * (1 - coinChance) * (wildWeight / 100);
  const expectedWildCountPerRound = scatterRules.freeSpinsAwarded * expectedWildsPerSpin;
  const expectedTotalWinPerRound = scatterRules.freeSpinsAwarded * (lineRTP + scatterRTP);
  const expectedBonusWinPerRound = expectedTotalWinPerRound * expectedWildCountPerRound;
  const wildBonusEV = triggerProb * expectedBonusWinPerRound;

  return (lineRTP + scatterRTP + freeSpinEV + wildBonusEV) * 100;
}

// --- Win-calc — ported verbatim from backEnd/src/games/LifeOfLuxury/winCalc.ts --------------

type SymbolPayoutTable = Record<RegularSymbol, { x3: number; x4: number; x5: number }>;

function symbolsOnLine(grid: Grid, line: readonly [number, number, number, number, number]): LifeOfLuxurySymbol[] {
  return line.map((row, reel) => grid[reel][row]);
}

/**
 * Evaluates a single payline: the longest run of one regular symbol starting at reel 1
 * (left-to-right), minimum 3, with WILD substituting for whatever symbol the run started with.
 * COIN (the scatter) breaks a run exactly like a mismatched symbol would.
 */
function evaluatePayline(
  grid: Grid,
  line: readonly [number, number, number, number, number],
  lineNumber: number,
  paytable: SymbolPayoutTable,
  bet: number
): LineWin | null {
  const symbols = symbolsOnLine(grid, line);
  const first = symbols[0];
  if (first === SCATTER_SYMBOL || first === WILD_SYMBOL) return null;

  let count = 1;
  while (count < symbols.length && (symbols[count] === first || symbols[count] === WILD_SYMBOL)) count++;
  if (count < 3) return null;

  const matched = first as RegularSymbol;
  const runLength = count as 3 | 4 | 5;
  const multiplier = runLength === 3 ? paytable[matched].x3 : runLength === 4 ? paytable[matched].x4 : paytable[matched].x5;
  const positions: [number, number][] = line.slice(0, runLength).map((row, reel) => [reel, row]);

  return {
    lineNumber,
    symbol: matched,
    count: runLength,
    multiplier,
    finalWin: multiplier * bet,
    positions,
  };
}

function evaluateAllPaylines(grid: Grid, paytable: SymbolPayoutTable, bet: number): LineWin[] {
  return PAYLINES.map((line, i) => evaluatePayline(grid, line, i + 1, paytable, bet)).filter(
    (w): w is LineWin => w !== null
  );
}

/** COIN can land anywhere on the 5x3 grid, doesn't need a payline. 3+ anywhere pays a multiple of
 * the bet and — on a base spin only — triggers free spins. "5" means 5 or more. */
function calculateScatterWin(grid: Grid, bet: number, scatterRules: LifeOfLuxuryRtpConfig["scatterRules"]): ScatterResult {
  const positions: [number, number][] = [];
  grid.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (symbol === SCATTER_SYMBOL) positions.push([reelIndex, rowIndex]);
    });
  });

  const count = positions.length;
  if (count < SCATTER_TRIGGER_COUNT) return { count, win: 0, positions, triggered: false };

  const multiplier = count === 3 ? scatterRules.x3 : count === 4 ? scatterRules.x4 : scatterRules.x5;
  return { count, win: multiplier * bet, positions, triggered: true };
}

function calculateSpinWin(
  grid: Grid,
  paytable: SymbolPayoutTable,
  bet: number,
  scatterRules: LifeOfLuxuryRtpConfig["scatterRules"]
): SpinEvaluation {
  const lineWins = evaluateAllPaylines(grid, paytable, bet);
  const scatter = calculateScatterWin(grid, bet, scatterRules);

  const lineWinTotal = lineWins.reduce((sum, w) => sum + w.finalWin, 0);
  const finalWin = lineWinTotal + scatter.win;

  const winningPositions: [number, number][] = [];
  for (const w of lineWins) winningPositions.push(...w.positions);

  return { lineWins, scatter, finalWin, winningPositions };
}

// --- Grid drawing — ported from backEnd/src/games/LifeOfLuxury/engine.ts --------------------

/** Weighted-random symbol pick from the admin-configured `tiers` table — reads the admin's saved
 * tier table fresh on every call, so a change saved from the RTP admin tab takes effect on the
 * very next spin. */
function weightedSymbol(tiers: { key: LifeOfLuxurySymbol; frequencyPercent: number }[]): LifeOfLuxurySymbol {
  const total = tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = Math.random() * total;
  for (const tier of tiers) {
    roll -= tier.frequencyPercent;
    if (roll < 0) return tier.key;
  }
  return tiers[tiers.length - 1].key;
}

/** Every cell independently rolls: is this COIN (its own admin-configured chance)? If not, draw
 * from the 10-row weight table (9 payers + WILD) — except on a reel outside WILD_ALLOWED_REELS,
 * where WILD's row is excluded first (the remaining 9 payers' proportions renormalize
 * automatically), so WILD can never land there. */
function drawGrid(tiers: { key: LifeOfLuxurySymbol; frequencyPercent: number }[], scatterChancePercent: number): Grid {
  const tiersNoWild = tiers.filter((t) => t.key !== "WILD");
  const grid: Grid = [];
  for (let reel = 0; reel < REEL_COUNT; reel++) {
    const reelTiers = WILD_ALLOWED_REELS.includes(reel) ? tiers : tiersNoWild;
    const column: LifeOfLuxurySymbol[] = [];
    for (let row = 0; row < ROW_COUNT; row++) {
      column.push(Math.random() * 100 < scatterChancePercent ? SCATTER_SYMBOL : weightedSymbol(reelTiers));
    }
    grid.push(column);
  }
  return grid;
}

/** Bet-multiple cutoffs, checked JACKPOT -> MEGA -> BIG (highest tier whose threshold is met) —
 * mirrors backEnd/src/gameTiers.ts's getWinTier. */
function celebrationTier(finalWin: number, bet: number, thresholds: LifeOfLuxuryRtpConfig["amountThresholds"]): WinTierName | null {
  const multiple = bet > 0 ? finalWin / bet : 0;
  if (multiple >= thresholds.jackpotMin) return "JACKPOT";
  if (multiple >= thresholds.megaWinMin) return "MEGA WIN";
  if (multiple >= thresholds.bigWinMin) return "BIG WIN";
  return null;
}

// --- Free-spin round + spin resolution -------------------------------------------------------

/** Mirrors the old backend's `FreeSpinRound` Mongo doc — module-level so it survives between
 * spinRequest calls within a round without threading extra state through LifeOfLuxuryGame.tsx's
 * own call site. Wiped on a page reload (no localStorage backing) — an abandoned round's
 * remaining free spins are lost on refresh instead of resuming, the same category of behavior
 * change as balance no longer persisting across refresh once a game goes fully client-side. */
let activeRound: { remaining: number; wildCount: number; totalWin: number } | null = null;

/** Runs one local, server-equivalent spin. `isFreeSpin` is only a hint — like the old backend
 * ("authoritative, not the client's own isFreeSpin flag"), this derives the real answer from its
 * own `activeRound` state so the module's round bookkeeping and the component's React state can
 * never drift apart (e.g. if a previous call threw mid-round). `currentBalance` is the player's
 * balance right before this spin — the new balance (bet deducted, wins/bonus credited) is
 * computed here and returned, mirroring SizzlingSevens' already-offline `spinRequest`. */
export async function spinRequest(bet: number, isFreeSpin: boolean, currentBalance: number): Promise<SpinResponse> {
  const actuallyFreeSpin = activeRound !== null && activeRound.remaining > 0;
  if (isFreeSpin !== actuallyFreeSpin) {
    console.warn(
      "LifeOfLuxury spinRequest: isFreeSpin argument disagreed with local round state — using local state as authoritative."
    );
  }

  const config = getLifeOfLuxuryRtpConfig();
  const grid = drawGrid(config.tiers, config.scatterRules.chancePercent);
  const evaluation = calculateSpinWin(grid, config.symbolPayouts, bet, config.scatterRules);
  // No retriggering: a coin scatter during an already-active free-spins round still pays its
  // cash prize (already folded into evaluation.finalWin) but never awards more free spins.
  const freeSpinsAwarded = evaluation.scatter.triggered && !actuallyFreeSpin ? config.scatterRules.freeSpinsAwarded : null;
  const tier = celebrationTier(evaluation.finalWin, bet, config.amountThresholds);

  // End-of-round wild bonus: total free-spin win × (wilds seen across the round + 1). Only wilds
  // landing *during* the round count, never the triggering base spin's own grid. bonusWin is
  // credited on top of this spin's own winAmount, which (like every other free spin in the
  // round) is still paid out immediately below.
  let bonusWin = 0;
  let freeSpinRoundResult: SpinResponse["freeSpinRoundResult"] = null;

  if (actuallyFreeSpin && activeRound) {
    const wildCount = grid.reduce((sum, reel) => sum + reel.filter((s) => s === WILD_SYMBOL).length, 0);
    activeRound.wildCount += wildCount;
    activeRound.totalWin += evaluation.finalWin;
    activeRound.remaining -= 1;

    if (activeRound.remaining <= 0) {
      const multiplier = activeRound.wildCount + 1;
      bonusWin = Math.round(activeRound.totalWin * activeRound.wildCount * 100) / 100;
      freeSpinRoundResult = {
        totalWin: activeRound.totalWin,
        wildCount: activeRound.wildCount,
        multiplier,
        bonusWin,
        finalWin: Math.round((activeRound.totalWin + bonusWin) * 100) / 100,
      };
      activeRound = null;
    }
  }

  const stakedAmount = actuallyFreeSpin ? 0 : bet;
  const balance = Math.round((currentBalance - stakedAmount + evaluation.finalWin + bonusWin) * 100) / 100;

  // A base spin's own Coin trigger starts the round others will play through.
  if (!actuallyFreeSpin && freeSpinsAwarded) {
    activeRound = { remaining: freeSpinsAwarded, wildCount: 0, totalWin: 0 };
  }

  return {
    grid,
    evaluation,
    winAmount: evaluation.finalWin,
    tier,
    freeSpinsAwarded,
    freeSpinRoundResult,
    balance,
    meta: { forced: false },
  };
}

export async function getLifeOfLuxuryConfig(): Promise<LifeOfLuxuryConfigResponse> {
  const config = getLifeOfLuxuryRtpConfig();
  const symbolPayouts: SymbolPayoutRow[] = REGULAR_SYMBOLS.map((symbol) => ({
    symbol,
    ...config.symbolPayouts[symbol],
  }));
  const symbolWeights: Partial<Record<LifeOfLuxurySymbol, number>> = Object.fromEntries(
    config.tiers.map((t) => [t.key, t.frequencyPercent])
  );

  return {
    meta: {
      id: "life-of-luxury",
      name: "Life of Luxury",
      description: "Classic 5-reel, 15-line luxury-themed slot with a Coin scatter and free spins",
      minBet: BET_LEVELS[0],
      maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    },
    lineCount: LINE_COUNT,
    betLevels: BET_LEVELS,
    minBet: BET_LEVELS[0],
    maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    paylines: PAYLINES,
    symbolPayouts,
    symbolWeights,
    scatter: { symbol: "COIN", triggerCount: SCATTER_TRIGGER_COUNT, ...config.scatterRules },
  };
}

/** Fire-and-forget: records a spin that already happened (locally) into the backend's
 * SpinHistory, purely for admin record-keeping — see the module doc comment above. */
export async function logSpinResult(params: {
  betAmount: number;
  winAmount: number;
  reelSymbols: LifeOfLuxurySymbol[][];
  balanceAfter: number;
  tier: WinTierName | null;
}): Promise<void> {
  await apiClient.post("/api/games/life-of-luxury/spin-log", params);
}
