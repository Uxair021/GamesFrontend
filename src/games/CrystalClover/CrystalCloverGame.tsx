import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { CrystalCloverScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/CrystalCloverScene";
import { getCrystalCloverConfig, spinRequest, CrystalCloverConfigResponse } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30];
const WIN_HIGHLIGHT_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/kulakovka-casino-291450.mp3";
const REEL_SPIN_SOUND_URL = "/Sound/freesound_community-spinning-reel-27903.mp3";
const REEL_SPIN_SOUND_TRIM_SECONDS = 0.4;

const SYMBOL_LABELS: Record<string, string> = {
  SEVEN_CLOVER: "3× 7 Crystal Clover",
  TRIPLE_BAR: "3× Triple Bar",
  DOUBLE_BAR: "3× Double Bar",
  BAR: "3× Bar",
};

const SYMBOL_IMAGES: Record<string, string> = {
  SEVEN_CLOVER: "/symbols/crystalClover/7clover.png",
  TRIPLE_BAR: "/symbols/crystalClover/trippleBar.png",
  DOUBLE_BAR: "/symbols/crystalClover/doubleBar.png",
  BAR: "/symbols/crystalClover/bar.png",
  WILD: "/symbols/crystalClover/wild.png",
  MULTIPLIER_2X: "/symbols/crystalClover/2X.png",
};

export function CrystalCloverGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CrystalCloverScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<CrystalCloverConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
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
  const winHighlightActiveRef = useRef(false);
  const winHighlightStartRef = useRef(0);
  // The home button and control bar are now genuine stacked rows (not absolute overlays on
  // top of the canvas — frame.png's reel windows fill almost the entire 781px canvas height,
  // leaving no safe margin for an overlay bar to sit in without covering the bottom row of
  // symbols). Since the card's total natural height is no longer just CANVAS_HEIGHT, this
  // measures the real (untransformed) size of `gameCardRef` directly, independent of
  // useFitScale's own internal measurement, so the outer wrapper below can reserve exactly
  // the right amount of post-scale space for all 3 rows together.
  const [naturalSize, setNaturalSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  useEffect(() => {
    const el = gameCardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setNaturalSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getCrystalCloverConfig()
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
        // frame.png's own margins (outside the gold-bordered reel windows) are transparent —
        // without this, Pixi's default opaque black clear color fills them instead of letting
        // the page-level bg.png backdrop (see the fixed <img> below) show through.
        backgroundAlpha: 0,
      })
      .then(async () => {
        if (cancelled || !canvasHostRef.current) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        canvasHostRef.current.appendChild(app.canvas);
        const scene = await CrystalCloverScene.create(app);
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
      const result = await spinRequest(betAmount);
      sound.startReelSpinLoop(REEL_SPIN_SOUND_URL, REEL_SPIN_SOUND_TRIM_SECONDS);
      await sceneRef.current.spin(result.grid, () => sound.playReelStop(), turbo);
      sound.stopReelSpinLoop();
      setWinAmount(result.winAmount);
      setBalance(result.balance);

      if (result.evaluation.lineWins.length > 0) {
        sceneRef.current.showWinHighlights(result.evaluation.lineWins);
        winHighlightActiveRef.current = true;
        winHighlightStartRef.current = Date.now();
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

  const scaledWidth = naturalSize.width * fitScale;
  const scaledHeight = naturalSize.height * fitScale;

  return (
    <>
      {/* True full-viewport backdrop — position:fixed so it covers the whole browser window
       * (escaping GamePage.tsx's flex-centered, bg-black wrapper) regardless of how the scaled
       * card below is sized, and shows through the Pixi canvas's transparent margins (see
       * app.init's backgroundAlpha:0 below) and frame.png's own transparent margins outside
       * its gold-bordered windows, instead of flat black. */}
      <img src="/symbols/crystalClover/bg.png" alt="" className="fixed inset-0 h-full w-full object-cover" />

      <div className="relative overflow-hidden" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          ref={gameCardRef}
          className="relative flex flex-col overflow-hidden"
          style={{
            width: CANVAS_WIDTH,
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: "top left",
          }}
        >

          {/* Row 1: home button */}
          <div className="z-10 w-full flex items-center justify-start px-4 py-3">
            <Link
              to="/"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-black/50 text-amber-200 backdrop-blur-sm shadow-[0_0_12px_rgba(0,0,0,0.4)] transition-colors hover:border-amber-300/70 hover:bg-black/70"
              aria-label="Home"
            >
              <HomeIcon size={22} />
            </Link>
          </div>

          {/* Row 2: canvas (reels) */}
          <div className="relative overflow-hidden rounded-lg">
            <div ref={canvasHostRef} className="mx-auto bg-transparent" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-emerald-300/70">
                Loading reels...
              </div>
            )}
            {error && (
              <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-4xl text-center text-red-100">
                {error}
              </div>
            )}
          </div>

          {/* Row 3: controller — dark glass panel with a glowing gold hairline echoing
           * frame.png's own gold trim, tying the control bar into the rest of the cabinet
           * instead of reading as a generic flat bar bolted on underneath. */}
          <div className="relative z-10 flex w-full items-center justify-between gap-3 border-t-2 border-amber-400/50 bg-black/75 px-5 py-4 shadow-[0_-6px_24px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/90 to-transparent" />

            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 backdrop-blur-sm">
              <div className="flex flex-col gap-1.5">
                <CtrlButton onClick={() => setShowPaytable((v) => !v)} ariaLabel="Paytable" className="h-9 w-9">
                  <InfoIcon />
                </CtrlButton>
                <CtrlButton
                  onClick={() => {
                    sound.resumeAudio();
                    setMuted(sound.toggleMuted());
                  }}
                  active={muted}
                  ariaLabel={muted ? "Unmute" : "Mute"}
                  className="h-9 w-9"
                >
                  <SoundIcon muted={muted} />
                </CtrlButton>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-200/70">Credit</span>
                <span className="text-2xl font-bold tabular-nums text-white">{(user?.balance ?? 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 backdrop-blur-sm">
              <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0} ariaLabel="Decrease bet" className="h-9 w-9">
                <TriangleIcon direction="left" />
              </CtrlButton>
              <div className="flex flex-col items-center px-2 leading-tight">
                <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-300/80">Bet</span>
                <span className="text-2xl font-bold tabular-nums text-white">{betAmount.toFixed(2)}</span>
              </div>
              <CtrlButton
                onClick={() => changeBet(1)}
                disabled={betIndex === betLevels.length - 1}
                ariaLabel="Increase bet"
                className="h-9 w-9"
              >
                <TriangleIcon direction="right" />
              </CtrlButton>
            </div>

            <div className="flex min-w-[220px] max-w-sm flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-black/60 py-2.5 shadow-[0_0_18px_rgba(16,185,129,0.15),inset_0_2px_6px_rgba(0,0,0,0.6)] backdrop-blur-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">Win</span>
              <span className="text-3xl font-black tabular-nums text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                {winAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <CtrlButton onClick={() => setTurbo((v) => !v)} active={turbo} ariaLabel="Turbo spin" className="h-[68px] w-[68px]">
                <TurboIcon size={34} />
              </CtrlButton>

              <button
                onClick={() => {
                  sound.resumeAudio();
                  setAutoplay((v) => !v);
                }}
                aria-label="Autoplay"
                className={`relative flex h-[68px] w-[92px] items-center justify-center rounded-2xl border text-lg font-black tracking-wide backdrop-blur-sm transition-all duration-150 ease-out active:translate-y-[2px] ${
                  autoplay
                    ? "border-emerald-300/80 bg-emerald-500/25 text-emerald-100 shadow-[0_0_16px_rgba(52,211,153,0.55),inset_0_1px_1px_rgba(255,255,255,0.15)]"
                    : "border-white/15 bg-white/[0.06] text-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] hover:border-amber-300/40 hover:bg-white/[0.1]"
                }`}
              >
                AUTO
              </button>

              <button
                onClick={() => runSpin()}
                disabled={!ready || spinning}
                className="relative flex h-[76px] w-[210px] items-center justify-center rounded-3xl border-2 border-amber-300/70 bg-gradient-to-b from-lime-300 via-emerald-500 to-green-700 text-4xl font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
                style={{
                  boxShadow:
                    "0 5px 0 #14532d, 0 0 26px rgba(52,211,153,0.45), 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
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
          title="7 Crystal Clover"
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

function PaytableModal({ config, onClose }: { config: CrystalCloverConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-emerald-400/40 bg-gradient-to-b from-emerald-950 to-black p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-emerald-400">How to win</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-white/90">
          {config.paylineCount} fixed paylines. 3 matching symbols on a line pays (shown below as a multiple of your
          bet). Any mix of the 3 BAR symbols on a line still pays a small consolation amount even when they don't
          match exactly, and 1, 2, or 3 Wilds on a line pays its own flat bonus (see below).
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
              <tr key={row.symbol}>
                <td className="py-1 flex items-center gap-2">
                  <img src={SYMBOL_IMAGES[row.symbol]} alt="" className="h-6 w-6 object-contain" />
                  {SYMBOL_LABELS[row.symbol] ?? row.symbol}
                </td>
                <td className="py-1 text-right font-semibold text-lime-300">x{row.payout.toFixed(4)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1 flex items-center gap-2">Any 3 Bars (mixed)</td>
              <td className="py-1 text-right font-semibold text-lime-300">x{config.anyBarPayout.toFixed(4)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 text-sm">
          <div className="font-bold text-emerald-400 flex items-center gap-2">
            <img src={SYMBOL_IMAGES.WILD} alt="" className="h-6 w-6 object-contain" />
            WILD (pure Wild run)
          </div>
          <div className="text-white/80">
            1 Wild = x{config.wild.purePayout[1].toFixed(4)}, 2 Wilds = x{config.wild.purePayout[2].toFixed(4)}, 3
            Wilds = x{config.wild.purePayout[3].toFixed(4)} (not multiplied further)
          </div>
        </div>
        <div className="mt-4 text-sm">
          <div className="font-bold text-emerald-400 flex items-center gap-2">
            <img src={SYMBOL_IMAGES.MULTIPLIER_2X} alt="" className="h-6 w-6 object-contain" />
            2X Multiplier
          </div>
          <div className="text-white/80">
            Doesn't need a payline — every 2X anywhere on the reels doubles your whole spin's win, stacking per copy
            (2 copies = x4, 3 = x8).
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative flex items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-150 ease-out active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-35 disabled:active:translate-y-0 ${
        active
          ? "border-emerald-300/80 bg-emerald-500/25 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.55),inset_0_1px_1px_rgba(255,255,255,0.15)]"
          : "border-white/15 bg-white/[0.06] text-amber-100/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] hover:border-amber-300/40 hover:bg-white/[0.1]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function TriangleIcon({ direction }: { direction: "left" | "right" }) {
  const points = direction === "left" ? "15,4 6,12 15,20" : "9,4 18,12 9,20";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.3" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TurboIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="13,2 3,14 11,14 9,22 21,9 13,9" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
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
