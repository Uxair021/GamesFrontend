import { Assets, Texture } from "pixi.js";
import { RubberDuckSymbol } from "../api";

const ASSET_BASE = "/symbols/rubberDuck";

const SYMBOL_FILES: Record<RubberDuckSymbol, string> = {
  TRIPLE_7: "tripple7.png",
  DOUBLE_7: "double7.png",
  SEVEN: "7.png",
  BOAT: "boat.png",
  GUN: "gun.png",
  TOOL: "tool.png",
  SHAMPOO: "shampoo.png",
  TOWEL: "towel.png",
  BRUSH: "brush.png",
  SAFEGUARD: "saveGaurd.png",
  CAP: "cap.png",
  POT: "pot.png",
  SOAP: "soap.png",
  SPONGE: "sponch.png",
  BONUS: "bonus.png",
  AVOCADO: "avacado.png",
  BANANA: "banana.png",
  COCONUT: "coconut.png",
  GRAPES: "grapes.png",
  LEMON: "lemon.png",
  STRAWBERRY: "strawberry.png",
};

export async function loadSymbolTextures(): Promise<Record<RubberDuckSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [RubberDuckSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Assets.load<Texture>(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<RubberDuckSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  return Assets.load<Texture>(`${ASSET_BASE}/bg.png`);
}

/** Ornamental frame shown around a reel's symbol whenever it lands on BONUS — see Reel.ts's
 * updateBonusFrame. */
export async function loadFrameTexture(): Promise<Texture> {
  return Assets.load<Texture>(`${ASSET_BASE}/frame.png`);
}
