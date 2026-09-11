import { Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { BuffaloSymbol } from "../api";

const ASSET_BASE = "/symbols/buffalo777";

const SYMBOL_FILES: Record<BuffaloSymbol, string> = {
  TEN: "10.webp",
  JACK: "J.webp",
  QUEEN: "Q.webp",
  KING: "K.webp",
  ACE: "A.webp",
  BULL: "bull.webp",
  SINGLE_BAR: "SingleBar.webp",
  DOUBLE_BAR: "DoubleBar.webp",
  TRIPLE_BAR: "TripleBar.webp",
  MONEY_BAG: "MoneyBag.webp",
  COIN: "Coin.webp",
};

/** Symbols with a bonus win animation — plays in place of the static image on the payline
 * cell when that symbol lands as part of a win. Add more here as more .gifs are provided. */
const WIN_GIF_FILES: Partial<Record<BuffaloSymbol, string>> = {
  QUEEN: "Q.gif",
  TEN: "10.gif",
  JACK: "J.gif",
  KING: "K.gif",
  SINGLE_BAR: "SingleBar.gif",
  DOUBLE_BAR: "DoubleBar.gif",
  TRIPLE_BAR: "TripleBar.gif",
  COIN: "coin.gif",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/** Strips near-white pixels to transparent — matches the technique already proven for
 * Shamrock Spin/Cash Machine's source art, which ships on opaque white/near-white cards. */
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

export async function loadSymbolTextures(): Promise<Record<BuffaloSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [BuffaloSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await loadChromaKeyedTexture(`${ASSET_BASE}/${file}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<BuffaloSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/bg.webp`);
  return Texture.from(img);
}

/** Decoded (but not playing) template `AnimatedGIF` per symbol that has a win animation —
 * the actual GIF parse + frame-decompress (expensive: this art is ~9MB/161 frames) happens
 * exactly once here, up front. Reel.ts clones this template (cheap — just a frame-array
 * reference copy + a fresh canvas) every time a win animation is needed, instead of
 * re-decoding the raw file on every win. */
export async function loadWinGifAnimations(): Promise<Partial<Record<BuffaloSymbol, AnimatedGIF>>> {
  const entries = await Promise.all(
    (Object.entries(WIN_GIF_FILES) as [BuffaloSymbol, string][]).map(async ([symbol, file]) => {
      const res = await fetch(`${ASSET_BASE}/${file}`);
      const buffer = await res.arrayBuffer();
      const template = AnimatedGIF.fromBuffer(buffer, { loop: true, autoPlay: false });
      return [symbol, template] as const;
    })
  );
  return Object.fromEntries(entries) as Partial<Record<BuffaloSymbol, AnimatedGIF>>;
}
