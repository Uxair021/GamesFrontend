import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { VegasHitsScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/VegasHitsScene";
import { getVegasHitsConfig, spinRequest, VegasHitsConfigResponse } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const BG_URL = "/symbols/vegasHit/bg.gif";
const BG_MUSIC_URL = "/Sound/kulakovka-casino-291450.mp3";
const REEL_SPIN_SOUND_URL = "/Sound/mixkit-arcade-slot-machine-wheel-1933.wav";
const WIN_HIGHLIGHT_MIN_DISPLAY_MS = 2000;
const AUTOPLAY_GAP_MS = 700;
const FREE_SPIN_GAP_MS = 700;
/** "trigger 7 Free Games ... up to a maximum of 700 Free Games" — enforced client-side since
 * the server is stateless per spin and doesn't track how many free spins a chain has already
 * awarded (mirrors the backend's own MAX_TOTAL_FREE_SPINS — see games/VegasHits/config.ts). */
const MAX_TOTAL_FREE_SPINS = 700;

export function VegasHitsGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VegasHitsScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<VegasHitsConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>([0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30]);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(
    null
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const winHighlightActiveRef = useRef(false);
  const winHighlightStartRef = useRef(0);

  const [freeGames, setFreeGames] = useState<{
    remaining: number;
    total: number;
    lastChiliMultiplier: number | null;
    totalWin: number;
    lockedBetIndex: number;
  } | null>(null);
  const [freeGamesSummary, setFreeGamesSummary] = useState<{ totalWin: number; totalSpins: number } | null>(null);

  const betLevel = betLevels[betIndex] ?? betLevels[0];
  const totalBet = betLevel;
  const inFreeGames = freeGames !== null;

  useEffect(() => {
    getVegasHitsConfig()
      .then((c) => {
        setConfig(c);
        setBetLevels(c.betLevels);
      })
      .catch(() => {
        /* fall back to defaults already set */
      });
  }, []);

  // Waits for config (the reel needs its symbolWeights before it can build its cosmetic filler
  // — see pixi/Reel.ts) before creating the Pixi app/scene.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const app = new Application();

    app
      .init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        backgroundAlpha: 0,
      })
      .then(async () => {
        if (cancelled || !canvasHostRef.current) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        canvasHostRef.current.appendChild(app.canvas);
        const scene = await VegasHitsScene.create(app, config.symbolWeights);
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      });

    return () => {
      cancelled = true;
      sound.stopReelSpinLoop();
      sound.stopBackgroundMusic();
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [config]);

  /** Classic auto-stop spin: the server decides the whole grid + result in one call, the reels
   * play a fixed-duration landing animation on it (see pixi/VegasHitsScene.spin), same shape as
   * 7 Crystal Clover's runSpin. `isFreeSpin` plays one spin of an already-active Free Games
   * round (no balance staked, at the round's locked bet) instead of a normal paid spin. */
  const runSpin = useCallback(
    async (isFreeSpin: boolean) => {
      sound.resumeAudio();
      if (!sceneRef.current || spinning) return;
      if (!isFreeSpin && (!user || user.balance < totalBet)) {
        setError("Insufficient balance");
        setAutoplay(false);
        return;
      }

      setError(null);
      setSpinning(true);
      setWinAmount(0);
      setFreeGamesSummary(null);

      // A previous spin's win highlight must stay visible for at least
      // WIN_HIGHLIGHT_MIN_DISPLAY_MS before this new spin clears it, even if the player hits
      // SPIN again immediately.
      if (winHighlightActiveRef.current) {
        const remaining = WIN_HIGHLIGHT_MIN_DISPLAY_MS - (Date.now() - winHighlightStartRef.current);
        if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining));
        winHighlightActiveRef.current = false;
      }
      if (!sceneRef.current) return;

      try {
        const spinBetLevel = isFreeSpin ? betLevels[freeGames?.lockedBetIndex ?? betIndex] : betLevel;
        const result = await spinRequest(spinBetLevel, isFreeSpin);
        sound.startReelSpinLoop(REEL_SPIN_SOUND_URL);
        await sceneRef.current.spin(result.grid, () => sound.playReelStop(), turbo);
        sound.stopReelSpinLoop();

        setWinAmount(result.winAmount);
        setBalance(result.balance);

        if (result.evaluation.winningPositions.length > 0) {
          sceneRef.current.showWinHighlights(result.evaluation.winningPositions);
          winHighlightActiveRef.current = true;
          winHighlightStartRef.current = Date.now();
        }

        if (result.tier) {
          sound.playCelebration(result.tier);
          setCelebration({ tier: result.tier, winAmount: result.winAmount });
        } else if (result.winAmount > 0) {
          sound.playWinChime();
        }

        if (isFreeSpin) {
          setFreeGames((prev) => {
            if (!prev) return prev;
            const totalWin = prev.totalWin + result.winAmount;
            if (result.freeGamesAward) {
              const grantable = Math.max(0, Math.min(result.freeGamesAward.freeSpins, MAX_TOTAL_FREE_SPINS - prev.total));
              return {
                ...prev,
                remaining: prev.remaining - 1 + grantable,
                total: prev.total + grantable,
                lastChiliMultiplier: result.evaluation.chiliMultiplier,
                totalWin,
              };
            }
            return { ...prev, remaining: prev.remaining - 1, lastChiliMultiplier: result.evaluation.chiliMultiplier, totalWin };
          });
        } else if (result.freeGamesAward) {
          setFreeGames({
            remaining: result.freeGamesAward.freeSpins,
            total: result.freeGamesAward.freeSpins,
            lastChiliMultiplier: null,
            totalWin: 0,
            lockedBetIndex: betIndex,
          });
        }
      } catch (err) {
        sound.stopReelSpinLoop();
        const message = err instanceof Error ? err.message : "Spin failed";
        setError(message);
        setAutoplay(false);
        if (isFreeSpin) setFreeGames(null);
      } finally {
        setSpinning(false);
      }
    },
    [betIndex, betLevel, betLevels, freeGames, spinning, totalBet, turbo, user, setBalance]
  );

  // Autoplay — repeats a normal paid spin on a short delay, same pattern as 7 Crystal Clover.
  // Never fires while a Free Games round is active (that round drives its own spins below).
  useEffect(() => {
    if (!autoplay || spinning || !ready || inFreeGames) return;
    const id = window.setTimeout(() => runSpin(false), AUTOPLAY_GAP_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, inFreeGames, runSpin]);

  // Auto-continues the Free Games round until it runs out.
  useEffect(() => {
    if (!freeGames || spinning || !ready || celebration) return;
    if (freeGames.remaining <= 0) {
      setFreeGamesSummary({ totalWin: freeGames.totalWin, totalSpins: freeGames.total });
      setFreeGames(null);
      return;
    }
    const id = window.setTimeout(() => runSpin(true), FREE_SPIN_GAP_MS);
    return () => window.clearTimeout(id);
  }, [freeGames, spinning, ready, celebration, runSpin]);

  const changeBet = (direction: 1 | -1) => {
    if (inFreeGames) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

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
          <img src={BG_URL} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />

          <div className="absolute top-0 z-10 w-full flex items-center justify-between px-14 py-8">
            <Link
              to="/"
              className="flex bg-white h-[88px] w-[100px] items-center justify-center rounded-xl border-4 border-black text-black font-bold hover:bg-white"
              aria-label="Home"
            >
              <HomeIcon size={46} />
            </Link>
            {inFreeGames && (
              <div className="flex items-center gap-4 rounded-full bg-black/80 border-2 border-red-500 px-6 py-2 text-red-300 font-black text-2xl tracking-wide">
                <span>FREE GAMES</span>
                <span className="text-white">{freeGames!.remaining} left (of {freeGames!.total})</span>
                {freeGames!.lastChiliMultiplier !== null && <span className="text-orange-400">🌶 x{freeGames!.lastChiliMultiplier}</span>}
                <span>Win: {freeGames!.totalWin.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="relative mt-1 overflow-hidden rounded-lg">
            <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-red-300/70">Loading reels...</div>
            )}
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-4xl text-center text-red-100">
              {error}
            </div>
          )}

          {freeGamesSummary && (
            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-red-500 bg-black/90 px-12 py-8 text-center">
              <div className="text-3xl font-black text-red-400 uppercase tracking-wide">Free Games Complete</div>
              <div className="mt-2 text-xl text-white/80">{freeGamesSummary.totalSpins} spins played</div>
              <div className="mt-4 text-5xl font-black text-lime-300">{freeGamesSummary.totalWin.toFixed(2)}</div>
              <button
                className="mt-6 rounded-full bg-red-600 px-8 py-2 font-bold text-white"
                onClick={() => setFreeGamesSummary(null)}
              >
                Continue
              </button>
            </div>
          )}

          <div className="absolute bottom-0 z-10 flex w-full items-center justify-between gap-3 border-t border-white/10 bg-gradient-to-b from-neutral-800 via-neutral-900 to-black px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-3">
                <CtrlButton onClick={() => setShowPaytable((v) => !v)} ariaLabel="Paytable" className="h-[60px] w-[60px]">
                  <InfoIcon />
                </CtrlButton>
                <CtrlButton
                  onClick={() => {
                    sound.resumeAudio();
                    setMuted(sound.toggleMuted());
                  }}
                  active={muted}
                  ariaLabel={muted ? "Unmute" : "Mute"}
                  className="h-[60px] w-[60px]"
                >
                  <SoundIcon muted={muted} />
                </CtrlButton>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-md font-bold uppercase tracking-wide text-white/80">Credit</span>
                <span className="text-3xl font-bold text-white">{(user?.balance ?? 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0 || inFreeGames} ariaLabel="Decrease bet" className="h-[60px] w-[65px]">
                <TriangleIcon direction="left" />
              </CtrlButton>
              <div className="flex flex-col items-center leading-tight">
                <span className="text-md font-bold uppercase tracking-wide text-red-400">Bet</span>
                <span className="text-3xl font-bold text-white">{totalBet.toFixed(2)}</span>
              </div>
              <CtrlButton
                onClick={() => changeBet(1)}
                disabled={betIndex === betLevels.length - 1 || inFreeGames}
                ariaLabel="Increase bet"
                className="h-[60px] w-[65px]"
              >
                <TriangleIcon direction="right" />
              </CtrlButton>
            </div>

            <div className="flex min-w-[220px] flex-1 max-w-sm items-center justify-center gap-2 rounded-lg border border-black bg-black/70 py-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
              <span className="text-lg font-bold uppercase tracking-wide text-white">Win</span>
              <span className="text-5xl font-black text-red-400">{winAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-3">
              <CtrlButton onClick={() => setTurbo((v) => !v)} active={turbo} ariaLabel="Turbo spin" className="h-[80px] w-[85px]">
                <TurboIcon size={46} />
              </CtrlButton>

              <button
                onClick={() => {
                  sound.resumeAudio();
                  setAutoplay((v) => !v);
                }}
                disabled={inFreeGames}
                aria-label="Autoplay"
                className={`relative flex h-[120px] w-[140px] items-center justify-center rounded-2xl text-xl border font-black tracking-wide transition-all duration-150 ease-out active:translate-y-[2px] disabled:opacity-40 disabled:active:translate-y-0 ${
                  autoplay
                    ? "border-red-400 bg-red-500/25 text-red-200 shadow-[0_0_16px_rgba(239,68,68,0.55)]"
                    : "border-white/20 bg-white/[0.06] text-white/80 hover:border-red-300/50 hover:bg-white/[0.1]"
                }`}
              >
                AUTO
              </button>

              <button
                onClick={() => runSpin(false)}
                disabled={!ready || spinning || inFreeGames}
                className="relative flex h-[145px] w-[200px] items-center justify-center rounded-3xl border-2 border-red-950 bg-gradient-to-b from-orange-400 via-red-500 to-red-700 text-6xl font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
                style={{
                  boxShadow: "0 5px 0 #7f1d1d, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="pointer-events-none absolute inset-x-[0] top-0 h-[50%] rounded-full bg-white/40" style={{ filter: "blur(3px)" }} />
                {spinning ? "..." : "SPIN"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPaytable && config && <PaytableModal config={config} onClose={() => setShowPaytable(false)} />}

      {celebration && (
        <WinCelebration
          tier={celebration.tier}
          winAmount={celebration.winAmount}
          onDismiss={() => setCelebration(null)}
        />
      )}

      {showLoadingScreen && (
        <LoadingScreen
          title="Vegas Hits"
          ready={ready}
          onDone={() => {
            setShowLoadingScreen(false);
            sound.startBackgroundMusic(BG_MUSIC_URL);
          }}
        />
      )}
    </>
  );
}

/** Server-side payout figures are calibrated relative to LINE_COST (the fixed internal
 * reference the whole paytable was tuned against — see backend config.ts), not the player's
 * actual selected bet directly: finalWin = payout x (totalBet / lineCost). This converts a raw
 * payout into "how many times your actual total bet this pays" for display. */
function toBetMultiple(payout: number, lineCost: number): string {
  return (payout / lineCost).toFixed(4);
}

const SYMBOL_IMAGES: Record<string, string> = {
  GREEN_7: "/symbols/vegasHit/Green7.png",
  DOUBLE_GREEN_7: "/symbols/vegasHit/DoubleGreen7.png",
  TRIPLE_GREEN_7: "/symbols/vegasHit/TripleGreen7.png",
  RED_7: "/symbols/vegasHit/Red7.png",
  BLUE_7: "/symbols/vegasHit/Blue7.png",
  WILD: "/symbols/vegasHit/redHot.png",
  BONUS: "/symbols/vegasHit/Bonus.png",
};

function PaytableModal({ config, onClose }: { config: VegasHitsConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-red-500/40 bg-gradient-to-b from-red-950 to-black p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-red-400">How to win</div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="text-sm text-white/90">
          {config.paylineCount} fixed paylines on every spin (Middle / Top / Bottom rows plus both diagonals). 3
          matching symbols on a line pays out (shown below as a multiple of your total bet). BONUS lands anywhere
          and doesn't need a payline — 3+ anywhere pays 1X total bet and triggers Free Games.
        </p>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="text-left font-normal">Symbol (3 matching)</th>
              <th className="text-right font-normal">Pays</th>
            </tr>
          </thead>
          <tbody>
            {config.paytable.map((row) => (
              <tr key={row.symbol}>
                <td className="py-1 flex items-center gap-2">
                  <img src={SYMBOL_IMAGES[row.symbol]} alt="" className="h-6 w-6 object-contain" />
                  {row.symbol.replace(/_/g, " ")}
                </td>
                <td className="py-1 text-right font-semibold text-lime-300">x{toBetMultiple(row.payout, config.lineCost)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1 flex items-center gap-2">Any 7 (mixed, no Wild)</td>
              <td className="py-1 text-right font-semibold text-lime-300">x{toBetMultiple(config.wild.rules.anyMixBet, config.lineCost)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 text-sm">
          <div className="font-bold text-red-400 flex items-center gap-2">
            <img src={SYMBOL_IMAGES.WILD} alt="" className="h-6 w-6 object-contain" />
            RED HOT 3X Wild
          </div>
          <div className="text-white/80">
            Substitutes for every symbol except BONUS. 1 Wild completing a line = that symbol's win x
            {config.wild.rules.oneCompleteMultiplier}, 2 Wilds completing a line = x{config.wild.rules.twoCompleteMultiplier}.
          </div>
          <div className="mt-1 text-white/80">
            A Wild that doesn't (or can't) complete a match still pays on its own: 1 Wild = x
            {toBetMultiple(config.wild.rules.onePureBet, config.lineCost)}, 2 Wilds = x
            {toBetMultiple(config.wild.rules.twoPureBet, config.lineCost)}, 3 Wilds = x
            {toBetMultiple(config.wild.rules.threePureBet, config.lineCost)}.
          </div>
        </div>

        <div className="mt-4 text-sm">
          <div className="font-bold text-red-400">Free Games</div>
          <div className="text-white/80">
            3+ BONUS triggers {config.freeGames.spinsPerTrigger} Free Games. Each Free Game draws a fresh Chili
            Multiplier ({config.freeGames.chiliMultiplierPool.map((m) => `x${m}`).join(" / ")}) that scales every
            win except one that involved a RED HOT 3X wild. 3+ BONUS during Free Games retriggers
            {" "}
            {config.freeGames.spinsPerTrigger} more, up to {config.freeGames.maxTotalFreeSpins} total.
          </div>
        </div>
      </div>
    </div>
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
  const ledge = active ? "#92400e" : "#0a0a0a";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative flex items-center justify-center rounded-full border-2 bg-gradient-to-b transition-transform duration-100 ease-out hover:brightness-105 active:translate-y-[3px] disabled:opacity-40 disabled:active:translate-y-0 disabled:pointer-events-none ${
        active
          ? "border-amber-800 from-amber-200 via-amber-400 to-amber-600"
          : "border-black/70 from-white via-neutral-100 to-neutral-300"
      } ${className}`}
      style={{
        boxShadow: `0 4px 0 ${ledge}, 0 7px 10px rgba(255, 255, 255, 0.9), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`,
      }}
    >
      <span className="pointer-events-none absolute inset-x-[16%] top-[9%] h-[36%] rounded-full bg-white/55" style={{ filter: "blur(2px)" }} />
      {children}
    </button>
  );
}

function TriangleIcon({ direction }: { direction: "left" | "right" }) {
  const points = direction === "left" ? "15,4 6,12 15,20" : "9,4 18,12 9,20";
  return (
    <svg width="36" height="36" viewBox="0 0 24 24">
      <polygon points={points} fill="black" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.1" fill="black" stroke="none" />
    </svg>
  );
}

function TurboIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="black" stroke="none">
      <polygon points="13,2 3,14 11,14 9,22 21,9 13,9" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
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
