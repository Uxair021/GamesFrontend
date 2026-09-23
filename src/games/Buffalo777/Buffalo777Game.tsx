import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { Buffalo777Scene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/Buffalo777Scene";
import { getBuffalo777Config, spinRequest, logSpinResult, Buffalo777ConfigResponse, PayoutRow } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
const WIN_GLOW_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/atlasaudio-game-game-music-576637.mp3";

const BUTTON_IMAGES = {
  home: "/symbols/buffalo777/Home Button Buffalo777.webp",
  minus: "/symbols/buffalo777/Minus Button Buffalo777.webp",
  plus: "/symbols/buffalo777/Plus Button Buffalo777.webp",
  setting: "/symbols/buffalo777/Setting Button Buffalo777.webp",
  spinGreen: "/symbols/buffalo777/Spin Button Green Buffalo777.webp",
  spinRed: "/symbols/buffalo777/Spin Button Red Buffalo777.webp",
  auto: "/symbols/buffalo777/Auto Button Buffalo777.webp",
  turbo: "/symbols/buffalo777/Turbo Button Buffalo777.webp",
} as const;

/** Maps the backend's winTierKey (SpinResponse.winTierKey) to the ladder sign it should pour
 * coins out of — see Buffalo777Scene's LADDER_POSITIONS. Keys mirror engine.ts's TierKey. */
const TIER_KEY_TO_LADDER_SYMBOL: Record<string, PayoutRow["symbol"]> = {
  ten: "TEN",
  jack: "JACK",
  queen: "QUEEN",
  king: "KING",
  ace: "ACE",
  bull: "BULL",
  anyBar: "ANY_BAR",
  singleBar: "SINGLE_BAR",
  doubleBar: "DOUBLE_BAR",
  tripleBar: "TRIPLE_BAR",
  moneyBag: "MONEY_BAG",
  coin: "COIN",
};

const PAYOUT_LABELS: Record<PayoutRow["symbol"], string> = {
  COIN: "3× Gold Coin",
  MONEY_BAG: "3× Money Bag",
  TRIPLE_BAR: "3× Triple Bar",
  DOUBLE_BAR: "3× Double Bar",
  SINGLE_BAR: "3× Single Bar",
  ANY_BAR: "Any 3 Bars (mixed)",
  BULL: "3× Bull",
  ACE: "3× Ace",
  KING: "3× King",
  QUEEN: "3× Queen",
  JACK: "3× Jack",
  TEN: "3× 10",
};

export function Buffalo777Game() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Buffalo777Scene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Buffalo777ConfigResponse | null>(null);
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
  const winGlowActiveRef = useRef(false);
  const winGlowStartRef = useRef(0);

  const betAmount = betLevels[betIndex] ?? betLevels[0];

  useEffect(() => {
    getBuffalo777Config()
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
        const scene = await Buffalo777Scene.create(app);
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
      await sceneRef.current.spin(result.reels, () => sound.playReelStop(), turbo);
      sound.stopReelSpinLoop();
      setWinAmount(result.winAmount);
      // Buffalo777 is a fully offline test game — there's no server balance to read back, so
      // this mirrors the same deduct-bet-then-credit-win math the backend used to do.
      const newBalance = Math.round(((user?.balance ?? 0) - betAmount + result.winAmount) * 100) / 100;
      setBalance(newBalance);

      // Fire-and-forget — purely for the admin dashboard's record-keeping, gameplay never
      // waits on or depends on this succeeding.
      logSpinResult({
        betAmount,
        winAmount: result.winAmount,
        reelSymbols: result.reels,
        balanceAfter: newBalance,
        tier: result.tier,
      }).catch(() => {});

      if (result.winAmount > 0) {
        sceneRef.current.setWinGlow(true);
        winGlowActiveRef.current = true;
        winGlowStartRef.current = Date.now();

        const ladderSymbol = result.winTierKey ? TIER_KEY_TO_LADDER_SYMBOL[result.winTierKey] : undefined;
        if (ladderSymbol) sceneRef.current.playCoinFall(ladderSymbol);
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

  // Keep the ladder's win-value readouts in sync with the current bet.
  useEffect(() => {
    if (!ready || !config || !sceneRef.current) return;
    sceneRef.current.updatePayoutValues(config.paytable, betAmount);
  }, [ready, config, betAmount]);

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
        height: CANVAS_HEIGHT,
        transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
        transformOrigin: "top left",
      }}
    >
      {/* Home sits on the pre-drawn badge baked into bg.webp's own art, top-left corner. */}
      <div
        className="absolute z-10"
        style={{ left: 52, top: 52, width: 70, height: 70, transform: "translate(-50%, -50%)" }}
      >
        <Link
          to="/"
          aria-label="Home"
          className="block h-[40px] w-[40px] transition-transform duration-100 ease-out active:scale-90"
        >
          <img src={BUTTON_IMAGES.home} alt="Home" className="h-full w-full select-none object-contain" draggable={false} />
        </Link>
      </div>

      <div className="relative mt-1 overflow-hidden rounded-lg">
        <div ref={canvasHostRef} className="mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-amber-950 text-amber-300/70">
            Loading reels...
          </div>
        )}
      </div>

      {error && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-5xl text-center text-red-100">
          {error}
        </div>
      )}

      {/*
       * Every control below sits exactly on the slot pre-drawn into bg.webp's own control-bar
       * art (gear/minus/plus/win-panel/turbo/auto/spin) — absolute, in canvas pixels
       * (CANVAS_WIDTH x CANVAS_HEIGHT = 1672x941), centered on each element via
       * translate(-50%, -50%). First-pass estimate read off the art; tune by eye as needed,
       * same convention as Buffalo777Scene.ts's own LADDER_POSITIONS. Mute has no slot in this
       * art (not part of the original design) so it lives in the top-right corner instead,
       * clear of everything else.
       */}
      <div className="absolute z-10" style={{ right: 16, top: 16 }}>
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

      {/* Warm amber-to-dark-wood gradient bar grounding the whole control row — bg.webp's own
       * art here is just open sky/desert fading to sand, with no distinct control-bar shape
       * baked in, so without this the buttons/text below float directly on that busy scene with
       * weak contrast. Colors pulled from the game's own palette (the gold/amber of the BAR and
       * SPIN button art, the dark wood-brown of the side ladder signs) so it reads as part of
       * the same machine rather than a bolted-on strip. Placed first among these siblings (no
       * z-index needed) so every control below stacks on top of it in normal DOM order. */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: 107,
          background:
            "linear-gradient(180deg, rgba(74,40,12,0) 0%, rgba(112,64,20,0.55) 16%, rgba(112,60,18,0.88) 34%, rgba(58,30,8,0.95) 64%, rgba(16,8,3,0.98) 100%)",
          // borderTop: "1px solid rgba(255,205,110,0.55)",
        }}
      />

      <div className="absolute" style={{ left: 49, top: 880, width: 84, height: 74, transform: "translate(-50%, -50%)" }}>
        <ImgButton onClick={() => setShowPaytable((v) => !v)} src={BUTTON_IMAGES.setting} alt="Paytable" className="h-full w-full" />
      </div>

      <div
        className="absolute flex flex-col items-center justify-center leading-tight rounded-xl border"
        style={{
          left: 211,
          top: 880,
          width: 190,
          height: 46,
          transform: "translate(-50%, -50%)",
          background: "linear-gradient(180deg, rgba(122,72,24,0.85), rgba(52,27,8,0.9))",
          borderColor: "rgba(255,205,110,0.45)",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.4)",
        }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-200/90">Credit</span>
        <span className="text-xl font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
          {(user?.balance ?? 0).toFixed(2)}
        </span>
      </div>

      <div className="absolute" style={{ left: 372, top: 880, width: 72, height: 72, transform: "translate(-50%, -50%)" }}>
        <ImgButton onClick={() => changeBet(-1)} disabled={betIndex === 0} src={BUTTON_IMAGES.minus} alt="Decrease bet" className="h-full w-full" />
      </div>

      <div
        className="absolute flex flex-col items-center justify-center leading-tight rounded-xl border"
        style={{
          left: 454,
          top: 880,
          width: 70,
          height: 46,
          transform: "translate(-50%, -50%)",
          background: "linear-gradient(180deg, rgba(122,72,24,0.85), rgba(52,27,8,0.9))",
          borderColor: "rgba(255,205,110,0.45)",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.4)",
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Bet</span>
        <span className="text-lg font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
          {betAmount.toFixed(2)}
        </span>
      </div>

      <div className="absolute" style={{ left: 537, top: 880, width: 75, height: 75, transform: "translate(-50%, -50%)" }}>
        <ImgButton
          onClick={() => changeBet(1)}
          disabled={betIndex === betLevels.length - 1}
          src={BUTTON_IMAGES.plus}
          alt="Increase bet"
          className="h-full w-full"
        />
      </div>

      <div
        className="absolute flex items-center justify-center gap-2 rounded-xl border"
        style={{
          left: 836,
          top: 878,
          width: 420,
          height: 67,
          transform: "translate(-50%, -50%)",
          background: "linear-gradient(180deg, rgba(122,72,24,0.85), rgba(52,27,8,0.9))",
          borderColor: "rgba(255,205,110,0.45)",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.4)",
        }}
      >
        <span className="text-md font-bold uppercase tracking-wide text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">Win</span>
        <span className="text-3xl font-black text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {winAmount.toFixed(2)}
        </span>
      </div>

      <div className="absolute" style={{ left: 1214, top: 880, width: 77, height: 77, transform: "translate(-50%, -50%)" }}>
        <ImgButton onClick={() => setTurbo((v) => !v)} active={turbo} src={BUTTON_IMAGES.turbo} alt="Turbo spin" className="h-full w-full" />
      </div>

      <div className="absolute" style={{ left: 1325, top: 883, width: 108, height: 75, transform: "translate(-50%, -50%)" }}>
        <ImgButton
          onClick={() => {
            sound.resumeAudio();
            setAutoplay((v) => !v);
          }}
          active={autoplay}
          src={BUTTON_IMAGES.auto}
          alt="Autoplay"
          className="h-full w-full"
        />
      </div>

      <div className="absolute" style={{ left: 1534, top: 878, width: 245, height: 105, transform: "translate(-50%, -50%)" }}>
        <ImgButton
          onClick={() => runSpin()}
          disabled={!ready || spinning}
          dimDisabled={!spinning}
          src={spinning ? BUTTON_IMAGES.spinRed : BUTTON_IMAGES.spinGreen}
          alt="Spin"
          className="h-full w-full"
        />
      </div>
    </div>
    </div>

    {showPaytable && config && <PaytableModal config={config} onClose={() => setShowPaytable(false)} />}

    {celebration && (
      <WinCelebration tier={celebration.tier} winAmount={celebration.winAmount} onDismiss={() => setCelebration(null)} />
    )}

    {showLoadingScreen && (
      <LoadingScreen
        title="Buffalo 777"
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

function PaytableModal({ config, onClose }: { config: Buffalo777ConfigResponse; onClose: () => void }) {
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
          One line, straight across the middle. Land 3 matching symbols on that line and you win — the rarer the
          symbol, the bigger the payout.
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
                <td className="py-1">{PAYOUT_LABELS[row.symbol]}</td>
                <td className="py-1 text-right font-semibold text-lime-300">x{row.payout}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 rounded-lg bg-amber-900/40 p-3 text-xs text-amber-200">
          <span className="font-semibold text-amber-300">Gold Coin bonus:</span> land 3 Gold Coins and the machine
          pays out 500× your bet on the spot — the biggest single hit on the reels.
        </div>
      </div>
    </div>
  );
}

/**
 * A flat image-based button (the game's own art already includes its bevel/circle or pill
 * chrome, so this is just the click/disabled/active behavior around an <img>) — a shrink on
 * press, dimmed + inert while disabled, and a soft glow while toggled on (turbo/autoplay),
 * since none of the source art ships a separate "active" variant.
 */
function ImgButton({
  onClick,
  src,
  alt,
  active = false,
  disabled = false,
  dimDisabled = true,
  className = "",
}: {
  onClick: () => void;
  src: string;
  alt: string;
  active?: boolean;
  disabled?: boolean;
  /** Set false for a disabled state that should still read at full opacity/crispness (e.g. the
   * Spin button's red "spinning" art) — disabled still blocks clicks either way. */
  dimDisabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={alt}
      className={`relative flex items-center justify-center transition-transform duration-100 ease-out active:scale-90 disabled:active:scale-100 disabled:pointer-events-none ${
        dimDisabled ? "disabled:opacity-40" : ""
      } ${active ? "drop-shadow-[0_0_10px_rgba(251,191,36,0.85)] brightness-110" : ""} ${className}`}
    >
      <img src={src} alt={alt} className="z-10 h-full w-full select-none object-contain" draggable={false} />
    </button>
  );
}

/**
 * A physical, "pressable" 3D button: a solid drop-shadow ledge beneath it gives it real
 * thickness, and clicking collapses that ledge while nudging the button down into it — the
 * classic skeuomorphic push-button illusion, used for every round control (info/mute/bet/
 * turbo/auto) and the SPIN button.
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
      {/* Glossy highlight — a soft light streak across the top half, like a domed cap. */}
      <span
        className="pointer-events-none absolute inset-x-[16%] top-[9%] h-[36%] rounded-full bg-white/55"
        style={{ filter: "blur(2px)" }}
      />
      {children}
    </button>
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
