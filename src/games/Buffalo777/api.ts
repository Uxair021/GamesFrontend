import { apiClient } from "../../api/client";

export type BuffaloSymbol =
  | "TEN"
  | "JACK"
  | "QUEEN"
  | "KING"
  | "ACE"
  | "BULL"
  | "SINGLE_BAR"
  | "DOUBLE_BAR"
  | "TRIPLE_BAR"
  | "MONEY_BAG"
  | "COIN";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface PayoutRow {
  symbol: BuffaloSymbol | "ANY_BAR";
  payout: number;
}

export interface SpinResponse {
  reels: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol][];
  lineSymbols: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol];
  winTierKey: string | null;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
  meta: { forced: boolean };
}

export interface Buffalo777ConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  betLevels: number[];
}

export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/buffalo-777/spin", { betAmount });
  return data;
}

/** Asks the server to pre-compute and hold the next spin's result for this bet amount, so
 * a spin placed soon after can redeem it instantly instead of waiting on a fresh RNG
 * round-trip — see the backend's `/spin/reserve` route. Purely a background optimization:
 * the outcome itself is never returned here, and a failed/slow reservation just means the
 * next spin falls back to today's live behavior, so callers should treat this as
 * fire-and-forget and swallow errors. */
export async function reserveSpinRequest(betAmount: number): Promise<void> {
  await apiClient.post("/api/games/buffalo-777/spin/reserve", { betAmount });
}

export async function getBuffalo777Config(): Promise<Buffalo777ConfigResponse> {
  const { data } = await apiClient.get<Buffalo777ConfigResponse>("/api/games/buffalo-777/config");
  return data;
}
