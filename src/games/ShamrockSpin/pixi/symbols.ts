import { Texture } from "pixi.js";
import { SlotSymbol } from "../api";

const ASSET_BASE = "/symbols/shamrockSpin";

const SYMBOL_FILES: Record<SlotSymbol, string> = {
  SHAMROCK_WILD: "Shamrock Spin.png",
  SHAMROCK_1: "Shamrock Spin 1.png",
  SHAMROCK_2: "Shamrock Spin 2.png",
  SHAMROCK_3: "Shamrock Spin 3.png",
  SHAMROCK_4: "Shamrock Spin 4.png",
  GREEN_SEVEN: "Green 7.png",
  ORANGE_SEVEN: "Orange 7.png",
  YELLOW_SEVEN: "Yellow 7.png",
  TRIPLE_BAR: "BAR BAR BAR.png",
  DOUBLE_BAR: "BAR BAR.png",
  SINGLE_BAR: "BAR.png",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/** Strips near-white pixels to transparent — some source art (e.g. Orange 7) ships on an opaque white card. */
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

export async function loadSymbolTextures(): Promise<Record<SlotSymbol, Texture>> {
  const entries = await Promise.all(
    (Object.entries(SYMBOL_FILES) as [SlotSymbol, string][]).map(
      async ([symbol, file]) => [symbol, await loadChromaKeyedTexture(`${ASSET_BASE}/${encodeURIComponent(file)}`)] as const
    )
  );
  return Object.fromEntries(entries) as Record<SlotSymbol, Texture>;
}

export async function loadBackgroundTexture(): Promise<Texture> {
  const img = await loadImage(`${ASSET_BASE}/bg.png`);
  return Texture.from(img);
}
