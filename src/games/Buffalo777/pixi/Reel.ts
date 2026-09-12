import { BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { BuffaloSymbol } from "../api";

const FILLER_COUNT = 18;
const SYMBOL_PADDING = 20;
const GLOW_PULSE_PERIOD_MS = 520;
/** How dim the non-payline (above/below) rows go while the payline is celebrating a win. */
const NON_PAYLINE_DIM_ALPHA = 0.32;

export class Reel {
  public readonly container: Container;
  private textures: Record<BuffaloSymbol, Texture>;
  private gifTemplates: Partial<Record<BuffaloSymbol, AnimatedGIF>>;
  private fillerPool: BuffaloSymbol[];
  private pendingTimeouts: number[] = [];
  private pendingFrames: Array<() => void> = [];
  /**
   * y-index (in cellHeight units) the *next* prepended cell will take — always decreases
   * (more negative) with each prepend, so new cells stack above whatever's already there.
   * Reset to 0 by keepOnly()/showStatic() after every spin settles, so this never drifts to
   * an ever-larger magnitude across many spins.
   */
  private nextSlotAbove = 0;
  /** [above, middle, below] cells currently on screen — middle is the scored payline symbol. */
  private visibleCells: Container[] = [];
  private glowGraphics: Container | null = null;
  private glowRafId: number | null = null;
  /** The bonus win animation currently playing on the payline symbol, if any. */
  private activeGif: AnimatedGIF | null = null;
  /** Clips activeGif to exactly the cell bounds so its cover-fit scale (fills both axes,
   * no letterboxing) can't bleed into the dimmed rows above/below. */
  private activeGifMask: Graphics | null = null;

  constructor(
    textures: Record<BuffaloSymbol, Texture>,
    gifTemplates: Partial<Record<BuffaloSymbol, AnimatedGIF>>,
    private cellWidth: number,
    private cellHeight: number
  ) {
    this.textures = textures;
    this.gifTemplates = gifTemplates;
    this.fillerPool = Object.keys(textures) as BuffaloSymbol[];
    this.container = new Container();
  }

  private randomSymbol(): BuffaloSymbol {
    return this.fillerPool[Math.floor(Math.random() * this.fillerPool.length)];
  }

  private buildCell(symbol: BuffaloSymbol): Container {
    const cell = new Container();
    cell.label = symbol;
    const sprite = new Sprite(this.textures[symbol]);
    sprite.anchor.set(0.5);
    const maxW = this.cellWidth - SYMBOL_PADDING * 2;
    const maxH = this.cellHeight - SYMBOL_PADDING * 2;
    const scale = Math.min(maxW / sprite.texture.width, maxH / sprite.texture.height);
    sprite.scale.set(scale);
    (sprite as Sprite & { baseScale: number }).baseScale = scale;
    sprite.x = this.cellWidth / 2;
    sprite.y = this.cellHeight / 2;
    cell.addChild(sprite);
    return cell;
  }

  /** Appends cells *above* whatever's currently on screen — each successive symbol in
   * `symbols` gets placed one slot higher (more negative y) than the last, continuing on
   * from `nextSlotAbove`. As `container.y` eases downward (more positive) toward its
   * resting value, this newly-placed stack (and the old stack sitting below it, at
   * less-negative/positive y) both slide downward on screen — new symbols enter from the
   * top, old ones exit at the bottom. Returns direct references — never rely on
   * container.children order afterwards (see keepOnly). */
  private prependCells(symbols: BuffaloSymbol[]): Container[] {
    const cells: Container[] = [];
    symbols.forEach((sym) => {
      this.nextSlotAbove -= 1;
      const cell = this.buildCell(sym);
      cell.y = this.nextSlotAbove * this.cellHeight;
      this.container.addChild(cell);
      cells.push(cell);
    });
    return cells;
  }

  /** Renders the reel showing exactly these 3 symbols (above/middle/below), no animation. */
  showStatic(target: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol]): void {
    this.stopWinGlow();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.container.y = 0;
    this.nextSlotAbove = 0;
    const cells = target.map((sym, i) => {
      const cell = this.buildCell(sym);
      cell.y = i * this.cellHeight;
      this.container.addChild(cell);
      return cell;
    });
    this.visibleCells = cells;
  }

  /**
   * Spins and lands exactly on `target` (above/middle/below on the payline), scrolling
   * top-to-bottom — new symbols fall into place from above the visible window, existing
   * ones continue down and out the bottom. Continues from whatever's currently displayed
   * (filler + target prepended above the existing cells, never a jump/flash at the start).
   */
  spinTo(
    target: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol],
    duration: number,
    delay: number,
    fillerCount: number = FILLER_COUNT
  ): Promise<void> {
    this.stopWinGlow();
    if (this.visibleCells.length === 0) {
      // Nothing on screen yet (first render) — seed with a static frame to continue from.
      this.showStatic([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
    }

    const startY = this.container.y;
    const filler: BuffaloSymbol[] = Array.from({ length: fillerCount }, () => this.randomSymbol());
    // Prepend order matters: filler first (ends up *below* the target, closer to the old
    // stack — passes through the window first), then target BELOW->MIDDLE->ABOVE last, so
    // "above" ends up the most-negative (topmost) of the three, per prependCells' contract.
    this.prependCells(filler);
    const targetCells = this.prependCells([target[2], target[1], target[0]]).reverse(); // -> [above, middle, below]

    // After both prepend calls above, `nextSlotAbove` is exactly the "above" target cell's
    // slot index (it was the very last decrement applied) — landing it at window-local y=0
    // means the container must shift by the negation of that.
    const finalY = -this.nextSlotAbove * this.cellHeight;

    return new Promise((resolve) => {
      let rafId = 0;
      const timeoutId = window.setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          // Clamped to >=0 — see WinCelebration.tsx for why requestAnimationFrame's
          // timestamp can otherwise come in marginally before `start`.
          const t = Math.min(Math.max((now - start) / duration, 0), 1);
          // Ease-out only — the reel snaps straight to full speed the instant it starts (no
          // ramp-up), then decelerates smoothly into the landing.
          const eased = 1 - Math.pow(1 - t, 3);
          this.container.y = startY + (finalY - startY) * eased;
          if (t < 1) {
            rafId = requestAnimationFrame(tick);
          } else {
            this.container.y = finalY;
            this.keepOnly(targetCells);
            resolve();
          }
        };
        rafId = requestAnimationFrame(tick);
      }, delay);

      this.pendingTimeouts.push(timeoutId);
      this.pendingFrames.push(() => cancelAnimationFrame(rafId));
    });
  }

  /** Destroys every cell except `keep` (by direct reference) and recoordinates `keep` to y=0, so the child list never grows unbounded across spins. Purely internal bookkeeping — no visible change since `keep` is already what's on screen. */
  private keepOnly(keep: Container[]): void {
    const toRemove = this.container.children.filter((c) => !keep.includes(c));
    toRemove.forEach((c) => {
      this.container.removeChild(c);
      c.destroy({ children: true });
    });
    keep.forEach((cell, i) => {
      cell.y = i * this.cellHeight;
    });
    this.nextSlotAbove = 0;
    this.container.y = 0;
    this.visibleCells = keep;
  }

  /** Gold glow + border pulse on the payline (middle) symbol — loops until stopWinGlow() is
   * called. Also dims the above/below rows so the win reads clearly, and swaps in a bonus
   * .gif animation over the payline symbol if one exists for it. */
  startWinGlow(): void {
    this.stopWinGlow();
    const middle = this.visibleCells[1];
    const sprite = middle?.children[0] as (Sprite & { baseScale: number }) | undefined;
    if (!middle || !sprite) return;

    if (this.visibleCells[0]) this.visibleCells[0].alpha = NON_PAYLINE_DIM_ALPHA;
    if (this.visibleCells[2]) this.visibleCells[2].alpha = NON_PAYLINE_DIM_ALPHA;

    const symbol = middle.label as BuffaloSymbol;
    const template = this.gifTemplates[symbol];
    if (template) {
      // Clone reuses the template's already-decoded frames (cheap) instead of re-parsing
      // the raw GIF file (expensive — this art is ~9MB/161 frames, would otherwise freeze
      // the main thread for seconds on every single win).
      const gif = template.clone();
      gif.loop = true;
      gif.anchor.set(0.5);
      // Unlike the static symbol PNGs (which ship with real card-border margin baked in,
      // hence SYMBOL_PADDING), this art fills its frame edge-to-edge — cover-fit (scale up
      // to fill both axes, cropping any excess) instead of contain-fit, so there's no
      // letterboxing. The mask below clips the crop to the cell so it can't bleed into the
      // dimmed rows above/below.
      const scale = Math.max(this.cellWidth / gif.texture.width, this.cellHeight / gif.texture.height);
      gif.scale.set(scale);
      gif.x = this.cellWidth / 2;
      gif.y = this.cellHeight / 2;

      const mask = new Graphics();
      mask.rect(0, 0, this.cellWidth, this.cellHeight);
      mask.fill({ color: 0xffffff });
      middle.addChild(mask);
      gif.mask = mask;
      this.activeGifMask = mask;

      sprite.visible = false;
      middle.addChild(gif);
      gif.play();
      this.activeGif = gif;
    }

    // Soft blurred backdrop for a diffuse glow...
    const backdrop = new Graphics();
    backdrop.roundRect(-6, -6, this.cellWidth + 12, this.cellHeight + 12, 12);
    backdrop.fill({ color: 0xffb300 });
    backdrop.filters = [new BlurFilter({ strength: 18 })];

    // ...plus a crisp pulsing border on top, so it reads clearly even against the light reel background.
    const border = new Graphics();

    const glow = new Container();
    glow.addChild(backdrop, border);
    middle.addChildAt(glow, 0);
    this.glowGraphics = glow;

    const start = performance.now();
    const animate = () => {
      const elapsed = performance.now() - start;
      const pulse = 0.5 + 0.5 * Math.sin((elapsed / GLOW_PULSE_PERIOD_MS) * Math.PI * 2);

      backdrop.alpha = 0.5 + pulse * 0.5;
      border.clear();
      border.roundRect(-4, -4, this.cellWidth + 8, this.cellHeight + 8, 10);
      border.stroke({ color: 0xffd700, width: 3 + pulse * 3, alpha: 0.7 + pulse * 0.3 });

      sprite.scale.set(sprite.baseScale * (1 + pulse * 0.09));
      sprite.tint = pulse > 0.5 ? 0xfff2c0 : 0xffffff;
      this.glowRafId = requestAnimationFrame(animate);
    };
    this.glowRafId = requestAnimationFrame(animate);
  }

  stopWinGlow(): void {
    if (this.glowRafId !== null) {
      cancelAnimationFrame(this.glowRafId);
      this.glowRafId = null;
    }
    if (this.glowGraphics) {
      this.glowGraphics.destroy();
      this.glowGraphics = null;
    }
    if (this.activeGif) {
      this.activeGif.mask = null;
      this.activeGif.parent?.removeChild(this.activeGif);
      this.activeGif.destroy();
      this.activeGif = null;
    }
    if (this.activeGifMask) {
      this.activeGifMask.parent?.removeChild(this.activeGifMask);
      this.activeGifMask.destroy();
      this.activeGifMask = null;
    }
    this.visibleCells.forEach((cell) => {
      cell.alpha = 1;
      const sprite = cell.children[0] as (Sprite & { baseScale: number }) | undefined;
      if (sprite) {
        sprite.visible = true;
        sprite.scale.set(sprite.baseScale);
        sprite.tint = 0xffffff;
      }
    });
  }

  destroy(): void {
    this.stopWinGlow();
    this.pendingTimeouts.forEach((id) => window.clearTimeout(id));
    this.pendingFrames.forEach((cancel) => cancel());
    this.container.destroy({ children: true });
  }
}
