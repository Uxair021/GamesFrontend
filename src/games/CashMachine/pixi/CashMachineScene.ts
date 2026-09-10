import { Application, Container, Graphics, Sprite } from "pixi.js";
import { CashSymbol } from "../api";
import { loadSymbolTextures, loadBackgroundTexture, loadForegroundTexture } from "./symbols";
import { CashReel } from "./CashReel";

// Fractional positions of the 3 reel windows within bg.png (1564x1006 source art) — two
// oval windows flanking a shield-shaped center window, unevenly spaced/sized, so each
// gets its own fractions rather than one evenly-spaced formula. Eyeballed from the art;
// expect to tune these empirically against real renders, same as ShamrockSpin's did.
const REEL_WINDOWS = [
  { leftFrac: 0.190, rightFrac: 0.379 }, // left oval
  { leftFrac: 0.412, rightFrac: 0.587 }, // center shield
  { leftFrac: 0.615, rightFrac: 0.800 }, // right oval
];
const WINDOW_TOP_FRAC = 0.313;
const WINDOW_BOTTOM_FRAC = 0.701;

const BG_ASPECT = 1564 / 1006;

export const CANVAS_WIDTH = 1450;
export const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH / BG_ASPECT);

export class CashMachineScene {
  private reels: CashReel[] = [];
  private root: Container;
  private activeReelCount = 3;

  private constructor(
    app: Application,
    background: Sprite,
    foreground: Sprite,
    textures: Awaited<ReturnType<typeof loadSymbolTextures>>
  ) {
    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(background);

    const windowTop = WINDOW_TOP_FRAC * app.screen.height;
    const windowHeight = (WINDOW_BOTTOM_FRAC - WINDOW_TOP_FRAC) * app.screen.height;

    for (const win of REEL_WINDOWS) {
      const left = win.leftFrac * app.screen.width;
      const width = (win.rightFrac - win.leftFrac) * app.screen.width;

      const reelWindow = new Container();
      reelWindow.x = left;
      reelWindow.y = windowTop;

      const mask = new Graphics();
      mask.rect(0, 0, width, windowHeight);
      mask.fill({ color: 0xffffff });
      reelWindow.addChild(mask);
      reelWindow.mask = mask;

      const reel = new CashReel(textures, width, windowHeight);
      reelWindow.addChild(reel.container);
      reel.showStatic("null");

      this.root.addChild(reelWindow);
      this.reels.push(reel);
    }

    // On top of every reel: bg2.png's transparent oval/shield cutouts let the reel
    // content show through in the frame's exact curve, while its opaque ornate border
    // occludes any symbol/glow overflow past that curve — bg.png underneath still
    // supplies the silver window fill since both share the same composition.
    this.root.addChild(foreground);
  }

  static async create(app: Application): Promise<CashMachineScene> {
    const [background, foreground, textures] = await Promise.all([
      loadBackgroundTexture(),
      loadForegroundTexture(),
      loadSymbolTextures(),
    ]);
    const bgSprite = new Sprite(background);
    bgSprite.width = app.screen.width;
    bgSprite.height = app.screen.height;
    const fgSprite = new Sprite(foreground);
    fgSprite.width = app.screen.width;
    fgSprite.height = app.screen.height;
    return new CashMachineScene(app, bgSprite, fgSprite, textures);
  }

  /**
   * Starts every reel currently in play (per the active bet tier) scrolling immediately —
   * purely cosmetic filler, no server result needed yet. Call this the instant Spin is
   * pressed, before the spin request is even sent, so reel motion never waits on the
   * network. Reels beyond the active tier stay static/dimmed, same as today.
   */
  startSpinUp(): void {
    this.reels.forEach((reel, i) => {
      if (i >= this.activeReelCount) return;
      reel.startContinuousSpin();
    });
  }

  /** Cancels an in-flight spin-up (e.g. the spin request failed/timed out) and settles
   * every in-play reel to an idle frame instead of leaving it spinning forever. */
  cancelSpinUp(): void {
    this.reels.forEach((reel, i) => {
      if (i >= this.activeReelCount) return;
      reel.stopToIdle();
    });
  }

  /**
   * Lands the reels actually in play for this bet tier on `symbols` (length equals
   * `activeReels`) — each reel picks up from wherever `startSpinUp` left it scrolling
   * (or from a static frame, if it was never started). Reels beyond `activeReels` are
   * dimmed and shown blank — no spin animation — since lower bet tiers only put reel 1
   * (then 1-2, then 1-2-3) in play. Reels in `respunIndexes` get a second,
   * reverse-direction spin after the first lands (the bonus-respin visual cue). Resolves
   * once every reel (including any respins) has finished.
   */
  async land(
    symbols: CashSymbol[],
    activeReels: number,
    respunIndexes: number[],
    onReelLand?: (index: number) => void
  ): Promise<void> {
    this.activeReelCount = activeReels;
    const respunSet = new Set(respunIndexes);
    const firstPass = this.reels.map((reel, i) => {
      if (i >= activeReels) {
        reel.stopToIdle();
        reel.setDimmed(true);
        reel.showStatic("null");
        return Promise.resolve();
      }
      reel.setDimmed(false);
      // A respun reel was "null" before the respin (that's the only trigger condition on
      // the backend) — land the first pass on that, and the *final* value in the reverse pass.
      const firstTarget = respunSet.has(i) ? "null" : symbols[i];
      return reel.landOn(firstTarget, 900 + i * 350, 0).then(() => onReelLand?.(i));
    });
    await Promise.all(firstPass);

    if (respunIndexes.length === 0) return;

    const respinPass = respunIndexes.map((i, order) =>
      this.reels[i].landOn(symbols[i], 700, order * 150, true).then(() => onReelLand?.(i))
    );
    await Promise.all(respinPass);
  }

  /** Updates which reels read as "in play" without spinning anything — used to reflect
   * a bet change immediately, before the next spin. */
  setActiveReelsPreview(activeReels: number): void {
    this.activeReelCount = activeReels;
    this.reels.forEach((reel, i) => reel.setDimmed(i >= activeReels));
  }

  setWinGlow(active: boolean): void {
    this.reels.forEach((reel, i) => {
      if (i >= this.activeReelCount) return; // never glow a dimmed, not-in-play reel
      active ? reel.startWinGlow() : reel.stopWinGlow();
    });
  }

  destroy(): void {
    this.reels.forEach((r) => r.destroy());
    this.root.destroy({ children: true });
  }
}
