import { apiClient } from "../../api/client";

export type CrazySymbol = "SEVEN_LOW" | "SEVEN_MID" | "SEVEN_HIGH" | "SINGLE_BAR" | "DOUBLE_BAR";

export type SpecialSymbol = "MULT_2X" | "MULT_5X" | "MULT_10X" | "DOLLAR_PLUS" | "DOUBLE_DOLLAR_PLUS" | "RESPIN";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  symbol: CrazySymbol | "ANY_SEVEN" | "ANY_BAR" | "ANY_GLOBAL";
  payout: number;
}

export interface SpecialPayoutRow {
  symbol: SpecialSymbol;
  label: string;
  effect: string;
  /** Bet-multiplier bonus for DOLLAR_PLUS/DOUBLE_DOLLAR_PLUS (finalWin = baseWin + this × bet) — null for the others. */
  betMultiplier: number | null;
}

export interface SpinResponse {
  reels: [CrazySymbol, CrazySymbol, CrazySymbol][];
  lineSymbols: [CrazySymbol, CrazySymbol, CrazySymbol];
  specialReel: [SpecialSymbol, SpecialSymbol, SpecialSymbol];
  lineWinTierKey: string | null;
  baseWin: number;
  winAmount: number;
  respinsAwarded: number;
  tier: WinTierName | null;
  /** Which of reels 0-2 (if any) should land physically between two symbols instead of
   * squarely on one — how a loss is represented (no separate "EMPTY" symbol). */
  emptyReelIndex: number | null;
  /** True when the special reel should land physically between two symbols (no bonus this round). */
  specialIsHalfStop: boolean;
  balance: number;
  meta: { forced: boolean };
}

export interface Crazy777ConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  specialPaytable: SpecialPayoutRow[];
  betLevels: number[];
}

export async function spinRequest(betAmount: number, respin = false): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/crazy-777/spin", { betAmount, respin });
  return data;
}

export async function getCrazy777Config(): Promise<Crazy777ConfigResponse> {
  const { data } = await apiClient.get<Crazy777ConfigResponse>("/api/games/crazy-777/config");
  return data;
}
