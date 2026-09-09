import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { SizzlingSevensScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/SizzlingSevensScene";
import { getSizzlingSevensConfig, spinRequest, SizzlingSevensConfigResponse, FreeGamesAward } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const BG_URL = "/symbols/sizzling7s/bg.png";
const BG_MUSIC_URL = "/Sound/alex-morgan-chinese-lunar-new-year-music-548625.mp3";
/** How long an auto-played free spin stays continuously "spinning" before it lands on its own
 * — a normal spin instead lands whenever the player clicks Stop. */
const FREE_SPIN_AUTO_STOP_MS = 1400;
const FREE_SPIN_GAP_MS = 900;

export function SizzlingSevensGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SizzlingSevensScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<SizzlingSevensConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>([0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30]);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [awaitingStop, setAwaitingStop] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(
    null
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);

  const [freeGames, setFreeGames] = useState<{
    remaining: number;
    total: number;
    pool: number[];
    lastMultiplier: number | null;
    totalWin: number;
    lockedBetIndex: number;
  } | null>(null);
  const [mysteryReveal, setMysteryReveal] = useState<{ freeSpins: number; multiplierPool: number[] } | null>(null);
  const [freeGamesSummary, setFreeGamesSummary] = useState<{ totalWin: number; totalSpins: number } | null>(null);

  const betLevel = betLevels[betIndex] ?? betLevels[0];
  const totalBet = betLevel;

  useEffect(() => {
    getSizzlingSevensConfig()
      .then((c) => {
        setConfig(c);
        setBetLevels(c.betLevels);
      })
      .catch(() => {
        /* fall back to defaults already set */
      });
  }, []);

  // Waits for config (the reel needs its symbolWeights before it can start scrolling with the
  // right distribution — see pixi/Reel.ts) before creating the Pixi app/scene.
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
        const scene = await SizzlingSevensScene.create(app, config.symbolWeights, config.paylines);
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      });

    return () => {
      cancelled = true;
      sound.stopBackgroundMusic();
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [config]);

  /** Applies a resolved spin's result to state — shared by the manual (Stop-clicked) path and
   * the free-spin auto-stop path. */
  const applyResult = useCallback(
    (
      result: {
        winAmount: number;
        tier: "BIG WIN" | "MEGA WIN" | "JACKPOT" | null;
        winningPositions: [number, number][];
        freeGamesAward: FreeGamesAward | null;
        balance: number;
      },
      isFreeSpin: boolean
    ) => {
      setWinAmount(result.winAmount);
      setBalance(result.balance);

      if (result.winningPositions.length > 0) {
        sceneRef.current?.showWinHighlights(result.winningPositions);
      }

      if (result.winAmount > 0) sound.playWinChime();
      if (result.tier) {
        sound.playCelebration(result.tier);
        setCelebration({ tier: result.tier, winAmount: result.winAmount });
      }

      if (isFreeSpin) {
        setFreeGames((prev) => {
          if (!prev) return prev;
          const totalWin = prev.totalWin + result.winAmount;
          if (result.freeGamesAward) {
            return {
              ...prev,
              remaining: prev.remaining - 1 + result.freeGamesAward.freeSpins,
              total: prev.total + result.freeGamesAward.freeSpins,
              pool: result.freeGamesAward.multiplierPool,
              totalWin,
            };
          }
          return { ...prev, remaining: prev.remaining - 1, totalWin };
        });
      } else if (result.freeGamesAward) {
        setMysteryReveal(
          result.freeGamesAward.isMystery
            ? { freeSpins: result.freeGamesAward.freeSpins, multiplierPool: result.freeGamesAward.multiplierPool }
            : null
        );
        setFreeGames({
          remaining: result.freeGamesAward.freeSpins,
          total: result.freeGamesAward.freeSpins,
          pool: result.freeGamesAward.multiplierPool,
          lastMultiplier: null,
          totalWin: 0,
          lockedBetIndex: betIndex,
        });
      }
    },
    [betIndex, setBalance]
  );

  /** Manual spin (SPIN button) — purely local: starts the reels scrolling and arms the button
   * as "Stop". No server call yet, nothing deducted — the round only becomes real once Stop
   * freezes a grid to send off for scoring. */
  const startManualSpin = useCallback(() => {
    sound.resumeAudio();
    if (!sceneRef.current || spinning) return;
    if (!user || user.balance < totalBet) {
      setError("Insufficient balance");
      return;
    }

    setError(null);
    setSpinning(true);
    setWinAmount(0);
    setFreeGamesSummary(null);
    sceneRef.current.startSpin();
    setAwaitingStop(true);
  }, [spinning, totalBet, user]);

  /** Stop button — freezes every reel exactly where it is (no substitution — see
   * Reel.freezeInPlace) and sends that grid to the server to be scored and paid out. */
  const handleStopClick = useCallback(async () => {
    if (!sceneRef.current || !awaitingStop) return;
    setAwaitingStop(false);
    const grid = await sceneRef.current.freezeSpin();
    sound.playDrumBeat();

    try {
      const result = await spinRequest(betLevel, grid, false, null);
      applyResult(
        {
          winAmount: result.winAmount,
          tier: result.tier,
          winningPositions: result.evaluation.winningPositions,
          freeGamesAward: result.freeGamesAward,
          balance: result.balance,
        },
        false
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spin failed";
      setError(message);
    } finally {
      setSpinning(false);
    }
  }, [applyResult, awaitingStop, betLevel]);

  /** One auto-played free spin — starts scrolling, freezes itself after
   * FREE_SPIN_AUTO_STOP_MS (no player Stop click during Free Games), then sends the frozen
   * grid off for scoring, same as a manual Stop. */
  const runFreeSpin = useCallback(async () => {
    if (!sceneRef.current || !freeGames) return;
    setSpinning(true);
    setWinAmount(0);
    sceneRef.current.startSpin();

    try {
      await new Promise((r) => window.setTimeout(r, FREE_SPIN_AUTO_STOP_MS));
      const grid = await sceneRef.current.freezeSpin();
      sound.playDrumBeat();

      const result = await spinRequest(betLevels[freeGames.lockedBetIndex], grid, true, freeGames.pool);
      applyResult(
        {
          winAmount: result.winAmount,
          tier: result.tier,
          winningPositions: result.evaluation.winningPositions,
          freeGamesAward: result.freeGamesAward,
          balance: result.balance,
        },
        true
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Free spin failed");
      setFreeGames(null);
    } finally {
      setSpinning(false);
    }
  }, [applyResult, betLevels, freeGames]);

  // Auto-continue the Free Games round until it runs out, same "auto-continue while a bonus
  // round is active" pattern Crazy777 uses for respins.
  useEffect(() => {
    if (!freeGames || spinning || !ready || celebration) return;
    if (freeGames.remaining <= 0) {
      setFreeGamesSummary({ totalWin: freeGames.totalWin, totalSpins: freeGames.total });
      setFreeGames(null);
      return;
    }
    const id = window.setTimeout(() => runFreeSpin(), FREE_SPIN_GAP_MS);
    return () => window.clearTimeout(id);
  }, [freeGames, spinning, ready, celebration, runFreeSpin]);

  const changeBet = (direction: 1 | -1) => {
    if (freeGames) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;
  const inFreeGames = freeGames !== null;
  const spinButtonLabel = awaitingStop ? "STOP" : spinning ? "..." : "SPIN";
  const spinButtonDisabled = !ready || inFreeGames || (spinning && !awaitingStop);

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

          <div className="absolute top-0 z-10 w-full flex items-center justify-between px-3 py-2">
            <Link
              to="/"
              className="flex bg-white h-10 w-10 items-center justify-center rounded-full border-2 border-black text-black font-bold hover:bg-white"
              aria-label="Home"
            >
              <HomeIcon size={26} />
            </Link>
            {inFreeGames && (
              <div className="flex items-center gap-4 rounded-full bg-black/80 border-2 border-amber-400 px-6 py-2 text-amber-300 font-black text-2xl tracking-wide">
                <span>FREE GAMES</span>
                <span className="text-white">{freeGames!.remaining} left (of {freeGames!.total})</span>
                {freeGames!.lastMultiplier !== null && <span className="text-lime-300">x{freeGames!.lastMultiplier}</span>}
                <span>Win: {freeGames!.totalWin.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="relative mt-1 overflow-hidden rounded-lg">
            <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-amber-300/70">Loading reels...</div>
            )}
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-4xl text-center text-red-100">
              {error}
            </div>
          )}

          {freeGamesSummary && (
            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-amber-400 bg-black/90 px-12 py-8 text-center">
              <div className="text-3xl font-black text-amber-300 uppercase tracking-wide">Free Games Complete</div>
              <div className="mt-2 text-xl text-white/80">{freeGamesSummary.totalSpins} spins played</div>
              <div className="mt-4 text-5xl font-black text-lime-300">{freeGamesSummary.totalWin.toFixed(2)}</div>
              <button
                className="mt-6 rounded-full bg-amber-500 px-8 py-2 font-bold text-black"
                onClick={() => setFreeGamesSummary(null)}
              >
                Continue
              </button>
            </div>
          )}

          <div className="absolute bottom-0 z-10 flex w-full items-center justify-between gap-3 border-t border-white/10 bg-gradient-to-b from-neutral-800 via-neutral-900 to-black px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <CtrlButton onClick={() => setShowPaytable((v) => !v)} ariaLabel="Paytable" className="h-10 w-10">
                  <InfoIcon />
                </CtrlButton>
                <CtrlButton
                  onClick={() => {
                    sound.resumeAudio();
                    setMuted(sound.toggleMuted());
                  }}
                  active={muted}
                  ariaLabel={muted ? "Unmute" : "Mute"}
                  className="h-10 w-10"
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
              <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0 || inFreeGames} ariaLabel="Decrease bet" className="h-10 w-10">
                <TriangleIcon direction="left" />
              </CtrlButton>
              <div className="flex flex-col items-center leading-tight">
                <span className="text-md font-bold uppercase tracking-wide text-amber-400">Bet</span>
                <span className="text-3xl font-bold text-white">{totalBet.toFixed(2)}</span>
              </div>
              <CtrlButton
                onClick={() => changeBet(1)}
                disabled={betIndex === betLevels.length - 1 || inFreeGames}
                ariaLabel="Increase bet"
                className="h-10 w-10"
              >
                <TriangleIcon direction="right" />
              </CtrlButton>
            </div>

            <div className="flex min-w-[220px] flex-1 max-w-sm items-center justify-center gap-2 rounded-lg border border-black bg-black/70 py-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
              <span className="text-md font-bold uppercase tracking-wide text-white">Win</span>
              <span className="text-3xl font-black text-amber-300">{winAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={awaitingStop ? handleStopClick : startManualSpin}
                disabled={spinButtonDisabled}
                className="relative flex h-[70px] w-[200px] items-center justify-center rounded-3xl border-2 border-orange-950 bg-gradient-to-b from-yellow-300 via-amber-500 to-orange-600 text-4xl font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
                style={{
                  boxShadow: "0 5px 0 #7c2d12, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="pointer-events-none absolute inset-x-[12%] top-[10%] h-[30%] rounded-full bg-white/40" style={{ filter: "blur(3px)" }} />
                {spinButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </div>

      {mysteryReveal && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80">
          <div className="rounded-2xl border-4 border-fuchsia-400 bg-gradient-to-b from-fuchsia-950 to-black px-14 py-10 text-center">
            <div className="text-3xl font-black text-fuchsia-300 uppercase tracking-widest">Mystery Pick!</div>
            <div className="mt-4 text-6xl font-black text-white">{mysteryReveal.freeSpins} Free Games</div>
            <div className="mt-3 text-xl text-white/80">
              Multipliers: {mysteryReveal.multiplierPool.map((m) => `x${m}`).join(" / ")}
            </div>
            <button
              className="mt-6 rounded-full bg-fuchsia-500 px-8 py-2 font-bold text-black"
              onClick={() => setMysteryReveal(null)}
            >
              Start
            </button>
          </div>
        </div>
      )}

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
          title="Sizzling 7s"
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
  RED_7: "/symbols/sizzling7s/red-7.png",
  BLUE_7: "/symbols/sizzling7s/blue-7.png",
  BAR: "/symbols/sizzling7s/bar.png",
  DOUBLE_BAR: "/symbols/sizzling7s/bar2.png",
  TRIPLE_BAR: "/symbols/sizzling7s/bar3.png",
  WILD_2X: "/symbols/sizzling7s/2xWild.png",
  BONUS: "/symbols/sizzling7s/bonus.png",
};

function PaytableModal({ config, onClose }: { config: SizzlingSevensConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-amber-950 to-black p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-amber-400">How to win</div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="text-sm text-white/90">
          {config.paylineCount} fixed paylines on every spin. 3+ matching symbols left-to-right on a line pays
          out (shown below as a multiple of your total bet); the 2X WILD substitutes for every symbol except
          BONUS and multiplies a substituted win by 2 per Wild used (x2/x4/x8). BONUS lands anywhere and doesn't
          need a payline — 3+ anywhere pays a scatter win and triggers Free Games.
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
                  {row.symbol.replace("_", " ")}
                </td>
                <td className="py-1 text-right font-semibold text-lime-300">x{toBetMultiple(row.payout, config.lineCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 text-sm">
          <div className="font-bold text-amber-400">2X WILD (pure Wild)</div>
          <div className="text-white/80">
            1 Wild = x{toBetMultiple(config.wild.purePayout[1], config.lineCost)}, 2 Wilds = x
            {toBetMultiple(config.wild.purePayout[2], config.lineCost)}, 3 Wilds = x
            {toBetMultiple(config.wild.purePayout[3], config.lineCost)} (not multiplied further)
          </div>
        </div>

        <div className="mt-4 text-sm">
          <div className="font-bold text-amber-400">Free Games</div>
          <ul className="text-white/80 list-disc list-inside">
            {config.freeGames.awards.map((a) => (
              <li key={a.freeSpins}>
                {a.freeSpins} Free Games — multiplier: {a.multiplierPool.map((m) => `x${m}`).join(" / ")}
              </li>
            ))}
            <li>
              Mystery Pick — {config.freeGames.mystery.spinCounts.join("/")} Free Games, multiplier:{" "}
              {config.freeGames.mystery.multiplierPool.map((m) => `x${m}`).join(" / ")}
            </li>
          </ul>
          <div className="mt-1 text-white/60">
            A fresh multiplier is drawn every free spin. 3+ Bonus during Free Games retriggers and adds more spins.
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
    <svg width="16" height="16" viewBox="0 0 24 24">
      <polygon points={points} fill="black" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.1" fill="black" stroke="none" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
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
