import { apiClient } from "../../api/client";

export type FiveXSymbol =
  | "WHITE_BAR"
  | "SEVEN_BAR"
  | "RED_BAR"
  | "PURPLE_BAR"
  | "RED_7"
  | "PURPLE_7"
  | "BLUE_7"
  | "COIN_2X"
  | "COIN_3X"
  | "COIN_4X"
  | "COIN_5X";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export type WinType = "SPECIAL_JACKPOT" | "SYMBOL_MATCH" | "SYMBOL_WITH_MULTIPLIERS" | "ANY3_MATCH" | "MULTIPLIER_ONLY" | "NO_WIN";

export interface WinResult {
  isWin: boolean;
  baseCombination: FiveXSymbol | "ANY3_BAR_WITH_7BAR" | "ANY3_BAR_ONLY" | null;
  baseMultiplier: number;
  bonusMultipliers: number[];
  stackedMultiplier: number;
  finalMultiplier: number;
  payout: number;
  winType: WinType;
}

export interface SpinResponse {
  reels: [FiveXSymbol, FiveXSymbol, FiveXSymbol];
  winResult: WinResult;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
  meta: { forced: boolean };
}

export interface PayoutRow {
  label: string;
  payout: number;
}

export interface FiveXRewindConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  betLevels: number[];
}

export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/5x-rewind/spin", { betAmount });
  return data;
}

export async function getFiveXRewindConfig(): Promise<FiveXRewindConfigResponse> {
  const { data } = await apiClient.get<FiveXRewindConfigResponse>("/api/games/5x-rewind/config");
  return data;
}
