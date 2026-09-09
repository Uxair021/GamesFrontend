import { Application, Container, Graphics, Texture } from "pixi.js";
import { AnimatedGIF } from "@pixi/gif";
import { Reel } from "./Reel";
import { loadSymbolTextures, loadWinGifAnimations } from "./symbols";
import { Grid, SizzlingSymbol } from "../api";

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

const REEL_COUNT = 3;
const ROW_COUNT = 3;
const REEL_AREA_LEFT = 0.222;
const REEL_AREA_RIGHT = 0.778;
const REEL_AREA_TOP = 0.335;
const REEL_AREA_BOTTOM = 0.875;
const REEL_GAP_FRAC = 0.032;
/** Per-reel resting-position offset (fraction of a row) — all 0 (no offset). A prior version
 * shifted reel 2 by half a row for visual variety, but that broke paylines: a "MMM" line's 3
 * symbols need to actually sit on the same horizontal line for a win to look legitimate, and a
 * scoring row-index match isn't enough if the reels don't visually agree on where "middle" is.
 * See Reel.ts's phaseOffsetSteps doc comment. */
const REEL_PHASE_OFFSETS = [0, 0, 0];

const WIN_OVERLAY_COLOR = 0x000000;
const WIN_OVERLAY_ALPHA = 0.8;

/** Dev/debug aid only — draws 3 red reference lines across the reels at the TOP/MIDDLE/BOTTOM
 * row (see drawDebugPaylines). Flip to true to bring them back. */
const SHOW_DEBUG_PAYLINES = false;

const WILD: SizzlingSymbol = "WILD_2X";
const BONUS: SizzlingSymbol = "BONUS";
/** Every symbol a Wild can substitute for — mirrors backend config.ts's WILD_SUBSTITUTES_FOR.
 * Only used here to decide, purely visually, whether a peeked grid is a winner (see
 * isWinningGrid) — the server is still the sole source of truth for what actually gets paid. */
const WILD_SUBSTITUTES_FOR = new Set<SizzlingSymbol>(["RED_7", "BLUE_7", "BAR", "DOUBLE_BAR", "TRIPLE_BAR"]);
/** Mirrors backend config.ts's BAR_FAMILY plus Wild — a line where every symbol is some mix of
 * these (not necessarily identical) still wins via the flat ANY_BAR rule, so isWinningGrid needs
 * to recognize it too or a spin that actually wins could cosmetically land as a "near miss". */
const ANY_BAR_SET = new Set<SizzlingSymbol>(["BAR", "DOUBLE_BAR", "TRIPLE_BAR", "WILD_2X"]);
const BONUS_TRIGGER_COUNT = 3;

interface ActiveWinVisual {
  view: Container;
  destroy: () => void;
}

export class SizzlingSevensScene {
  private root: Container;
  private reels: Reel[] = [];
  private gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>;
  /** Live from GET /config (see api.ts) — used only to decide, purely visually, whether a
   * peeked grid is a winner (see isWinningGrid/freezeSpin), never to compute a payout. */
  private paylines: [number, number, number][];
  /** ONE overlay spanning the whole reel background (not per-symbol boxes) — hidden until a
   * win, then dims everything under it while each winning symbol's own highlight (see
   * winHighlightLayer) renders on top of it, unaffected. */
  private winOverlay: Graphics;
  /** Sits above winOverlay in the display list — holds a fresh (non-dimmed) copy of every
   * winning symbol, positioned to exactly line up with its real cell underneath. */
  private winHighlightLayer: Container;
  private activeWinVisuals: ActiveWinVisual[] = [];
  /** Rows whose own static sprite got hidden to make room for a highlight visual (see
   * showWinHighlights) — tracked so clearWinAnimations can restore exactly these, and nothing
   * more, without needing every Reel to remember its own hidden-row state. */
  private hiddenSpriteRows: Array<{ reel: Reel; row: number }> = [];

  private constructor(
    app: Application,
    textures: Record<SizzlingSymbol, Texture>,
    gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>,
    symbolWeights: Partial<Record<SizzlingSymbol, number>>,
    paylines: [number, number, number][]
  ) {
    this.gifTemplates = gifTemplates;
    this.paylines = paylines;
    this.root = new Container();
    app.stage.addChild(this.root);

    const areaLeft = CANVAS_WIDTH * REEL_AREA_LEFT;
    const areaRight = CANVAS_WIDTH * REEL_AREA_RIGHT;
    const areaTop = CANVAS_HEIGHT * REEL_AREA_TOP;
    const areaBottom = CANVAS_HEIGHT * REEL_AREA_BOTTOM;
    const gap = (areaRight - areaLeft) * REEL_GAP_FRAC;
    const cellWidth = (areaRight - areaLeft - gap * (REEL_COUNT - 1)) / REEL_COUNT;
    const cellHeight = (areaBottom - areaTop) / ROW_COUNT;

    const backdrop = new Graphics();
    backdrop.roundRect(
      areaLeft - 12,
      areaTop - 12,
      areaRight - areaLeft + 24,
      areaBottom - areaTop + 24,
      18
    );
    backdrop.fill({ color: 0x000000, alpha: 0.35 });
    this.root.addChild(backdrop);

    for (let i = 0; i < REEL_COUNT; i++) {
      const reel = new Reel(textures, gifTemplates, cellWidth, cellHeight, symbolWeights, REEL_PHASE_OFFSETS[i] ?? 0);
      reel.view.x = areaLeft + i * (cellWidth + gap);
      reel.view.y = areaTop;
      reel.showStatic(["BAR", "BAR", "BAR"]);
      this.root.addChild(reel.view);
      this.reels.push(reel);
    }

    // Added after every reel view, so it renders on top of all 3 at once when shown.
    this.winOverlay = new Graphics();
    this.winOverlay.roundRect(
      areaLeft - 12,
      areaTop - 12,
      areaRight - areaLeft + 24,
      areaBottom - areaTop + 24,
      18
    );
    this.winOverlay.fill({ color: WIN_OVERLAY_COLOR, alpha: WIN_OVERLAY_ALPHA });
    this.winOverlay.visible = false;
    this.root.addChild(this.winOverlay);

    this.winHighlightLayer = new Container();
    this.root.addChild(this.winHighlightLayer);

    // Debug guide only — draws the 3 straight paylines (TTT/MMM/BBB). Flip SHOW_DEBUG_PAYLINES
    // above to true to show them again (can't just comment out this call — tsc's noUnusedLocals
    // would then flag drawDebugPaylines itself as dead code and fail the build).
    if (SHOW_DEBUG_PAYLINES) this.drawDebugPaylines(areaLeft, areaRight, areaTop, cellHeight);
  }

  /** Draws 3 straight horizontal reference lines across the whole reel width, at the vertical
   * center of the TOP/MIDDLE/BOTTOM row — payline 1 (MMM), 2 (TTT), 3 (BBB) in PAYLINES. Purely
   * a dev/debug aid, not part of actual gameplay; ignores reel 2's own phaseOffsetSteps (it's a
   * rough guide, not meant to trace exactly through reel 2's shifted symbols). */
  private drawDebugPaylines(areaLeft: number, areaRight: number, areaTop: number, cellHeight: number): void {
    const lines = new Graphics();
    for (let row = 0; row < ROW_COUNT; row++) {
      const y = areaTop + (row + 0.5) * cellHeight;
      lines.moveTo(areaLeft, y).lineTo(areaRight, y);
    }
    lines.stroke({ color: 0xff0000, width: 2, alpha: 0.8 });
    this.root.addChild(lines);
  }

  static async create(
    app: Application,
    symbolWeights: Partial<Record<SizzlingSymbol, number>> = {},
    paylines: [number, number, number][] = []
  ): Promise<SizzlingSevensScene> {
    const [textures, gifTemplates] = await Promise.all([loadSymbolTextures(), loadWinGifAnimations()]);
    return new SizzlingSevensScene(app, textures, gifTemplates, symbolWeights, paylines);
  }

  showStaticGrid(grid: Grid): void {
    this.clearWinAnimations();
    grid.forEach((column, i) => this.reels[i].showStatic(column as [SizzlingSymbol, SizzlingSymbol, SizzlingSymbol]));
  }

  /** Starts every reel spinning indefinitely — call once when the player presses Spin. */
  startSpin(): void {
    this.clearWinAnimations();
    this.reels.forEach((r) => r.startContinuousSpin());
  }

  /** Structural-only win check (does ANY line/scatter win at all — not how much) against a
   * grid that hasn't been visually committed to yet. Mirrors winCalc.ts's matching rules just
   * closely enough to answer that yes/no; it never computes a payout and never feeds into
   * scoring — the server (see SizzlingSevensGame.tsx's spinRequest) remains the only source of
   * truth for what actually pays. Used solely to pick the *cosmetic* landing style for a spin
   * that's already fully decided (see freezeSpin) — RTP is entirely unaffected by this check,
   * since it never changes which symbols get reported. */
  private isWinningGrid(grid: Grid): boolean {
    for (const line of this.paylines) {
      const symbols = line.map((row, reel) => grid[reel][row]);
      let leadingWilds = 0;
      while (leadingWilds < 3 && symbols[leadingWilds] === WILD) leadingWilds++;
      if (leadingWilds >= 1) return true; // any pure-Wild run pays something, however small
      const anchor = symbols[0];
      if (anchor === BONUS || !WILD_SUBSTITUTES_FOR.has(anchor)) continue;
      let matchCount = 0;
      for (let i = 0; i < 3; i++) {
        if (symbols[i] === anchor || symbols[i] === WILD) matchCount++;
        else break;
      }
      if (matchCount >= 3) return true;
      if (symbols.every((s) => ANY_BAR_SET.has(s))) return true;
    }

    let bonusCount = 0;
    for (const column of grid) for (const symbol of column) if (symbol === BONUS) bonusCount++;
    return bonusCount >= BONUS_TRIGGER_COUNT;
  }

  /** Stops every reel (advance-and-bounce, no predetermined target, no symbol swap — see
   * Reel.stopAndSettle) simultaneously and returns the resulting grid for the caller to send
   * off for scoring. First peeks what every reel would land on (without animating), decides
   * once whether that grid wins anything, then tells every reel to land clean (a win) or with a
   * cosmetic "near miss" offset (a loss) — see stopAndSettle's landClean param. The peek and the
   * real settle happen back-to-back with no animation frame between them, so the symbols
   * reported here are guaranteed identical to what was peeked; only the landing's visual
   * cleanliness differs. */
  async freezeSpin(): Promise<Grid> {
    const peeked = this.reels.map((reel) => reel.peekStopSymbols());
    const landClean = this.isWinningGrid(peeked);
    return Promise.all(this.reels.map((reel) => reel.stopAndSettle(landClean)));
  }

  /** Dims the *whole* reel area under one shared overlay, then lifts each winning symbol's own
   * .gif (or pulse, for BONUS) above it so only the winners read as "still important" —
   * `positions` is [reelIndex, rowIndex] pairs, exactly SpinEvaluation.winningPositions from
   * the spin response. A losing spin (empty positions) leaves everything untouched rather than
   * graying out a grid with nothing to celebrate. */
  showWinHighlights(positions: [number, number][]): void {
    this.clearWinAnimations();
    if (positions.length === 0) return;

    this.winOverlay.visible = true;

    const seen = new Set<string>();
    for (const [reelIndex, rowIndex] of positions) {
      const key = `${reelIndex},${rowIndex}`;
      if (seen.has(key)) continue; // multiple winning lines can share the same cell
      seen.add(key);

      const reel = this.reels[reelIndex];
      if (!reel) continue;
      const built = reel.buildWinVisual(rowIndex);
      if (!built) continue;

      // Without this, the original PNG still shows through the (only ~50% opaque) overlay,
      // dimmed, around/behind the gif — hide it entirely so only the highlight is visible.
      reel.setRowSpriteVisible(rowIndex, false);
      this.hiddenSpriteRows.push({ reel, row: rowIndex });

      built.view.x = reel.view.x;
      built.view.y = reel.view.y + reel.getRowY(rowIndex);
      this.winHighlightLayer.addChild(built.view);
      built.play();
      this.activeWinVisuals.push(built);
    }
  }

  clearWinAnimations(): void {
    this.winOverlay.visible = false;
    this.activeWinVisuals.forEach((v) => v.destroy());
    this.activeWinVisuals = [];
    this.hiddenSpriteRows.forEach(({ reel, row }) => reel.setRowSpriteVisible(row, true));
    this.hiddenSpriteRows = [];
  }

  destroy(): void {
    this.clearWinAnimations();
    this.reels.forEach((r) => r.destroy());
    Object.values(this.gifTemplates).forEach((template) => template?.destroy());
    this.root.destroy({ children: true });
  }
}
