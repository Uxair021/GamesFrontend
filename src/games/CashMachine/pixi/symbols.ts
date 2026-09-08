import { Texture } from "pixi.js";
import { CashSymbol } from "../api";

const ASSET_BASE = "/symbols/moneyMachine";

const SYMBOL_FILES: Record<CashSymbol, string> = {
  null: "null.png",
  "0": "0.png",
  "1": "1.png",
  "2": "2.png",
  "5": "5.png",
  "10": "10.png",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/** These PNGs already ship with transparent backgrounds — no chroma-keying needed. */
export async function loadSymbolTextures(): Promise<Record<CashSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [CashSymbol, string][]).map(
      async ([symbol, file]) => [symbol, Texture.from(await loadImage(`${ASSET_BASE}/${file}`))] as const
    )
  );
  return Object.fromEntries(entries) as Record<CashSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/bg.png`);
  return Texture.from(img);
}

/**
 * Same composition as bg.png but with the oval/shield reel windows cut out to real
 * transparency. Rendered *above* the reels so the ornate frame's opaque pixels occlude
 * any symbol/glow overflow past the window's curve, while the transparent cutouts let
 * the reel content show through in exactly the frame's true oval/shield shape — bg.png
 * underneath still provides the silver window fill since both share the same layout.
 */
export async function loadForegroundTexture(): Promise<Texture> {
  // Routed through a canvas (like the chroma-keyed symbol textures) rather than
  // Texture.from(img) directly — the direct-image upload path rendered this
  // particular file's transparent cutouts as opaque black instead of see-through,
  // even though the source pixel data itself is genuinely alpha=0 there.
  const img = await loadImage(`${ASSET_BASE}/bg2.png`);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return Texture.from(canvas);
}
