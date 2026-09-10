import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { RubberDuckScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/RubberDuckScene";
import { getRubberDuckConfig, spinRequest, RubberDuckConfigResponse, PayingSymbol } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { FreeSpinCelebration } from "../ShamrockSpin/FreeSpinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
const WIN_GLOW_MIN_DISPLAY_MS = 3500;
const FREE_SPIN_GAP_MS = 900;
const AUTOPLAY_GAP_MS = 700;
const RETRIGGER_TOAST_MS = 2600;

export function RubberDuckGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RubberDuckScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<RubberDuckConfigResponse | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(
    null
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const winEffectActiveRef = useRef(false);
  const winEffectStartRef = useRef(0);

  const [freeSpins, setFreeSpins] = useState<{
    remaining: number;
    total: number;
    totalWin: number;
    lockedBetIndex: number;
  } | null>(null);
  const [freeSpinAward, setFreeSpinAward] = useState<number | null>(null);
  const [freeSpinsSummary, setFreeSpinsSummary] = useState<{ totalWin: number; totalSpins: number } | null>(null);
  const [retriggerToast, setRetriggerToast] = useState(false);

  const betAmount = betLevels[betIndex] ?? betLevels[0];
  const inFreeSpins = freeSpins !== null;

  useEffect(() => {
    getRubberDuckConfig()
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
        const scene = await RubberDuckScene.create(app);
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
  }, []);

  const runSpin = useCallback(
    async (isFreeSpin: boolean) => {
      if (!sceneRef.current) return;
      setSpinning(true);
      setWinAmount(0);

      if (winEffectActiveRef.current) {
        const remaining = WIN_GLOW_MIN_DISPLAY_MS - (Date.now() - winEffectStartRef.current);
        if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining));
        sceneRef.current?.setWinPositions([]);
        winEffectActiveRef.current = false;
      }
      if (!sceneRef.current) return;

      const stakeBet = isFreeSpin ? betLevels[freeSpins?.lockedBetIndex ?? betIndex] : betAmount;

      try {
        sceneRef.current.setWinPositions([]);
        sound.startReelSpinLoop();
        const result = await spinRequest(stakeBet, isFreeSpin);
        await sceneRef.current.spin(result.reels, () => sound.playReelStop());
        sound.stopReelSpinLoop();

        setWinAmount(result.winAmount);
        setBalance(result.balance);

        if (result.evaluation.positionWins.length > 0) {
          sceneRef.current.setWinPositions(result.evaluation.positionWins);
          winEffectActiveRef.current = true;
          winEffectStartRef.current = Date.now();
        }

        if (result.tier) {
          sound.playCelebration(result.tier);
          setCelebration({ tier: result.tier, winAmount: result.winAmount });
        } else if (result.winAmount > 0) {
          sound.playWinChime();
        }

        if (isFreeSpin) {
          setFreeSpins((prev) => (prev ? { ...prev, remaining: prev.remaining - 1, totalWin: prev.totalWin + result.winAmount } : prev));
          if (result.retriggered) {
            sound.playFreeSpinsJingle();
            setFreeSpins((prev) => (prev ? { ...prev, remaining: prev.remaining + 10, total: prev.total + 10 } : prev));
            setRetriggerToast(true);
            window.setTimeout(() => setRetriggerToast(false), RETRIGGER_TOAST_MS);
          }
          if (result.freeSpinRoundResult) {
            setFreeSpinsSummary(result.freeSpinRoundResult);
            setFreeSpins(null);
          }
        } else if (result.freeSpinsAwarded) {
          sound.playFreeSpinsJingle();
          setFreeSpinAward(result.freeSpinsAwarded);
          setFreeSpins({
            remaining: result.freeSpinsAwarded,
            total: result.freeSpinsAwarded,
            totalWin: 0,
            lockedBetIndex: betIndex,
          });
        }
      } catch (err) {
        sound.stopReelSpinLoop();
        const message = err instanceof Error ? err.message : "Spin failed";
        setError(message);
        if (isFreeSpin) setFreeSpins(null);
        else setAutoplay(false);
      } finally {
        setSpinning(false);
      }
    },
    [betAmount, betIndex, betLevels, freeSpins, setBalance]
  );

  const startManualSpin = useCallback(() => {
    sound.resumeAudio();
    if (!sceneRef.current || spinning || freeSpins) return;
    if (!user || user.balance < betAmount) {
      setError("Insufficient balance");
      setAutoplay(false);
      return;
    }
    setError(null);
    setFreeSpinsSummary(null);
    runSpin(false);
  }, [betAmount, freeSpins, runSpin, spinning, user]);

  useEffect(() => {
    if (!autoplay || spinning || !ready || freeSpins || celebration) return;
    const id = window.setTimeout(() => {
      if (!user || user.balance < betAmount) {
        setError("Insufficient balance");
        setAutoplay(false);
        return;
      }
      setError(null);
      runSpin(false);
    }, AUTOPLAY_GAP_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, freeSpins, celebration, user, betAmount, runSpin]);

  useEffect(() => {
    if (!freeSpins || spinning || !ready || celebration || freeSpinAward !== null) return;
    if (freeSpins.remaining <= 0) return; // waiting on runSpin's own freeSpinRoundResult handling
    const id = window.setTimeout(() => runSpin(true), FREE_SPIN_GAP_MS);
    return () => window.clearTimeout(id);
  }, [freeSpins, spinning, ready, celebration, freeSpinAward, runSpin]);

  const changeBet = (direction: 1 | -1) => {
    if (freeSpins || autoplay) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;
  const spinDisabled = !ready || spinning || inFreeSpins;

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
          <div className="absolute top-0 z-10 flex w-full items-center justify-between px-3 py-2">
            <Link
              to="/"
              className="flex bg-white/70 h-20 w-20 items-center justify-center rounded-full border-4 border-black text-black font-bold hover:bg-white"
              aria-label="Home"
            >
              <HomeIcon size={46} />
            </Link>
            {inFreeSpins && (
              <div className="flex items-center gap-4 rounded-full bg-black/80 border-2 border-sky-400 px-6 py-2 text-sky-300 font-black text-2xl tracking-wide">
                <span>FREE SPINS</span>
                <span className="text-white">
                  {freeSpins!.remaining} left (of {freeSpins!.total})
                </span>
                <span className="text-lime-300">Win: {freeSpins!.totalWin.toFixed(2)}</span>
                {retriggerToast && <span className="text-amber-300 animate-pulse">+10 MORE!</span>}
              </div>
            )}
          </div>

          <div className="relative overflow-hidden">
            <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-sky-950 text-sky-300/70">
                Loading reels...
              </div>
            )}
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 mx-3 rounded bg-red-900/60 px-10 py-5 text-4xl text-center text-red-100">
              {error}
            </div>
          )}

          {freeSpinsSummary && (
            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-sky-400 bg-black/90 px-12 py-8 text-center">
              <div className="text-3xl font-black text-sky-300 uppercase tracking-wide">Free Spins Complete</div>
              <div className="mt-2 text-xl text-white/80">{freeSpinsSummary.totalSpins} spins played</div>
              <div className="mt-4 text-5xl font-black text-lime-300">{freeSpinsSummary.totalWin.toFixed(2)}</div>
              <button
                className="mt-6 rounded-full bg-sky-500 px-8 py-2 font-bold text-black"
                onClick={() => setFreeSpinsSummary(null)}
              >
                Continue
              </button>
            </div>
          )}

          <div className="absolute bottom-0 z-10 flex w-full items-center justify-between gap-3 border-t border-white/10 bg-gradient-to-b from-neutral-800 via-neutral-900 to-black px-4 py-2.5">
            <div className="flex items-center gap-3">
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
              <div className="flex flex-col leading-tight">
                <span className="text-md font-bold uppercase tracking-wide text-white/80">Credit</span>
                <span className="text-3xl font-bold text-white">{(user?.balance ?? 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0 || inFreeSpins || autoplay} ariaLabel="Decrease bet" className="h-[60px] w-[60px]">
                <TriangleIcon direction="left" />
              </CtrlButton>
              <div className="flex flex-col items-center leading-tight">
                <span className="text-md font-bold uppercase tracking-wide text-sky-400">Bet</span>
                <span className="text-3xl font-bold text-white">{betAmount.toFixed(2)}</span>
              </div>
              <CtrlButton
                onClick={() => changeBet(1)}
                disabled={betIndex === betLevels.length - 1 || inFreeSpins || autoplay}
                ariaLabel="Increase bet"
                className="h-[60px] w-[60px]"
              >
                <TriangleIcon direction="right" />
              </CtrlButton>
            </div>

            <div className="flex min-w-[220px] flex-1 max-w-sm items-center justify-center gap-2 rounded-lg border border-black bg-black/70 py-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
              <span className="text-xl font-bold uppercase tracking-wide text-white">Win</span>
              <span className="text-5xl font-black text-sky-300">{winAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => {
                  sound.resumeAudio();
                  setAutoplay((v) => !v);
                }}
                disabled={inFreeSpins}
                aria-label="Autoplay"
                className={`relative flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 text-2xl font-black tracking-wide transition-all duration-150 ease-out active:translate-y-[2px] disabled:opacity-40 disabled:active:translate-y-0 ${
                  autoplay
                    ? "border-sky-300 bg-sky-500/30 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.55)]"
                    : "border-white/15 bg-white/[0.06] text-white/80 hover:border-sky-300/40 hover:bg-white/[0.1]"
                }`}
              >
                AUTO
              </button>

              <button
                onClick={startManualSpin}
                disabled={spinDisabled}
                className="relative flex h-[145px] w-[220px] items-center justify-center rounded-3xl border-2 border-blue-950 bg-gradient-to-b from-sky-300 via-blue-500 to-blue-700 text-6xl font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
                style={{
                  boxShadow: "0 5px 0 #172554, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="pointer-events-none absolute inset-x-[12%] top-[10%] h-[30%] rounded-full bg-white/40" style={{ filter: "blur(3px)" }} />
                {spinning ? "..." : "SPIN"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {celebration && (
        <WinCelebration tier={celebration.tier} winAmount={celebration.winAmount} onDismiss={() => setCelebration(null)} />
      )}

      {freeSpinAward !== null && <FreeSpinCelebration count={freeSpinAward} onDismiss={() => setFreeSpinAward(null)} />}

      {showPaytable && config && (
        <PaytableModal config={config} betAmount={betAmount} onClose={() => setShowPaytable(false)} />
      )}

      {showLoadingScreen && (
        <LoadingScreen
          title="Rubber Duck"
          ready={ready}
          onDone={() => {
            setShowLoadingScreen(false);
            sound.startBackgroundMusic("/Sound/mfcc-gambling-lottery-casino-gambling-music-120447.mp3");
          }}
        />
      )}
    </>
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

function InfoIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.1" fill="black" stroke="none" />
    </svg>
  );
}

const SYMBOL_IMAGES: Record<PayingSymbol, string> = {
  TRIPLE_7: "/symbols/rubberDuck/tripple7.png",
  DOUBLE_7: "/symbols/rubberDuck/double7.png",
  SEVEN: "/symbols/rubberDuck/7.png",
  BOAT: "/symbols/rubberDuck/boat.png",
  GUN: "/symbols/rubberDuck/gun.png",
  TOOL: "/symbols/rubberDuck/tool.png",
  SHAMPOO: "/symbols/rubberDuck/shampoo.png",
  TOWEL: "/symbols/rubberDuck/towel.png",
  BRUSH: "/symbols/rubberDuck/brush.png",
  SAFEGUARD: "/symbols/rubberDuck/saveGaurd.png",
  CAP: "/symbols/rubberDuck/cap.png",
  POT: "/symbols/rubberDuck/pot.png",
  SOAP: "/symbols/rubberDuck/soap.png",
  SPONGE: "/symbols/rubberDuck/sponch.png",
};

function PaytableModal({
  config,
  betAmount,
  onClose,
}: {
  config: RubberDuckConfigResponse;
  betAmount: number;
  onClose: () => void;
}) {
  const sortedPaytable = [...config.paytable].sort((a, b) => b.payout - a.payout);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-sky-500/40 bg-gradient-to-b from-sky-950 to-black p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-sky-300">How to win</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-white/90">
          Every symbol below pays for itself the instant it lands on any of the 5 reels — no matching required. If
          more than one paying symbol lands in the same spin (same symbol or different), their values simply add
          together.
        </p>
        <p className="mt-2 text-sm text-white/90">
          3 or more <img src="/symbols/rubberDuck/bonus.png" alt="Bonus" className="inline h-5 w-5 align-text-bottom" />{" "}
          BONUS symbols anywhere in the line award <span className="font-semibold text-amber-300">15 free spins</span>{" "}
          — landing 3+ again during free spins adds{" "}
          <span className="font-semibold text-amber-300">10 more spins</span> on top of what's left. Every win pays{" "}
          <span className="font-semibold text-lime-300">3x</span> during free spins.
        </p>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="text-left font-normal">Symbol</th>
              <th className="text-right font-normal">Pays</th>
            </tr>
          </thead>
          <tbody>
            {sortedPaytable.map((row) => (
              <tr key={row.symbol} className="border-t border-white/10">
                <td className="flex items-center gap-2 py-1.5">
                  <img src={SYMBOL_IMAGES[row.symbol]} alt="" className="h-8 w-8 object-contain" />
                  {row.symbol.replace(/_/g, " ")}
                </td>
                <td className="py-1.5 text-right font-semibold text-lime-300">
                  {(row.payout * betAmount).toFixed(2)}{" "}
                  <span className="text-xs font-normal text-white/50">({row.payout}x)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-xs text-white/50">
          Any other fruit symbol not listed above (avocado, banana, coconut, grapes, lemon, strawberry) is a loss —
          it never pays.
        </p>
      </div>
    </div>
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
  const ledge = active ? "#0369a1" : "#0a0a0a";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative flex items-center justify-center rounded-full border-2 bg-gradient-to-b transition-transform duration-100 ease-out hover:brightness-105 active:translate-y-[3px] disabled:opacity-40 disabled:active:translate-y-0 disabled:pointer-events-none ${
        active
          ? "border-sky-800 from-sky-200 via-sky-400 to-sky-600"
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

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
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
