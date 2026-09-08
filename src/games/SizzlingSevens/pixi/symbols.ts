import { Assets, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { SizzlingSymbol } from "../api";

const SYMBOL_PATHS: Record<SizzlingSymbol, string> = {
  RED_7: "/symbols/sizzling7s/red-7.png",
  BLUE_7: "/symbols/sizzling7s/blue-7.png",
  BAR: "/symbols/sizzling7s/bar.png",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.png",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.png",
  WILD_2X: "/symbols/sizzling7s/2xWild.png",
  BONUS: "/symbols/sizzling7s/bonus.png",
};

/** Symbols with a matching win .gif — plays in place of the static PNG on a winning cell.
 * BONUS has no .gif (pulses instead, see Reel.ts's playWinAt). */
const WIN_GIF_PATHS: Partial<Record<SizzlingSymbol, string>> = {
  RED_7: "/symbols/sizzling7s/red-7.gif",
  BLUE_7: "/symbols/sizzling7s/blue-7.gif",
  BAR: "/symbols/sizzling7s/bar.gif",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.gif",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.gif",
  WILD_2X: "/symbols/sizzling7s/2xWild.gif",
};

export async function loadSymbolTextures(): Promise<Record<SizzlingSymbol, Texture>> {
  const entries = Object.entries(SYMBOL_PATHS) as [SizzlingSymbol, string][];
  const textures = await Promise.all(entries.map(([, path]) => Assets.load<Texture>(path)));
  const result = {} as Record<SizzlingSymbol, Texture>;
  entries.forEach(([symbol], i) => (result[symbol] = textures[i]));
  return result;
}

/** Decoded (but not playing) template `AnimatedGIF` per symbol that has a win animation — the
 * actual GIF parse/decompress happens exactly once here; Reel.ts clones this template (cheap)
 * every time a win animation is needed instead of re-decoding the raw file on every win. */
export async function loadWinGifAnimations(): Promise<Partial<Record<SizzlingSymbol, AnimatedGIF>>> {
  const entries = await Promise.all(
    (Object.entries(WIN_GIF_PATHS) as [SizzlingSymbol, string][]).map(async ([symbol, path]) => {
      const res = await fetch(path);
      const buffer = await res.arrayBuffer();
      const template = AnimatedGIF.fromBuffer(buffer, { loop: true, autoPlay: false });
      return [symbol, template] as const;
    })
  );
  return Object.fromEntries(entries) as Partial<Record<SizzlingSymbol, AnimatedGIF>>;
}
