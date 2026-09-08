import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { FiveXRewindScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/FiveXRewindScene";
import { getFiveXRewindConfig, spinRequest, FiveXRewindConfigResponse } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";
// import { CelebrationGifOverlay } from "./CelebrationGifOverlay";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30];
const WIN_GLOW_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/mfcc-lottery-casino-pause-intro-background-music-120443.mp3";
const BG_GIF_URL = "/symbols/5xRewind/bg.gif";
// const CELEBRATION_GIF_URL = "/symbols/5xRewind/celebration.gif";

export function FiveXRewindGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<FiveXRewindScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<FiveXRewindConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(
    null
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [turbo, setTurbo] = useState(false);
  // const [celebrationGifActive, setCelebrationGifActive] = useState(false);
  const winGlowActiveRef = useRef(false);
  const winGlowStartRef = useRef(0);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getFiveXRewindConfig()
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
        backgroundAlpha: 0,
      })
      .then(async () => {
        if (cancelled || !canvasHostRef.current) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        canvasHostRef.current.appendChild(app.canvas);
        const scene = await FiveXRewindScene.create(app);
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

  const runSpin = useCallback(async () => {
    sound.resumeAudio();
    if (!sceneRef.current || spinning) return;
    if (!user || user.balance < betAmount) {
      setError("Insufficient balance");
      setAutoplay(false);
      return;
    }

    setError(null);
    setSpinning(true);
    setWinAmount(0);
    // setCelebrationGifActive(false);

    // A previous spin's win glow must stay visible for at least WIN_GLOW_MIN_DISPLAY_MS
    // before this new spin can clear it, even if the player hits SPIN again immediately.
    if (winGlowActiveRef.current) {
      const remaining = WIN_GLOW_MIN_DISPLAY_MS - (Date.now() - winGlowStartRef.current);
      if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining));
      sceneRef.current?.setWinGlow(false);
      winGlowActiveRef.current = false;
    }
    if (!sceneRef.current) return;

    try {
      const result = await spinRequest(betAmount);
      sound.startReelSpinLoop();
      await sceneRef.current.spin(result.reels, () => sound.playReelStop(), turbo);
      sound.stopReelSpinLoop();
      setWinAmount(result.winAmount);
      setBalance(result.balance);

      if (result.winAmount > 0) {
        sceneRef.current.setWinGlow(true);
        winGlowActiveRef.current = true;
        winGlowStartRef.current = Date.now();
        // setCelebrationGifActive(true);
      }

      if (result.tier) {
        sound.playCelebration(result.tier);
        setCelebration({ tier: result.tier, winAmount: result.winAmount });
      } else if (result.winAmount > 0) {
        sound.playWinChime();
      }
    } catch (err) {
      sound.stopReelSpinLoop();
      const message = err instanceof Error ? err.message : "Spin failed";
      setError(message);
      setAutoplay(false);
    } finally {
      setSpinning(false);
    }
  }, [betAmount, spinning, user, setBalance, turbo]);

  useEffect(() => {
    if (!autoplay || spinning || !ready) return;
    const id = window.setTimeout(() => {
      runSpin();
    }, 700);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, runSpin]);

  const changeBet = (direction: 1 | -1) => {
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
      <img
        src={BG_GIF_URL}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      />

      {/* <CelebrationGifOverlay
        active={celebrationGifActive}
        src={CELEBRATION_GIF_URL}
        onDone={() => setCelebrationGifActive(false)}
      /> */}

      <div className="absolute top-0 z-10 w-full flex items-center justify-start px-3 py-2">
        <Link
          to="/"
          className="flex bg-white h-10 w-10 items-center justify-center rounded-full border-2 border-black text-black font-bold hover:bg-white"
          aria-label="Home"
        >
          <HomeIcon size={26} />
        </Link>
      </div>

      <div className="relative mt-1 overflow-hidden rounded-lg">
        <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-amber-300/70">Loading reels...</div>
        )}
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-5xl text-center text-red-100">
          {error}
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
          <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0} ariaLabel="Decrease bet" className="h-10 w-10">
            <TriangleIcon direction="left" />
          </CtrlButton>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-md font-bold uppercase tracking-wide text-amber-400">Bet</span>
            <span className="text-3xl font-bold text-white">{betAmount.toFixed(2)}</span>
          </div>
          <CtrlButton
            onClick={() => changeBet(1)}
            disabled={betIndex === betLevels.length - 1}
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
          <CtrlButton onClick={() => setTurbo((v) => !v)} active={turbo} ariaLabel="Turbo spin" className="h-[70px] w-[70px]">
            <TurboIcon size={40} />
          </CtrlButton>

          <CtrlButton
            onClick={() => {
              sound.resumeAudio();
              setAutoplay((v) => !v);
            }}
            active={autoplay}
            ariaLabel="Autoplay"
          >
            <span className="flex h-[70px] w-[100px] items-center justify-center text-xl font-black text-black">AUTO</span>
          </CtrlButton>

          <button
            onClick={() => runSpin()}
            disabled={!ready || spinning}
            className="relative flex h-[70px] w-[200px] items-center justify-center rounded-3xl border-2 border-orange-950 bg-gradient-to-b from-yellow-300 via-amber-500 to-orange-600 text-4xl font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
            style={{
              boxShadow: "0 5px 0 #7c2d12, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0px 0 #7c2d12, 0 2px 3px rgba(0,0,0,0.4), inset 0 4px 8px rgba(0,0,0,0.45)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.boxShadow =
                "0 5px 0 #7c2d12, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 5px 0 #7c2d12, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)";
            }}
          >
            <span className="pointer-events-none absolute inset-x-[12%] top-[10%] h-[30%] rounded-full bg-white/40" style={{ filter: "blur(3px)" }} />
            {spinning ? "..." : "SPIN"}
          </button>
        </div>
      </div>
    </div>
    </div>

    {showPaytable && config && <PaytableModal config={config} onClose={() => setShowPaytable(false)} />}

    {celebration && (
      <WinCelebration tier={celebration.tier} winAmount={celebration.winAmount} onDismiss={() => setCelebration(null)} />
    )}

    {showLoadingScreen && (
      <LoadingScreen
        title="5x Rewind"
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

function PaytableModal({ config, onClose }: { config: FiveXRewindConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-amber-950 to-black p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-amber-400">How to win</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-white/90">
          One line, straight across the middle of all 3 reels. Multiplier coins (2X/3X/4X/5X) substitute for a
          matching symbol and stack their values together — landing 2 or 3 coins on their own still pays out, using
          just their stacked value.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="text-left font-normal">Combo</th>
              <th className="text-right font-normal">Pays</th>
            </tr>
          </thead>
          <tbody>
            {config.paytable.map((row) => (
              <tr key={row.label}>
                <td className="py-1">{row.label}</td>
                <td className="py-1 text-right font-semibold text-lime-300">{row.payout > 0 ? `x${row.payout}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

/**
 * A physical, "pressable" 3D button: a solid drop-shadow ledge beneath it gives it real
 * thickness, and clicking collapses that ledge while nudging the button down into it.
 */
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
      onMouseDown={(e) => {
        e.currentTarget.style.boxShadow = `0 0px 0 ${ledge}, 0 1px 2px rgba(0,0,0,0.4), inset 0 3px 6px rgba(0,0,0,0.4)`;
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 0 ${ledge}, 0 7px 10px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 0 ${ledge}, 0 7px 10px rgba(255, 255, 255, 0.9), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)`;
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-[16%] top-[9%] h-[36%] rounded-full bg-white/55"
        style={{ filter: "blur(2px)" }}
      />
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

function TurboIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="black" stroke="none">
      <polygon points="13,2 3,14 11,14 9,22 21,9 13,9" />
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
