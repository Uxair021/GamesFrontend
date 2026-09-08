import { apiClient } from "../../api/client";

export type SlotSymbol =
  | "SHAMROCK_WILD"
  | "SHAMROCK_1"
  | "SHAMROCK_2"
  | "SHAMROCK_3"
  | "SHAMROCK_4"
  | "GREEN_SEVEN"
  | "ORANGE_SEVEN"
  | "YELLOW_SEVEN"
  | "TRIPLE_BAR"
  | "DOUBLE_BAR"
  | "SINGLE_BAR";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export type WinRuleId =
  | "WILD_JACKPOT"
  | "GREEN_SEVEN"
  | "ORANGE_SEVEN"
  | "YELLOW_SEVEN"
  | "TRIPLE_BAR"
  | "ANY_SEVENS"
  | "ANY_BARS"
  | "SINGLE_BAR"
  | "TWO_WILDS"
  | "ONE_WILD";

export interface WinRule {
  id: WinRuleId;
  basePayout: number;
  freeSpinPayout: number;
}

export interface SpinResponse {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol][];
  lineSymbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  winRuleId: WinRuleId | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  freeSpinsAwarded: number;
  balance: number;
  meta: { forced: boolean };
}

export interface ShamrockConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  winRules: WinRule[];
  betLevels: number[];
  maxTotalFreeSpins: number;
}

export async function spinRequest(betAmount: number, freeSpin = false): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/shamrock-spin/spin", {
    betAmount,
    freeSpin,
  });
  return data;
}

export async function getShamrockConfig(): Promise<ShamrockConfigResponse> {
  const { data } = await apiClient.get<ShamrockConfigResponse>("/api/games/shamrock-spin/config");
  return data;
}
