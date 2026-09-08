import { apiClient } from "../../api/client";

export type SizzlingSymbol = "RED_7" | "BLUE_7" | "BAR" | "DOUBLE_BAR" | "TRIPLE_BAR" | "WILD_2X" | "BONUS";

/** grid[reelIndex][rowIndex] — row 0 = TOP, 1 = MIDDLE, 2 = BOTTOM. */
export type Grid = SizzlingSymbol[][];

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
  betMultipliers: number[];
  minBet: number;
  maxBet: number;
  paylineCount: number;
  paylines: [number, number, number][];
  paytable: PaytableRow[];
  /** Admin-configured reel-strip weights, one per symbol — the client draws its own scrolling
   * content from this distribution (see pixi/Reel.ts) now that the server no longer picks the
   * result; it only scores whatever grid the client reports (see spinRequest's `grid` param). */
  symbolWeights: Partial<Record<SizzlingSymbol, number>>;
  wild: { symbol: "WILD_2X"; multiplierBase: number; purePayout: Record<1 | 2 | 3, number> };
  bonus: { symbol: "BONUS"; triggerCount: number };
  freeGames: {
    awards: Array<{ freeSpins: number; multiplierPool: number[] }>;
    mystery: { spinCounts: number[]; multiplierPool: number[] };
  };
}

/** `grid` is what the reel actually froze on (see Reel.freezeInPlace) — the server scores and
 * pays out exactly that grid rather than drawing its own. */
export async function spinRequest(
  betMultiplier: number,
  grid: Grid,
  isFreeSpin: boolean,
  freeGameMultiplierPool: number[] | null
): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/sizzling-7s/spin", {
    betMultiplier,
    grid,
    isFreeSpin,
    freeGameMultiplierPool,
  });
  return data;
}

export async function getSizzlingSevensConfig(): Promise<SizzlingSevensConfigResponse> {
  const { data } = await apiClient.get<SizzlingSevensConfigResponse>("/api/games/sizzling-7s/config");
  return data;
}
