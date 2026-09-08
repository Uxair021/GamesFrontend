import { Application, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { BuffaloSymbol, PayoutRow } from "../api";
import { loadSymbolTextures, loadBackgroundTexture, loadWinGifAnimations } from "./symbols";
import { Reel } from "./Reel";

const REEL_COUNT = 3;
const VISIBLE_ROWS = 3;
const COLUMN_GAP = 25;

// Fractional position of the reel window within bg.png (1672x941 source art) — the three
// white boxes under the "BUFFALO 777" title. First-pass estimate; tune by eye as needed.
const WINDOW_LEFT_FRAC = 0.239;
const WINDOW_RIGHT_FRAC = 0.761;
const WINDOW_TOP_FRAC = 0.129;
const WINDOW_BOTTOM_FRAC = 0.87;

const BG_ASPECT = 1672 / 941;

export const CANVAS_WIDTH = 1672;
export const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH / BG_ASPECT);

const WINDOW_WIDTH = (WINDOW_RIGHT_FRAC - WINDOW_LEFT_FRAC) * CANVAS_WIDTH;
const WINDOW_HEIGHT = (WINDOW_BOTTOM_FRAC - WINDOW_TOP_FRAC) * CANVAS_HEIGHT;
export const CELL_WIDTH = (WINDOW_WIDTH - (REEL_COUNT - 1) * COLUMN_GAP) / REEL_COUNT;
export const CELL_HEIGHT = WINDOW_HEIGHT / VISIBLE_ROWS;

/** Fractional (x, y) center of the empty wooden sign under each payout row baked into
 * bg.png — left ladder highest-to-lowest, then right ladder highest-to-lowest. First-pass
 * estimate; tune by eye as needed. */
const LADDER_POSITIONS: Record<PayoutRow["symbol"], { xFrac: number; yFrac: number }> = {
  COIN: { xFrac: 0.0748, yFrac: 0.1222 },
  MONEY_BAG: { xFrac: 0.0748, yFrac: 0.256 },
  TRIPLE_BAR: { xFrac: 0.0748, yFrac: 0.3990 },
  DOUBLE_BAR: { xFrac: 0.0748, yFrac: 0.5376 },
  SINGLE_BAR: { xFrac: 0.0748, yFrac: 0.6728 },
  ANY_BAR: { xFrac: 0.0748, yFrac: 0.8115 },
  BULL: { xFrac: 0.9272, yFrac: 0.1176 },
  ACE: { xFrac: 0.9272, yFrac: 0.2532 },
  KING: { xFrac: 0.9272, yFrac: 0.3888 },
  QUEEN: { xFrac: 0.9272, yFrac: 0.5346 },
  JACK: { xFrac: 0.9272, yFrac: 0.6734 },
  TEN: { xFrac: 0.9272, yFrac: 0.8092 },
};

const LADDER_TEXT_STYLE = new TextStyle({
  fontFamily: "Arial Black, Arial, sans-serif",
  fontWeight: "900",
  fontSize: 22,
  fill: 0xffe37a,
  stroke: { color: 0x3a1e08, width: 4 },
  align: "center",
});

export class Buffalo777Scene {
  private reels: Reel[] = [];
  private root: Container;
  private ladderTexts: Partial<Record<PayoutRow["symbol"], Text>> = {};
  private gifTemplates: Awaited<ReturnType<typeof loadWinGifAnimations>>;

  private constructor(
    app: Application,
    background: Sprite,
    textures: Awaited<ReturnType<typeof loadSymbolTextures>>,
    gifTemplates: Awaited<ReturnType<typeof loadWinGifAnimations>>
  ) {
    this.gifTemplates = gifTemplates;
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

      const reel = new Reel(textures, gifTemplates, CELL_WIDTH, CELL_HEIGHT);
      reelWindow.addChild(reel.container);

      const idleTarget: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol] = ["TEN", "BULL", "SINGLE_BAR"];
      reel.showStatic(idleTarget);

      this.root.addChild(reelWindow);
      this.reels.push(reel);
    }

    // Win-value readouts on the wooden signs baked into bg.png's side ladders.
    for (const [symbol, pos] of Object.entries(LADDER_POSITIONS) as [PayoutRow["symbol"], { xFrac: number; yFrac: number }][]) {
      const text = new Text({ text: "", style: LADDER_TEXT_STYLE });
      text.anchor.set(0.5);
      text.x = pos.xFrac * app.screen.width;
      text.y = pos.yFrac * app.screen.height;
      this.root.addChild(text);
      this.ladderTexts[symbol] = text;
    }
  }

  static async create(app: Application): Promise<Buffalo777Scene> {
    const [background, textures, gifTemplates] = await Promise.all([
      loadBackgroundTexture(),
      loadSymbolTextures(),
      loadWinGifAnimations(),
    ]);
    const bgSprite = new Sprite(background);
    bgSprite.width = app.screen.width;
    bgSprite.height = app.screen.height;
    return new Buffalo777Scene(app, bgSprite, textures, gifTemplates);
  }

  /** Fills in each ladder sign with the dollar amount that payout is actually worth at the
   * current bet (payout multiplier × bet) — recompute whenever the bet changes. */
  updatePayoutValues(paytable: PayoutRow[], betAmount: number): void {
    for (const row of paytable) {
      const text = this.ladderTexts[row.symbol];
      if (text) text.text = (row.payout * betAmount).toFixed(2);
    }
  }

  /** Spins all reels and lands on the given result. Resolves once every reel has stopped.
   * All 3 reels start scrolling at the same instant; the staggered stop (each landing
   * progressively later) comes from the increasing duration per reel index. onReelLand
   * fires as each individual reel stops (for a per-reel landing sound). `turbo` shortens
   * the spin/stagger duration for a much snappier round. */
  async spin(
    reelsResult: [BuffaloSymbol, BuffaloSymbol, BuffaloSymbol][],
    onReelLand?: (index: number) => void,
    turbo = false
  ): Promise<void> {
    const speed = turbo ? 0.4 : 1;
    const spins = this.reels.map((reel, i) =>
      reel.spinTo(reelsResult[i], (900 + i * 350) * speed, 0).then(() => onReelLand?.(i))
    );
    await Promise.all(spins);
  }

  /** Glow + pulse on the payline symbols (any win) — call with false to stop, e.g. when the next spin starts. */
  setWinGlow(active: boolean): void {
    this.reels.forEach((reel) => (active ? reel.startWinGlow() : reel.stopWinGlow()));
  }

  destroy(): void {
    this.reels.forEach((r) => r.destroy());
    Object.values(this.gifTemplates).forEach((template) => template?.destroy());
    this.root.destroy({ children: true });
  }
}
