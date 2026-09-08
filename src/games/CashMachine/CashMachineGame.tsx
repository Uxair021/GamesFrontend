import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { CashMachineScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/CashMachineScene";
import { getCashMachineConfig, spinRequest, CashMachineConfigResponse } from "./api";
import { WinCelebration, WinTierName } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.5, 0.9, 1, 5, 10];
const WIN_GLOW_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/mondamusic-retro-arcade-game-music-512837.mp3";

/** Pixel positions of the 3 readout boxes baked into bg.png/bg2.png, measured against the
 * 1300x836 canvas. Balance / Bet / Win, left to right. */
const READOUT_BOXES = [
  { x: 140, width: 355 },
  { x: 550, width: 355 },
  { x: 970, width: 355 },
];
const READOUT_TOP = 720;
const READOUT_HEIGHT = 61;

/** Mirrors the backend's BET_TIERS mapping (bet -> reels in play) — used purely to dim
 * the not-in-play reels immediately when the bet changes, before the next spin. */
function getActiveReelsForBet(bet: number): number {
  if (bet === 0.1 || bet === 1) return 1;
  if (bet === 0.5 || bet === 5) return 2;
  return 3;
}

export function CashMachineGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CashMachineScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<CashMachineConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: WinTierName; winAmount: number } | null>(null);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const winGlowActiveRef = useRef(false);
  const winGlowStartRef = useRef(0);
  const autoplayRef = useRef(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getCashMachineConfig()
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
        const scene = await CashMachineScene.create(app);
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
      await sceneRef.current.spin(result.symbols, result.activeReels, result.respunIndexes, () => sound.playReelStop());
      sound.stopReelSpinLoop();
      setWinAmount(result.winAmount);
      setBalance(result.balance);

      if (result.winAmount > 0) {
        sceneRef.current.setWinGlow(true);
        winGlowActiveRef.current = true;
        winGlowStartRef.current = Date.now();
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
  }, [betAmount, spinning, user, setBalance]);

  useEffect(() => {
    if (!autoplay || spinning || !ready) return;
    const id = window.setTimeout(() => {
      runSpin();
    }, 700);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, runSpin]);

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  // Dim the not-in-play reels the instant the bet changes, rather than waiting for the
  // next spin to resolve and only then reflecting the new reel count.
  useEffect(() => {
    if (!ready || !sceneRef.current) return;
    sceneRef.current.setActiveReelsPreview(getActiveReelsForBet(betAmount));
  }, [betAmount, ready]);

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) window.clearTimeout(holdTimeoutRef.current);
    };
  }, []);

  const changeBet = (direction: 1 | -1) => {
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

  const setMaxBet = () => setBetIndex(betLevels.length - 1);

  const HOLD_THRESHOLD_MS = 450;

  /** Tap SPIN for a single spin; press and hold to engage autoplay (release doesn't
   * stop it — tap the button again while autoplay is running to stop). */
  const handleSpinPointerDown = () => {
    sound.resumeAudio();
    if (!ready || spinning || autoplayRef.current) return;
    holdTriggeredRef.current = false;
    holdTimeoutRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true;
      setAutoplay(true);
    }, HOLD_THRESHOLD_MS);
  };

  const handleSpinPointerUp = () => {
    if (holdTimeoutRef.current) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (autoplayRef.current) {
      setAutoplay(false);
      return;
    }
    if (!holdTriggeredRef.current) {
      runSpin();
    }
  };

  const handleSpinPointerCancel = () => {
    if (holdTimeoutRef.current) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  };

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;

  return (
    <>
    <div className="relative overflow-hidden" style={{ width: scaledWidth, height: scaledHeight }}>
    <div
      ref={gameCardRef}
      className="relative flex flex-col overflow-hidden bg-black shadow-2xl"
      style={{
        width: CANVAS_WIDTH,
        transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
        transformOrigin: "top left",
      }}
    >
      <div className="absolute top-0 z-10 w-full flex items-center justify-between px-3 py-2">
        <Link
          to="/"
          className="flex bg-white h-12 w-12 items-center justify-center rounded-full border-2 border-black text-black font-bold hover:bg-white"
          aria-label="Home"
        >
          <HomeIcon size={30} />
        </Link>
      </div>

      <div className="relative mt-1 overflow-hidden rounded-lg">
        <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-emerald-400/70">
            Loading reels...
          </div>
        )}

        {ready && (
          <div className="pointer-events-none absolute left-0 top-0" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            <ReadoutBox box={READOUT_BOXES[0]} label="Balance" value={(user?.balance ?? 0).toFixed(2)} />
            <ReadoutBox box={READOUT_BOXES[1]} label="Bet" value={betAmount.toFixed(2)} />
            <ReadoutBox box={READOUT_BOXES[2]} label="Win" value={winAmount.toFixed(2)} />
          </div>
        )}
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-5xl text-center text-red-100">
          {error}
        </div>
      )}

      <div className="absolute bottom-0 flex w-full items-center justify-between gap-3 px-20 py-3">
        <button onClick={() => setShowPaytable((v) => !v)} className={bevelButtonClass()} aria-label="Paytable">
          <span className="text-2xl font-black text-black">i</span>
        </button>

        <button
          onClick={() => {
            sound.resumeAudio();
            setMuted(sound.toggleMuted());
          }}
          className={bevelButtonClass(muted)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <SoundIcon muted={muted} />
        </button>

        <button
          onClick={() => changeBet(-1)}
          disabled={betIndex === 0}
          className={`${bevelButtonClass()} w-24`}
          aria-label="Decrease bet"
        >
          <span className="text-base font-black leading-tight text-black">BET</span>
          <span className="text-lg font-black leading-none text-black">−</span>
        </button>

        <button
          onClick={() => changeBet(1)}
          disabled={betIndex === betLevels.length - 1}
          className={`${bevelButtonClass()} w-24`}
          aria-label="Increase bet"
        >
          <span className="text-base font-black leading-tight text-black">BET</span>
          <span className="text-lg font-black leading-none text-black">+</span>
        </button>

        <button
          onClick={setMaxBet}
          disabled={betIndex === betLevels.length - 1}
          className={`${bevelButtonClass()} w-24`}
          aria-label="Max bet"
        >
          <span className="text-base font-black leading-tight text-black">MAX</span>
          <span className="text-base font-black leading-tight text-black">BET</span>
        </button>

        <button
          onPointerDown={handleSpinPointerDown}
          onPointerUp={handleSpinPointerUp}
          onPointerLeave={handleSpinPointerCancel}
          disabled={!ready || (spinning && !autoplay)}
          className={`${bevelButtonClass(autoplay, "green")} w-40`}
        >
          <span className="text-2xl font-black italic tracking-wide text-black">
            {spinning ? "..." : autoplay ? "STOP" : "SPIN"}
          </span>
          {!spinning && !autoplay && (
            <span className="text-[10px] font-bold tracking-wide text-black/70">HOLD FOR AUTOSPIN</span>
          )}
        </button>
      </div>
    </div>
    </div>

    {showPaytable && config && <PaytableModal onClose={() => setShowPaytable(false)} />}

    {celebration && (
      <WinCelebration
        tier={celebration.tier}
        winAmount={celebration.winAmount}
        onDismiss={() => setCelebration(null)}
      />
    )}

    {showLoadingScreen && (
      <LoadingScreen
        title="Cash Machine"
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

function PaytableModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border-2 border-emerald-400/40 bg-gradient-to-b from-neutral-900 to-black p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-emerald-400">How the Machine Pays</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-white/90">
          Cash Machine has no symbols to match — every reel prints a digit, and whatever number the machine spits
          out <span className="font-semibold text-lime-300">is</span> your prize. Read the reels left to right,
          skip the blanks, and that's your win.
        </p>

        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-400/80">Reels in play</div>
        <p className="mt-1 text-xs text-white/70">Your bet decides how many reels the machine puts to work.</p>
        <div className="mt-2 rounded-lg bg-black/40 p-3 text-sm">
          <div className="flex justify-between border-b border-white/10 py-1">
            <span className="text-white/70">Bet 0.10 / 1</span>
            <span className="text-white/70">1 reel in play</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-1">
            <span className="text-white/70">Bet 0.50 / 5</span>
            <span className="text-white/70">2 reels in play</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-white/70">Bet 0.90 / 10</span>
            <span className="text-white/70">3 reels in play</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/70">
          The lower bet in each pair plays the exact same reels at the exact same odds — just for a smaller slice of
          the prize. Go big to win big.
        </p>

        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-400/80">Reading a win</div>
        <p className="mt-1 text-xs text-white/70">
          Concatenate what's showing, left to right, blanks skipped — that number, in dollars, is what lands in
          your balance.
        </p>
        <div className="mt-2 rounded-lg bg-black/40 p-3 text-sm">
          <div className="flex justify-between border-b border-white/10 py-1">
            <span className="text-white/70">blank · 2 · 5</span>
            <span className="font-semibold text-lime-300">win 25</span>
          </div>
          <div className="flex justify-between border-b border-white/10 py-1">
            <span className="text-white/70">1 · blank · 10</span>
            <span className="font-semibold text-lime-300">win 110</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-white/70">5 · 5 · 5</span>
            <span className="font-semibold text-lime-300">win 555</span>
          </div>
        </div>

        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-400/80">The Zero Respin</div>
        <p className="mt-1 text-xs text-white/90">
          Land a <span className="font-semibold text-emerald-300">0</span> anywhere and the machine jolts to life —
          every other blank reel in play gets a bonus respin, cranking in reverse, hunting for real digits before
          your win locks in. It's the reels' way of giving you a second shot at a bigger number, live, on the spot.
        </p>

        <div className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-400/80">All blanks</div>
        <p className="mt-1 text-xs text-white/70">
          No digits, no 0 — the machine stays quiet and you keep your bet ready for the next pull. Every spin's a
          fresh shot at the jackpot.
        </p>
      </div>
    </div>
  );
}

function ReadoutBox({ box, label, value }: { box: { x: number; width: number }; label: string; value: string }) {
  return (
    <div
      className="absolute flex gap-0 flex-col justify-center px-5"
      style={{ left: box.x, top: READOUT_TOP, width: box.width, height: READOUT_HEIGHT }}
    >
      <div className="text-[15px] font-bold uppercase tracking-widest text-emerald-400 text-start ">{label}</div>
      <div className="text-3xl font-bold text-center leading-tight text-lime-300">{value}</div>
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
 * The stacked/beveled arcade-button look — light face on top, a stepped orange-brown
 * edge underneath (like a physical button's side profile), pressed down (translated +
 * shortened shadow) on click. Used for every control-bar button.
 */
function bevelButtonClass(active = false, variant: "cream" | "green" = "cream"): string {
  const face =
    variant === "green"
      ? active
        ? "from-lime-300 to-emerald-500"
        : "from-emerald-300 via-emerald-400 to-emerald-600"
      : active
        ? "from-lime-200 to-lime-400"
        : "from-slate-50 via-slate-100 to-slate-300";
  return `flex h-14 w-[20%] flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-black/70 bg-gradient-to-b ${face} shadow-[0_3px_0_0_rgba(120,53,15,0.9),0_6px_0_0_rgba(194,65,12,0.9),0_9px_10px_rgba(0,0,0,0.55)] transition-transform hover:brightness-95 active:translate-y-1 active:shadow-[0_1px_0_0_rgba(120,53,15,0.9),0_3px_0_0_rgba(194,65,12,0.9),0_5px_6px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:active:translate-y-0 disabled:active:shadow-[0_3px_0_0_rgba(120,53,15,0.9),0_6px_0_0_rgba(194,65,12,0.9),0_9px_10px_rgba(0,0,0,0.55)]`;
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
