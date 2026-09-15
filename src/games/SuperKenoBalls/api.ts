import { apiClient } from "../../api/client";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface SuperKenoBallsConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: number[][];
  betLevels: number[];
  poolSize: number;
  drawnCount: number;
  minPicks: number;
  maxPicks: number;
  bonusMultiplier: number;
}

export interface SuperKenoBallsSpinResponse {
  picks: number[];
  drawn: number[];
  matched: number[];
  bonusBall: number;
  bonusHit: boolean;
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
}

export async function getSuperKenoBallsConfig(): Promise<SuperKenoBallsConfigResponse> {
  const { data } = await apiClient.get<SuperKenoBallsConfigResponse>("/api/games/super-keno-balls/config");
  return data;
}

export async function spinSuperKenoBalls(betAmount: number, picks: number[]): Promise<SuperKenoBallsSpinResponse> {
  const { data } = await apiClient.post<SuperKenoBallsSpinResponse>("/api/games/super-keno-balls/spin", {
    betAmount,
    picks,
  });
  return data;
}
