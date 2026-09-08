import { Texture } from "pixi.js";
import { CrazySymbol, SpecialSymbol } from "../api";

// Note: the actual asset folder on disk is spelled "carzy777" (not "crazy777").
const ASSET_BASE = "/symbols/carzy777";

const SYMBOL_FILES: Record<CrazySymbol, string> = {
  SEVEN_LOW: "7.png",
  SEVEN_MID: "77.png",
  SEVEN_HIGH: "777.png",
  SINGLE_BAR: "singleBar.png",
  DOUBLE_BAR: "doubleBar.png",
};

const SPECIAL_SYMBOL_FILES: Record<SpecialSymbol, string> = {
  MULT_2X: "2X.png",
  MULT_5X: "5X.png",
  MULT_10X: "10X.png",
  DOLLAR_PLUS: "singleDollar.png",
  DOUBLE_DOLLAR_PLUS: "doubleDollar.png",
  RESPIN: "respin.png",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export async function loadSymbolTextures(): Promise<Record<CrazySymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [CrazySymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Texture.from(await loadImage(`${ASSET_BASE}/${file}`))] as const
    )
  );
  return Object.fromEntries(entries) as Record<CrazySymbol, Texture>;
}

export async function loadSpecialSymbolTextures(): Promise<Record<SpecialSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SPECIAL_SYMBOL_FILES) as [SpecialSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await Texture.from(await loadImage(`${ASSET_BASE}/${file}`))] as const
    )
  );
  return Object.fromEntries(entries) as Record<SpecialSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/bg.png`);
  return Texture.from(img);
}
