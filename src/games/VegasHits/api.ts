import { apiClient } from "../../api/client";

export type VegasHitsSymbol = "GREEN_7" | "DOUBLE_GREEN_7" | "TRIPLE_GREEN_7" | "RED_7" | "BLUE_7" | "WILD" | "BONUS";

/** grid[reelIndex][rowIndex] — row 0 = TOP, 1 = MIDDLE, 2 = BOTTOM. `null` means that reel has
 * no symbol on this row at all — every reel always shows either 1 symbol on the middle row, or
 * 2 symbols on the top+bottom rows, never all 3 (same 2-state reel shape as 7 Crystal Clover). */
export type Grid = (VegasHitsSymbol | null)[][];

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface LineWin {
  lineNumber: number;
  symbol: VegasHitsSymbol;
  wildCount: number;
  basePayout: number;
  betMultiplier: number;
  finalWin: number;
  involvesWild: boolean;
  positions: [number, number][];
}

export interface SpinEvaluation {
  lineWins: LineWin[];
  scatterCount: number;
  scatterWin: number;
  chiliEligibleWin: number;
  wildWin: number;
  chiliMultiplier: number;
  finalWin: number;
  winningPositions: [number, number][];
  triggeredFreeGames: boolean;
}

export interface FreeGamesAward {
  freeSpins: number;
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
  symbol: VegasHitsSymbol;
  payout: number;
}

export interface VegasHitsConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  lineCost: number;
  betLevels: number[];
  minBet: number;
  maxBet: number;
  paylineCount: number;
  paylines: [number, number, number][];
  paytable: PaytableRow[];
  /** Admin-configured reel-strip weights, one per symbol — the client draws its own scrolling
   * content from this distribution (see pixi/Reel.ts) since the server only scores whatever
   * grid the client reports (see spinRequest's `grid` param). */
  symbolWeights: Partial<Record<VegasHitsSymbol, number>>;
  wild: {
    symbol: "WILD";
    rules: {
      onePureBet: number;
      twoPureBet: number;
      threePureBet: number;
      oneCompleteMultiplier: number;
      twoCompleteMultiplier: number;
      anyMixBet: number;
    };
  };
  bonus: { symbol: "BONUS"; triggerCount: number; scatterPayoutMultipleOfBet: number };
  freeGames: { spinsPerTrigger: number; maxTotalFreeSpins: number; chiliMultiplierPool: number[] };
}

/** `betLevel` is the real total bet (0.10-30 — see config's BET_LEVELS), not a multiplier.
 * Classic auto-stop — the server draws the whole grid and result in one call (mirrors 7 Crystal
 * Clover's spinRequest); the client only ever plays a fixed-duration landing animation on
 * whatever this returns (see pixi/Reel.ts's spinTo). */
export async function spinRequest(betLevel: number, isFreeSpin: boolean): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/vegas-hits/spin", {
    betLevel,
    isFreeSpin,
  });
  return data;
}

export async function getVegasHitsConfig(): Promise<VegasHitsConfigResponse> {
  const { data } = await apiClient.get<VegasHitsConfigResponse>("/api/games/vegas-hits/config");
  return data;
}
