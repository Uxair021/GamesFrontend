import gsap from "gsap";
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { FruitySymbol } from "../api";

const FILLER_COUNT = 18;
const SYMBOL_PADDING = 20;
const GLOW_PULSE_PERIOD_MS = 580;
/** How long one full rotation of the rainbow glow takes — independent of GLOW_PULSE_PERIOD_MS,
 * which drives the glow's size/alpha and the symbol's scale bounce. The glow itself already
 * shows every hue at once (see buildRainbowGlowTexture); this just slowly spins that fixed
 * rainbow ring rather than cycling through one flat color over time. */
const GLOW_ROTATION_PERIOD_MS = 6000;
/** How dim the non-payline (above/below) rows go while the payline is celebrating a win. */
const NON_PAYLINE_DIM_ALPHA = 0.32;

/** Manual switch between the winning symbol's two animation styles — flip this and reload to
 * try the other one; the glow's own spin+size pulse (see playGlowEffect) is unaffected either
 * way. false = PULSE (grows/shrinks via scale, the original). true = WOBBLE (rocks side to
 * side via rotation instead of resizing). */
const USE_WOBBLE_ANIMATION = false;
/** PULSE's scale swing (as a fraction of baseScale) — only used when USE_WOBBLE_ANIMATION is false. */
const PULSE_SCALE_AMOUNT = 0.32;
/** WOBBLE's max tilt each way, in radians (~7°), and how long one full left-right-left cycle
 * takes — only used when USE_WOBBLE_ANIMATION is true. */
const WOBBLE_MAX_RADIANS = 0.12;
const WOBBLE_PERIOD_MS = 450;

/** How many stars sweep across the winning cell (see playStarSweep) — raise this for a denser
 * sweep. */
const STAR_COUNT = 100;
/** How far above/below the cell's own vertical center a star can land, as a fraction of
 * cellHeight — 0.55 keeps every star within the single winning cell; > 1 lets them spill
 * visibly into the (dimmed) rows above/below for a taller-looking sweep. */
const STAR_VERTICAL_SPREAD_FRAC = 1.3;
/** Seconds between each successive star starting its sweep — scales the *total* sweep
 * duration with STAR_COUNT (kept at roughly the original ~0.6s spread by default: 24 * 0.025).
 * Lower this if a bigger STAR_COUNT starts feeling too drawn-out. */
const STAR_STAGGER_SECONDS = 0.015;

/** Full-saturation rainbow color at hue fraction `h` (0-1) — used for the win glow's color
 * cycling, no external color-conversion lib needed for one hue sweep. Mirrors 7 Crystal
 * Clover's Reel.ts hueToHex exactly. */
function hueToHex(h: number): number {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const q = 1 - f;
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = 1;
      g = f;
      b = 0;
      break;
    case 1:
      r = q;
      g = 1;
      b = 0;
      break;
    case 2:
      r = 0;
      g = 1;
      b = f;
      break;
    case 3:
      r = 0;
      g = q;
      b = 1;
      break;
    case 4:
      r = f;
      g = 0;
      b = 1;
      break;
    default:
      r = 1;
      g = 0;
      b = q;
      break;
  }
  return (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255);
}

export class Reel {
  public readonly container: Container;
  private textures: Record<FruitySymbol, Texture>;
  private fillerPool: FruitySymbol[];
  private pendingTimeouts: number[] = [];
  private pendingFrames: Array<() => void> = [];
  /** [above, middle, below] cells currently on screen — middle is the scored payline symbol. */
  private visibleCells: Container[] = [];
  /**
   * y-index (in cellHeight units) the *next* prepended cell will take — always decreases
   * (more negative) with each prepend, so new cells stack above whatever's already there.
   * Reset to 0 by keepOnly()/showStatic() after every spin settles, so this never drifts to
   * an ever-larger magnitude across many spins.
   */
  private nextSlotAbove = 0;
  private glowGraphics: Sprite | null = null;
  private glowRafId: number | null = null;
  /** Built once, lazily, and reused for every win after the first — a static texture, not
   * something redrawn per frame (see buildRainbowGlowTexture). */
  private rainbowGlowTexture: Texture | null = null;
  /** The one-shot star-sweep's own container/timeline — torn down in stopWinEffect() if a
   * new spin interrupts it before it finishes. */
  private starSweepLayer: Container | null = null;
  private starSweepTimeline: gsap.core.Timeline | null = null;

  constructor(
    textures: Record<FruitySymbol, Texture>,
    private cellWidth: number,
    private cellHeight: number
  ) {
    this.textures = textures;
    this.fillerPool = Object.keys(textures) as FruitySymbol[];
    this.container = new Container();
  }

  private randomSymbol(): FruitySymbol {
    return this.fillerPool[Math.floor(Math.random() * this.fillerPool.length)];
  }

  private buildCell(symbol: FruitySymbol): Container {
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
   * from `nextSlotAbove`. This is the mirror image of a "scrolls upward" reel: as
   * `container.y` eases upward (more positive) toward its resting value, this newly-placed
   * stack (and the old stack sitting below it, at less-negative/positive y) both slide
   * downward on screen — new symbols enter from the top, old ones exit at the bottom, per
   * the user's "top to bottom" spec. Returns direct references — never rely on
   * container.children order afterwards (see keepOnly). */
  private prependCells(symbols: FruitySymbol[]): Container[] {
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
  showStatic(target: [FruitySymbol, FruitySymbol, FruitySymbol]): void {
    this.stopWinEffect();
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
   * Spins and lands exactly on `target` (above/middle/below on the payline). Continues from
   * whatever's currently displayed — filler + target are prepended *above* the existing
   * cells, then `container.y` eases from its current value up toward the offset that brings
   * the newly-prepended target into the window — see prependCells' doc comment for why this
   * reads as a top-to-bottom fall.
   */
  spinTo(target: [FruitySymbol, FruitySymbol, FruitySymbol], duration: number, delay: number): Promise<void> {
    this.stopWinEffect();
    if (this.visibleCells.length === 0) {
      // Nothing on screen yet (first render) — seed with a static frame to continue from.
      this.showStatic([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
    }

    const startY = this.container.y;
    const filler: FruitySymbol[] = Array.from({ length: FILLER_COUNT }, () => this.randomSymbol());
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
          const t = Math.min(Math.max((now - start) / duration, 0), 1);
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

  /** Destroys every cell except `keep` (by direct reference), re-indexes them to the
   * resting [above, middle, below] = [0, cellHeight, 2*cellHeight] window slots, and resets
   * `container.y`/`nextSlotAbove` back to 0 — so neither the child list nor the slot indices
   * grow unbounded across spins. Purely internal bookkeeping — no visible change. */
  private keepOnly(keep: Container[]): void {
    const toRemove = this.container.children.filter((c) => !keep.includes(c));
    toRemove.forEach((c) => {
      this.container.removeChild(c);
      c.destroy({ children: true });
    });
    keep.forEach((cell, i) => {
      cell.y = i * this.cellHeight;
    });
    this.container.y = 0;
    this.nextSlotAbove = 0;
    this.visibleCells = keep;
  }

  /** Fires the payline's win treatment: a one-shot star sweep across the winning cell running
   * at the same time as (not before) a rainbow-cycling halo around the symbol plus a
   * pulse/wobble — the same treatment for every symbol now (fruit and seven/bar/star/bonus
   * alike; the old fruit-only slash+juice effect was removed per user request). Dimming the
   * above/below rows is handled separately (see dimNonPayline) so every reel dims at the same
   * instant even though this method itself is called staggered, reel-by-reel. The glow/pulse
   * loops indefinitely until stopWinEffect() is called (i.e. until the player spins again); the
   * star sweep is one-shot and cleans itself up on its own. */
  startWinEffect(): void {
    this.stopWinAnimation();
    const middle = this.visibleCells[1];
    const sprite = middle?.children[0] as (Sprite & { baseScale: number }) | undefined;
    if (!middle || !sprite) return;

    this.playStarSweep(middle);
    this.playGlowEffect(middle, sprite);
  }

  /** One-shot: STAR_COUNT stars sweep left-to-right across the winning cell (spinning, fading
   * in then out), scattered up to STAR_VERTICAL_SPREAD_FRAC * cellHeight above/below center.
   * Purely decorative — confined to this single cell via the mask each reel's window already
   * clips to. Runs independently of playGlowEffect now (see startWinEffect) — nothing waits
   * for this to finish. */
  private playStarSweep(cell: Container): void {
    const layer = new Container();
    cell.addChild(layer);
    this.starSweepLayer = layer;

    const stars: Graphics[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const radius = 9 + Math.random() * 6;
      const star = new Graphics();
      star.star(0, 0, 5, radius, radius * 0.45).fill({ color: 0xfff6c8 });
      star.x = -this.cellWidth * 0.35 - i * 14;
      star.y = this.cellHeight / 2 + (Math.random() - 0.5) * this.cellHeight * STAR_VERTICAL_SPREAD_FRAC;
      star.alpha = 0;
      star.rotation = Math.random() * Math.PI;
      layer.addChild(star);
      stars.push(star);
    }

    const tl = gsap.timeline({
      onComplete: () => {
        layer.destroy({ children: true });
        if (this.starSweepLayer === layer) this.starSweepLayer = null;
      },
    });
    stars.forEach((star, i) => {
      const staggerStart = i * STAR_STAGGER_SECONDS;
      const targetX = this.cellWidth * 1.35 + i * 14;
      tl.to(star, { alpha: 1, duration: 0.12 }, staggerStart)
        .to(star, { x: targetX, rotation: star.rotation + Math.PI * 1.5, duration: 0.85, ease: "power1.inOut" }, staggerStart)
        .to(star, { alpha: 0, duration: 0.2 }, staggerStart + 0.65);
    });
    this.starSweepTimeline = tl;
  }

  /** Builds (once, lazily — see rainbowGlowTexture) a soft-edged circular texture showing the
   * *entire* rainbow simultaneously — a conic gradient sweeping every hue around the ring, all
   * visible at once, rather than one flat color that cycles over time. The blur is baked
   * straight into the canvas (via the 2D context's own `filter`, not a runtime Pixi
   * BlurFilter on the sprite) with generous padding around the circle — a Pixi filter needs
   * room to bleed past the sprite's own texture bounds to blur without clipping, and this
   * texture had none, which is exactly what showed up as a hard rectangular edge (worst in the
   * bottom-right corner) once the glow scaled down small enough for that clipped filter
   * boundary to become visible. Baking the blur into the texture itself, with real margin,
   * removes that whole class of problem. The sprite built from this is rotated per-frame for a
   * slow "spinning rainbow" look, far cheaper than redrawing the canvas every frame. */
  private buildRainbowGlowTexture(diameter: number): Texture {
    if (this.rainbowGlowTexture) return this.rainbowGlowTexture;

    const blurPx = diameter * 0.12;
    // The canvas is noticeably bigger than the visible circle so the baked-in blur has real
    // room to fade all the way to fully transparent well inside the edge, never right up
    // against it.
    const size = Math.ceil(diameter * 1.6);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    const radius = diameter / 2 - blurPx;

    if (typeof ctx.createConicGradient === "function") {
      const conic = ctx.createConicGradient(0, cx, cy);
      const stopCount = 12;
      for (let i = 0; i <= stopCount; i++) {
        conic.addColorStop(i / stopCount, `#${hueToHex(i / stopCount).toString(16).padStart(6, "0")}`);
      }
      ctx.fillStyle = conic;
    } else {
      // Very old browsers without conic gradient support — a plain warm gold fallback.
      ctx.fillStyle = "#ffb300";
    }
    ctx.filter = `blur(${blurPx}px)`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.filter = "none";

    // A further radial fade on top of the baked-in blur, entirely within the padded canvas
    // (nowhere near its edge), so the very outer rim tapers all the way to alpha 0 instead of
    // trailing off as a faint but nonzero haze.
    ctx.globalCompositeOperation = "destination-in";
    const fadeRadius = size / 2;
    const fade = ctx.createRadialGradient(cx, cy, 0, cx, cy, fadeRadius);
    fade.addColorStop(0, "rgba(255,255,255,1)");
    fade.addColorStop(0.6, "rgba(255,255,255,0.9)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";

    this.rainbowGlowTexture = Texture.from(canvas);
    return this.rainbowGlowTexture;
  }

  /** A big, soft, all-colors-at-once rainbow halo radiating *around* the symbol itself (a
   * circle, not a rectangular backdrop spanning the whole cell) — slowly spinning, pulsing
   * larger and smaller — plus a much bigger scale pulse on the symbol itself so the win reads
   * as a real "pop", not a gentle wobble. The one win treatment every symbol gets now (fruit
   * and seven/bar/star/bonus alike). Loops until stopWinEffect() is called. */
  private playGlowEffect(middle: Container, sprite: Sprite & { baseScale: number }): void {
    const cx = this.cellWidth / 2;
    const cy = this.cellHeight / 2;
    const baseDiameter = Math.min(this.cellWidth, this.cellHeight) * 1.0;

    const texture = this.buildRainbowGlowTexture(baseDiameter);
    const glow = new Sprite(texture);
    glow.anchor.set(0.5);
    glow.x = cx;
    glow.y = cy;
    middle.addChildAt(glow, 0);
    this.glowGraphics = glow;

    // The texture itself is padded well beyond baseDiameter (see buildRainbowGlowTexture's doc
    // comment — that's what fixed the hard-edge artifact), so the sprite's *base* scale has to
    // shrink it back down to the intended visual size before the pulse's own scale multiplier
    // is layered on top; using glow.scale.set(pulseFactor) directly would render the whole
    // padded texture (1.6x too big) at face value.
    const glowBaseScale = baseDiameter / texture.width;

    const start = performance.now();
    const animate = () => {
      const elapsed = performance.now() - start;
      const pulse = 0.3 + 0.3 * Math.sin((elapsed / GLOW_PULSE_PERIOD_MS) * Math.PI * 2);

      glow.rotation = (elapsed / GLOW_ROTATION_PERIOD_MS) * Math.PI * 2;
      glow.scale.set(glowBaseScale * (1.25 + pulse * 0.75));
      glow.alpha = 0.55 + pulse * 0.35;

      if (USE_WOBBLE_ANIMATION) {
        sprite.rotation = Math.sin((elapsed / WOBBLE_PERIOD_MS) * Math.PI * 2) * WOBBLE_MAX_RADIANS;
      } else {
        sprite.scale.set(sprite.baseScale * (1 + pulse * PULSE_SCALE_AMOUNT));
      }
      this.glowRafId = requestAnimationFrame(animate);
    };
    this.glowRafId = requestAnimationFrame(animate);
  }

  /** Tears down the star sweep + glow/pulse-or-wobble animation only — deliberately does *not*
   * touch visibleCells' alpha (see dimNonPayline's doc comment for why). Used both by
   * stopWinEffect (the real "win celebration is over" cleanup) and as startWinEffect's own
   * defensive pre-clear, where resetting alpha would immediately wipe out a dim the scene may
   * have just applied moments earlier via dimNonPayline. */
  private stopWinAnimation(): void {
    if (this.glowRafId !== null) {
      cancelAnimationFrame(this.glowRafId);
      this.glowRafId = null;
    }
    if (this.glowGraphics) {
      this.glowGraphics.destroy();
      this.glowGraphics = null;
    }
    if (this.starSweepTimeline) {
      this.starSweepTimeline.kill();
      this.starSweepTimeline = null;
    }
    if (this.starSweepLayer) {
      this.starSweepLayer.destroy({ children: true });
      this.starSweepLayer = null;
    }
  }

  /** Dims the above/below (non-payline) rows immediately — split out from startWinEffect so
   * FruityScene.setWinEffect can call this on every reel in one synchronous pass (all reels
   * dim at the exact same instant) even though the star sweep/glow itself is staggered
   * reel-by-reel afterward (see WIN_EFFECT_STAGGER_MS). Calling this *before* scheduling the
   * staggered startWinEffect() calls is what makes it work: startWinEffect's own defensive
   * stopWinAnimation() never resets alpha, so the dim set here survives untouched until the
   * round truly ends (stopWinEffect). */
  dimNonPayline(): void {
    if (this.visibleCells[0]) this.visibleCells[0].alpha = NON_PAYLINE_DIM_ALPHA;
    if (this.visibleCells[2]) this.visibleCells[2].alpha = NON_PAYLINE_DIM_ALPHA;
  }

  stopWinEffect(): void {
    this.stopWinAnimation();
    this.visibleCells.forEach((cell) => {
      cell.alpha = 1;
      const sprite = cell.children[0] as (Sprite & { baseScale: number }) | undefined;
      if (sprite) {
        sprite.visible = true;
        sprite.scale.set(sprite.baseScale);
        sprite.rotation = 0;
        sprite.tint = 0xffffff;
      }
    });
  }

  /** The symbol currently showing on the payline (middle cell), if any. */
  get paylineSymbol(): FruitySymbol | null {
    return (this.visibleCells[1]?.label as FruitySymbol | undefined) ?? null;
  }

  destroy(): void {
    this.stopWinEffect();
    this.pendingTimeouts.forEach((id) => window.clearTimeout(id));
    this.pendingFrames.forEach((cancel) => cancel());
    this.container.destroy({ children: true });
    if (this.rainbowGlowTexture) {
      this.rainbowGlowTexture.destroy(true);
      this.rainbowGlowTexture = null;
    }
  }
}
