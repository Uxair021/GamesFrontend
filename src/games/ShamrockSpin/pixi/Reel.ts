import { BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";
import { SlotSymbol } from "../api";

const FILLER_COUNT = 18;
const SYMBOL_PADDING = 6;
const GLOW_PULSE_PERIOD_MS = 520;

export class Reel {
  public readonly container: Container;
  private textures: Record<SlotSymbol, Texture>;
  private fillerPool: SlotSymbol[];
  private pendingTimeouts: number[] = [];
  private pendingFrames: Array<() => void> = [];
  /** Number of cells currently appended, so a new spin knows where (what y) to append next. */
  private cellCount = 0;
  /** [above, middle, below] cells currently on screen — middle is the scored payline symbol. */
  private visibleCells: Container[] = [];
  private glowGraphics: Container | null = null;
  private glowRafId: number | null = null;

  constructor(
    textures: Record<SlotSymbol, Texture>,
    private cellWidth: number,
    private cellHeight: number
  ) {
    this.textures = textures;
    this.fillerPool = Object.keys(textures) as SlotSymbol[];
    this.container = new Container();
  }

  private randomSymbol(): SlotSymbol {
    return this.fillerPool[Math.floor(Math.random() * this.fillerPool.length)];
  }

  private buildCell(symbol: SlotSymbol): Container {
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

  /** Appends cells and returns direct references to them — never rely on container.children order afterwards (see keepOnly). */
  private appendCells(symbols: SlotSymbol[]): Container[] {
    const cells: Container[] = [];
    symbols.forEach((sym) => {
      const cell = this.buildCell(sym);
      cell.y = this.cellCount * this.cellHeight;
      this.container.addChild(cell);
      this.cellCount++;
      cells.push(cell);
    });
    return cells;
  }

  /** Renders the reel showing exactly these 3 symbols (above/middle/below), no animation. */
  showStatic(target: [SlotSymbol, SlotSymbol, SlotSymbol]): void {
    this.stopWinGlow();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cellCount = 0;
    this.container.y = 0;
    this.visibleCells = this.appendCells(target);
  }

  /**
   * Spins and lands exactly on `target` (above/middle/below on the payline). Continues
   * scrolling from whatever is currently displayed — filler + target are appended after
   * the existing cells rather than replacing them, so there's no jump/flash at the start.
   */
  spinTo(target: [SlotSymbol, SlotSymbol, SlotSymbol], duration: number, delay: number): Promise<void> {
    this.stopWinGlow();
    if (this.cellCount === 0) {
      // Nothing on screen yet (first render) — seed with a static frame to continue from.
      this.appendCells([this.randomSymbol(), this.randomSymbol(), this.randomSymbol()]);
    }

    const startY = this.container.y;
    const filler: SlotSymbol[] = Array.from({ length: FILLER_COUNT }, () => this.randomSymbol());
    const appended = this.appendCells([...filler, ...target]);
    // Direct references to the 3 landing cells — captured now, not inferred later from
    // array position (Container.removeChildren() does not preserve insertion order here).
    const targetCells = appended.slice(-target.length);

    const finalY = startY - (filler.length + target.length) * this.cellHeight;

    return new Promise((resolve) => {
      let rafId = 0;
      const timeoutId = window.setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          // Clamped to >=0 — see WinCelebration.tsx for why requestAnimationFrame's
          // timestamp can otherwise come in marginally before `start`.
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
    this.cellCount = keep.length;
    this.container.y = 0;
    this.visibleCells = keep;
  }

  /** Gold glow + border pulse on the payline (middle) symbol — loops until stopWinGlow() is called. */
  startWinGlow(): void {
    this.stopWinGlow();
    const middle = this.visibleCells[1];
    const sprite = middle?.children[0] as (Sprite & { baseScale: number }) | undefined;
    if (!middle || !sprite) return;

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
    this.visibleCells.forEach((cell) => {
      const sprite = cell.children[0] as (Sprite & { baseScale: number }) | undefined;
      if (sprite) {
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
