import { Assets, Texture } from "pixi.js";
import { FruitySymbol } from "../api";

const ASSET_BASE = "/symbols/fruity777";

// On-disk filenames as provided (kept as-is rather than renamed — note the two typos:
// "graps.png"/"watermellon.png").
const SYMBOL_FILES: Record<FruitySymbol, string> = {
  APPLE: "apple.png",
  LEMON: "lemon.png",
  ORANGE: "orange.png",
  PEACH: "peach.png",
  PINEAPPLE: "pineapple.png",
  GRAPE: "graps.png",
  WATERMELON: "watermellon.png",
  DRAGON_FRUIT: "dragonFruit.png",
  SEVEN: "7.png",
  BAR: "bar.png",
  STAR: "luckyStar.png",
  BONUS: "bonus.png",
};

export async function loadSymbolTextures(): Promise<Record<FruitySymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [FruitySymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Assets.load<Texture>(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<FruitySymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  return Assets.load<Texture>(`${ASSET_BASE}/bg.png`);
}
