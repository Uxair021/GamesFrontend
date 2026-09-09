import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { Mega10XPayScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/Mega10XPayScene";
import { getMega10xPayConfig, spinRequest, Mega10xPayConfigResponse } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30];
const WIN_GLOW_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/what-s-next-nick-petrov-main-version-48836-02-22.mp3";


export function Mega10XPayGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Mega10XPayScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Mega10xPayConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(
    null
  );
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const winGlowActiveRef = useRef(false);
  const winGlowStartRef = useRef(0);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getMega10xPayConfig()
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
        const scene = await Mega10XPayScene.create(app);
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

  // Keeps the scene's own BET/WIN readouts (rendered inside bg.png's baked-in box, not the
  // HTML control bar) in sync with the latest bet selection and spin result.
  useEffect(() => {
    if (!ready || !sceneRef.current) return;
    sceneRef.current.updateReadouts(betAmount, winAmount);
  }, [ready, betAmount, winAmount]);

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
      await sceneRef.current.spin(result.reels, result.winAmount > 0, () => sound.playReelStop());
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

  // Auto-continues spinning while autoplay is on — same "wait a beat after each landing, then
  // fire the next spin" pattern Buffalo 777's autoplay uses. Stops itself on insufficient
  // balance or a spin error (see runSpin's setAutoplay(false) calls above).
  useEffect(() => {
    if (!autoplay || spinning || !ready) return;
    const id = window.setTimeout(() => runSpin(), 700);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, runSpin]);

  const changeBet = (direction: 1 | -1) => {
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;

  return (
    <>
      <div className="relative overflow-hidden" style={{ width: scaledWidth, height: scaledHeight + 20 * fitScale }}>
        <div
          ref={gameCardRef}
          className="relative flex flex-col overflow-hidden rounded-lg bg-black shadow-2xl"
          style={{
            width: CANVAS_WIDTH,
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {/* Top bar — back pill + coin balance readout, distinct pill/LCD styling from every
              other game's control bar (per user request for a different controller UI). */}
          <div className="absolute top-0 z-10 flex w-full items-center justify-between px-3 py-2">
            <Link
              to="/"
              className="flex h-12 w-20 items-center justify-center rounded-full bg-slate-800/90 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.6)] hover:bg-slate-700/90"
              aria-label="Home"
            >
              <BackIcon />
            </Link>
            <div className="flex items-center gap-2">
              <Bevel3DButton onClick={() => { sound.resumeAudio(); setMuted(sound.toggleMuted()); }} active={muted} ariaLabel={muted ? "Unmute" : "Mute"} size={36}>
                <SoundIcon muted={muted} />
              </Bevel3DButton>
              <div className="flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.6)]">
                <CoinIcon />
                <span className="min-w-[70px] text-right font-mono text-lg font-bold text-amber-300">
                  {(user?.balance ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-black text-amber-300/70">
                Loading reels...
              </div>
            )}
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 mx-3 rounded bg-red-900/70 px-8 py-4 text-2xl text-center text-red-100">
              {error}
            </div>
          )}

          {/* Bottom controller — [i][BET-][BET+], a gold MEGA10XPAY pill, and a glossy green
              SPIN button. BET/WIN themselves render inside the scene's own baked-in readout
              box above (see Mega10XPayScene.buildReadouts), not here. Every button uses the
              same heavy 3D bevel (Bevel3DButton) per user request. */}
          <div className="absolute bottom-0 z-10 flex w-full items-center gap-2.5 bg-gradient-to-b from-neutral-900 via-neutral-800 to-neutral-950 px-4 py-3" style={{ height: 73 }}>
            <Bevel3DButton onClick={() => setShowPaytable((v) => !v)} ariaLabel="Paytable" size={52}>
              <span className="text-2xl font-black italic text-neutral-900">i</span>
            </Bevel3DButton>
            <Bevel3DButton onClick={() => changeBet(-1)} disabled={betIndex === 0 || spinning} ariaLabel="Decrease bet" size={52}>
              <span className="flex flex-col items-center leading-[0.85] text-neutral-900">
                <span className="text-[11px] font-black tracking-wide">BET</span>
                <span className="text-xl font-black">−</span>
              </span>
            </Bevel3DButton>
            <Bevel3DButton onClick={() => changeBet(1)} disabled={betIndex === betLevels.length - 1 || spinning} ariaLabel="Increase bet" size={52}>
              <span className="flex flex-col items-center leading-[0.85] text-neutral-900">
                <span className="text-[11px] font-black tracking-wide">BET</span>
                <span className="text-xl font-black">+</span>
              </span>
            </Bevel3DButton>

            <button
              onClick={() => setShowPaytable((v) => !v)}
              className="flex h-14 flex-1 items-center justify-center rounded-md border-2 border-amber-900/70 bg-gradient-to-b from-amber-100 via-amber-400 to-amber-600 px-6 text-xl font-black italic tracking-wide text-red-900"
              style={{ boxShadow: "inset 0 2px 3px rgba(255,255,255,0.85), inset 0 -3px 6px rgba(120,53,15,0.5), 0 3px 4px rgba(0,0,0,0.5)" }}
            >
              MEGA 10X PAY
            </button>

            <Bevel3DButton
              onClick={() => {
                sound.resumeAudio();
                setAutoplay((v) => !v);
              }}
              active={autoplay}
              ariaLabel="Autoplay"
              size={52}
            >
              <span className="flex flex-col items-center leading-[0.8] text-neutral-900">
                <AutoplayIcon />
                <span className="mt-0.5 text-[9px] font-black tracking-wide">AUTO</span>
              </span>
            </Bevel3DButton>

            <button
              onClick={runSpin}
              disabled={!ready || spinning}
              className="relative flex h-16 w-36 flex-col items-center justify-center rounded-2xl border-2 border-emerald-950 bg-gradient-to-b from-lime-300 via-green-500 to-green-700 font-black leading-tight text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-50 disabled:active:translate-y-0"
              style={{
                boxShadow:
                  "0 5px 0 #052e16, 0 9px 14px rgba(0,0,0,0.55), inset 0 3px 3px rgba(255,255,255,0.75), inset 0 -6px 10px rgba(0,0,0,0.35)",
              }}
            >
              <span className="pointer-events-none absolute inset-x-[14%] top-[8%] h-[28%] rounded-full bg-white/50" style={{ filter: "blur(2px)" }} />
              <span className="text-2xl tracking-wide">{spinning ? "..." : "SPIN"}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide opacity-90">Hold for auto spin</span>
            </button>
          </div>
        </div>
      </div>

      {showPaytable && config && <PaytableModal config={config} onClose={() => setShowPaytable(false)} />}

      {celebration && (
        <WinCelebration tier={celebration.tier} winAmount={celebration.winAmount} onDismiss={() => setCelebration(null)} />
      )}

      {showLoadingScreen && (
        <LoadingScreen
          title="Mega 10X Pay"
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


/** Square chrome/silver button with a heavy 3D bevel — a raised glossy top-left highlight, a
 * dark ledge along the bottom-right, and a soft rounded-square shape — matching the reference
 * screenshot's [i]/[BET-]/[BET+] buttons exactly. Presses collapse the ledge and nudge the
 * button down into it, same "real physical button" illusion every other game's CtrlButton
 * uses, just square instead of round per this game's distinct look. */
function Bevel3DButton({
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
  size = 52,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
  size?: number;
  children: React.ReactNode;
}) {
  const ledge = active ? "#78350f" : "#0a0a0a";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative flex shrink-0 items-center justify-center rounded-[10px] border transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-40 disabled:active:translate-y-0 ${
        active
          ? "border-amber-800 bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600"
          : "border-neutral-950 bg-gradient-to-b from-neutral-200 via-neutral-400 to-neutral-600"
      }`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 4px 0 ${ledge}, 0 7px 9px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.85), inset 0 -5px 7px rgba(0,0,0,0.35)`,
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-[14%] top-[8%] h-[38%] rounded-[6px] bg-white/60"
        style={{ filter: "blur(1.5px)" }}
      />
      {children}
    </button>
  );
}

function PaytableModal({ config, onClose }: { config: Mega10xPayConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-neutral-900 to-black p-4 text-white shadow-2xl"
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
          One line, straight across the payline. Land 3 matching symbols on that line to win. Landing exactly 1 or 2
          CHERRY on the line also pays, even without a 3rd match.
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
                <td className="py-1 text-right font-semibold text-lime-300">x{row.payout}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px"
    width="30px" height="30px" viewBox="0 0 45.58 45.58" fill= "#fff"
    >
    <g>
      <path d="M45.506,33.532c-1.741-7.42-7.161-17.758-23.554-19.942V7.047c0-1.364-0.826-2.593-2.087-3.113
        c-1.261-0.521-2.712-0.229-3.675,0.737L1.305,19.63c-1.739,1.748-1.74,4.572-0.001,6.32L16.19,40.909
        c0.961,0.966,2.415,1.258,3.676,0.737c1.261-0.521,2.087-1.75,2.087-3.113v-6.331c5.593,0.007,13.656,0.743,19.392,4.313
        c0.953,0.594,2.168,0.555,3.08-0.101C45.335,35.762,45.763,34.624,45.506,33.532z"/>
    </g>
  </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="#fbbf24" stroke="#92400e" strokeWidth="1.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#92400e">
        $
      </text>
    </svg>
  );
}

function AutoplayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
      <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.93 4" strokeLinecap="round" />
      <path d="M20 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.93-4" strokeLinecap="round" />
      <path d="M4 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
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
