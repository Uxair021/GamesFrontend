import { apiClient } from "../../api/client";

export type CrystalCloverSymbol = "SEVEN_CLOVER" | "TRIPLE_BAR" | "DOUBLE_BAR" | "BAR" | "WILD" | "MULTIPLIER_2X";

/** grid[reelIndex][rowIndex] — row 0 = TOP, 1 = MIDDLE, 2 = BOTTOM. `null` means that reel has
 * no symbol on this row at all — every reel always shows either 1 symbol on the middle row, or
 * 2 symbols on the top+bottom rows, never all 3. */
export type Grid = (CrystalCloverSymbol | null)[][];

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface LineWin {
  lineNumber: number;
  symbol: CrystalCloverSymbol;
  matchCount: number;
  basePayout: number;
  wildCount: number;
  wildMultiplier: number;
  betMultiplier: number;
  finalWin: number;
  positions: [number, number][];
  isPureWild: boolean;
  isAnyBar: boolean;
}

export interface SpinEvaluation {
  lineWins: LineWin[];
  totalLineWin: number;
  multiplierCount: number;
  multiplierFactor: number;
  finalWin: number;
  winningPositions: [number, number][];
}

export interface SpinResponse {
  grid: Grid;
  evaluation: SpinEvaluation;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
  meta: { forced: boolean };
}

export interface PaytableRow {
  symbol: CrystalCloverSymbol;
  payout: number;
}

export interface CrystalCloverConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  betLevels: number[];
  minBet: number;
  maxBet: number;
  paylineCount: number;
  paylines: [number, number, number][];
  paytable: PaytableRow[];
  anyBarPayout: number;
  wild: { symbol: "WILD"; multiplierBase: number; purePayout: Record<1 | 2 | 3, number> };
  multiplier: { symbol: "MULTIPLIER_2X"; base: number };
}

/** `betLevel` is the real total bet (0.10-30) — classic auto-stop, server predetermines the
 * whole grid and result; the client only ever animates to whatever this returns. */
export async function spinRequest(betLevel: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/crystal-clover/spin", { betLevel });
  return data;
}

export async function getCrystalCloverConfig(): Promise<CrystalCloverConfigResponse> {
  const { data } = await apiClient.get<CrystalCloverConfigResponse>("/api/games/crystal-clover/config");
  return data;
}
