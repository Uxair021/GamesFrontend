import { apiClient } from "../../api/client";

export type FruitySymbol =
  | "APPLE"
  | "LEMON"
  | "ORANGE"
  | "PEACH"
  | "PINEAPPLE"
  | "GRAPE"
  | "WATERMELON"
  | "DRAGON_FRUIT"
  | "SEVEN"
  | "BAR"
  | "STAR"
  | "BONUS";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  symbol: FruitySymbol;
  payout: number;
}

export interface SpinResponse {
  reels: [FruitySymbol, FruitySymbol, FruitySymbol][];
  lineSymbols: [FruitySymbol, FruitySymbol, FruitySymbol];
  winTierKey: string | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  freeSpinsAwarded: number;
  balance: number;
  meta: { forced: boolean };
}

export interface Fruity777ConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  betLevels: number[];
  freeSpins: { min: number; max: number };
}

export async function spinRequest(betAmount: number, freeSpin = false): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/fruity-777/spin", {
    betAmount,
    freeSpin,
  });
  return data;
}

export async function getFruity777Config(): Promise<Fruity777ConfigResponse> {
  const { data } = await apiClient.get<Fruity777ConfigResponse>("/api/games/fruity-777/config");
  return data;
}
