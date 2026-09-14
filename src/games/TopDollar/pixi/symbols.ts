import { Texture } from "pixi.js";
import { TopDollarSymbol } from "../api";

const ASSET_BASE = "/symbols/dollarGame";

const SYMBOL_FILES: Record<TopDollarSymbol, string> = {
  SEVEN: "7.png",
  TRIPLE_BAR: "TripleBar.png",
  DOUBLE_BAR: "doubleBar.png",
  SINGLE_BAR: "singleBar.png",
  DIAMOND: "daimond.png",
  DOLLAR: "dollar.png",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/** Strips near-white pixels to transparent — this game's symbol art ships on opaque white
 * cards, same technique already proven for Buffalo 777/Shamrock Spin/Cash Machine's source art. */
async function loadChromaKeyedTexture(url: string): Promise<Texture> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) d[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);

  return Texture.from(canvas);
}

export async function loadSymbolTextures(): Promise<Record<TopDollarSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [TopDollarSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await loadChromaKeyedTexture(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<TopDollarSymbol, Texture>;
}

export async function loadBottomScreenTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/bottomScreen.png`);
  return Texture.from(img);
}

export async function loadTopScreenTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/topScreen.png`);
  return Texture.from(img);
}

/** A single stack-of-bills prop, reused (gradient-tinted per position, see TopDollarScene's
 * buildBonusBundles) for each of the 10 note-bundle spots on the bonus board — ships with a
 * real alpha channel already (no chroma-key needed, unlike the symbol card art). */
export async function loadNoteBundleTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/notes.png`);
  return Texture.from(img);
}
