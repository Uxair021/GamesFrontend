import { apiClient } from "../../api/client";

export type PayingSymbol =
  | "TRIPLE_7"
  | "DOUBLE_7"
  | "SEVEN"
  | "BOAT"
  | "GUN"
  | "TOOL"
  | "SHAMPOO"
  | "TOWEL"
  | "BRUSH"
  | "SAFEGUARD"
  | "CAP"
  | "POT"
  | "SOAP"
  | "SPONGE";

export type FruitSymbol = "AVOCADO" | "BANANA" | "COCONUT" | "GRAPES" | "LEMON" | "STRAWBERRY";

export type RubberDuckSymbol = PayingSymbol | "BONUS" | FruitSymbol;

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  symbol: PayingSymbol;
  payout: number;
}

export interface PositionWin {
  reelIndex: number;
  symbol: PayingSymbol;
  win: number;
}

export interface SpinEvaluation {
  positionWins: PositionWin[];
  winningPositions: number[];
  bonusCount: number;
  triggered: boolean;
  finalWin: number;
}

export interface SpinResponse {
  reels: RubberDuckSymbol[];
  evaluation: SpinEvaluation;
  winAmount: number;
  tier: WinTierName | null;
  freeSpinsAwarded: number | null;
  retriggered: boolean;
  freeSpinRoundResult: { totalWin: number; totalSpins: number } | null;
  balance: number;
  meta: { forced: boolean };
}

export interface RubberDuckConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  betLevels: number[];
  minBet: number;
  maxBet: number;
  paytable: PayoutRow[];
  symbolWeights: Record<string, number>;
  freeSpins: { triggerCount: number; base: number; retrigger: number; winMultiplier: number };
}

export async function spinRequest(bet: number, freeSpin = false): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/rubber-duck/spin", { bet, freeSpin });
  return data;
}

export async function getRubberDuckConfig(): Promise<RubberDuckConfigResponse> {
  const { data } = await apiClient.get<RubberDuckConfigResponse>("/api/games/rubber-duck/config");
  return data;
}
