import gsap from "gsap";
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { FruitySymbol, PayoutRow } from "../api";
import { loadSymbolTextures, loadBackgroundTexture } from "./symbols";
import { Reel } from "./Reel";
import { COIN_COLOR, COIN_SHINE_COLOR } from "./effects";

const REEL_COUNT = 3;
const VISIBLE_ROWS = 3;

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

// Reel window bounds, measured directly from bg.png's own gold-bordered frame (the 3
// diamond-pattern boxes under the "777 FRUITY" title) — not eyeballed.
const WINDOW_LEFT_FRAC = 551 / CANVAS_WIDTH;
const WINDOW_RIGHT_FRAC = 1469 / CANVAS_WIDTH;
const WINDOW_TOP_FRAC = 104 / CANVAS_HEIGHT;
const WINDOW_BOTTOM_FRAC = 880 / CANVAS_HEIGHT;
const COLUMN_GAP = 10;

const WINDOW_WIDTH = (WINDOW_RIGHT_FRAC - WINDOW_LEFT_FRAC) * CANVAS_WIDTH;
const WINDOW_HEIGHT = (WINDOW_BOTTOM_FRAC - WINDOW_TOP_FRAC) * CANVAS_HEIGHT;
export const CELL_WIDTH = (WINDOW_WIDTH - (REEL_COUNT - 1) * COLUMN_GAP) / REEL_COUNT;
export const CELL_HEIGHT = WINDOW_HEIGHT / VISIBLE_ROWS;

// The empty purple-framed sidebar box (also baked into bg.png, to the left of the reel
// window) that the paytable renders into — same measurement approach as the window above.
const PANEL_LEFT_FRAC = 279 / CANVAS_WIDTH;
const PANEL_RIGHT_FRAC = 527 / CANVAS_WIDTH;
const PANEL_TOP_FRAC = 131 / CANVAS_HEIGHT;
const PANEL_BOTTOM_FRAC = 839 / CANVAS_HEIGHT;

/** Row order top-to-bottom: the Bonus/free-spins feature headlines the list (it's the
 * flagship "big feature" row, not a numeric payout), then every real symbol descending by
 * payout — mirrors the reference paytable's "highest at top" convention. */
const SIDEBAR_ORDER: FruitySymbol[] = [
  "BONUS",
  "STAR",
  "BAR",
  "SEVEN",
  "DRAGON_FRUIT",
  "WATERMELON",
  "GRAPE",
  "PINEAPPLE",
  "PEACH",
  "ORANGE",
  "LEMON",
  "APPLE",
];

const ROW_TEXT_STYLE = new TextStyle({
  fontFamily: "Arial Black, Arial, sans-serif",
  fontWeight: "500",
  fontSize: 22,
  fill: 0xffe37a,
  stroke: { color: 0x3a1e08, width: 4 },
  align: "right",
});

/** The Bonus row's "3-10 FREE SPINS" label is longer than any dollar amount — smaller font
 * so it still fits the same column the numbers use. */
const BONUS_TEXT_STYLE = new TextStyle({
  fontFamily: "Arial Black, Arial, sans-serif",
  fontWeight: "600",
  fontSize: 22,
  fill: 0xffe37a,
  stroke: { color: 0x3a1e08, width: 3 },
  align: "right",
});

/** How many identical icons render per row — 3-in-a-row, matching exactly what a win on the
 * payline looks like, instead of a single icon + a bare "xN" multiplier. */
const ICONS_PER_ROW = 3;

/** How long the winning sidebar row keeps visibly pulsing (per user request: 3-4s, not one
 * quick bounce) and how many full up/down bounces fit in that window. */
const PULSE_TOTAL_SECONDS = 4;
const PULSE_CYCLES = 10;

/** Gap between each reel's win effect starting — reel 1, then 2, then 3, left to right (per
 * user request: 0.5s apart), instead of all 3 glowing in perfect unison. */
const WIN_EFFECT_STAGGER_MS = 200;

interface SidebarRow {
  symbol: FruitySymbol;
  container: Container;
  /** Holds just the 3 icon sprites, nothing else — animateRowPulse scales this alone (not
   * `container`) so the win pulse bounces the icons only, never the payout `text` next to
   * them. */
  iconsContainer: Container;
  icons: Sprite[];
  text: Text;
  highlight: Graphics;
}

export class FruityScene {
  private reels: Reel[] = [];
  /** Pending per-reel win-effect start delays, so a spin that lands before the stagger
   * finishes (see setWinEffect) can cancel the ones that haven't fired yet. */
  private winEffectStartTimeouts: number[] = [];
  private root: Container;
  private sidebarRows: SidebarRow[] = [];
  private coinLayer: Container;

  private constructor(
    app: Application,
    background: Sprite,
    textures: Awaited<ReturnType<typeof loadSymbolTextures>>
  ) {
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

      const idleTarget: [FruitySymbol, FruitySymbol, FruitySymbol] = ["APPLE", "LEMON", "ORANGE"];
      reel.showStatic(idleTarget);

      this.root.addChild(reelWindow);
      this.reels.push(reel);
    }

    this.coinLayer = new Container();
    this.root.addChild(this.coinLayer);

    this.buildSidebar(app, textures);
  }

  private buildSidebar(app: Application, textures: Record<FruitySymbol, Texture>): void {
    const panelLeft = PANEL_LEFT_FRAC * app.screen.width;
    const panelRight = PANEL_RIGHT_FRAC * app.screen.width;
    const panelTop = PANEL_TOP_FRAC * app.screen.height;
    const panelBottom = PANEL_BOTTOM_FRAC * app.screen.height;
    const panelWidth = panelRight - panelLeft;
    const rowHeight = (panelBottom - panelTop) / SIDEBAR_ORDER.length;

    const leftPad = panelWidth * 0.035;
    const rightPad = panelWidth * 0.05;
    const iconGap = panelWidth * 0.012;
    const iconSize = Math.min(rowHeight - 14, panelWidth * 0.16);
    // Right edge the text anchors to (see the anchor.set(1, 0.5) below) — right-aligning a
    // single-line Text means moving its anchor + x, not TextStyle.align (that only affects
    // how multiple wrapped/\n lines sit relative to each other, a no-op on one line).
    const textRightX = panelWidth - rightPad;

    SIDEBAR_ORDER.forEach((symbol, i) => {
      const rowContainer = new Container();
      rowContainer.x = panelLeft;
      rowContainer.y = panelTop + i * rowHeight;
      this.root.addChild(rowContainer);

      const highlight = new Graphics();
      highlight.roundRect(2, 2, panelWidth - 4, rowHeight - 4, 8);
      highlight.fill({ color: 0xffd700, alpha: 0 });
      rowContainer.addChild(highlight);

      // 3 identical icons side by side — reads as exactly the winning pattern (3-in-a-row on
      // the payline), not just a single sample icon next to a bare multiplier. Held in their
      // own sub-container (not added straight to rowContainer) so animateRowPulse can scale
      // just the icons on a win, never the payout text sitting next to them.
      const iconsContainer = new Container();
      rowContainer.addChild(iconsContainer);
      const icons: Sprite[] = [];
      for (let j = 0; j < ICONS_PER_ROW; j++) {
        const icon = new Sprite(textures[symbol]);
        icon.anchor.set(0.5);
        const scale = Math.min(iconSize / icon.texture.width * 1.5, iconSize / icon.texture.height * 1.5);
        icon.scale.set(scale);
        icon.x = leftPad + j * (iconSize + iconGap) + iconSize / 2;
        icon.y = rowHeight / 2;
        iconsContainer.addChild(icon);
        icons.push(icon);
      }

      const text = new Text({ text: "", style: symbol === "BONUS" ? BONUS_TEXT_STYLE : ROW_TEXT_STYLE });
      text.anchor.set(1, 0.5);
      text.x = textRightX;
      text.y = rowHeight / 2;
      rowContainer.addChild(text);

      this.sidebarRows.push({ symbol, container: rowContainer, iconsContainer, icons, text, highlight });
    });
  }

  static async create(app: Application): Promise<FruityScene> {
    const [background, textures] = await Promise.all([loadBackgroundTexture(), loadSymbolTextures()]);
    const bgSprite = new Sprite(background);
    bgSprite.width = app.screen.width;
    bgSprite.height = app.screen.height;
    return new FruityScene(app, bgSprite, textures);
  }

  /** Fills in each sidebar row with the actual amount that combo currently pays (payout ×
   * `betAmount`) — not a bare "xN" multiplier — so it reads the same way the reels' own Win
   * readout does. Recompute whenever the paytable loads *or the bet changes* (see
   * Fruity777Game.tsx's effect keyed on betAmount). The Bonus row shows its free-spin range
   * instead, since it has no cash payout of its own. */
  updatePaytable(paytable: PayoutRow[], betAmount: number): void {
    const bySymbol = Object.fromEntries(paytable.map((row) => [row.symbol, row.payout])) as Partial<
      Record<FruitySymbol, number>
    >;
    for (const row of this.sidebarRows) {
      if (row.symbol === "BONUS") {
        row.text.text = `BONUS`;
      } else {
        const payout = bySymbol[row.symbol];
        row.text.text = payout !== undefined ? (payout * betAmount).toFixed(2) : "";
      }
    }
  }

  /** Spins all reels and lands on the given result. Resolves once every reel has stopped.
   * All 3 reels start scrolling at the same instant; the staggered stop (each landing
   * progressively later) comes from the increasing duration per reel index. */
  async spin(reelsResult: [FruitySymbol, FruitySymbol, FruitySymbol][], onReelLand?: (index: number) => void): Promise<void> {
    const spins = this.reels.map((reel, i) =>
      reel.spinTo(reelsResult[i], 900 + i * 350, 0).then(() => onReelLand?.(i))
    );
    await Promise.all(spins);
  }

  /** Win treatment on the payline (a rainbow-cycling halo around the symbol plus a scale
   * pulse — see Reel.ts) plus the matching sidebar row's pulse + coin toss. Every reel's
   * above/below rows dim in one synchronous pass, all at the same instant — only the star
   * sweep/glow itself starts in sequence, left to right (reel 1, then 2, then 3, staggered by
   * WIN_EFFECT_STAGGER_MS), not the dimming (per user request: the dim used to be tied to each
   * reel's own staggered start, which made it visibly dim reel-by-reel instead of all at once).
   * Call with `false` to stop (e.g. when the next spin starts). */
  setWinEffect(active: boolean, winningSymbol?: FruitySymbol): void {
    this.winEffectStartTimeouts.forEach((id) => window.clearTimeout(id));
    this.winEffectStartTimeouts = [];

    if (active) {
      this.reels.forEach((reel) => reel.dimNonPayline());
      this.reels.forEach((reel, i) => {
        this.winEffectStartTimeouts.push(window.setTimeout(() => reel.startWinEffect(), i * WIN_EFFECT_STAGGER_MS));
      });
      if (winningSymbol) this.pulseSidebarRow(winningSymbol);
    } else {
      this.reels.forEach((reel) => reel.stopWinEffect());
    }
  }

  /** Announces a Bonus trigger the same way a numeric win does — pulses the BONUS sidebar
   * row (no coin toss; the free-spin award itself is announced via the full-screen banner). */
  pulseBonusRow(): void {
    const row = this.sidebarRows.find((r) => r.symbol === "BONUS");
    if (!row) return;
    this.animateRowPulse(row);
  }

  /** Scales/glows the winning symbol's sidebar row and fires a handful of gold coins arcing
   * from that row down to the bottom edge of the canvas — reads as "feeding" the win toward
   * the control bar sitting just below the canvas in the DOM (see plan's Decisions). */
  private pulseSidebarRow(symbol: FruitySymbol): void {
    const row = this.sidebarRows.find((r) => r.symbol === symbol);
    if (!row) return;
    this.animateRowPulse(row);
    this.throwCoins(row);
  }

  /** Pulses the row for PULSE_TOTAL_SECONDS (~3.5s, per user request) — a gentle repeating
   * scale bounce on all 3 icons only (scaling iconsContainer scales them together, leaving
   * `text` — the payout amount — untouched) plus a held gold highlight behind the whole row,
   * instead of one quick bounce. */
  private animateRowPulse(row: SidebarRow): void {
    gsap.killTweensOf(row.iconsContainer.scale);
    gsap.killTweensOf(row.highlight);
    row.iconsContainer.pivot.set(0, 0);
    row.iconsContainer.scale.set(1);

    const halfCycle = PULSE_TOTAL_SECONDS / (PULSE_CYCLES * 2);
    gsap.to(row.highlight, { alpha: 0.55, duration: 0.15 });
    gsap.to(row.highlight, { alpha: 0, duration: 0.5, delay: PULSE_TOTAL_SECONDS - 0.5 });
    gsap.to(row.iconsContainer.scale, {
      x: 1.12,
      y: 1.12,
      duration: halfCycle,
      ease: "sine.inOut",
      repeat: PULSE_CYCLES * 2 - 1,
      yoyo: true,
    });
  }

  private throwCoins(row: SidebarRow): void {
    const origin = row.icons[1] ?? row.icons[0];
    const startX = row.container.x + origin.x;
    const startY = row.container.y + origin.y;
    const targetY = CANVAS_HEIGHT;
    const coinCount = 6 + Math.floor(Math.random() * 3);

    for (let i = 0; i < coinCount; i++) {
      const coin = new Graphics();
      coin.circle(0, 0, 14).fill({ color: COIN_COLOR });
      coin.circle(-3, -3, 5.5).fill({ color: COIN_SHINE_COLOR, alpha: 0.8 });
      coin.x = startX;
      coin.y = startY;
      this.coinLayer.addChild(coin);

      const targetX = startX + (Math.random() - 0.3) * 420 + 200;
      const delay = i * 0.04;
      const duration = 0.7 + Math.random() * 0.3;

      gsap
        .timeline({ delay, onComplete: () => coin.destroy() })
        .to(coin, { x: targetX, duration, ease: "power1.in" }, 0)
        .to(coin, { y: targetY, duration, ease: "power2.in" }, 0)
        .to(coin, { rotation: Math.random() * 10 - 5, duration }, 0)
        .to(coin, { alpha: 0, duration: 0.2 }, duration - 0.2);
    }
  }

  destroy(): void {
    this.winEffectStartTimeouts.forEach((id) => window.clearTimeout(id));
    this.reels.forEach((r) => r.destroy());
    this.root.destroy({ children: true });
  }
}
