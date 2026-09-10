import { Application, Container, Sprite, Texture } from "pixi.js";
import { RubberDuckSymbol, PositionWin } from "../api";
import { loadSymbolTextures, loadBackgroundTexture, loadFrameTexture } from "./symbols";
import { Reel } from "./Reel";

const REEL_COUNT = 5;

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

// Reel window bounds, measured directly from bg.png's own 5 white cell frames (pixel-scanned
// against the raw PNG, not eyeballed — cells sit at x=[285,508]/[569,789]/[850,1071]/
// [1131,1352]/[1413,1636], y=[365,572] on the 1920x1080 art).
const WINDOW_LEFT = 278;
const WINDOW_RIGHT = 1645;
const WINDOW_TOP = 340;
const WINDOW_BOTTOM = 585;
const COLUMN_GAP = 45;

const WINDOW_WIDTH = WINDOW_RIGHT - WINDOW_LEFT;
export const CELL_WIDTH = (WINDOW_WIDTH - (REEL_COUNT - 1) * COLUMN_GAP) / REEL_COUNT;
export const CELL_HEIGHT = WINDOW_BOTTOM - WINDOW_TOP;

const IDLE_SYMBOLS: RubberDuckSymbol[] = ["GRAPES", "LEMON", "AVOCADO", "COCONUT", "BANANA"];

export class RubberDuckScene {
  private reels: Reel[] = [];
  private root: Container;

  private constructor(
    app: Application,
    background: Sprite,
    textures: Record<RubberDuckSymbol, Texture>,
    frameTexture: Texture
  ) {
    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(background);

    for (let i = 0; i < REEL_COUNT; i++) {
      const reelWindow = new Container();
      reelWindow.x = WINDOW_LEFT + i * (CELL_WIDTH + COLUMN_GAP);
      reelWindow.y = WINDOW_TOP;

      const reel = new Reel(textures, CELL_WIDTH, CELL_HEIGHT, frameTexture);
      reelWindow.addChild(reel.container);
      reel.showStatic(IDLE_SYMBOLS[i]);

      this.root.addChild(reelWindow);
      this.reels.push(reel);
    }
  }

  static async create(app: Application): Promise<RubberDuckScene> {
    const [background, textures, frameTexture] = await Promise.all([
      loadBackgroundTexture(),
      loadSymbolTextures(),
      loadFrameTexture(),
    ]);
    const bgSprite = new Sprite(background);
    bgSprite.width = app.screen.width;
    bgSprite.height = app.screen.height;
    return new RubberDuckScene(app, bgSprite, textures, frameTexture);
  }

  /** Spins all 5 reels and lands on the given result — resolves once every reel has stopped,
   * each landing a little later than the last (left to right). */
  async spin(reels: RubberDuckSymbol[], onReelLand?: (index: number) => void): Promise<void> {
    const spins = this.reels.map((reel, i) => reel.spinTo(reels[i], 700 + i * 260, 0).then(() => onReelLand?.(i)));
    await Promise.all(spins);
  }

  /** Draws the blinking blue border + floating win amount on every reel that won, clears
   * everywhere else. Call with an empty array to clear all. */
  setWinPositions(positionWins: PositionWin[]): void {
    const byReel = new Map(positionWins.map((w) => [w.reelIndex, w.win]));
    this.reels.forEach((reel, i) => {
      const amount = byReel.get(i);
      reel.setWin(amount !== undefined, amount);
    });
  }

  destroy(): void {
    this.reels.forEach((r) => r.destroy());
    this.root.destroy({ children: true });
  }
}
