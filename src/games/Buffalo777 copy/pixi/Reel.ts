import { BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { BuffaloSymbol } from "../api";

const SYMBOL_PADDING = 20;
/** Fallback cell count consumed while decelerating, if a caller doesn't specify one — see
 * spinTo(). Must be >= 3 (the 3 target cells alone take up that much travel). */
const DEFAULT_DECEL_CELLS = 3;
const GLOW_PULSE_PERIOD_MS = 520;
/** How dim the non-payline (above/below) rows go while the payline is celebrating a win. */
const NON_PAYLINE_DIM_ALPHA = 0.32;

export class Reel {
  public readonly container: Container;
  private textures: Record<BuffaloSymbol, Texture>;
  private gifTemplates: Partial<Record<BuffaloSymbol, AnimatedGIF>>;
  private fillerPool: BuffaloSymbol[];
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
   *
   * Two phases, timed in *cells* rather than milliseconds so there's zero rounding slack
   * between "how many filler symbols were queued up" and "how far the container actually
   * travels" — that mismatch used to make deceleration overshoot its intended duration by a
   * cell or more, inconsistently per reel. Multiple reels called with the same `speed` and
   * `startTime` stay perfectly in lockstep for as long as they're all spinning, and only
   * diverge once each starts landing:
   *  1. Constant-speed phase — exactly `spinCells` cells scroll past at `speed` px/ms.
   *     Callers stagger stops by passing a larger `spinCells` to later reels; the speed
   *     itself never changes here, so reels given the same `speed` move identically.
   *  2. Deceleration phase — eases from `speed` down to a stop, covering exactly
   *     `decelCells` cells (the last 3 of which are the target itself). Its duration is
   *     derived from that exact distance and `speed` so the ease-out's *initial* velocity
   *     is exactly `speed` too — i.e. no jump/snap at the handoff from phase 1.
   */
  spinTo(
    target: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol],
    spinCells: number,
    speed: number,
    decelCells: number = DEFAULT_DECEL_CELLS,
    startTime: number = performance.now()
  ): Promise<void> {
    this.stopWinGlow();
    if (this.visibleCells.length === 0) {
      // Nothing on screen yet (first render) — seed with a static frame to continue from.
      this.showStatic([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
    }

    const startY = this.container.y;
    // Exactly `spinCells` cells' worth of travel time — no ceiling/buffer, so the topmost
    // filler cell lands precisely at the window's top edge (never short, never spare) the
    // instant phase 1 ends, keeping phase 2's distance calculation exact.
    const spinMs = (spinCells * this.cellHeight) / speed;
    this.prependCells(Array.from({ length: spinCells }, () => this.randomSymbol()));

    return new Promise((resolve) => {
      let rafId = 0;

      const runDecelPhase = (decelStartY: number) => {
        const cellsToLand = Math.max(decelCells, 3);
        const extraFillerCount = cellsToLand - 3;
        this.prependCells(Array.from({ length: extraFillerCount }, () => this.randomSymbol()));
        // Prepend order matters: target BELOW->MIDDLE->ABOVE last, so "above" ends up the
        // most-negative (topmost) of the three, per prependCells' contract.
        const targetCells = this.prependCells([target[2], target[1], target[0]]).reverse(); // -> [above, middle, below]

        const distance = cellsToLand * this.cellHeight;
        const finalY = decelStartY + distance;
        // Duration a `v(t) = speed * (1 - t/decelMs)^2` deceleration takes to cover
        // `distance` — integrating that gives the same shape as the eased position curve
        // below, so this exact decelMs makes the ease-out's starting speed land exactly on
        // `speed` (see the doc comment above) with no rounding error, since `distance` here
        // is exact (unlike the old ms-based version).
        const decelMs = (3 * distance) / speed;

        const phase2Start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(Math.max((now - phase2Start) / decelMs, 0), 1);
          const eased = 1 - Math.pow(1 - t, 3);
          this.container.y = decelStartY + distance * eased;
          if (t < 1) {
            rafId = requestAnimationFrame(tick);
          } else {
            this.container.y = finalY;
            this.keepOnly(targetCells);
            resolve();
          }
        };
        rafId = requestAnimationFrame(tick);
      };

      const tickPhase1 = (now: number) => {
        // Clamped to >=0 — see WinCelebration.tsx for why requestAnimationFrame's
        // timestamp can otherwise come in marginally before `startTime`.
        const elapsed = Math.max(now - startTime, 0);
        if (elapsed < spinMs) {
          this.container.y = startY + speed * elapsed;
          rafId = requestAnimationFrame(tickPhase1);
        } else {
          // Land exactly on the phase-1/phase-2 boundary within this same frame — otherwise
          // the container would hold last frame's position for one extra frame (a visible
          // stall) before phase 2's first tick catches it up.
          const decelStartY = startY + speed * spinMs;
          this.container.y = decelStartY;
          runDecelPhase(decelStartY);
        }
      };
      rafId = requestAnimationFrame(tickPhase1);

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
    this.pendingFrames.forEach((cancel) => cancel());
    this.container.destroy({ children: true });
  }
}
