import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { TopDollarScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/TopDollarScene";
import {
  getTopDollarConfig,
  spinRequest,
  bonusAdvanceRequest,
  bonusResolveRequest,
  TopDollarConfigResponse,
  PayoutRow,
  SpinResponseBonus,
  ReelResult,
  TopDollarSymbol,
} from "./api";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

/** DOLLAR only ever lands on reel index 2 (confirmed: backend's DOLLAR_REEL_INDEX), at the
 * payline/middle row — used to target the same win-highlight glow/scale effect at it on a
 * bonus trigger (see runSpin). */
const DOLLAR_HIGHLIGHT_ROWS: [number[], number[], number[]] = [[], [], [1]];

const BG_MUSIC_URL = "/Sound/casino-vip-music-game-casino-music-5-469384.mp3";
// The track plays at full volume from the very first second (nothing to trim at the front), but
// fades out into ~1.2s of true silence right at its own tail (271.2s total) — trimming to 270s
// cuts that dead air so the loop doesn't have an audible gap before jumping back to the start.
const BG_MUSIC_TRIM_END_SECONDS = 270;

const DEFAULT_BET_LEVELS = [10, 25, 50, 100];

const PAYOUT_LABELS: Record<PayoutRow["key"], string> = {
  SEVEN: "3× 7",
  TRIPLE_BAR: "3× Triple Bar",
  DOUBLE_BAR: "3× Double Bar",
  SINGLE_BAR: "3× Single Bar",
  ANY_BAR: "Any 3 Bars (mixed)",
  DIAMOND_THREE: "3× Diamond",
  DIAMOND_TWO: "2× Diamond",
  DIAMOND_ONE: "1× Diamond",
};

/** This game's own symbol art (frontEnd/public/symbols/dollarGame/) — used to illustrate the
 * paytable in the info popup with the actual symbols instead of text-only labels, per user
 * request ("use this game symbols to define the rules"). Same raw files pixi/symbols.ts loads
 * for the reels (that module chroma-keys them for canvas use; here the plain white-card PNG is
 * shown directly, which reads fine since it matches the reel window's own white-glass look). */
const SYMBOL_ICON_SRC: Record<TopDollarSymbol, string> = {
  SEVEN: "/symbols/dollarGame/7.png",
  TRIPLE_BAR: "/symbols/dollarGame/TripleBar.png",
  DOUBLE_BAR: "/symbols/dollarGame/doubleBar.png",
  SINGLE_BAR: "/symbols/dollarGame/singleBar.png",
  DIAMOND: "/symbols/dollarGame/daimond.png",
  DOLLAR: "/symbols/dollarGame/dollar.png",
};

/** Which symbols (and how many) illustrate each paytable row. */
const PAYOUT_ICONS: Record<PayoutRow["key"], TopDollarSymbol[]> = {
  SEVEN: ["SEVEN", "SEVEN", "SEVEN"],
  TRIPLE_BAR: ["TRIPLE_BAR", "TRIPLE_BAR", "TRIPLE_BAR"],
  DOUBLE_BAR: ["DOUBLE_BAR", "DOUBLE_BAR", "DOUBLE_BAR"],
  SINGLE_BAR: ["SINGLE_BAR", "SINGLE_BAR", "SINGLE_BAR"],
  ANY_BAR: ["TRIPLE_BAR", "DOUBLE_BAR", "SINGLE_BAR"],
  DIAMOND_THREE: ["DIAMOND", "DIAMOND", "DIAMOND"],
  DIAMOND_TWO: ["DIAMOND", "DIAMOND"],
  DIAMOND_ONE: ["DIAMOND"],
};

function SymbolIcon({ symbol, size = 32 }: { symbol: TopDollarSymbol; size?: number }) {
  return (
    <img
      src={SYMBOL_ICON_SRC[symbol]}
      alt={symbol}
      className="rounded-md bg-white object-contain p-0.5 shadow"
      style={{ width: size, height: size }}
    />
  );
}

const OFFER_LABELS = ["First Offer", "Second Offer", "Third Offer", "Last Offer"];

/** What gets spoken (see soundEngine's speak) each time an offer is revealed — the last offer
 * auto-accepts with no real choice, so it gets its own line instead of asking a question the
 * player can't actually act on. */
function buildOfferSpeech(offerNumber: number, isLastOffer: boolean, amount: number): string {
  const label = OFFER_LABELS[offerNumber - 1] ?? `Offer ${offerNumber}`;
  const amountText = `${amount} dollar${amount === 1 ? "" : "s"}`;
  return isLastOffer
    ? `${label}: ${amountText}. Take it, it's the last offer.`
    : `${label}: ${amountText}. Take it, or try again?`;
}

/** Figures out which symbols actually made up a line win, purely from the returned reel grid —
 * the backend doesn't send winning positions explicitly, but this game's outcome tiers are
 * mutually exclusive (see backend engine.ts's rollTier) so the pattern alone is enough to tell:
 * either the 3 payline (middle-row) symbols form the win (7s/bars, matching or mixed), or — if
 * they don't — it's a diamond-count win, scored from every DIAMOND showing anywhere on the grid.
 * Returns one row-index array per reel (0=above, 1=middle, 2=below) for Reel.playWinHighlight. */
function computeWinHighlightRows(reels: [ReelResult, ReelResult, ReelResult]): [number[], number[], number[]] {
  const middle = reels.map((r) => r.symbols[1]);
  const isBar = (s: string) => s === "TRIPLE_BAR" || s === "DOUBLE_BAR" || s === "SINGLE_BAR";
  const paylineWin = (middle[0] === middle[1] && middle[1] === middle[2]) || middle.every(isBar);

  if (paylineWin) return [[1], [1], [1]];

  return reels.map((r) => r.symbols.flatMap((s, row) => (s === "DIAMOND" ? [row] : []))) as [
    number[],
    number[],
    number[],
  ];
}

interface BonusUiState {
  bonusId: string;
  currentOffer: number;
  offerNumber: number;
  offerCount: number;
  isLastOffer: boolean;
}

export function TopDollarGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TopDollarScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<TopDollarConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [bonus, setBonus] = useState<BonusUiState | null>(null);
  const [bonusBusy, setBonusBusy] = useState(false);
  // True from the moment the camera starts scrolling up to the bonus board until it's fully
  // back down on the base screen — wider than `bonus` alone (which only becomes true *after*
  // the scroll finishes), so the HTML control bar (not part of the Pixi canvas, so it can't
  // scroll with it) hides for the whole transition instead of sitting fixed in place while the
  // background scrolls out from under it.
  const [bonusViewActive, setBonusViewActive] = useState(false);
  // False until the one-time intro (hold on the top screen, then scroll down to the base game —
  // see playIntroScroll) finishes — gates the HTML control bar the same way bonusViewActive
  // does, so the player can't spin while the intro is still mid-scroll.
  const [introDone, setIntroDone] = useState(false);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getTopDollarConfig()
      .then((c) => {
        setConfig(c);
        setBetLevels(c.betLevels);
      })
      .catch(() => {
        /* fall back to default bet levels already set */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Kicks off the background-music fetch/decode now, in parallel with the Pixi/loading-screen
    // work below, so it's already cached by the time the intro scroll starts (it used to first
    // load right as the scroll began, and that decode/trim work landing mid-scroll was a jerk/
    // hitch — same fix as GemsDeluxe).
    sound.preloadBackgroundMusic(BG_MUSIC_URL, BG_MUSIC_TRIM_END_SECONDS);
    const app = new Application();

    app
      .init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      .then(async () => {
        if (cancelled || !canvasHostRef.current) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        canvasHostRef.current.appendChild(app.canvas);
        const scene = await TopDollarScene.create(app);
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      });

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      sound.stopReelSpinLoop();
      sound.stopBonusAlarmLoop();
      sound.cancelSpeech();
      sound.stopBackgroundMusic();
    };
  }, []);

  // Keeps the LCD-style BET/WIN readout baked into the reel window in sync — see
  // TopDollarScene's buildReadouts/updateReadouts.
  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.updateReadouts(betAmount, winAmount);
  }, [ready, betAmount, winAmount]);

  // Plays once, right as the loading screen hands off — holds briefly on the top (bonus board)
  // screen so the player sees it, then scrolls down to the base game before any control becomes
  // usable (confirmed with user: see the top screen first, then scroll down, then can play).
  const playIntroScroll = useCallback(async () => {
    if (!sceneRef.current) {
      setIntroDone(true);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    await sceneRef.current.scrollToBase();
    setIntroDone(true);
  }, []);

  const runSpin = useCallback(async () => {
    if (!sceneRef.current || spinning || bonus || !introDone) return;
    if (!user || user.balance < betAmount) {
      setError("Insufficient balance");
      return;
    }

    sound.resumeAudio();
    setError(null);
    setSpinning(true);
    setWinAmount(0);

    try {
      const result = await spinRequest(betAmount);
      sound.startReelSpinLoop();
      const emptyReelIndex = result.bonusTriggered ? null : result.emptyReelIndex;
      await sceneRef.current.spin(result.reels, emptyReelIndex);
      sound.stopReelSpinLoop();
      setBalance(result.balance);

      if (result.bonusTriggered) {
        const bonusResult = result as SpinResponseBonus;
        // Call out the DOLLAR symbol with the same glow/scale highlight a line win gets, and
        // start the bonus bell ringing — both run for 2s before the screen scrolls up. The bell
        // keeps ringing through the scroll and the pause that follows it, right up until the
        // bundle-selection chase actually starts (confirmed with user: this exact sequencing).
        sceneRef.current.playWinHighlights(DOLLAR_HIGHLIGHT_ROWS);
        sound.startBonusAlarmLoop();
        await new Promise((resolve) => setTimeout(resolve, 3500));
        sceneRef.current.clearWinHighlights();
        setBonusViewActive(true);
        await sceneRef.current.scrollToBonus();
        await new Promise((resolve) => setTimeout(resolve, 1750));
        sound.stopBonusAlarmLoop();
        await sceneRef.current.playBundleSelection(bonusResult.currentOffer);
        setBonus({
          bonusId: bonusResult.bonusId,
          currentOffer: bonusResult.currentOffer,
          offerNumber: bonusResult.offerNumber,
          offerCount: bonusResult.offerCount,
          isLastOffer: bonusResult.isLastOffer,
        });
        // Fire-and-forget — the buttons are usable immediately, not gated on the line finishing.
        sound.speak(buildOfferSpeech(bonusResult.offerNumber, bonusResult.isLastOffer, bonusResult.currentOffer));
      } else {
        setWinAmount(result.winAmount);
        if (result.winAmount > 0) {
          sceneRef.current.playWinHighlights(computeWinHighlightRows(result.reels));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spin failed";
      setError(message);
    } finally {
      setSpinning(false);
    }
  }, [betAmount, spinning, bonus, introDone, user, setBalance]);

  const handleTakeIt = useCallback(async () => {
    if (!bonus || bonusBusy) return;
    // The offer line may still be talking (or this may be the last offer's auto-accept firing
    // mid-sentence) — stop it immediately rather than let it keep going over the resolve/scroll.
    sound.cancelSpeech();
    setBonusBusy(true);
    try {
      const res = await bonusResolveRequest(bonus.bonusId);
      setBalance(res.balance);
      setWinAmount(res.winAmount);
      // Hide the offer buttons immediately, before the scroll even starts — otherwise they stay
      // mounted (fixed on screen) for the whole ~900ms scroll while the bonus board slides away
      // underneath them, which reads as the buttons themselves sliding down with it.
      setBonus(null);
      await sceneRef.current?.scrollToBase();
      setBonusViewActive(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve bonus");
    } finally {
      setBonusBusy(false);
    }
  }, [bonus, bonusBusy, setBalance]);

  const handleTryAgain = useCallback(async () => {
    if (!bonus || bonusBusy || bonus.isLastOffer) return;
    // Stop the current offer's line before rolling the next one.
    sound.cancelSpeech();
    setBonusBusy(true);
    try {
      const res = await bonusAdvanceRequest(bonus.bonusId);
      await sceneRef.current?.playBundleSelection(res.currentOffer);
      setBonus((prev) => (prev ? { ...prev, ...res } : prev));
      sound.speak(buildOfferSpeech(res.offerNumber, res.isLastOffer, res.currentOffer));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not advance bonus");
    } finally {
      setBonusBusy(false);
    }
  }, [bonus, bonusBusy]);

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;

  return (
    <>
      <div className="relative overflow-hidden" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          ref={gameCardRef}
          className="relative flex flex-col overflow-hidden rounded-2xl bg-black shadow-2xl"
          style={{
            width: CANVAS_WIDTH,
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          <div className="absolute top-0 z-10 w-full flex items-center justify-start px-3 py-2">
            <Link
              to="/"
              className="flex bg-white h-20 w-20 items-center justify-center rounded-full border-4 border-black text-black font-bold hover:bg-white"
              aria-label="Home"
            >
              <HomeIcon size={46} />
            </Link>
          </div>

          <div className="relative overflow-hidden" style={{ height: CANVAS_HEIGHT }}>
            <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-950 text-amber-300/70">
                Loading reels...
              </div>
            )}

            {bonus && (
              <div className="absolute inset-x-0 bottom-[10%] flex items-center w-full justify-center">
                <div className="z-10 flex w-[70%] items-between justify-between gap-6">
                  <button
                    onClick={handleTakeIt}
                    disabled={bonusBusy}
                    className="rounded-2xl border-2 border-green-950 bg-gradient-to-b from-lime-300 via-green-500 to-green-700 px-8 py-3 text-2xl font-black italic text-white shadow-lg disabled:opacity-50"
                  >
                    TAKE IT
                  </button>
                  <div className="gap-10 rounded-xl border-2 border-amber-400 bg-black/70 px-8 py-3 text-center">
                    <div className="text-lg font-bold uppercase tracking-wide text-amber-300">
                      {OFFER_LABELS[bonus.offerNumber - 1] ?? `Offer ${bonus.offerNumber}`}
                    </div>
                    <div className="text-5xl font-black text-white">${bonus.currentOffer.toFixed(2)}</div>
                  </div>
                  <button
                    onClick={handleTryAgain}
                    disabled={bonusBusy || bonus.isLastOffer}
                    className="rounded-2xl border-2 border-red-950 bg-gradient-to-b from-orange-300 via-red-500 to-red-700 px-8 py-3 text-2xl font-black italic text-white shadow-lg disabled:opacity-50"
                  >
                    TRY AGAIN
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-5xl text-center text-red-100">
              {error}
            </div>
          )}

          {/* Sits directly on the cabinet's own glossy control-deck panel (baked into
              bottomScreen.png, right below the reel window) instead of a separate opaque bar —
              first-pass placement (top/bottom fractions), tune by eye as needed. Hidden during
              the bonus round: these buttons are positioned to sit on the BOTTOM screen's control
              deck, which scrolls out of view once the bonus board (top screen) is showing —
              being plain HTML they don't scroll with the canvas, so left visible they'd just
              float over the bonus board art instead, which already has its own Take-It/Try-Again
              controls. */}
          {!bonusViewActive && introDone && (
            <div className="absolute inset-x-0 top-[48%] bottom-[5%] flex items-center justify-between gap-3 pl-[180px] pr-[180px]">
              <div className="flex items-center gap-3">
                <CtrlButton onClick={() => setShowPaytable((v) => !v)} ariaLabel="Paytable" className="h-20 w-20">
                  <InfoIcon />
                </CtrlButton>
                <CtrlButton
                  onClick={() => {
                    sound.resumeAudio();
                    setMuted(sound.toggleMuted());
                  }}
                  active={muted}
                  ariaLabel={muted ? "Unmute" : "Mute"}
                  className="h-20 w-20"
                >
                  <SoundIcon muted={muted} />
                </CtrlButton>
              </div>
              <div>
                <CreditScreen balance={user?.balance ?? 0} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {betLevels.map((level, i) => (
                  <BetButton
                    key={level}
                    value={level}
                    active={i === betIndex}
                    disabled={spinning}
                    onClick={() => setBetIndex(i)}
                  />
                ))}
              </div>

              <SpinButton onClick={() => runSpin()} disabled={!ready || spinning || !introDone} spinning={spinning} />
            </div>
          )}
        </div>
      </div>

      {showPaytable && config && <PaytableModal config={config} onClose={() => setShowPaytable(false)} />}

      {showLoadingScreen && (
        <LoadingScreen
          title="Top Dollar"
          ready={ready}
          onDone={() => {
            setShowLoadingScreen(false);
            sound.startBackgroundMusic(BG_MUSIC_URL, BG_MUSIC_TRIM_END_SECONDS);
            playIntroScroll();
          }}
        />
      )}
    </>
  );
}

/** Diamond payouts count anywhere on the grid (not a line match like every other row) — tagged
 * distinctly so the difference reads even without the English label, per user request that this
 * card be understandable "even a non-English person." */
function isDiamondRow(key: PayoutRow["key"]): boolean {
  return key === "DIAMOND_ONE" || key === "DIAMOND_TWO" || key === "DIAMOND_THREE";
}

function PaytableModal({ config, onClose }: { config: TopDollarConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border-4 border-amber-400/50 bg-gradient-to-b from-blue-950 to-black p-6 text-white shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="text-3xl font-black uppercase tracking-wide text-amber-400 sm:text-4xl">How to Win</div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/40 text-2xl text-white/80 hover:bg-black/60"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Payline callout — the yellow bar matches the actual in-game payline color, so the
            "3 in a row wins" idea reads visually even without the caption underneath. */}
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-center">
          <div className="text-xl font-black uppercase tracking-wide text-yellow-300 sm:text-2xl">
            3 in a Row = Win
          </div>
          <div className="mx-auto mt-2 h-1.5 w-24 rounded-full bg-yellow-400" />
          <div className="mt-1.5 text-xs text-yellow-100/60 sm:text-sm">on the middle line</div>
        </div>

        <table className="mt-5 w-full">
          <tbody className="divide-y divide-white/10">
            {config.paytable.map((row) => (
              <tr key={row.key}>
                <td className="py-3 pr-2">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:text-xs ${
                      isDiamondRow(row.key) ? "bg-violet-500/25 text-violet-200" : "bg-yellow-400/20 text-yellow-200"
                    }`}
                  >
                    {isDiamondRow(row.key) ? "Anywhere" : "Line"}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {PAYOUT_ICONS[row.key].map((symbol, i) => (
                      <SymbolIcon key={i} symbol={symbol} size={56} />
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-white/50 sm:text-sm">{PAYOUT_LABELS[row.key]}</div>
                </td>
                <td className="py-3 pl-2 text-right">
                  <span className="inline-block rounded-lg bg-lime-500/20 px-3 py-1.5 text-2xl font-black text-lime-300 sm:px-4 sm:text-3xl">
                    ×{row.payout}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Bonus trigger — the DOLLAR symbol itself + a gold BONUS badge, no sentence required
            to get the point across. */}
        <div className="mt-6 flex items-center justify-center gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-4">
          <SymbolIcon symbol="DOLLAR" size={64} />
          <span className="text-4xl font-black text-amber-300">→</span>
          <span className="rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-xl font-black uppercase tracking-wide text-amber-950 sm:text-2xl">
            Bonus
          </span>
        </div>
        <div className="mt-1.5 text-center text-xs text-amber-100/50 sm:text-sm">on reel 3</div>

        {/* Bonus-round summary — colored to match the real Take-It/Try-Again buttons so the
            association is immediate regardless of language. */}
        <div className="mt-5 rounded-2xl bg-blue-900/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-black/30 text-2xl font-black text-amber-300">
              {config.offerCount}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wide text-blue-200 sm:text-base">Offers</span>
            <span className="rounded-xl border-2 border-green-950 bg-gradient-to-b from-lime-300 via-green-500 to-green-700 px-4 py-2 text-base font-black italic text-white shadow-md sm:text-lg">
              ✓ Take It
            </span>
            <span className="rounded-xl border-2 border-red-950 bg-gradient-to-b from-orange-300 via-red-500 to-red-700 px-4 py-2 text-base font-black italic text-white shadow-md sm:text-lg">
              ↻ Try Again
            </span>
          </div>
          <div className="mt-3 text-center text-xs text-blue-200/70 sm:text-sm">
            Take It banks the cash now. Try Again rolls the next offer. The last offer locks in automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeLinecap="round" strokeLinejoin="round" fill="black" />
      {muted ? (
        <path d="M17 9 22 15M22 9l-5 6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16 8a5 5 0 0 1 0 8" strokeLinecap="round" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function HomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A physical cabinet button: a chrome/ivory face ringed in gold (matching bottomScreen.png's
 * gold trim), sitting on a drop-shadow "ledge" that collapses on press for a real pushbutton
 * feel — same technique Buffalo 777's CtrlButton uses, reskinned with a gold bezel to match
 * this cabinet's own gold accents instead of a plain flat web button. */
function CtrlButton({
  onClick,
  active = false,
  disabled = false,
  ariaLabel,
  className = "",
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const ledge = active ? "#1e3a8a" : "#3a2a06";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative flex items-center justify-center rounded-xl border-[3px] bg-gradient-to-b p-[3px] transition-transform duration-100 ease-out hover:brightness-105 active:translate-y-[3px] disabled:opacity-40 disabled:active:translate-y-0 disabled:pointer-events-none ${
        active
          ? "border-amber-300 from-green-400 via-green-600 to-green-800"
          : "border-amber-400 from-white via-neutral-100 to-neutral-300"
      } ${className}`}
      style={{
        boxShadow: `0 4px 0 ${ledge}, 0 0 10px 1px rgba(251,191,36,0.5), 0 7px 10px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`,
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.boxShadow = `0 0px 0 ${ledge}, 0 0 6px 1px rgba(251,191,36,0.5), 0 1px 2px rgba(0,0,0,0.4), inset 0 3px 6px rgba(0,0,0,0.4)`;
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 0 ${ledge}, 0 0 10px 1px rgba(251,191,36,0.5), 0 7px 10px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 0 ${ledge}, 0 0 10px 1px rgba(251,191,36,0.5), 0 7px 10px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`;
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-[10%] top-[8%] h-[32%] rounded-md bg-white/55"
        style={{ filter: "blur(2px)" }}
      />
      {children}
    </button>
  );
}

/** Square 3D bet-selection button — same pressable gold-bezel mechanic as CtrlButton, sized
 * for a text label instead of an icon, with an "active" (currently selected) highlight. */
function BetButton({
  value,
  active,
  disabled,
  onClick,
}: {
  value: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <CtrlButton onClick={onClick} active={active} disabled={disabled} ariaLabel={`Bet ${value}`} className="h-14 w-28">
      <span className="text-4xl font-black text-black">${value}</span>
    </CtrlButton>
  );
}

/** The big illuminated SPIN button real cabinets center their whole panel on — a domed gold/
 * red button (not a rectangular web button) with a thick metallic bezel, a glossy highlight
 * arc, and the same pressable drop-shadow-ledge mechanic as CtrlButton, scaled up. */
function SpinButton({ onClick, disabled, spinning }: { onClick: () => void; disabled: boolean; spinning: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Spin"
      className="relative flex h-[120px] w-[240px] shrink-0 items-center justify-center rounded-2xl border-[6px] border-amber-300 bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-600 p-0 transition-transform duration-100 ease-out active:translate-y-[4px] disabled:opacity-50 disabled:active:translate-y-0"
      style={{
        boxShadow:
          "0 8px 0 #5b1a0e, 0 0 22px 4px rgba(251,191,36,0.55), 0 14px 20px rgba(0,0,0,0.6), inset 0 3px 3px rgba(255,255,255,0.7), inset 0 -8px 12px rgba(0,0,0,0.35)",
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0px 0 #5b1a0e, 0 0 12px 2px rgba(251,191,36,0.5), 0 3px 6px rgba(0,0,0,0.5), inset 0 5px 10px rgba(0,0,0,0.45)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.boxShadow =
          "0 8px 0 #5b1a0e, 0 0 22px 4px rgba(251,191,36,0.55), 0 14px 20px rgba(0,0,0,0.6), inset 0 3px 3px rgba(255,255,255,0.7), inset 0 -8px 12px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 8px 0 #5b1a0e, 0 0 22px 4px rgba(251,191,36,0.55), 0 14px 20px rgba(0,0,0,0.6), inset 0 3px 3px rgba(255,255,255,0.7), inset 0 -8px 12px rgba(0,0,0,0.35)";
      }}
    >
      <span className="absolute inset-1 rounded-2xl bg-gradient-to-b from-red-500 via-red-600 to-red-800" />
      <span
        className="pointer-events-none absolute inset-x-[8%] top-[8%] h-[32%] rounded-2xl bg-white/45"
        style={{ filter: "blur(4px)" }}
      />
      <span className="relative text-7xl font-black italic tracking-wide text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        {spinning ? "..." : "SPIN"}
      </span>
    </button>
  );
}

/** The credit meter as a proper backlit LCD screen — dark glass, gold-lit bezel, Digital-7
 * digits — instead of plain text floating on the cabinet art. Same font Mega 10X Pay/Crazy 777
 * use for their own LCD-style readouts (see TopDollarScene's buildReadouts). */
function CreditScreen({ balance }: { balance: number }) {
  return (
    <div
      className="flex flex-col items-center rounded-lg border-2 border-amber-400/80 bg-gradient-to-b from-neutral-950 to-black px-5 py-1.5"
      style={{
        boxShadow: "0 0 8px 1px rgba(251,191,36,0.45), inset 0 3px 8px rgba(0,0,0,0.9), inset 0 0 12px rgba(0,0,0,0.6)",
      }}
    >
      <span className="text-md font-bold uppercase tracking-widest text-amber-400/90">Credit</span>
      <span className="text-5xl font-bold text-lime-300" style={{ fontFamily: "Digital-7, monospace" }}>
        {balance.toFixed(2)}
      </span>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.1" fill="black" stroke="none" />
    </svg>
  );
}
