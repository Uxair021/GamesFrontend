import { Assets, Texture } from "pixi.js";
import { Mega10xSymbol } from "../api";

const ASSET_BASE = "/symbols/mega10x";

const SYMBOL_FILES: Record<Mega10xSymbol, string> = {
  TEN_X: "10x.png",
  THREE_X: "3x.png",
  SEVEN: "7.png",
  SEVEN_BAR: "7Bar.png",
  TRIPLE_BAR: "TripleBar.png",
  DOUBLE_BAR: "doubleBar.png",
  SINGLE_BAR: "singleBar.png",
  CHERRY: "cherry.png",
};

export async function loadSymbolTextures(): Promise<Record<Mega10xSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [Mega10xSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Assets.load<Texture>(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<Mega10xSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  return Assets.load<Texture>(`${ASSET_BASE}/bg.png`);
}
