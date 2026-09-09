import { apiClient } from "../../api/client";

export type Mega10xSymbol =
  | "TEN_X"
  | "THREE_X"
  | "SEVEN"
  | "SEVEN_BAR"
  | "TRIPLE_BAR"
  | "DOUBLE_BAR"
  | "SINGLE_BAR"
  | "CHERRY";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  label: string;
  symbol: Mega10xSymbol | null;
  payout: number;
}

export interface SpinResponse {
  reels: [Mega10xSymbol, Mega10xSymbol, Mega10xSymbol][];
  lineSymbols: [Mega10xSymbol, Mega10xSymbol, Mega10xSymbol];
  winTierKey: string | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
  meta: { forced: boolean };
}

export interface Mega10xPayConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  betLevels: number[];
}

export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/mega-10x-pay/spin", { betAmount });
  return data;
}

export async function getMega10xPayConfig(): Promise<Mega10xPayConfigResponse> {
  const { data } = await apiClient.get<Mega10xPayConfigResponse>("/api/games/mega-10x-pay/config");
  return data;
}
