import { Assets, Texture } from "pixi.js";
import { CrystalCloverSymbol } from "../api";

const SYMBOL_PATHS: Record<CrystalCloverSymbol, string> = {
  SEVEN_CLOVER: "/symbols/crystalClover/7clover.png",
  TRIPLE_BAR: "/symbols/crystalClover/trippleBar.png",
  DOUBLE_BAR: "/symbols/crystalClover/doubleBar.png",
  BAR: "/symbols/crystalClover/bar.png",
  WILD: "/symbols/crystalClover/wild.png",
  MULTIPLIER_2X: "/symbols/crystalClover/2X.png",
};

/** All symbol PNGs already carry real alpha transparency (confirmed against the raw file
 * bytes) — unlike Buffalo777's older asset set, no chroma-keying needed here. */
export async function loadSymbolTextures(): Promise<Record<CrystalCloverSymbol, Texture>> {
  const entries = Object.entries(SYMBOL_PATHS) as [CrystalCloverSymbol, string][];
  const textures = await Promise.all(entries.map(([, path]) => Assets.load<Texture>(path)));
  const result = {} as Record<CrystalCloverSymbol, Texture>;
  entries.forEach(([symbol], i) => (result[symbol] = textures[i]));
  return result;
}

export async function loadFrameTexture(): Promise<Texture> {
  return Assets.load<Texture>("/symbols/crystalClover/frame.png");
}
