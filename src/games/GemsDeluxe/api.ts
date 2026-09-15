import { apiClient } from "../../api/client";

export type GemsDeluxeSymbol = "SEVEN" | "TRIPLE_BAR" | "DOUBLE_BAR" | "SINGLE_BAR" | "DIAMOND" | "DOLLAR";

/** [above, middle, below] for one reel — middle is the scored payline symbol. Every position
 * always shows a real symbol (no blank) — a loss is instead represented by one reel landing
 * half-stopped (see emptyReelIndex below and pixi/Reel.ts's spinTo). */
export interface ReelResult {
  symbols: [GemsDeluxeSymbol, GemsDeluxeSymbol, GemsDeluxeSymbol];
}

export interface PayoutRow {
  key: "SEVEN" | "TRIPLE_BAR" | "DOUBLE_BAR" | "SINGLE_BAR" | "ANY_BAR" | "DIAMOND_ONE" | "DIAMOND_TWO" | "DIAMOND_THREE";
  payout: number;
}

export interface BonusPoolRow {
  key: string;
  value: number;
}

export interface GemsDeluxeConfigResponse {
  meta: { id: string; name: string; description: string; minBet: number; maxBet: number };
  paytable: PayoutRow[];
  bonusPool: BonusPoolRow[];
  offerCount: number;
  betLevels: number[];
}

interface SpinResponseBase {
  reels: [ReelResult, ReelResult, ReelResult];
  winAmount: number;
  balance: number;
}

export interface SpinResponseLine extends SpinResponseBase {
  bonusTriggered: false;
  /** Which of the 3 reels (0-2) lands half-stopped — how a loss is shown, no blank symbol
   * needed. null on an actual win. */
  emptyReelIndex: number | null;
}

export interface SpinResponseBonus extends SpinResponseBase {
  bonusTriggered: true;
  bonusId: string;
  currentOffer: number;
  offerNumber: number;
  offerCount: number;
  isLastOffer: boolean;
}

export type SpinResponse = SpinResponseLine | SpinResponseBonus;

export interface BonusAdvanceResponse {
  currentOffer: number;
  offerNumber: number;
  offerCount: number;
  isLastOffer: boolean;
}

export interface BonusResolveResponse {
  balance: number;
  winAmount: number;
}

export async function getGemsDeluxeConfig(): Promise<GemsDeluxeConfigResponse> {
  const { data } = await apiClient.get<GemsDeluxeConfigResponse>("/api/games/gems-deluxe/config");
  return data;
}

export async function spinRequest(betAmount: number): Promise<SpinResponse> {
  const { data } = await apiClient.post<SpinResponse>("/api/games/gems-deluxe/spin", { betAmount });
  return data;
}

export async function bonusAdvanceRequest(bonusId: string): Promise<BonusAdvanceResponse> {
  const { data } = await apiClient.post<BonusAdvanceResponse>("/api/games/gems-deluxe/bonus-advance", { bonusId });
  return data;
}

export async function bonusResolveRequest(bonusId: string): Promise<BonusResolveResponse> {
  const { data } = await apiClient.post<BonusResolveResponse>("/api/games/gems-deluxe/bonus-resolve", { bonusId });
  return data;
}
