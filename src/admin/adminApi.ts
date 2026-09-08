import { apiClient } from "../api/client";
import { UserRole } from "../api/authApi";

export interface AdminUser {
  _id: string;
  email: string | null;
  username: string;
  /** Current plaintext password, decrypted server-side for admin viewing. Null for accounts
   * created before this feature shipped (their password was only ever hashed, never stored). */
  password: string | null;
  balance: number;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  disabled: boolean;
  deletedAt: string | null;
  createdAt: string;
  online?: boolean;
}

export interface BalanceAdjustmentEntry {
  _id: string;
  userId: string;
  previousBalance: number;
  newBalance: number;
  delta: number;
  createdBy: string;
  createdAt: string;
}

export interface SpinEntry {
  _id: string;
  userId: string | { _id: string; username: string };
  gameId: string;
  betAmount: number;
  winAmount: number;
  reelSymbols: string[][];
  balanceAfter: number;
  tier: string | null;
  forced: boolean;
  createdAt: string;
}

export type ForcedOutcomeStatus = "pending" | "consumed" | "cancelled";

export interface ForcedOutcomeEntry {
  _id: string;
  userId: string;
  gameId: string;
  targetTier: string;
  status: ForcedOutcomeStatus;
  createdBy: string;
  consumedAt: string | null;
  consumedSpinId: string | null;
  createdAt: string;
}

export interface AdminStats {
  totalPlayers: number;
  onlineNow: number;
  totalBalance: number;
  today: { spinCount: number; wagered: number; won: number };
  pendingForcedOutcomes: number;
}

export type EarningsRange = "today" | "week" | "month" | "year";

export interface EarningsResponse {
  range: EarningsRange;
  series: Array<{ bucket: string; wagered: number; totalWin: number; net: number; spinCount: number }>;
  summary: {
    wagered: number;
    paidOut: number;
    net: number;
    holdPercent: number;
    rtpActual: number;
    spinCount: number;
  };
}

export type TierKey =
  | "loss"
  | "freeSpin"
  | "simpleWin"
  | "bigWin"
  | "megaWin"
  | "jackpot"
  | "zeroRespin"
  // Buffalo 777 only — each maps 1:1 to a specific symbol/combo, so payouts stay exact
  // per-symbol rather than collapsed into the shared buckets above.
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
  | "coin"
  // Crazy 777 only — line-side tiers (reels 1-3): exact 3-of-a-kind (share singleBar/
  // doubleBar/loss above; these 3 are new) plus 3 mixed-family "ANY" tiers.
  | "sevenLow"
  | "sevenMid"
  | "sevenHigh"
  | "anySeven"
  | "anyGlobal"
  // Crazy 777 only — special-reel-side tiers (reel 4), an independent weighted table
  // stored in `specialReelTiers` below.
  | "multiplier2x"
  | "multiplier5x"
  | "multiplier10x"
  | "dollarPlus"
  | "doubleDollarPlus"
  | "respin"
  | "specialEmpty"
  // 5x Rewind only — line tiers (stored in `tiers`, same as every other game): loss + each
  // exact 3-of-a-kind + the 3 "ANY-3 mixed" categories.
  | "whiteBar"
  | "sevenBar"
  | "redBar"
  | "purpleBar"
  | "red7"
  | "purple7"
  | "blue7"
  | "any3BarOnly"
  | "any3BarWithSevenBar"
  | "any3Sevens"
  // 5x Rewind only — coin-overlay tiers (stored in `specialReelTiers`, reusing Crazy 777's
  // second-table field, but rolled independently for *each* of the 3 reels instead of once
  // per spin — see backEnd/src/games/FiveXRewind/engine.ts).
  | "noCoin"
  | "coin2x"
  | "coin3x"
  | "coin4x"
  | "coin5x"
  // Sizzling 7s only — one row per reel symbol (stored in `tiers`), used as the reel-strip
  // weight table: frequencyPercent is that symbol's draw weight (all 7 sum to 100%),
  // payoutMultiplier is its 3-matching payout (WILD_2X's row holds only the 3-Wild pure
  // payout). See backEnd/src/games/SizzlingSevens/config.ts.
  | "RED_7"
  | "BLUE_7"
  | "BAR"
  | "DOUBLE_BAR"
  | "TRIPLE_BAR"
  | "WILD_2X"
  | "BONUS";

export interface TierRow {
  key: TierKey;
  /** Percent chance of this outcome on a single spin — all rows sum to 100. */
  frequencyPercent: number;
  /** Multiplier of bet credited when this tier hits. null for "loss" and "freeSpin". For
   * "zeroRespin" (Cash Machine) this is only an *estimated average* for the RTP preview — the
   * real payout is whatever value the respin reveals (see AmountThresholds.zeroRespinMin/Max). */
  payoutMultiplier: number | null;
  /** ShamrockSpin win-tiers only — used instead of payoutMultiplier during a free-spin bonus round. */
  freeSpinPayoutMultiplier: number | null;
}

export interface AmountThresholds {
  simpleWinMax: number;
  bigWinMin: number;
  megaWinMin: number;
  jackpotMin: number;
  /** Range of the digit value the "0 → respin" mechanic is allowed to reveal. */
  zeroRespinMin: number;
  zeroRespinMax: number;
}

export type CelebrationTier = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PaytableConfig {
  gameId: string;
  targetRtpPercent: number;
  /** ShamrockSpin only — bonus spins awarded when the "freeSpin" tier rolls. */
  freeSpinsGranted: number | null;
  tiers: TierRow[];
  /** ShamrockSpin only — which WIN_RULES render (cosmetically) for each win tier. */
  ruleTierMap: Record<string, string> | null;
  /** Which celebration overlay (if any) each win tier triggers. A tier missing from the
   * map, or mapped to null, just plays the plain win chime with no overlay. */
  celebrationMap: Partial<Record<TierKey, CelebrationTier | null>> | null;
  /** Cash Machine only — editable amount thresholds. */
  amountThresholds: AmountThresholds | null;
  /** Crazy 777 only — a second, fully independent weighted table for reel 4 (the special
   * reel), summing to 100% on its own, separate from `tiers`' 100% sum. */
  specialReelTiers: TierRow[] | null;
  /** Crazy 777 only — bounds for the RESPIN special-reel feature. */
  respinRange: { min: number; max: number } | null;
}

/** Crazy 777 only — mirrors crazy777FinalWinPerBet in the backend. */
function crazy777FinalWinPerBet(lineTier: TierRow, specialTier: TierRow): number {
  if (lineTier.key === "loss" || lineTier.payoutMultiplier === null) return 0;
  const baseWin = lineTier.payoutMultiplier;
  switch (specialTier.key) {
    case "multiplier2x":
    case "multiplier5x":
    case "multiplier10x":
      return baseWin * (specialTier.payoutMultiplier ?? 1);
    case "dollarPlus":
    case "doubleDollarPlus":
      return baseWin + (specialTier.payoutMultiplier ?? 0);
    default:
      return baseWin;
  }
}

/** Crazy 777 only — mirrors computeCrazy777RtpPercent in the backend (two independent
 * weighted tables, exact joint EV plus a first-order RESPIN retrigger term). */
function computeCrazy777RtpPercent(config: PaytableConfig): number {
  const specialTiers = config.specialReelTiers ?? [];
  let jointEV = 0;
  for (const line of config.tiers) {
    for (const special of specialTiers) {
      jointEV += (line.frequencyPercent / 100) * (special.frequencyPercent / 100) * crazy777FinalWinPerBet(line, special);
    }
  }

  const pLineWin =
    config.tiers.filter((t) => t.key !== "loss" && t.payoutMultiplier !== null).reduce((sum, t) => sum + t.frequencyPercent, 0) /
    100;
  const respinTier = specialTiers.find((t) => t.key === "respin");
  const pRespin = respinTier ? respinTier.frequencyPercent / 100 : 0;
  const range = config.respinRange ?? { min: 0, max: 0 };
  const avgRespins = (range.min + range.max) / 2;
  const extraRtp = pLineWin * pRespin * avgRespins * jointEV;

  return (jointEV + extraRtp) * 100;
}

/** 5x Rewind only — mirrors games/FiveXRewind/winCalc.ts's calculateWin (payout only, not
 * the full structured result — that's all the RTP preview needs). */
const FIVEX_SYMBOLS = [
  "WHITE_BAR", "SEVEN_BAR", "RED_BAR", "PURPLE_BAR", "RED_7", "PURPLE_7", "BLUE_7",
  "COIN_2X", "COIN_3X", "COIN_4X", "COIN_5X",
] as const;
type FiveXSymbol = (typeof FIVEX_SYMBOLS)[number];
const FIVEX_NON_COIN_SYMBOLS: FiveXSymbol[] = ["WHITE_BAR", "SEVEN_BAR", "RED_BAR", "PURPLE_BAR", "RED_7", "PURPLE_7", "BLUE_7"];
const FIVEX_COIN_VALUE: Partial<Record<FiveXSymbol, number>> = { COIN_2X: 2, COIN_3X: 3, COIN_4X: 4, COIN_5X: 5 };
const FIVEX_COIN_SET = new Set<FiveXSymbol>(["COIN_2X", "COIN_3X", "COIN_4X", "COIN_5X"]);
const FIVEX_BAR_FAMILY = new Set<FiveXSymbol>(["WHITE_BAR", "RED_BAR", "PURPLE_BAR", "SEVEN_BAR"]);
const FIVEX_BAR_ONLY = new Set<FiveXSymbol>(["WHITE_BAR", "RED_BAR", "PURPLE_BAR"]);
const FIVEX_SEVEN_FAMILY = new Set<FiveXSymbol>(["SEVEN_BAR", "RED_7", "PURPLE_7", "BLUE_7"]);
const FIVEX_DEFAULT_BASE_TIERS: Partial<Record<FiveXSymbol, number>> = {
  WHITE_BAR: 1, SEVEN_BAR: 10, RED_7: 20, PURPLE_7: 15, BLUE_7: 12, PURPLE_BAR: 6, RED_BAR: 5,
};
interface FiveXComboMultipliers {
  anyBarOnly: number;
  anyBarWithSevenBar: number;
  anySevens: number;
}
const FIVEX_DEFAULT_COMBO_MULTIPLIERS: FiveXComboMultipliers = {
  anyBarOnly: 2,
  anyBarWithSevenBar: 4,
  anySevens: 8,
};
const FIVEX_EXACT_TIER_TO_SYMBOL: Partial<Record<TierKey, FiveXSymbol>> = {
  whiteBar: "WHITE_BAR", sevenBar: "SEVEN_BAR", redBar: "RED_BAR", purpleBar: "PURPLE_BAR",
  red7: "RED_7", purple7: "PURPLE_7", blue7: "BLUE_7",
};
const FIVEX_COIN_TIER_TO_SYMBOL: Partial<Record<TierKey, FiveXSymbol>> = {
  coin2x: "COIN_2X", coin3x: "COIN_3X", coin4x: "COIN_4X", coin5x: "COIN_5X",
};

function fiveXIsGenuineLoss(s1: FiveXSymbol, s2: FiveXSymbol, s3: FiveXSymbol): boolean {
  if (s1 === s2 && s2 === s3) return false;
  if (FIVEX_BAR_FAMILY.has(s1) && FIVEX_BAR_FAMILY.has(s2) && FIVEX_BAR_FAMILY.has(s3)) return false;
  if (FIVEX_SEVEN_FAMILY.has(s1) && FIVEX_SEVEN_FAMILY.has(s2) && FIVEX_SEVEN_FAMILY.has(s3)) return false;
  return true;
}
function fiveXIsAny3BarOnly(s1: FiveXSymbol, s2: FiveXSymbol, s3: FiveXSymbol): boolean {
  if (!FIVEX_BAR_ONLY.has(s1) || !FIVEX_BAR_ONLY.has(s2) || !FIVEX_BAR_ONLY.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}
// WHITE_BAR + SEVEN_BAR only, mixed — confirmed with user: NOT "any bar family mixed with
// SEVEN_BAR" (RED_BAR/PURPLE_BAR don't count here — e.g. RED_BAR|PURPLE_BAR|SEVEN_BAR matches
// no rule and is a genuine loss).
const FIVEX_WHITE_OR_SEVEN = new Set<FiveXSymbol>(["WHITE_BAR", "SEVEN_BAR"]);
function fiveXIsAny3BarWithSevenBar(s1: FiveXSymbol, s2: FiveXSymbol, s3: FiveXSymbol): boolean {
  if (!FIVEX_WHITE_OR_SEVEN.has(s1) || !FIVEX_WHITE_OR_SEVEN.has(s2) || !FIVEX_WHITE_OR_SEVEN.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}
function fiveXIsAny3Sevens(s1: FiveXSymbol, s2: FiveXSymbol, s3: FiveXSymbol): boolean {
  if (!FIVEX_SEVEN_FAMILY.has(s1) || !FIVEX_SEVEN_FAMILY.has(s2) || !FIVEX_SEVEN_FAMILY.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}

function fiveXPayout(
  reels: [FiveXSymbol, FiveXSymbol, FiveXSymbol],
  bet: number,
  baseTiers: Partial<Record<FiveXSymbol, number>>,
  comboMultipliers: FiveXComboMultipliers
): number {
  const [a, b, c] = reels;
  if (a === "COIN_2X" && b === "COIN_5X" && c === "COIN_2X") return bet * 1000;
  if (a === "COIN_2X" && b === "COIN_4X" && c === "COIN_2X") return bet * 400;

  const coins = reels.filter((s) => FIVEX_COIN_SET.has(s));
  const nonCoins = reels.filter((s) => !FIVEX_COIN_SET.has(s));
  const stacked = coins.reduce((p, s) => p * (FIVEX_COIN_VALUE[s] ?? 1), 1);
  const allMatch = nonCoins.length > 0 && nonCoins.every((s) => s === nonCoins[0]);
  const baseSymbol = allMatch ? nonCoins[0] : null;
  const baseMultiplier = baseSymbol ? baseTiers[baseSymbol] : undefined;
  if (baseSymbol && baseMultiplier !== undefined) return bet * baseMultiplier * stacked;

  if (coins.length === 0) {
    if (fiveXIsAny3BarOnly(a, b, c)) return bet * comboMultipliers.anyBarOnly;
    if (fiveXIsAny3BarWithSevenBar(a, b, c)) return bet * comboMultipliers.anyBarWithSevenBar;
    if (fiveXIsAny3Sevens(a, b, c)) return bet * comboMultipliers.anySevens;
  }
  if (coins.length > 0) return bet * stacked;
  return 0;
}

/** Every base (pre-coin) 3-symbol combo that structurally belongs to a given line tier,
 * uniformly weighted within it — mirrors the backend's fiveXLineCombos exactly. */
function fiveXLineCombos(tierKey: TierKey): [FiveXSymbol, FiveXSymbol, FiveXSymbol][] {
  const exactSymbol = FIVEX_EXACT_TIER_TO_SYMBOL[tierKey];
  if (exactSymbol) return [[exactSymbol, exactSymbol, exactSymbol]];

  const predicate =
    tierKey === "loss"
      ? fiveXIsGenuineLoss
      : tierKey === "any3BarOnly"
        ? fiveXIsAny3BarOnly
        : tierKey === "any3BarWithSevenBar"
          ? fiveXIsAny3BarWithSevenBar
          : tierKey === "any3Sevens"
            ? fiveXIsAny3Sevens
            : null;
  if (!predicate) return [];

  const combos: [FiveXSymbol, FiveXSymbol, FiveXSymbol][] = [];
  for (const s1 of FIVEX_NON_COIN_SYMBOLS) {
    for (const s2 of FIVEX_NON_COIN_SYMBOLS) {
      for (const s3 of FIVEX_NON_COIN_SYMBOLS) {
        if (predicate(s1, s2, s3)) combos.push([s1, s2, s3]);
      }
    }
  }
  return combos;
}

/**
 * 5x Rewind only — rolls one line tier per spin (loss + each named win category), then
 * independently rolls the coin-overlay table (`specialReelTiers`) 3 times, once per reel.
 * RTP is the exact EV: for each line tier, every structurally-valid base combo (uniformly
 * likely within that tier) x every one of the 5x5x5 = 125 coin-overlay combinations —
 * mirrors the backend's computeFiveXRewindRtpPercent exactly.
 */
function computeFiveXRewindRtpPercent(config: PaytableConfig): number {
  const baseTiers: Partial<Record<FiveXSymbol, number>> = { ...FIVEX_DEFAULT_BASE_TIERS };
  for (const tier of config.tiers) {
    const symbol = FIVEX_EXACT_TIER_TO_SYMBOL[tier.key];
    if (symbol && tier.payoutMultiplier !== null) baseTiers[symbol] = tier.payoutMultiplier;
  }
  const comboMultipliers: FiveXComboMultipliers = {
    anyBarOnly: config.tiers.find((t) => t.key === "any3BarOnly")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anyBarOnly,
    anyBarWithSevenBar:
      config.tiers.find((t) => t.key === "any3BarWithSevenBar")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anyBarWithSevenBar,
    anySevens: config.tiers.find((t) => t.key === "any3Sevens")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anySevens,
  };

  const coinTiers = config.specialReelTiers ?? [];
  const coinProb: number[] = [(coinTiers.find((t) => t.key === "noCoin")?.frequencyPercent ?? 0) / 100];
  const coinSymbol: (FiveXSymbol | null)[] = [null];
  for (const [key, symbol] of Object.entries(FIVEX_COIN_TIER_TO_SYMBOL) as [TierKey, FiveXSymbol][]) {
    coinSymbol.push(symbol);
    coinProb.push((coinTiers.find((t) => t.key === key)?.frequencyPercent ?? 0) / 100);
  }

  let ev = 0;
  for (const tier of config.tiers) {
    const combos = fiveXLineCombos(tier.key);
    if (combos.length === 0) continue;
    const pCombo = tier.frequencyPercent / 100 / combos.length;
    if (pCombo === 0) continue;

    for (const [b1, b2, b3] of combos) {
      for (let i1 = 0; i1 < coinProb.length; i1++) {
        if (coinProb[i1] === 0) continue;
        for (let i2 = 0; i2 < coinProb.length; i2++) {
          if (coinProb[i2] === 0) continue;
          for (let i3 = 0; i3 < coinProb.length; i3++) {
            if (coinProb[i3] === 0) continue;
            const reels: [FiveXSymbol, FiveXSymbol, FiveXSymbol] = [
              coinSymbol[i1] ?? b1,
              coinSymbol[i2] ?? b2,
              coinSymbol[i3] ?? b3,
            ];
            const p = pCombo * coinProb[i1] * coinProb[i2] * coinProb[i3];
            ev += p * fiveXPayout(reels, 1, baseTiers, comboMultipliers);
          }
        }
      }
    }
  }
  return ev * 100;
}

/** Sizzling 7s only — mirrors games/SizzlingSevens/{config,winCalc}.ts. Duplicated here (not
 * imported) since this file has no build-time link to the backend package — same convention
 * every other per-game RTP mirror in this file already follows. */
const SIZZ_SYMBOLS = ["RED_7", "BLUE_7", "BAR", "DOUBLE_BAR", "TRIPLE_BAR", "WILD_2X", "BONUS"] as const;
type SizzSymbol = (typeof SIZZ_SYMBOLS)[number];
const SIZZ_WILD: SizzSymbol = "WILD_2X";
const SIZZ_BONUS: SizzSymbol = "BONUS";
const SIZZ_WILD_SUB = new Set<SizzSymbol>(["RED_7", "BLUE_7", "BAR", "DOUBLE_BAR", "TRIPLE_BAR"]);
const SIZZ_DEFAULT_PAYTABLE: Record<Exclude<SizzSymbol, "WILD_2X">, number> = {
  RED_7: 250,
  BLUE_7: 100,
  TRIPLE_BAR: 50,
  DOUBLE_BAR: 30,
  BAR: 25,
  BONUS: 60,
};
const SIZZ_PURE_WILD_DEFAULT: Record<1 | 2 | 3, number> = { 1: 2, 2: 20, 3: 2500 };
const SIZZ_WILD_MULT_BASE = 2;
const SIZZ_BONUS_TRIGGER_COUNT = 3;
const SIZZ_PAYLINES: [number, number, number][] = [
  [1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0],
  [1, 0, 1], [1, 2, 1], [2, 1, 2], [0, 1, 0], [0, 1, 1],
  [2, 1, 1], [1, 0, 0], [1, 2, 2], [0, 0, 1], [2, 2, 1],
  [1, 1, 0], [1, 1, 2], [0, 2, 0], [2, 0, 2], [0, 1, 2],
  [2, 2, 0], [0, 2, 2], [2, 0, 0], [1, 0, 2], [1, 2, 0],
  [0, 2, 1], [2, 0, 1],
];
const SIZZ_FREE_GAMES_AWARDS: Array<{ freeSpins: number; multiplierPool: number[]; weight: number }> = [
  { freeSpins: 5, multiplierPool: [30, 15, 8], weight: 30 },
  { freeSpins: 8, multiplierPool: [10, 8, 5], weight: 28 },
  { freeSpins: 10, multiplierPool: [8, 5, 3], weight: 24 },
  { freeSpins: 15, multiplierPool: [5, 3, 2], weight: 18 },
];
const SIZZ_MYSTERY_SPIN_COUNTS = [5, 8, 10, 15];
const SIZZ_MYSTERY_POOL = [2, 3, 5, 8, 10, 15, 30];
const SIZZ_MYSTERY_WEIGHT = 20;

type SizzPaytable = Record<Exclude<SizzSymbol, "WILD_2X">, number>;
type SizzPureWild = Record<1 | 2 | 3, number>;
type SizzGrid = SizzSymbol[][];

function sizzMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sizzEvaluateLine(
  grid: SizzGrid,
  line: [number, number, number],
  paytable: SizzPaytable,
  pureWild: SizzPureWild
): number {
  const symbols = line.map((row, reel) => grid[reel][row]);
  let leadingWilds = 0;
  while (leadingWilds < 3 && symbols[leadingWilds] === SIZZ_WILD) leadingWilds++;

  let candidateA = 0;
  if (leadingWilds < 3) {
    const winSym = symbols[leadingWilds];
    if (winSym !== SIZZ_BONUS && SIZZ_WILD_SUB.has(winSym)) {
      let matchCount = 0;
      let wildCount = 0;
      for (let i = 0; i < 3; i++) {
        if (symbols[i] === SIZZ_WILD) {
          matchCount++;
          wildCount++;
        } else if (symbols[i] === winSym) {
          matchCount++;
        } else break;
      }
      if (matchCount >= 3) {
        candidateA = paytable[winSym as Exclude<SizzSymbol, "WILD_2X">] * Math.pow(SIZZ_WILD_MULT_BASE, wildCount);
      }
    }
  }

  let candidateB = 0;
  if (leadingWilds >= 1) {
    const capped = Math.min(leadingWilds, 3) as 1 | 2 | 3;
    candidateB = pureWild[capped];
  }

  return Math.max(candidateA, candidateB);
}

function sizzCalculateSpinWin(grid: SizzGrid, paytable: SizzPaytable, pureWild: SizzPureWild, freeMultiplier: number) {
  let lineTotal = 0;
  for (const line of SIZZ_PAYLINES) lineTotal += sizzEvaluateLine(grid, line, paytable, pureWild);

  let scatterCount = 0;
  for (const col of grid) for (const s of col) if (s === SIZZ_BONUS) scatterCount++;
  const scatterWin = scatterCount >= SIZZ_BONUS_TRIGGER_COUNT ? paytable.BONUS : 0;

  const beforeMultiplier = lineTotal + scatterWin;
  return { finalWin: beforeMultiplier * freeMultiplier, triggeredFreeGames: scatterCount >= SIZZ_BONUS_TRIGGER_COUNT };
}

function sizzWeightedSymbol(tiers: TierRow[], rng: () => number): SizzSymbol {
  const total = tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = rng() * total;
  for (const t of tiers) {
    roll -= t.frequencyPercent;
    if (roll < 0) return t.key as SizzSymbol;
  }
  return tiers[tiers.length - 1].key as SizzSymbol;
}

function sizzDrawGrid(tiers: TierRow[], rng: () => number): SizzGrid {
  const grid: SizzGrid = [];
  for (let reel = 0; reel < 3; reel++) {
    const col: SizzSymbol[] = [];
    for (let row = 0; row < 3; row++) col.push(sizzWeightedSymbol(tiers, rng));
    grid.push(col);
  }
  return grid;
}

function sizzTriggerFreeGames(rng: () => number): { freeSpins: number; multiplierPool: number[] } {
  const options = [...SIZZ_FREE_GAMES_AWARDS, { freeSpins: 0, multiplierPool: [] as number[], weight: SIZZ_MYSTERY_WEIGHT, isMystery: true }];
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * total;
  let picked = options[options.length - 1];
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) {
      picked = o;
      break;
    }
  }
  if ("isMystery" in picked && picked.isMystery) {
    const freeSpins = SIZZ_MYSTERY_SPIN_COUNTS[Math.floor(rng() * SIZZ_MYSTERY_SPIN_COUNTS.length)];
    return { freeSpins, multiplierPool: SIZZ_MYSTERY_POOL };
  }
  return { freeSpins: picked.freeSpins, multiplierPool: picked.multiplierPool };
}

const SIZZ_SIMS = 200_000;
const SIZZ_MAX_FREE_SPINS = 500;

export interface SizzlingSevensStats {
  rtpPercent: number;
  /** Percent of base spins (not counting free-spin rounds) that pay nothing — the closest
   * equivalent to every other game's admin-editable "Loss" row, except this is a *computed*
   * stat rather than an editable weight (Sizzling 7s has no dedicated loss symbol to draw). */
  lossPercent: number;
}

/** Sizzling 7s' RTP and loss frequency can't be exactly enumerated (3 reels x 3 rows x 27
 * overlapping lines x Wild/Bonus/Free-Games is combinatorially far too large) — estimated via
 * a fixed-seed Monte Carlo simulation instead, mirroring the backend's
 * computeSizzlingSevensStats exactly so both sides always agree. */
export function computeSizzlingSevensStats(config: PaytableConfig): SizzlingSevensStats {
  const paytable: SizzPaytable = { ...SIZZ_DEFAULT_PAYTABLE };
  for (const tier of config.tiers) {
    if (tier.key === SIZZ_WILD || tier.payoutMultiplier === null) continue;
    if (tier.key in paytable) (paytable as Record<string, number>)[tier.key] = tier.payoutMultiplier;
  }
  const wildRow = config.tiers.find((t) => t.key === SIZZ_WILD);
  const pureWild: SizzPureWild = { 1: SIZZ_PURE_WILD_DEFAULT[1], 2: SIZZ_PURE_WILD_DEFAULT[2], 3: wildRow?.payoutMultiplier ?? SIZZ_PURE_WILD_DEFAULT[3] };

  const rng = sizzMulberry32(0xc0ffee);
  let total = 0;
  let lossCount = 0;
  for (let i = 0; i < SIZZ_SIMS; i++) {
    const grid = sizzDrawGrid(config.tiers, rng);
    const ev = sizzCalculateSpinWin(grid, paytable, pureWild, 1);
    total += ev.finalWin;
    if (ev.finalWin === 0) lossCount++;

    if (ev.triggeredFreeGames) {
      let award = sizzTriggerFreeGames(rng);
      let remaining = award.freeSpins;
      let pool = award.multiplierPool;
      let played = 0;
      while (remaining > 0 && played < SIZZ_MAX_FREE_SPINS) {
        remaining--;
        played++;
        const freeGrid = sizzDrawGrid(config.tiers, rng);
        const freeMultiplier = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : 1;
        const freeEv = sizzCalculateSpinWin(freeGrid, paytable, pureWild, freeMultiplier);
        total += freeEv.finalWin;
        if (freeEv.triggeredFreeGames) {
          award = sizzTriggerFreeGames(rng);
          remaining += award.freeSpins;
          pool = award.multiplierPool;
        }
      }
    }
  }
  return { rtpPercent: (total / SIZZ_SIMS) * 100, lossPercent: (lossCount / SIZZ_SIMS) * 100 };
}

function computeSizzlingSevensRtpPercent(config: PaytableConfig): number {
  return computeSizzlingSevensStats(config).rtpPercent;
}

/**
 * Mirrors the backend's computeRtpPercent (backEnd/src/services/paytableConfig.ts) so the
 * admin page can show the effective RTP live, before the admin ever hits Save.
 */
export function computeRtpPercent(config: PaytableConfig): number {
  if (config.gameId === "5x-rewind") {
    return computeFiveXRewindRtpPercent(config);
  }

  if (config.gameId === "sizzling-7s") {
    return computeSizzlingSevensRtpPercent(config);
  }

  if (config.specialReelTiers) {
    return computeCrazy777RtpPercent(config);
  }

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

export const adminApi = {
  stats: async (): Promise<AdminStats> => (await apiClient.get("/api/admin/stats")).data,

  listUsers: async (status: "active" | "deleted" | "all" = "active"): Promise<AdminUser[]> =>
    (await apiClient.get("/api/admin/users", { params: { status } })).data.users,

  onlineNow: async (): Promise<AdminUser[]> =>
    (await apiClient.get("/api/admin/users/online-now")).data.users,

  createUser: async (payload: {
    fullName?: string;
    phone?: string;
    email?: string;
    startingBalance?: number;
  }): Promise<{ user: AdminUser; credentials: { username: string; password: string } }> =>
    (await apiClient.post("/api/admin/users", payload)).data,

  getUser: async (
    id: string
  ): Promise<{
    user: AdminUser;
    balanceHistory: BalanceAdjustmentEntry[];
    spins: SpinEntry[];
    pendingForcedOutcomes: ForcedOutcomeEntry[];
  }> => (await apiClient.get(`/api/admin/users/${id}`)).data,

  updateUser: async (
    id: string,
    payload: { fullName?: string | null; phone?: string | null; email?: string | null }
  ): Promise<AdminUser> => (await apiClient.patch(`/api/admin/users/${id}`, payload)).data.user,

  resetPassword: async (id: string): Promise<{ username: string; password: string }> =>
    (await apiClient.post(`/api/admin/users/${id}/reset-password`)).data.credentials,

  disableUser: async (id: string, disabled: boolean): Promise<AdminUser> =>
    (await apiClient.patch(`/api/admin/users/${id}/disable`, { disabled })).data.user,

  deleteUser: async (id: string): Promise<AdminUser> =>
    (await apiClient.patch(`/api/admin/users/${id}/delete`)).data.user,

  purgeUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/users/${id}/purge`);
  },

  setBalance: async (id: string, balance: number): Promise<AdminUser> =>
    (await apiClient.patch(`/api/admin/users/${id}/balance`, { balance })).data.user,

  createForcedOutcome: async (userId: string, gameId: string, targetTier: string): Promise<ForcedOutcomeEntry> =>
    (await apiClient.post("/api/admin/forced-outcomes", { userId, gameId, targetTier })).data.forcedOutcome,

  listForcedOutcomes: async (filter?: {
    userId?: string;
    gameId?: string;
    status?: ForcedOutcomeStatus;
  }): Promise<ForcedOutcomeEntry[]> =>
    (await apiClient.get("/api/admin/forced-outcomes", { params: filter })).data.forcedOutcomes,

  cancelForcedOutcome: async (id: string): Promise<ForcedOutcomeEntry> =>
    (await apiClient.patch(`/api/admin/forced-outcomes/${id}/cancel`)).data.forcedOutcome,

  getGameSettings: async (gameId: string): Promise<{ gameId: string; rtpMultiplier: number }> =>
    (await apiClient.get(`/api/admin/game-settings/${gameId}`)).data,

  updateGameSettings: async (
    gameId: string,
    rtpMultiplier: number
  ): Promise<{ gameId: string; rtpMultiplier: number }> =>
    (await apiClient.patch(`/api/admin/game-settings/${gameId}`, { rtpMultiplier })).data,

  getEarnings: async (range: EarningsRange, gameId?: string): Promise<EarningsResponse> =>
    (await apiClient.get("/api/admin/earnings", { params: { range, gameId } })).data,

  recentSpins: async (filter?: { username?: string; gameId?: string; limit?: number }): Promise<SpinEntry[]> =>
    (await apiClient.get("/api/admin/spins/recent", { params: filter })).data.spins,

  getSseTicket: async (): Promise<string> => (await apiClient.get("/api/admin/sse-events-ticket")).data.ticket,

  getPaytable: async (
    gameId: string
  ): Promise<{ config: PaytableConfig; computedRtpPercent: number; valid: boolean }> =>
    (await apiClient.get(`/api/admin/paytable/${gameId}`)).data,

  updatePaytable: async (
    gameId: string,
    config: PaytableConfig
  ): Promise<{ config: PaytableConfig; computedRtpPercent: number; valid: boolean }> =>
    (await apiClient.put(`/api/admin/paytable/${gameId}`, config)).data,
};
