import { apiClient } from "../../api/client";
import { WinTierName } from "../shared/WinCelebration";

export type CashSymbol = "null" | "0" | "1" | "2" | "5" | "10";

export interface WinTier {
  name: WinTierName;
  minAmount: number;
}

export interface SpinResponse {
  /** Only the reels actually in play for this bet's tier — length equals activeReels. */
  symbols: CashSymbol[];
  /** How many of the 3 reels are in play at this bet (1, 2, or 3). */
  activeReels: number;
  /** Indexes (within `symbols`) of reels that got a bonus respin (0 landed elsewhere + this reel was null). */
  respunIndexes: number[];
  winAmount: number;
  tier: WinTierName | null;
  balance: number;
  meta: { forced: boolean };
}

export interface CashMachineConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  winTiers: WinTier[];
  betLevels: number[];
}

export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/cash-machine/spin", { betAmount });
  return data;
}

export async function getCashMachineConfig(): Promise<CashMachineConfigResponse> {
  const { data } = await apiClient.get<CashMachineConfigResponse>("/api/games/cash-machine/config");
  return data;
}
