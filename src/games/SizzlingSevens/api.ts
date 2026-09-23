/**
 * Sizzling 7s' RNG, paytable, Wild/Bonus/Free-Games math, and balance are all computed
 * entirely in the browser — same "fully offline, client-side test game" architecture as
 * Buffalo777 (see games/Buffalo777/api.ts). The reel's own continuous scroll already decided
 * the grid client-side before this file existed (it freezes wherever the player clicks Stop —
 * see pixi/Reel.ts); what moved here is the *scoring* of that grid (27-payline evaluation,
 * Wild substitution/multiplier, Bonus scatter, the whole Free Games/Mystery-Pick system) and
 * the admin-editable paytable, both of which used to round-trip to the backend on every spin.
 * config.ts/winCalc.ts are faithful ports of what used to live in
 * `backEnd/src/games/SizzlingSevens/{config,winCalc}.ts`, using the exact same weights/payouts
 * that previously came from `backEnd/src/services/paytableConfig.ts`'s
 * `DEFAULT_CONFIGS["sizzling-7s"]` (the live odds). Kept as the same exported function
 * names/signatures as the old network calls (`spinRequest`, `getSizzlingSevensConfig`) so
 * SizzlingSevensGame.tsx and the pixi/ files didn't need to change how they call them.
 *
 * The one exception is `logSpinResult`: a write-only, fire-and-forget call to a minimal backend
 * endpoint (`backEnd/src/games/SizzlingSevens/routes.ts`) that just records the already-decided
 * result into the same `SpinHistory` collection every other game uses, so Sizzling 7s spins
 * show up in the admin dashboard (Earnings, Player Detail, Live Feed) like every other game's.
 * It never influences gameplay — the spin itself is fully decided above before this is called.
 */

import { apiClient } from "../../api/client";
import {
  SizzlingSymbol,
  PAYLINES,
  DEFAULT_PAYTABLE,
  WILD_SYMBOL,
  BONUS_TRIGGER_COUNT,
  WILD_MULTIPLIER_BASE,
  PURE_WILD_PAYOUT,
  FREE_GAMES_AWARDS,
  MYSTERY_SPIN_COUNTS,
  MYSTERY_MULTIPLIER_POOL,
  LINE_COST,
  BET_LEVELS,
} from "./config";
import { Grid, Paytable, PureWildPayout, calculateSpinWin, triggerFreeGames, pickFreeSpinMultiplier } from "./winCalc";

export type { SizzlingSymbol, Grid };

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface LineWin {
  lineNumber: number;
  symbol: SizzlingSymbol;
  matchCount: number;
  basePayout: number;
  wildCount: number;
  wildMultiplier: number;
  betMultiplier: number;
  finalWin: number;
  positions: [number, number][];
  isPureWild: boolean;
}

export interface SpinEvaluation {
  lineWins: LineWin[];
  scatterCount: number;
  scatterWin: number;
  totalLineWin: number;
  totalWinBeforeFreeMultiplier: number;
  freeGameMultiplier: number;
  finalWin: number;
  winningPositions: [number, number][];
  triggeredFreeGames: boolean;
}

export interface FreeGamesAward {
  freeSpins: number;
  multiplierPool: number[];
  isMystery: boolean;
}

export interface SpinResponse {
  grid: Grid;
  evaluation: SpinEvaluation;
  winAmount: number;
  tier: WinTierName | null;
  freeGamesAward: FreeGamesAward | null;
  balance: number;
  meta: { forced: boolean };
}

export interface PaytableRow {
  symbol: SizzlingSymbol;
  payout: number;
}

export interface SizzlingSevensConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  lineCost: number;
  betLevels: number[];
  minBet: number;
  maxBet: number;
  paylineCount: number;
  paylines: [number, number, number][];
  paytable: PaytableRow[];
  symbolWeights: Partial<Record<SizzlingSymbol, number>>;
  wild: { symbol: "WILD_2X"; multiplierBase: number; purePayout: Record<1 | 2 | 3, number> };
  bonus: { symbol: "BONUS"; triggerCount: number };
  freeGames: {
    awards: Array<{ freeSpins: number; multiplierPool: number[] }>;
    mystery: { spinCounts: number[]; multiplierPool: number[] };
  };
}

// --- Admin-adjustable RTP control (fully client-side — no backend for this game) ---
//
// Mirrors Buffalo777's own client-side RTP control (games/Buffalo777/api.ts) — except here
// `tiers` is a 7-row *reel-strip weight* table (one row per symbol, not a per-outcome tier like
// Buffalo777's), matching the exact shape the backend's paytableConfig service used to store
// for this game. frequencyPercent is that symbol's draw weight (all 7 sum to 100%),
// payoutMultiplier is its 3-matching payout (WILD_2X's row holds only the 3-Wild pure payout —
// see pureWildPayoutFrom below). There's no dedicated "loss" row — losing is just whatever
// combinatorially doesn't line up across the 27 overlapping paylines.

export interface SizzlingTierRow {
  key: SizzlingSymbol;
  frequencyPercent: number;
  payoutMultiplier: number;
}

export interface SizzlingAmountThresholds {
  bigWinMin: number;
  megaWinMin: number;
  jackpotMin: number;
}

export interface SizzlingRtpConfig {
  targetRtpPercent: number;
  tiers: SizzlingTierRow[];
  amountThresholds: SizzlingAmountThresholds;
}

const RTP_CONFIG_STORAGE_KEY = "texas-slots-sizzling7s-rtp-config";

/** The exact live weights/payouts this game shipped with (ported verbatim from
 * paytableConfig.ts's old DEFAULT_CONFIGS["sizzling-7s"] entry) — tuned to land at ~85% RTP /
 * ~21.6% loss frequency (see that entry's original comment for the full derivation). Used both
 * as the fallback when nothing's saved yet and by the admin page's "Reset to default" action. */
export function getSizzlingDefaultConfig(): SizzlingRtpConfig {
  return {
    targetRtpPercent: 85.0,
    tiers: [
      { key: "BAR", frequencyPercent: 11, payoutMultiplier: 1.4195 },
      { key: "DOUBLE_BAR", frequencyPercent: 11, payoutMultiplier: 1.7034 },
      { key: "TRIPLE_BAR", frequencyPercent: 11, payoutMultiplier: 2.8389 },
      { key: "BLUE_7", frequencyPercent: 33, payoutMultiplier: 5.6779 },
      { key: "RED_7", frequencyPercent: 32, payoutMultiplier: 14.1946 },
      { key: "BONUS", frequencyPercent: 1.5, payoutMultiplier: 3.4067 },
      { key: "WILD_2X", frequencyPercent: 0.5, payoutMultiplier: 0.5678 },
    ],
    amountThresholds: { bigWinMin: 3, megaWinMin: 6, jackpotMin: 12 },
  };
}

function isValidTierRow(row: unknown): row is SizzlingTierRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.key === "string" && typeof r.frequencyPercent === "number" && typeof r.payoutMultiplier === "number";
}

/** Reads the admin's saved RTP config from localStorage — falls back to the fresh default if
 * nothing's been saved yet, the stored value is corrupt/malformed, or localStorage itself is
 * unavailable (private browsing, etc.). */
export function getSizzlingRtpConfig(): SizzlingRtpConfig {
  try {
    const raw = localStorage.getItem(RTP_CONFIG_STORAGE_KEY);
    if (raw === null) return getSizzlingDefaultConfig();
    const parsed = JSON.parse(raw) as Partial<SizzlingRtpConfig>;
    if (
      typeof parsed.targetRtpPercent !== "number" ||
      !Array.isArray(parsed.tiers) ||
      parsed.tiers.length === 0 ||
      !parsed.tiers.every(isValidTierRow) ||
      !parsed.amountThresholds
    ) {
      return getSizzlingDefaultConfig();
    }
    return { targetRtpPercent: parsed.targetRtpPercent, tiers: parsed.tiers, amountThresholds: parsed.amountThresholds };
  } catch {
    return getSizzlingDefaultConfig();
  }
}

/** Persists a new RTP config — takes effect on the very next spin (rollTier-equivalent
 * weighting re-reads this on every call, see symbolWeightsFrom below), no reload or cross-tab
 * wiring needed. Silently no-ops if localStorage isn't available. */
export function setSizzlingRtpConfig(config: SizzlingRtpConfig): void {
  try {
    localStorage.setItem(RTP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private browsing / storage disabled — setting just won't persist */
  }
}

/** Admin-configured 3-match payouts (from each symbol's own tier row), falling back to the
 * built-in defaults for any row left unset. WILD_2X's row holds the 3-Wild pure payout only
 * (see pureWildPayoutFrom below) — it has no "3 matching WILD_2X" entry in Paytable itself. */
function paytableFrom(tiers: SizzlingTierRow[]): Paytable {
  const paytable: Paytable = { ...DEFAULT_PAYTABLE };
  for (const tier of tiers) {
    if (tier.key === WILD_SYMBOL) continue;
    if (tier.key in paytable) (paytable as Record<string, number>)[tier.key] = tier.payoutMultiplier;
  }
  return paytable;
}

/** The admin-editable 3-Wild pure payout, falling back to the spec default. 1/2-Wild stay
 * fixed (not worth their own admin rows) — see config.ts's PURE_WILD_PAYOUT comment. */
function pureWildPayoutFrom(tiers: SizzlingTierRow[]): PureWildPayout {
  const wildRow = tiers.find((t) => t.key === WILD_SYMBOL);
  return { 1: PURE_WILD_PAYOUT[1], 2: PURE_WILD_PAYOUT[2], 3: wildRow?.payoutMultiplier ?? PURE_WILD_PAYOUT[3] };
}

function symbolWeightsFrom(tiers: SizzlingTierRow[]): Partial<Record<SizzlingSymbol, number>> {
  return Object.fromEntries(tiers.map((t) => [t.key, t.frequencyPercent]));
}

/** Celebration tier is picked by bucketing finalWin as a multiple of the *total* bet — the same
 * "amountThresholds reused as multiplier cutoffs" pattern the old backend engine used. Since
 * finalWin scales with betMultiplier exactly like totalBet does, this ratio is bet-independent
 * — it's really just (basePayout x wildMultiplier) / LINE_COST, i.e. how big a win is relative
 * to the flat 30-coin line cost. */
function celebrationTier(finalWin: number, totalBet: number, thresholds: SizzlingAmountThresholds): WinTierName | null {
  const multiple = totalBet > 0 ? finalWin / totalBet : 0;
  if (multiple >= thresholds.jackpotMin) return "JACKPOT";
  if (multiple >= thresholds.megaWinMin) return "MEGA WIN";
  if (multiple >= thresholds.bigWinMin) return "BIG WIN";
  return null;
}

/** Scores a client-supplied grid — the reel's own continuous scroll (using the same
 * admin-configured weights, replicated client-side, see pixi/Reel.ts) determines what's
 * showing when the player clicks Stop, and that's what's passed in here to be evaluated/paid.
 * `currentBalance` is the player's balance right before this spin — the new balance (bet
 * deducted, win credited; free spins never deduct) is computed here and returned, mirroring
 * what the old backend endpoint used to do with the DB's own user record. */
export async function spinRequest(
  betLevel: number,
  grid: Grid,
  isFreeSpin: boolean,
  freeGameMultiplierPool: number[] | null,
  currentBalance: number
): Promise<SpinResponse> {
  const rtpConfig = getSizzlingRtpConfig();
  const paytable = paytableFrom(rtpConfig.tiers);
  const pureWildPayout = pureWildPayoutFrom(rtpConfig.tiers);

  const totalBet = betLevel;
  const betMultiplier = totalBet / LINE_COST;
  const freeGameMultiplier = isFreeSpin && freeGameMultiplierPool ? pickFreeSpinMultiplier(freeGameMultiplierPool) : 1;

  const evaluation = calculateSpinWin(grid, paytable, betMultiplier, freeGameMultiplier, pureWildPayout);
  const freeGamesAward = evaluation.triggeredFreeGames ? triggerFreeGames() : null;
  const tier = celebrationTier(evaluation.finalWin, totalBet, rtpConfig.amountThresholds);

  const stakedAmount = isFreeSpin ? 0 : totalBet;
  const balance = Math.round((currentBalance - stakedAmount + evaluation.finalWin) * 100) / 100;

  return {
    grid,
    evaluation,
    winAmount: evaluation.finalWin,
    tier,
    freeGamesAward: freeGamesAward ? { ...freeGamesAward } : null,
    balance,
    meta: { forced: false },
  };
}

export async function getSizzlingSevensConfig(): Promise<SizzlingSevensConfigResponse> {
  const rtpConfig = getSizzlingRtpConfig();
  const wildRow = rtpConfig.tiers.find((t) => t.key === WILD_SYMBOL);

  return {
    meta: {
      id: "sizzling-7s",
      name: "Sizzling 7s",
      description: "Classic 3-reel, 27-line slot with 2X wilds and a Bonus free games feature",
      minBet: BET_LEVELS[0],
      maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    },
    lineCost: LINE_COST,
    betLevels: BET_LEVELS,
    minBet: BET_LEVELS[0],
    maxBet: BET_LEVELS[BET_LEVELS.length - 1],
    paylineCount: PAYLINES.length,
    paylines: PAYLINES as [number, number, number][],
    paytable: Object.keys(DEFAULT_PAYTABLE).map((key) => {
      const row = rtpConfig.tiers.find((t) => t.key === key);
      return { symbol: key as SizzlingSymbol, payout: row?.payoutMultiplier ?? DEFAULT_PAYTABLE[key as keyof typeof DEFAULT_PAYTABLE] };
    }),
    symbolWeights: symbolWeightsFrom(rtpConfig.tiers),
    wild: {
      symbol: "WILD_2X",
      multiplierBase: WILD_MULTIPLIER_BASE,
      purePayout: { 1: PURE_WILD_PAYOUT[1], 2: PURE_WILD_PAYOUT[2], 3: wildRow?.payoutMultiplier ?? PURE_WILD_PAYOUT[3] },
    },
    bonus: { symbol: "BONUS", triggerCount: BONUS_TRIGGER_COUNT },
    freeGames: {
      awards: FREE_GAMES_AWARDS.map((a) => ({ freeSpins: a.freeSpins, multiplierPool: a.multiplierPool })),
      mystery: { spinCounts: MYSTERY_SPIN_COUNTS, multiplierPool: MYSTERY_MULTIPLIER_POOL },
    },
  };
}

/** Fire-and-forget: records a spin that already happened (locally) into the backend's
 * SpinHistory, purely for admin record-keeping — see the module doc comment above. */
export async function logSpinResult(params: {
  betAmount: number;
  winAmount: number;
  reelSymbols: SizzlingSymbol[][];
  balanceAfter: number;
  tier: WinTierName | null;
}): Promise<void> {
  await apiClient.post("/api/games/sizzling-7s/spin-log", params);
}
