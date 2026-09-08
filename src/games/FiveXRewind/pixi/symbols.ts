import { Texture, Assets } from "pixi.js";
import { FiveXSymbol } from "../api";

const ASSET_BASE = "/symbols/5xRewind";

const SYMBOL_FILES: Record<FiveXSymbol, string> = {
  WHITE_BAR: "WHITE-BAR.png",
  SEVEN_BAR: "7-BAR.png",
  RED_BAR: "RED-BAR.png",
  PURPLE_BAR: "PURPLE-BAR.png",
  RED_7: "RED-7.png",
  PURPLE_7: "PURPLE-7.png",
  BLUE_7: "BLUE-7.png",
  COIN_2X: "2X-coin.png",
  COIN_3X: "3X-coin.png",
  COIN_4X: "4X-coin.png",
  COIN_5X: "5X-coin.png",
};

/** All 11 symbol PNGs already have real alpha transparency (confirmed against the source
 * files) — no chroma-keying needed here, unlike Buffalo777's flat-white-background assets. */
export async function loadSymbolTextures(): Promise<Record<FiveXSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [FiveXSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Assets.load(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<FiveXSymbol, Texture>;
}
