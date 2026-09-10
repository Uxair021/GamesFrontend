import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { BuffaloSymbol, PayoutRow } from "../api";
import { loadSymbolTextures, loadBackgroundTexture, loadWinGifAnimations } from "./symbols";
import { Reel } from "./Reel";

const REEL_COUNT = 3;
const VISIBLE_ROWS = 3;
const COLUMN_GAP = 25;

/** Multiplies every reel's landing duration in spin() (on top of the existing turbo
 * multiplier) — < 1 makes the whole spin snappier, > 1 makes it last longer, without
 * changing anything about how a spin plays out (same stagger, same easing, same turbo
 * behavior). */
const SPIN_SPEED_MULTIPLIER = 1.3;

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

/** How many coin sprites spill out per win-line payout. */
const COIN_FALL_COUNT = 56;
/** Native-pixel size range each falling coin is scaled to. */
const COIN_MIN_SIZE = 34;
const COIN_MAX_SIZE = 54;
/** Each coin's fall takes COIN_FALL_MIN_DURATION_MS to (COIN_FALL_MIN_DURATION_MS +
 * COIN_FALL_DURATION_VARIANCE_MS) ms — raise these to make the fall itself last longer. */
const COIN_FALL_MIN_DURATION_MS = 900;
const COIN_FALL_DURATION_VARIANCE_MS = 900;
/** Coins start falling at a random delay between 0 and this many ms, so they don't all drop
 * in a single synchronized line — raise it to spread the cascade out over more time. */
const COIN_FALL_MAX_STAGGER_MS = 850;

export class Buffalo777Scene {
  private reels: Reel[] = [];
  private root: Container;
  private ladderTexts: Partial<Record<PayoutRow["symbol"], Text>> = {};
  private gifTemplates: Awaited<ReturnType<typeof loadWinGifAnimations>>;
  private coinTexture: Texture;
  private coinLayer: Container;
  private coinTimeouts: number[] = [];
  private coinFrameCancels: Array<() => void> = [];

  private constructor(
    app: Application,
    background: Sprite,
    textures: Awaited<ReturnType<typeof loadSymbolTextures>>,
    gifTemplates: Awaited<ReturnType<typeof loadWinGifAnimations>>
  ) {
    this.gifTemplates = gifTemplates;
    this.coinTexture = textures.COIN;
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

    // On top of everything (reels + ladder text) so falling coins read clearly over both.
    this.coinLayer = new Container();
    this.root.addChild(this.coinLayer);
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
    const speed = (turbo ? 0.4 : 1) * SPIN_SPEED_MULTIPLIER;
    const spins = this.reels.map((reel, i) =>
      reel.spinTo(reelsResult[i], (900 + i * 350) * speed, 0).then(() => onReelLand?.(i))
    );
    await Promise.all(spins);
  }

  /** Glow + pulse on the payline symbols (any win) — call with false to stop, e.g. when the next spin starts. */
  setWinGlow(active: boolean): void {
    this.reels.forEach((reel) => (active ? reel.startWinGlow() : reel.stopWinGlow()));
  }

  /** Spills a handful of coins out of the ladder sign for whichever payout line just won,
   * falling past the bottom of the screen — e.g. `symbol="COIN"` pours coins out of the
   * left ladder's Gold Coin entry. Purely cosmetic; call once per winning spin. */
  playCoinFall(symbol: PayoutRow["symbol"]): void {
    const pos = LADDER_POSITIONS[symbol];
    if (!pos) return;
    const originX = pos.xFrac * CANVAS_WIDTH;
    const originY = pos.yFrac * CANVAS_HEIGHT;
    const floorY = CANVAS_HEIGHT + 60;

    for (let i = 0; i < COIN_FALL_COUNT; i++) {
      const coin = new Sprite(this.coinTexture);
      coin.anchor.set(0.5);
      const size = COIN_MIN_SIZE + Math.random() * (COIN_MAX_SIZE - COIN_MIN_SIZE);
      coin.scale.set(size / this.coinTexture.width);
      coin.rotation = Math.random() * Math.PI * 2;
      coin.alpha = 0;

      // Coins pop out clustered around the number, then drift a bit wider as they fall.
      const popX = (Math.random() - 0.5) * 30;
      const driftX = (Math.random() - 0.5) * 90;
      coin.x = originX + popX;
      coin.y = originY;
      this.coinLayer.addChild(coin);

      const delay = Math.random() * COIN_FALL_MAX_STAGGER_MS;
      const duration = COIN_FALL_MIN_DURATION_MS + Math.random() * COIN_FALL_DURATION_VARIANCE_MS;
      const spinSpeed = (Math.random() - 0.5) * 8;
      const startY = originY;

      const timeoutId = window.setTimeout(() => {
        const start = performance.now();
        let rafId = 0;
        const tick = (now: number) => {
          const t = Math.min(Math.max((now - start) / duration, 0), 1);
          // Ease-in fall (accelerating, like gravity) from a slower emerging pop.
          const eased = t * t;
          coin.y = startY + (floorY - startY) * eased;
          coin.x = originX + popX + driftX * t;
          coin.rotation += spinSpeed * 0.05;
          coin.alpha = t < 0.12 ? t / 0.12 : t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1;
          if (t < 1) {
            rafId = requestAnimationFrame(tick);
          } else {
            this.coinLayer.removeChild(coin);
            coin.destroy();
          }
        };
        rafId = requestAnimationFrame(tick);
        this.coinFrameCancels.push(() => cancelAnimationFrame(rafId));
      }, delay);

      this.coinTimeouts.push(timeoutId);
    }
  }

  destroy(): void {
    this.coinTimeouts.forEach((id) => window.clearTimeout(id));
    this.coinFrameCancels.forEach((cancel) => cancel());
    this.reels.forEach((r) => r.destroy());
    Object.values(this.gifTemplates).forEach((template) => template?.destroy());
    this.root.destroy({ children: true });
  }
}
