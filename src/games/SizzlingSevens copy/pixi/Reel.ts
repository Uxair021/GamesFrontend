import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { SizzlingSymbol } from "../api";

const ROW_COUNT = 3;
const SYMBOL_PADDING = 2;
/** Extra spacing between consecutive symbol positions on the strip, on top of cellHeight.
 * Kept at 0 (unlike Crazy777's Reel, which uses this for a "peek past the window edge"
 * cylindrical-wheel look) — this game is a flat 3x3 grid, and Scene.ts's win-highlight boxes
 * assume plain `rowIndex * cellHeight` spacing with no gap, so any nonzero value here would
 * make the rendered symbols drift out of alignment with their own highlight boxes and frame. */
const ROW_GAP_PX = 8;
/** Constant-speed scroll rate during the unbounded idle spin, px/ms. */
const IDLE_SPEED = 3.35;
/** How many strip steps ahead of the current scroll position get pre-populated with filler,
 * recycled as the reel scrolls — keeps memory/child-count bounded during an indefinitely long
 * idle spin (the player can hold it spinning as long as they like before clicking Stop). */
const BUFFER_STEPS = 20;
/** Symbols render slightly larger than a strict "fit inside the cell" scale would give — the
 * clipping mask (see the Reel doc comment below) makes a bit of intentional overflow safe. */
const SYMBOL_SCALE_BOOST = 1.22;
const PULSE_PERIOD_MS = 520;
/** How many whole rows Stop advances past wherever the reel was when clicked, before settling
 * — e.g. with 2, whatever symbol was on the top row ends up on the bottom row. This is what
 * makes the result unpredictable from what's on screen at click time: those extra 1-2 rows are
 * already-generated filler (see BUFFER_STEPS) that simply hasn't scrolled into view yet, so
 * nothing about it could have been seen or targeted before clicking Stop. */
const ADVANCE_STEPS = 2;
const ADVANCE_DURATION_MS = 340;
/** On a losing spin, the strip settles this many row-heights off its clean center — a classic
 * "near miss" look (real reel-strip machines do this too). Purely cosmetic: see stopAndSettle's
 * landClean param doc comment for why this can never affect which symbols get reported/scored. */
const LOSE_LANDING_OFFSET_FRAC = 0.24;

function easeOutBack(t: number): number {
  // Overshoots past 1 then eases back — "advances a little past the stop, then settles" bounce.
  const c1 = 0.25;
  const c3 = c1 + 0.8;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

type Mode = "idle" | "spinning";

/**
 * A single reel with a 3-row visible window (top/middle/bottom), matching Crazy777's
 * reel look. Unlike every other game's `spinTo(target, duration)` (fixed-duration, plays to a
 * predetermined stop automatically), this reel supports an *unbounded* idle spin —
 * `startContinuousSpin()` scrolls indefinitely with random filler until `stopAndSettle()` is
 * called (whenever the player clicks Stop), which advances a couple more rows past wherever
 * the scroll was at that moment (content already generated but not yet shown — see
 * ADVANCE_STEPS) and bounces to a stop there. No predetermined target, no symbol substitution,
 * and nothing about the result could have been seen or targeted before clicking Stop. The grid
 * reported to the server for scoring is derived from whichever symbol ends up nearest each
 * row's center once it settles. The server only scores that grid (see SizzlingSevensGame.tsx)
 * — it no longer decides the outcome.
 *
 * `view` (fixed, what Scene.ts positions) holds a clipping mask plus `strip` (the scrolling
 * inner container) — without that mask, filler symbols scrolling above/below the 3-row window
 * during an idle spin render fully visible instead of being cut off at the frame's edges.
 *
 * This reel doesn't own any win-celebration visuals itself — Scene.ts draws one overlay across
 * *all* 3 reels at once (not per-symbol boxes) and asks each reel only to build a detached,
 * self-contained visual for a winning row via buildWinVisual(), which it then positions above
 * that shared overlay. See SizzlingSevensScene.ts's showWinHighlights.
 */
export class Reel {
  public readonly view: Container;
  private readonly strip: Container;
  private textures: Record<SizzlingSymbol, Texture>;
  private gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>;
  private symbolPool: SizzlingSymbol[];
  private weights: number[];
  private phaseOffsetSteps: number;
  private pendingTimeouts: number[] = [];
  private pendingFrames: Array<() => void> = [];
  private visibleCells: Container[] = [];

  private mode: Mode = "idle";
  private stripCells: Array<{ cell: Container; index: number }> = [];
  private nextStripIndex = 0;
  private spinStartTime = 0;
  private spinStartY = 0;

  constructor(
    textures: Record<SizzlingSymbol, Texture>,
    gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>,
    private cellWidth: number,
    private cellHeight: number,
    /** Reel-strip weights (admin-configured, see GET /config's symbolWeights) — the client
     * draws its own scrolling content from this same distribution now that the server no
     * longer picks the result, so the admin's relative symbol rarity is still respected even
     * though the exact landed grid is determined by where the player clicks Stop. */
    symbolWeights: Partial<Record<SizzlingSymbol, number>> = {},
    /** A fixed fraction-of-a-row this reel's resting position is permanently shifted by (e.g.
     * 0.5 = starts/settles half a row off clean alignment) — baked into restY() once and never
     * un-done (strip.y is never reset back to a "clean" state between spins), so it's a
     * standing visual trait of this specific reel, not a one-off. Purely cosmetic variety
     * between reels; the real unpredictability comes from ADVANCE_STEPS in stopAndSettle. */
    phaseOffsetSteps = 0
  ) {
    this.textures = textures;
    this.gifTemplates = gifTemplates;
    this.symbolPool = Object.keys(textures) as SizzlingSymbol[];
    this.weights = this.symbolPool.map((s) => symbolWeights[s] ?? 1);
    this.phaseOffsetSteps = phaseOffsetSteps;

    this.view = new Container();
    this.strip = new Container();

    const windowHeight = cellHeight * ROW_COUNT;

    // Background — light gray/white vertical gradient, same "1px-wide, height-tall canvas
    // gradient stretched over the shape's bounds" technique used elsewhere in this codebase
    // (e.g. FiveXRewind's Reel) since Pixi's own Graphics.fill() doesn't support gradients
    // directly.
    const background = new Graphics();
    background.rect(0, 0, cellWidth, windowHeight);
    const gradCanvas = document.createElement("canvas");
    gradCanvas.width = 1;
    gradCanvas.height = Math.max(1, Math.round(windowHeight));
    const gradCtx = gradCanvas.getContext("2d")!;
    const grad = gradCtx.createLinearGradient(0, 0, 0, gradCanvas.height);
    grad.addColorStop(0, "#c7c7c7");
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(1, "#c7c7c7");
    gradCtx.fillStyle = grad;
    gradCtx.fillRect(0, 0, 1, gradCanvas.height);
    background.fill({ texture: Texture.from(gradCanvas) });
    this.view.addChild(background);

    const windowMask = new Graphics();
    windowMask.rect(0, 0, cellWidth, windowHeight);
    windowMask.fill({ color: 0xffffff });
    this.view.addChild(windowMask);
    this.view.addChild(this.strip);
    this.strip.mask = windowMask;

    // Dark gray border lines along the top and bottom edges only.
    const borders = new Graphics();
    borders.moveTo(0, 0).lineTo(cellWidth, 0);
    borders.moveTo(0, windowHeight).lineTo(cellWidth, windowHeight);
    borders.stroke({ color: 0x4a4a4a, width: 4 });
    this.view.addChild(borders);
  }

  private get step(): number {
    return this.cellHeight + ROW_GAP_PX;
  }

  private restY(i: number): number {
    return (i + this.phaseOffsetSteps) * this.step - ROW_GAP_PX;
  }

  private randomSymbol(): SizzlingSymbol {
    const total = this.weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < this.symbolPool.length; i++) {
      roll -= this.weights[i];
      if (roll < 0) return this.symbolPool[i];
    }
    return this.symbolPool[this.symbolPool.length - 1];
  }

  private buildCell(symbol: SizzlingSymbol): Container {
    const cell = new Container();
    cell.label = symbol;
    const sprite = new Sprite(this.textures[symbol]);
    sprite.anchor.set(0.5);
    const maxW = this.cellWidth - SYMBOL_PADDING * 2;
    const maxH = this.cellHeight - SYMBOL_PADDING * 2;
    const scale = Math.min(maxW / sprite.texture.width, maxH / sprite.texture.height) * SYMBOL_SCALE_BOOST;
    sprite.scale.set(scale);
    (sprite as Sprite & { baseScale: number }).baseScale = scale;
    sprite.x = this.cellWidth / 2;
    sprite.y = this.cellHeight / 2;
    cell.addChild(sprite);
    return cell;
  }

  /** Renders exactly these 3 symbols (top/middle/bottom), no animation. */
  showStatic(target: [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol]): void {
    this.stopAllAnimation();
    this.strip.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.strip.y = 0;
    this.stripCells = [];
    this.visibleCells = target.map((sym, i) => {
      const cell = this.buildCell(sym);
      cell.y = this.restY(i);
      this.strip.addChild(cell);
      return cell;
    });
  }

  private stopAllAnimation(): void {
    this.pendingFrames.forEach((cancel) => cancel());
    this.pendingFrames = [];
    this.pendingTimeouts.forEach((id) => window.clearTimeout(id));
    this.pendingTimeouts = [];
    this.mode = "idle";
  }

  /** Fills strip cells (random filler) up to `throughIndex` (inclusive), skipping any index
   * that already has a cell (used to punch the 3 target cells into the strip before landing). */
  private ensureFilledTo(throughIndex: number): void {
    while (this.nextStripIndex <= throughIndex) {
      const idx = this.nextStripIndex;
      const cell = this.buildCell(this.randomSymbol());
      cell.y = -(idx + 1) * this.step;
      this.strip.addChild(cell);
      this.stripCells.push({ cell, index: idx });
      this.nextStripIndex++;
    }
  }

  /** Removes strip cells that have scrolled well past the visible window (below it, given
   * this reel scrolls top-to-bottom) — keeps the child list bounded during an indefinitely
   * long idle spin. A cell's screen position is strip.y - (index+1)*step; once that's
   * comfortably past the 3-row window it can never re-enter (this reel only scrolls one way),
   * so it's safe to drop. */
  private pruneBehind(): void {
    const windowIndex = this.strip.y / this.step;
    this.stripCells = this.stripCells.filter(({ cell, index }) => {
      if (index < windowIndex - 6) {
        this.strip.removeChild(cell);
        cell.destroy({ children: true });
        return false;
      }
      return true;
    });
  }

  /** Starts an unbounded idle scroll — keeps going until stopAndSettle() is called. Continues
   * from whatever's currently displayed (and whatever cells already exist from a previous
   * freeze — stripCells/nextStripIndex are deliberately *not* reset here, since stopAndSettle
   * leaves them alone too; resetting either here would orphan still-visible cells the strip
   * would no longer be tracking) so there's no jump at the start. */
  startContinuousSpin(): void {
    this.stopAllAnimation();
    this.mode = "spinning";

    const startY = this.strip.y;
    this.ensureFilledTo(Math.ceil(startY / this.step) + BUFFER_STEPS);

    this.spinStartTime = performance.now();
    this.spinStartY = startY;

    let rafId = 0;
    const tick = () => {
      if (this.mode !== "spinning") return;
      const elapsed = performance.now() - this.spinStartTime;
      this.strip.y = this.spinStartY + IDLE_SPEED * elapsed;
      const neededIndex = Math.ceil(this.strip.y / this.step) + BUFFER_STEPS;
      if (neededIndex > this.nextStripIndex) this.ensureFilledTo(neededIndex);
      this.pruneBehind();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    this.pendingFrames.push(() => cancelAnimationFrame(rafId));
  }

  /** The strip index (see stopAndSettle/ensureFilledTo) that ADVANCE_STEPS-past-`this.strip.y`
   * would cleanly settle on — the single source of truth both peekStopSymbols() and
   * stopAndSettle() derive their symbol read from, so calling one right before the other (no
   * animation frame in between, i.e. `this.strip.y` unchanged) is guaranteed to agree. */
  private computeSettleK(): number {
    const rawTargetY = this.strip.y + ADVANCE_STEPS * this.step;
    // Clean positions for this reel are strip.y = (k + phaseOffsetSteps) * step - ROW_GAP_PX
    // for integer k (see restY) — solve for the k nearest rawTargetY.
    return Math.round((rawTargetY + ROW_GAP_PX) / this.step - this.phaseOffsetSteps);
  }

  private symbolsAtK(k: number): [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol] {
    const cleanTargetY = (k + this.phaseOffsetSteps) * this.step - ROW_GAP_PX;
    this.ensureFilledTo(Math.ceil(cleanTargetY / this.step) + 3);
    const cellsByIndex = new Map(this.stripCells.map((s) => [s.index, s.cell]));
    return [0, 1, 2].map((row) => {
      const idx = k - row - 1;
      return (cellsByIndex.get(idx)?.label as SizzlingSymbol | undefined) ?? this.randomSymbol();
    }) as [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol];
  }

  /** Read-only preview of exactly what stopAndSettle() would report right now, without
   * animating or changing mode — lets a caller (Scene.ts) decide *how* to land (see
   * stopAndSettle's landClean param) before committing to the real stop. Must be followed by
   * stopAndSettle() with no animation frame in between to guarantee the same symbols; it's safe
   * to call more than once (ensureFilledTo is idempotent past what's already generated). */
  peekStopSymbols(): [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol] {
    if (this.mode !== "spinning") {
      return this.visibleCells.map((c) => c.label as SizzlingSymbol) as [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol];
    }
    return this.symbolsAtK(this.computeSettleK());
  }

  /** Stops the idle scroll — but not immediately at the click: advances roughly ADVANCE_STEPS
   * further rows first (with an overshoot-and-settle bounce), landing on content that was
   * already generated ahead of the visible window (see BUFFER_STEPS) but never actually shown
   * before this call. That's what makes the result unguessable from what was on screen at
   * click time, without needing a server-predetermined target or a jump to unrelated content —
   * it's simply the next couple of rows the player hadn't scrolled to yet.
   *
   * `landClean` (default true) controls the *visual* rest position only: true snaps the strip
   * to this reel's exact clean center-aligned position (respecting phaseOffsetSteps), same as
   * always. false — used for a losing spin, decided by Scene.ts via peekStopSymbols() before
   * this is called — settles the strip a bit off that clean position instead (a "near miss"
   * look), by shifting the whole strip uniformly. This can NEVER change which symbols are
   * reported: the settle index `k` (and therefore every cell that ends up in visibleCells) is
   * computed once, before the clean-vs-offset choice is applied to anything, and the offset
   * only nudges strip.y — it never touches k or which cell object each row reads. No-ops
   * (resolves with whatever was last reported) if this reel isn't currently mid-spin. */
  stopAndSettle(landClean = true): Promise<[SizzlingSymbol, SizzlingSymbol, SizzlingSymbol]> {
    const readSymbols = () => this.visibleCells.map((c) => c.label as SizzlingSymbol) as [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol];
    if (this.mode !== "spinning") return Promise.resolve(readSymbols());

    this.pendingFrames.forEach((cancel) => cancel());
    this.pendingFrames = [];
    this.mode = "idle";

    const startY = this.strip.y;
    const k = this.computeSettleK();
    const cleanTargetY = (k + this.phaseOffsetSteps) * this.step - ROW_GAP_PX;
    const finalY = landClean
      ? cleanTargetY
      : cleanTargetY + (Math.random() < 0.5 ? 1 : -1) * LOSE_LANDING_OFFSET_FRAC * this.step * (0.6 + Math.random() * 0.4);
    this.ensureFilledTo(Math.ceil(cleanTargetY / this.step) + 3);

    return new Promise((resolve) => {
      const start = performance.now();
      let rafId = 0;
      const tick = (now: number) => {
        const t = Math.min(Math.max((now - start) / ADVANCE_DURATION_MS, 0), 1);
        const eased = easeOutBack(t);
        this.strip.y = startY + (finalY - startY) * eased;
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        this.strip.y = finalY;
        this.pruneBehind();

        const cellsByIndex = new Map(this.stripCells.map((s) => [s.index, s.cell]));
        this.visibleCells = [0, 1, 2].map((row) => {
          const idx = k - row - 1;
          return (
            cellsByIndex.get(idx) ??
            // Shouldn't normally happen (BUFFER_STEPS/the ensureFilledTo call above keep well
            // ahead of this range) — safe fallback so this never crashes at an edge case.
            this.buildCell(this.randomSymbol())
          );
        });
        resolve(readSymbols());
      };
      rafId = requestAnimationFrame(tick);
      this.pendingFrames.push(() => cancelAnimationFrame(rafId));
    });
  }

  /** Local y (in `view`'s coordinate space) where row `row` currently sits — lets Scene.ts
   * position a scene-level element (the win overlay's highlight, see buildWinVisual) to line
   * up with a real row without needing to know this reel's own phaseOffsetSteps math. */
  getRowY(row: number): number {
    return this.restY(row);
  }

  /** Hides (or restores) row `row`'s own static sprite. The win overlay is only ~50% opaque,
   * so without this the original PNG still shows through it, dimmed, around/behind the
   * detached gif highlight Scene.ts draws on top (see buildWinVisual) — this is what actually
   * removes it from view entirely for the rows currently celebrating a win. */
  setRowSpriteVisible(row: number, visible: boolean): void {
    const sprite = this.visibleCells[row]?.children[0] as Sprite | undefined;
    if (sprite) sprite.visible = visible;
  }

  /** Builds a detached, self-contained visual (row `row`'s matching-symbol .gif if one exists,
   * else a pulsing clone — BONUS has no .gif yet) for Scene.ts to position above its own
   * shared win overlay. Doesn't touch this reel's own display tree at all — pair this with
   * setRowSpriteVisible(row, false) to actually hide the original underneath it. Returns null
   * if `row` isn't currently showing anything (shouldn't happen once settled, but is possible
   * mid-spin). */
  buildWinVisual(row: number): { view: Container; play: () => void; destroy: () => void } | null {
    const cell = this.visibleCells[row];
    if (!cell) return null;
    const symbol = cell.label as SizzlingSymbol;

    const container = new Container();
    const template = this.gifTemplates[symbol];
    if (template) {
      const gif = template.clone();
      gif.loop = true;
      gif.anchor.set(0.5);
      const maxW = this.cellWidth - SYMBOL_PADDING * 2;
      const maxH = this.cellHeight - SYMBOL_PADDING * 2;
      gif.scale.set(Math.min(maxW / gif.texture.width, maxH / gif.texture.height) * SYMBOL_SCALE_BOOST);
      gif.x = this.cellWidth / 2;
      gif.y = this.cellHeight / 2;

      const mask = new Graphics();
      mask.rect(0, 0, this.cellWidth, this.cellHeight);
      mask.fill({ color: 0xffffff });
      container.addChild(mask);
      gif.mask = mask;
      container.addChild(gif);

      return {
        view: container,
        play: () => gif.play(),
        destroy: () => {
          gif.mask = null;
          gif.destroy();
          mask.destroy();
          container.destroy();
        },
      };
    }

    // No .gif for this symbol (BONUS) — a fresh pulsing sprite clone instead.
    const sprite = new Sprite(this.textures[symbol]);
    sprite.anchor.set(0.5);
    const maxW = this.cellWidth - SYMBOL_PADDING * 2;
    const maxH = this.cellHeight - SYMBOL_PADDING * 2;
    const baseScale = Math.min(maxW / sprite.texture.width, maxH / sprite.texture.height) * SYMBOL_SCALE_BOOST;
    sprite.scale.set(baseScale);
    sprite.x = this.cellWidth / 2;
    sprite.y = this.cellHeight / 2;
    container.addChild(sprite);

    let rafId = 0;
    const start = performance.now();
    const animate = () => {
      const elapsed = performance.now() - start;
      const pulse = 0.5 + 0.5 * Math.sin((elapsed / PULSE_PERIOD_MS) * Math.PI * 2);
      sprite.scale.set(baseScale * (1 + pulse * 0.12));
      rafId = requestAnimationFrame(animate);
    };
    return {
      view: container,
      play: () => {
        rafId = requestAnimationFrame(animate);
      },
      destroy: () => {
        cancelAnimationFrame(rafId);
        container.destroy({ children: true });
      },
    };
  }

  destroy(): void {
    this.stopAllAnimation();
    this.view.destroy({ children: true });
  }
}
