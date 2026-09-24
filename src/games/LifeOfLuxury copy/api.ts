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
  /** Present only on the free spin that finishes the round — the server-tracked, authoritative
   * "total win × (wilds seen across the round + 1)" bonus (see backend routes.ts). bonusWin is
   * already folded into `balance` above; totalWin is the round's pre-bonus sum for display. */
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

/** Classic auto-stop — the server draws the whole grid and result in one call; the client only
 * ever plays a fixed-duration landing animation on whatever this returns (see
 * pixi/Reel.ts's spinTo). `bet` is the single amount staked and deducted — evaluated against
 * every line and the scatter alike, no per-line split. `isFreeSpin` true means this spin is
 * played inside an active free-spins round (no balance staked). */
export async function spinRequest(bet: number, isFreeSpin = false): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/life-of-luxury/spin", {
    bet,
    isFreeSpin,
  });
  return data;
}

export async function getLifeOfLuxuryConfig(): Promise<LifeOfLuxuryConfigResponse> {
  const { data } = await apiClient.get<LifeOfLuxuryConfigResponse>("/api/games/life-of-luxury/config");
  return data;
}
