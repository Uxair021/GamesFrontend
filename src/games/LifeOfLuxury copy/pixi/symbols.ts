import { Assets, Texture } from "pixi.js";
import { LifeOfLuxurySymbol } from "../api";

const ASSET_BASE = "/symbols/lifeOfLuxury";

/** daimond.png is the WILD symbol — it substitutes for any of the 9 regular symbols in a payline
 * run (see backEnd/src/games/LifeOfLuxury/winCalc.ts's evaluatePayline) and only ever lands on
 * reels 2/3/4 (see WILD_ALLOWED_REELS in backEnd/src/games/LifeOfLuxury/config.ts). */
const SYMBOL_FILES: Record<LifeOfLuxurySymbol, string> = {
  AEROPLANE: "aeroplane.png",
  BOAT: "boat.png",
  CAR: "car.png",
  RING: "ring.png",
  MONEY: "money.png",
  WATCH: "watch.png",
  GOLD_BAR: "goldBar.png",
  SILVER_BAR: "silverBar.png",
  BRONZE_BAR: "bronzeBar.png",
  COIN: "coin.png",
  WILD: "daimond.png",
};

export async function loadSymbolTextures(): Promise<Record<LifeOfLuxurySymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [LifeOfLuxurySymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Assets.load<Texture>(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<LifeOfLuxurySymbol, Texture>;
}
