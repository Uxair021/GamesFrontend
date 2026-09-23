import { Assets, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { SizzlingSymbol } from "../api";

const SYMBOL_PATHS: Record<SizzlingSymbol, string> = {
  RED_7: "/symbols/sizzling7s/red-7.webp",
  BLUE_7: "/symbols/sizzling7s/blue-7.webp",
  BAR: "/symbols/sizzling7s/bar.webp",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.webp",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.webp",
  WILD_2X: "/symbols/sizzling7s/2xWild.webp",
  BONUS: "/symbols/sizzling7s/bonus.webp",
};

/** Symbols with a matching win .gif — plays in place of the static PNG on a winning cell.
 * BONUS has no .gif (pulses instead, see Reel.ts's playWinAt). Every other symbol is excluded
 * here — they all have their own numbered frame sequences instead (see WIN_FRAME_SETS below),
 * which take priority. Kept as a (currently empty) map rather than removed outright, so a future
 * symbol can still be wired up this way without re-adding the plumbing. */
const WIN_GIF_PATHS: Partial<Record<SizzlingSymbol, string>> = {};

/** Symbols whose bonus win animation is a numbered sequence of frame images (1.webp, 2.webp,
 * ...) in its own folder, played as a PIXI.AnimatedSprite instead of a decoded .gif — same
 * technique as Buffalo777's TEN/JACK/KING frame sets (see that game's own pixi/symbols.ts).
 * Takes priority over WIN_GIF_PATHS for the same symbol.
 *
 * `animationSpeed` is PIXI's AnimatedSprite playback rate — how many source frames advance per
 * rendered frame at 60fps, so 1 = 60fps, 0.5 = 30fps, 0.2 = 12fps, etc. Tune it per symbol here
 * (e.g. raise WILD_2X's to make its 11 frames cycle faster) — Reel.ts's buildWinVisual reads it
 * via getWinFrameAnimationSpeed() instead of hardcoding one shared value for every symbol. */
const WIN_FRAME_SETS: Partial<Record<SizzlingSymbol, { dir: string; frameCount: number; animationSpeed: number }>> = {
  RED_7: { dir: "red 7 sprite", frameCount: 7, animationSpeed: 0.2 },
  BLUE_7: { dir: "blue 7 sprite", frameCount: 7, animationSpeed: 0.2 },
  BAR: { dir: "bar sprite", frameCount: 9, animationSpeed: 0.2 },
  DOUBLE_BAR: { dir: "bar2 sprite", frameCount: 14, animationSpeed: 0.2 },
  WILD_2X: { dir: "2xWild", frameCount: 11, animationSpeed: 0.1 },
  TRIPLE_BAR: { dir: "bar3 sprite", frameCount: 9, animationSpeed: 0.2 },
};

/** Reel.ts's per-symbol AnimatedSprite playback rate — see WIN_FRAME_SETS's animationSpeed doc
 * comment above. Falls back to 0.2 for a symbol with no frame set (shouldn't be called in that
 * case, but keeps this total rather than possibly-undefined). */
export function getWinFrameAnimationSpeed(symbol: SizzlingSymbol): number {
  return WIN_FRAME_SETS[symbol]?.animationSpeed ?? 0.2;
}

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

async function loadFrameSet({ dir, frameCount }: { dir: string; frameCount: number }): Promise<Texture[]> {
  return Promise.all(
    Array.from({ length: frameCount }, (_, i) => Assets.load<Texture>(`/symbols/sizzling7s/${dir}/${i + 1}.webp`))
  );
}

/** Decoded frame `Texture[]` per symbol in WIN_FRAME_SETS — loaded exactly once here; Reel.ts
 * builds a fresh AnimatedSprite from the shared array every time that symbol's win animation is
 * needed, instead of re-fetching the frame set on every win. */
export async function loadWinFrameAnimations(): Promise<Partial<Record<SizzlingSymbol, Texture[]>>> {
  const entries = await Promise.all(
    (Object.entries(WIN_FRAME_SETS) as [SizzlingSymbol, { dir: string; frameCount: number }][]).map(
      async ([symbol, spec]) => [symbol, await loadFrameSet(spec)] as const
    )
  );
  return Object.fromEntries(entries) as Partial<Record<SizzlingSymbol, Texture[]>>;
}
