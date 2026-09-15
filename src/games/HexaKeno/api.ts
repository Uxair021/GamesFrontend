import { apiClient } from "../../api/client";

export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";

export interface HexaKenoConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: number[][];
  betLevels: number[];
  poolSize: number;
  drawnCount: number;
  minPicks: number;
  maxPicks: number;
}

export interface HexaKenoSpinResponse {
  picks: number[];
  drawn: number[];
  matched: number[];
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
}

export async function getHexaKenoConfig(): Promise<HexaKenoConfigResponse> {
  const { data } = await apiClient.get<HexaKenoConfigResponse>("/api/games/hexa-keno/config");
  return data;
}

export async function spinHexaKeno(betAmount: number, picks: number[]): Promise<HexaKenoSpinResponse> {
  const { data } = await apiClient.post<HexaKenoSpinResponse>("/api/games/hexa-keno/spin", { betAmount, picks });
  return data;
}
