import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import { useAuth } from "../../context/AuthContext";
import { SlotMachineScene, CANVAS_WIDTH, CANVAS_HEIGHT } from "./pixi/SlotMachineScene";
import { getShamrockConfig, spinRequest, ShamrockConfigResponse, WinTierName, WinRuleId } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { FreeSpinCelebration } from "./FreeSpinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10];
const DEFAULT_MAX_TOTAL_FREE_SPINS = 29;
const WIN_GLOW_MIN_DISPLAY_MS = 2000;
const BG_MUSIC_URL = "/Sound/alex-morgan-video-game-pixel-chiptune-music-583271.mp3";

const WIN_RULE_LABELS: Record<WinRuleId, string> = {
  WILD_JACKPOT: "3× Shamrock Spin (wild)",
  GREEN_SEVEN: "3× Green 7",
  ORANGE_SEVEN: "3× Orange 7",
  YELLOW_SEVEN: "3× Yellow 7",
  TRIPLE_BAR: "3× BAR BAR BAR",
  ANY_SEVENS: "Any 3 Sevens",
  ANY_BARS: "Any 3 BARs",
  SINGLE_BAR: "3× BAR",
  TWO_WILDS: "2 Wilds + Any",
  ONE_WILD: "1 Wild + Any + Any",
};

export function ShamrockSpinGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SlotMachineScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  // Above 900px viewport width this is always 1 (desktop, unaffected). Below that
  // (phones/tablets) it shrinks the whole fixed-design-size card to fit, same
  // technique used by the celebration overlays.
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });

  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<ShamrockConfigResponse | null>(null);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [celebration, setCelebration] = useState<{ tier: WinTierName; winAmount: number } | null>(null);
  const [freeSpinCelebration, setFreeSpinCelebration] = useState<{ count: number } | null>(null);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [muted, setMuted] = useState(false);
  const pendingCelebrationRef = useRef<{ tier: WinTierName; winAmount: number } | null>(null);

  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState(0);
  const [freeSpinsTotalAwarded, setFreeSpinsTotalAwarded] = useState(0);
  const [freeSpinsWinnings, setFreeSpinsWinnings] = useState(0);
  const lockedBetRef = useRef(0);
  const winGlowActiveRef = useRef(false);
  const winGlowStartRef = useRef(0);

  const betAmount = betLevels[betIndex] ?? betLevels[0];
  const inFreeSpins = freeSpinsRemaining > 0;
  const maxTotalFreeSpins = config?.maxTotalFreeSpins ?? DEFAULT_MAX_TOTAL_FREE_SPINS;

  useEffect(() => {
    getShamrockConfig()
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
        const scene = await SlotMachineScene.create(app);
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
    async (freeSpin: boolean) => {
      sound.resumeAudio();
      if (!sceneRef.current || spinning) return;
      const stake = freeSpin ? lockedBetRef.current : betAmount;
      if (!freeSpin && (!user || user.balance < stake)) {
        setError("Insufficient balance");
        setAutoplay(false);
        return;
      }

      setError(null);
      setSpinning(true);
      if (!freeSpin) setWinAmount(0);

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
        const result = await spinRequest(stake, freeSpin);
        sound.startReelSpinLoop();
        await sceneRef.current.spin(result.reels, () => sound.playReelStop());
        sound.stopReelSpinLoop();
        setWinAmount(result.winAmount);
        setBalance(result.balance);
        if (freeSpin) setFreeSpinsWinnings((w) => w + result.winAmount);

        if (result.winAmount > 0) {
          sceneRef.current.setWinGlow(true);
          winGlowActiveRef.current = true;
          winGlowStartRef.current = Date.now();
        }

        if (result.freeSpinsAwarded > 0) {
          sound.playFreeSpinsJingle();
          if (!freeSpin) lockedBetRef.current = betAmount;
          setFreeSpinsTotalAwarded((total) => {
            const room = Math.max(maxTotalFreeSpins - total, 0);
            const addable = Math.min(result.freeSpinsAwarded, room);
            setFreeSpinsRemaining((r) => r + addable);
            return total + addable;
          });
          setFreeSpinCelebration({ count: result.freeSpinsAwarded });
        }

        if (result.tier) {
          sound.playCelebration(result.tier);
          // If a free-spin celebration is about to show for this same spin, queue the
          // win celebration to appear after it's dismissed instead of stacking both overlays.
          if (result.freeSpinsAwarded > 0) {
            pendingCelebrationRef.current = { tier: result.tier, winAmount: result.winAmount };
          } else {
            setCelebration({ tier: result.tier, winAmount: result.winAmount });
          }
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
        if (freeSpin) setFreeSpinsRemaining((r) => Math.max(r - 1, 0));
      }
    },
    [betAmount, spinning, user, setBalance, maxTotalFreeSpins]
  );

  // Auto-continue while free spins remain. Held off while the free-spin
  // celebration banner is showing so the bonus round doesn't start spinning
  // underneath it.
  useEffect(() => {
    if (!inFreeSpins || spinning || !ready || freeSpinCelebration) return;
    const id = window.setTimeout(() => runSpin(true), 900);
    return () => window.clearTimeout(id);
  }, [inFreeSpins, spinning, ready, freeSpinCelebration, runSpin]);

  // Reset the free-spins winnings tally once the bonus round ends.
  useEffect(() => {
    if (!inFreeSpins && freeSpinsTotalAwarded > 0 && !spinning) {
      const id = window.setTimeout(() => {
        setFreeSpinsTotalAwarded(0);
        setFreeSpinsWinnings(0);
      }, 3000);
      return () => window.clearTimeout(id);
    }
  }, [inFreeSpins, freeSpinsTotalAwarded, spinning]);

  useEffect(() => {
    if (!autoplay || spinning || !ready || inFreeSpins) return;
    const id = window.setTimeout(() => {
      runSpin(false);
    }, 700);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, inFreeSpins, runSpin]);

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
      <div className="absolute top-0 z-10 w-full flex items-center justify-between px-3 py-2">
        <Link
          to="/"
          className="flex bg-white h-12 w-12 items-center justify-center rounded-full border-2 border-black text-black font-bold hover:bg-white"
          aria-label="Home"
        >
          <HomeIcon size={30} />
        </Link>
        <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-xl font-bold text-cabinet-green">
            $
          </span>
          <span className="font-semibold text-xl text-cabinet-gold">{(user?.balance ?? 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="relative mt-1 overflow-hidden rounded-lg">
        <div
          ref={canvasHostRef}
          className="mx-auto"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-cabinet-green text-cabinet-gold/70">
            Loading reels...
          </div>
        )}
        {inFreeSpins && (
          <div className="absolute left-1/2 top-10 -translate-x-1/2 rounded-full bg-black/90 px-10 py-5 text-5xl font-bold text-amber-300 shadow z-10">
            FREE SPINS: {freeSpinsRemaining} left (of {freeSpinsTotalAwarded})
          </div>
        )}
      </div>

      {error && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 mx-3 mt-2 rounded bg-red-900/60 px-10 py-5 text-5xl text-center text-red-100">{error}</div>}

      {!inFreeSpins && freeSpinsTotalAwarded > 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 mx-3 mt-2 rounded-full bg-amber-900/80 px-10 py-5 text-center text-5xl text-amber-200 z-10">
          Free spins complete — won {freeSpinsWinnings.toFixed(2)}
        </div>
      )}

      <div className="absolute bottom-0 flex w-full items-center justify-between gap-2 bg-gradient-to-b from-cabinet-green-light to-cabinet-green px-3 py-2.5">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowPaytable((v) => !v)}
            className={ctrlButtonClass()}
            aria-label="Paytable"
          >
            <span className="text-xl font-black text-black">?</span>
          </button>

          <button
            onClick={() => {
              sound.resumeAudio();
              setMuted(sound.toggleMuted());
            }}
            className={ctrlButtonClass(muted)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            <SoundIcon muted={muted} />
          </button>
        </div>

        <div className="flex gap-3 items-center">

          <button
            onClick={() => changeBet(-1)}
            disabled={betIndex === 0 || inFreeSpins}
            className={ctrlButtonClass()}
            aria-label="Decrease bet"
          >
            <ChevronIcon direction="left" />
          </button>

          <div className="flex min-w-[92px] flex-col items-center justify-center rounded-lg border border-black/40 bg-gradient-to-b from-[#0c2a18] to-[#051309] px-4 py-1.5 shadow-inner">
            <div className="text-md font-bold uppercase tracking-wide text-amber-400">Total Bet</div>
            <div className="text-3xl font-bold text-lime-300">
              {(inFreeSpins ? lockedBetRef.current : betAmount).toFixed(2)}
            </div>
          </div>

          <button
            onClick={() => changeBet(1)}
            disabled={betIndex === betLevels.length - 1 || inFreeSpins}
            className={ctrlButtonClass()}
            aria-label="Increase bet"
          >
            <ChevronIcon direction="right" />
          </button>

        </div>

        <div className="flex min-w-[510px] flex-col items-center justify-center rounded-full border-2 border-white/70 bg-gradient-to-b from-red-600 via-red-800 to-red-950 px-5 py-1.5 shadow-[inset_0_2px_3px_rgba(255,255,255,0.3),0_2px_4px_rgba(0,0,0,0.4)]">
          <div className="text-md font-bold uppercase tracking-wide text-amber-300">Win</div>
          <div className="text-3xl font-bold text-amber-400">{winAmount.toFixed(2)}</div>
        </div>

        <div className="flex gap-5 items-center">
          <button
            onClick={() => {
              sound.resumeAudio();
              setAutoplay((v) => !v);
            }}
            disabled={inFreeSpins}
            className={ctrlButtonClass(autoplay)}
            aria-label="Autoplay"
          >
            <AutoplayIcon  />
          </button>

          <button
            onClick={() => runSpin(false)}
            disabled={!ready || spinning || inFreeSpins}
            className="rounded-2xl border-2 border-black/50 bg-gradient-to-b from-green-300 via-green-500 to-green-700 px-8 py-3.5 text-2xl font-black italic tracking-wide text-white shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),0_3px_6px_rgba(0,0,0,0.5)] disabled:opacity-50 w-[130px]"
          >
            {spinning || inFreeSpins ? "..." : "SPIN"}
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

    {freeSpinCelebration && (
      <FreeSpinCelebration
        count={freeSpinCelebration.count}
        onDismiss={() => {
          setFreeSpinCelebration(null);
          if (pendingCelebrationRef.current) {
            setCelebration(pendingCelebrationRef.current);
            pendingCelebrationRef.current = null;
          }
        }}
      />
    )}

    {showLoadingScreen && (
      <LoadingScreen
        title="Shamrock Spin"
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

function PaytableModal({ config, onClose }: { config: ShamrockConfigResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-cabinet-gold/40 bg-gradient-to-b from-cabinet-green-light to-cabinet-green p-4 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-bold text-cabinet-gold">Paytable (× total bet)</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-lg text-white/80 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white/50">
              <th className="text-left font-normal">Combo</th>
              <th className="text-right font-normal">Base</th>
              <th className="text-right font-normal">Free spins</th>
            </tr>
          </thead>
          <tbody>
            {config.winRules.map((rule) => (
              <tr key={rule.id}>
                <td className="py-1">{WIN_RULE_LABELS[rule.id]}</td>
                <td className="py-1 text-right font-semibold">x{rule.basePayout}</td>
                <td className="py-1 text-right font-semibold text-amber-300">x{rule.freeSpinPayout}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 border-t border-white/20 pt-3 text-xs text-white/70">
          Shamrock Spin symbols are wild, substituting for Sevens and BARs. Numbered Shamrock Spin symbols also
          award free spins equal to the numbers shown (max 9 to start, 29 total).
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

/** The cream, beveled, rounded-square button style shared by ?/-/+/autoplay. */
function ctrlButtonClass(active = false): string {
  return `flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black/80 bg-gradient-to-b ${
    active ? "from-amber-200 to-amber-400" : "from-white to-neutral-200"
  } shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_3px_rgba(0,0,0,0.4)] hover:brightness-95 disabled:opacity-40`;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const points = direction === "left" ? "15,4 6,12 15,20" : "9,4 18,12 9,20";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <polygon points={points} fill="black" />
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

function AutoplayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2">
      <path d="M17 2 21 6 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12v-2a4 4 0 0 1 4-4h14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22 3 18 7 14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="12" y="16" fontSize="9" fontWeight="900" fill="black" textAnchor="middle" stroke="none">
        A
      </text>
    </svg>
  );
}
