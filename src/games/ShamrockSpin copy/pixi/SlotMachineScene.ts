import { Application, Container, Graphics, Sprite } from "pixi.js";
import { SlotSymbol } from "../api";
import { loadSymbolTextures, loadBackgroundTexture } from "./symbols";
import { Reel } from "./Reel";

const REEL_COUNT = 3;
const VISIBLE_ROWS = 3;
const COLUMN_GAP = 3;

// Fractional position of the reel window within bg.png (1484x1060 source art).
const WINDOW_LEFT_FRAC = 0.208;
const WINDOW_RIGHT_FRAC = 0.802;
const WINDOW_TOP_FRAC = 0.253;
const WINDOW_BOTTOM_FRAC = 0.85;

const BG_ASPECT = 1484 / 1060;

export const CANVAS_WIDTH = 1300;
export const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH / BG_ASPECT);

const WINDOW_WIDTH = (WINDOW_RIGHT_FRAC - WINDOW_LEFT_FRAC) * CANVAS_WIDTH;
const WINDOW_HEIGHT = (WINDOW_BOTTOM_FRAC - WINDOW_TOP_FRAC) * CANVAS_HEIGHT;
export const CELL_WIDTH = (WINDOW_WIDTH - (REEL_COUNT - 1) * COLUMN_GAP) / REEL_COUNT;
export const CELL_HEIGHT = WINDOW_HEIGHT / VISIBLE_ROWS;

export class SlotMachineScene {
  private reels: Reel[] = [];
  private root: Container;

  private constructor(app: Application, background: Sprite, textures: Awaited<ReturnType<typeof loadSymbolTextures>>) {
    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(background);

    const windowLeft = WINDOW_LEFT_FRAC * app.screen.width;
    const windowTop = WINDOW_TOP_FRAC * app.screen.height;

    for (let i = 0; i < REEL_COUNT; i++) {
      const reelWindow = new Container();
      reelWindow.x = windowLeft + i * (CELL_WIDTH + COLUMN_GAP);
      reelWindow.y = windowTop;

      const mask = new Graphics();
      mask.rect(0, 0, CELL_WIDTH, VISIBLE_ROWS * CELL_HEIGHT);
      mask.fill({ color: 0xffffff });
      reelWindow.addChild(mask);
      reelWindow.mask = mask;

      const reel = new Reel(textures, CELL_WIDTH, CELL_HEIGHT);
      reelWindow.addChild(reel.container);

      const idleTarget: [SlotSymbol, SlotSymbol, SlotSymbol] = ["SINGLE_BAR", "SHAMROCK_1", "GREEN_SEVEN"];
      reel.showStatic(idleTarget);

      this.root.addChild(reelWindow);
      this.reels.push(reel);
    }

    // Drawn after (in front of) the reels so it's never hidden behind symbol art —
    // bg.png's baked-in payline sits behind the reels and gets covered.
    const paylineY = windowTop + 1.5 * CELL_HEIGHT;
    const paylineLeft = windowLeft - 16;
    const paylineRight = windowLeft + REEL_COUNT * CELL_WIDTH + (REEL_COUNT - 1) * COLUMN_GAP + 16;

    const payline = new Graphics();
    payline.moveTo(paylineLeft, paylineY);
    payline.lineTo(paylineRight, paylineY);
    payline.stroke({ color: 0xe8c15a, width: 3, alpha: 0.95 });
    payline.circle(paylineLeft, paylineY, 7);
    payline.circle(paylineRight, paylineY, 7);
    payline.fill({ color: 0x7a1fa2 });
    payline.circle(paylineLeft, paylineY, 7);
    payline.circle(paylineRight, paylineY, 7);
    payline.stroke({ color: 0xe8c15a, width: 1.5 });
    this.root.addChild(payline);
  }

  static async create(app: Application): Promise<SlotMachineScene> {
    const [background, textures] = await Promise.all([loadBackgroundTexture(), loadSymbolTextures()]);
    const bgSprite = new Sprite(background);
    bgSprite.width = app.screen.width;
    bgSprite.height = app.screen.height;
    return new SlotMachineScene(app, bgSprite, textures);
  }

  /** Spins all reels and lands on the given result. Resolves once every reel has stopped. onReelLand fires as each individual reel stops (for a per-reel landing sound). */
  async spin(reelsResult: [SlotSymbol, SlotSymbol, SlotSymbol][], onReelLand?: (index: number) => void): Promise<void> {
    const spins = this.reels.map((reel, i) =>
      reel.spinTo(reelsResult[i], 900 + i * 350, i * 150).then(() => onReelLand?.(i))
    );
    await Promise.all(spins);
  }

  /** Glow + pulse on the payline symbols (any win) — call with false to stop, e.g. when the next spin starts. */
  setWinGlow(active: boolean): void {
    this.reels.forEach((reel) => (active ? reel.startWinGlow() : reel.stopWinGlow()));
  }

  destroy(): void {
    this.reels.forEach((r) => r.destroy());
    this.root.destroy({ children: true });
  }
}
