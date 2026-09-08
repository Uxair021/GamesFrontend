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
/** Per-reel resting-position offset (fraction of a row) — reel 2 sits permanently half a row
 * off clean alignment while reels 1/3 stay clean, purely for visual variety between reels
 * (see Reel.ts's phaseOffsetSteps doc comment). */
const REEL_PHASE_OFFSETS = [0, 0.5, 0];

export class SizzlingSevensScene {
  private root: Container;
  private reels: Reel[] = [];
  private gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>;

  private constructor(
    app: Application,
    textures: Record<SizzlingSymbol, Texture>,
    gifTemplates: Partial<Record<SizzlingSymbol, AnimatedGIF>>,
    symbolWeights: Partial<Record<SizzlingSymbol, number>>
  ) {
    this.gifTemplates = gifTemplates;
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
  }

  static async create(app: Application, symbolWeights: Partial<Record<SizzlingSymbol, number>> = {}): Promise<SizzlingSevensScene> {
    const [textures, gifTemplates] = await Promise.all([loadSymbolTextures(), loadWinGifAnimations()]);
    return new SizzlingSevensScene(app, textures, gifTemplates, symbolWeights);
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

  /** Stops every reel (advance-and-bounce, no predetermined target, no symbol swap — see
   * Reel.stopAndSettle) simultaneously and returns the resulting grid for the caller to send
   * off for scoring. */
  async freezeSpin(): Promise<Grid> {
    return Promise.all(this.reels.map((reel) => reel.stopAndSettle()));
  }

  /** Plays each winning cell's own matching-symbol .gif (or a pulse for BONUS, which has no
   * .gif) directly over that symbol — `positions` is [reelIndex, rowIndex] pairs, exactly
   * SpinEvaluation.winningPositions from the spin response. */
  showWinHighlights(positions: [number, number][]): void {
    this.clearWinAnimations();
    for (const [reelIndex, rowIndex] of positions) {
      this.reels[reelIndex]?.playWinAt(rowIndex);
    }
  }

  clearWinAnimations(): void {
    this.reels.forEach((r) => r.clearWinAnimations());
  }

  destroy(): void {
    this.reels.forEach((r) => r.destroy());
    Object.values(this.gifTemplates).forEach((template) => template?.destroy());
    this.root.destroy({ children: true });
  }
}
