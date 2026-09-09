import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Application } from "pixi.js";
import gsap from "gsap";
import { useAuth } from "../../context/AuthContext";
import {
  LifeOfLuxuryScene,
  GRID_WIDTH,
  GRID_HEIGHT,
  CELL_WIDTH,
  CELL_HEIGHT,
  COLUMN_GAP,
  PaylinePattern,
  WinHighlightGroup,
} from "./pixi/LifeOfLuxuryScene";
import { getLifeOfLuxuryConfig, spinRequest, Grid } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { FreeSpinIntro } from "./FreeSpinIntro";
import { FreeSpinOutro } from "./FreeSpinOutro";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

const LINE_COUNT = 15;
const DEFAULT_BET_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
const AUTOPLAY_GAP_MS = 700;
const FREE_SPIN_GAP_MS = 700;
/** Blink cadence for the active winning line's border+bridge (canvas) and its sidebar tick —
 * both driven off this same clock so they never drift out of sync. */
const WIN_BLINK_TOGGLE_MS = 320;
/** How long each winning line gets "on stage" before the cycle moves to the next one. Runs
 * forever (wrapping back to the first line) until the next spin cancels it — see stopWinCycle. */
const WIN_LINE_HOLD_MS = 1280;

/** Decorative payline dots strung along both sides of the reel frame — one color per line,
 * also used to color that line's win overlay drawn in Pixi (see LifeOfLuxuryScene.
 * buildWinGroups/drawActiveGroup) so a lit line's HTML dot and its on-grid line always match. */
const LINE_DOT_COLORS = [
  "#ef4444", "#3b82f6", "#eab308", "#22c55e", "#166534", "#dc2626", "#1d4ed8", "#a21caf",
  "#f97316", "#0d9488", "#7c3aed", "#06b6d4", "#ec4899", "#4338ca", "#84cc16",
];
/** The 15 fixed payline patterns — mirrors backEnd/src/games/LifeOfLuxury/config.ts's PAYLINES
 * exactly (row index 0=top/1=mid/2=bottom per reel). Used both for the "show all paylines"
 * reference overlay (see the LINES box below) and to lay out the sidebar dots below — the
 * server is what actually evaluates wins, this is display-only. */
const PAYLINES: PaylinePattern[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [2, 1, 0, 1, 2],
  [0, 1, 2, 1, 0],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
  [1, 0, 1, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

interface PaylineDotSpec {
  lineIndex: number;
  /** Rotation for the little connector tick. Left-side dots use the pattern's *start* — its
   * reel-1→reel-2 step (down/up/flat). Right-side dots use the pattern's *end* — its
   * reel-4→reel-5 step — since the right-side dot sits past the line's finish, not its start. */
  angleDeg: number;
}

const WILD_GIF_SRC = "/symbols/lifeOfLuxury/diamond.gif";
/** Durations (seconds) for one wild's flight: reel cell -> scale up -> center of screen -> hold
 * -> free-spin wild counter. Sequenced one wild at a time when more than one lands in a spin
 * (see playWildFlights). */
const WILD_FLIGHT_SCALE_UP_S = 0.4;
const WILD_FLIGHT_TO_CENTER_S = 0.6;
const WILD_FLIGHT_HOLD_S = 1.5;
const WILD_FLIGHT_TO_COUNTER_S = 0.5;
const WILD_FLIGHT_HIDE_S = 0.15;

/** Every WILD cell in a landed grid, left-to-right (reel), top-to-bottom (row) within a reel —
 * matches WILD_ALLOWED_REELS' natural order, and the order the user sees them settle in. */
function findWildPositions(grid: Grid): [number, number][] {
  const positions: [number, number][] = [];
  grid.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (symbol === "WILD") positions.push([reelIndex, rowIndex]);
    });
  });
  return positions;
}

const TICK_ANGLE_DEG = 30;

function tickAngle(from: number, to: number): number {
  return to > from ? TICK_ANGLE_DEG : to < from ? -TICK_ANGLE_DEG : 0;
}

/**
 * Groups all 15 lines by their reel-1 (leftmost) row — exactly 5 lines land in each of the 3
 * row groups (top/mid/bottom), since the pattern set is balanced. Per group: the first 3 lines
 * (by line number) become the left-side dots at that row's height, the remaining 2 become the
 * right-side dots at that SAME row height (not their own reel-5 row) — so left (3x3=9) + right
 * (2x3=6) accounts for all 15 lines exactly once, none shown twice.
 */
function buildPaylineDotGroups(): { left: PaylineDotSpec[][]; right: PaylineDotSpec[][] } {
  const left: PaylineDotSpec[][] = [[], [], []];
  const right: PaylineDotSpec[][] = [[], [], []];
  for (let row = 0; row < 3; row++) {
    const lineIndices = PAYLINES.map((_, i) => i).filter((i) => PAYLINES[i][0] === row);
    lineIndices.forEach((lineIndex, j) => {
      const pattern = PAYLINES[lineIndex];
      if (j < 3) left[row].push({ lineIndex, angleDeg: tickAngle(pattern[0], pattern[1]) });
      else right[row].push({ lineIndex, angleDeg: tickAngle(pattern[3], pattern[4]) });
    });
  }
  return { left, right };
}

const { left: LEFT_DOT_GROUPS, right: RIGHT_DOT_GROUPS } = buildPaylineDotGroups();

export function LifeOfLuxuryGame() {
  const { user, setBalance } = useAuth();
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LifeOfLuxuryScene | null>(null);
  const appRef = useRef<Application | null>(null);
  const gameCardRef = useRef<HTMLDivElement | null>(null);
  const fitScale = useFitScale([gameCardRef], { fillViewport: true });
  /** Fixed-position overlay (viewport coordinates, see playWildFlights) that flying wild GIFs are
   * mounted into directly — imperative DOM, not React state, since these are short-lived and
   * don't need to survive re-renders. */
  const wildFlightLayerRef = useRef<HTMLDivElement | null>(null);
  /** The free-spins header's wild-count badge — the on-screen destination every flying wild
   * animates toward (see playWildFlights). */
  const wildCounterRef = useRef<HTMLDivElement | null>(null);
  /** Just the number inside wildCounterRef — given its own little "pop" each time it bumps. */
  const wildCountTextRef = useRef<HTMLSpanElement | null>(null);

  const [ready, setReady] = useState(false);
  /** True for the whole duration a wild is flying to the counter — dims every symbol on the
   * reels (see the overlay in the Reels section below) and, since playWildFlights is awaited
   * before runSpin returns, also blocks the next free spin from starting underneath it. */
  const [dimReelsForWildFlight, setDimReelsForWildFlight] = useState(false);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"; winAmount: number } | null>(null);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [fast, setFast] = useState(false);
  const [paylinesVisible, setPaylinesVisible] = useState(true);
  /** The current spin's winning lines/scatter, cycled through one at a time (see the three
   * effects below) — infinitely, until stopWinCycle cancels it at the start of the next spin. */
  const [winGroups, setWinGroups] = useState<WinHighlightGroup[]>([]);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [winBlinkOn, setWinBlinkOn] = useState(true);

  const [freeSpins, setFreeSpins] = useState<{
    remaining: number;
    total: number;
    totalWin: number;
    lockedBetIndex: number;
  } | null>(null);
  const [freeSpinAward, setFreeSpinAward] = useState<number | null>(null);
  const [freeSpinsSummary, setFreeSpinsSummary] = useState<{
    totalWin: number;
    wildCount: number;
    multiplier: number;
    bonusWin: number;
    finalWin: number;
  } | null>(null);
  /** How many wilds have landed so far this free-spin round, as shown by the header badge —
   * bumped one at a time as each flying-wild animation lands (see playWildFlights), reset when a
   * new round starts. Purely cosmetic: the real payout multiplier comes from the server's
   * freeSpinRoundResult, never from this. */
  const [displayWildCount, setDisplayWildCount] = useState(0);

  const bet = betLevels[betIndex] ?? betLevels[0];
  const balance = user?.balance ?? 0;
  const inFreeSpins = freeSpins !== null;

  useEffect(() => {
    getLifeOfLuxuryConfig()
      .then((c) => setBetLevels(c.betLevels))
      .catch(() => {
        /* fall back to default bet levels already set */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const app = new Application();

    app
      .init({
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
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
        const scene = await LifeOfLuxuryScene.create(app);
        if (cancelled) {
          scene.destroy();
          return;
        }
        sceneRef.current = scene;
        // Shown by default on load — before any spin, so the 15 line patterns can be visually
        // checked against the reference diagram with no click needed. runSpin hides it again
        // once the player actually spins (see setPaylinesVisible(false) there).
        scene.setAllPaylinesVisible(false, PAYLINES, LINE_DOT_COLORS);
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
    };
  }, []);

  /** Cancels the infinite win-line cycle (blink + one-at-a-time rotation) and clears the canvas
   * highlight — called at the start of every spin so a fresh spin always starts from a clean
   * slate, no matter where the previous spin's cycle was mid-blink. */
  const stopWinCycle = useCallback(() => {
    setWinGroups([]);
    setActiveGroupIndex(0);
    setWinBlinkOn(true);
    sceneRef.current?.clearWinHighlights();
  }, []);

  /** Flies one landed wild from its reel cell to the free-spins wild counter: scales up in place,
   * moves to the center of the screen and holds there, then shrinks into the counter and bumps
   * it. Pure viewport-coordinate DOM/GSAP overlay (via wildFlightLayerRef), independent of the
   * Pixi canvas and of any CSS scale — getBoundingClientRect already reflects on-screen size. */
  const playOneWildFlight = useCallback((reel: number, row: number): Promise<void> => {
    return new Promise((resolve) => {
      const layer = wildFlightLayerRef.current;
      const canvasEl = canvasHostRef.current;
      const cardEl = gameCardRef.current;
      const counterEl = wildCounterRef.current;
      if (!layer || !canvasEl || !cardEl || !counterEl) {
        resolve();
        return;
      }

      const canvasRect = canvasEl.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const counterRect = counterEl.getBoundingClientRect();

      const fx = (reel * (CELL_WIDTH + COLUMN_GAP) + CELL_WIDTH / 2) / GRID_WIDTH;
      const fy = (row * CELL_HEIGHT + CELL_HEIGHT / 2) / GRID_HEIGHT;
      const startX = canvasRect.left + fx * canvasRect.width;
      const startY = canvasRect.top + fy * canvasRect.height;
      const centerX = cardRect.left + cardRect.width / 2;
      const centerY = cardRect.top + cardRect.height / 2;
      const destX = counterRect.left + counterRect.width / 2;
      const destY = counterRect.top + counterRect.height / 2;
      const size = Math.max(48, (CELL_WIDTH * canvasRect.width) / GRID_WIDTH);

      const img = document.createElement("img");
      img.src = WILD_GIF_SRC;
      img.alt = "";
      Object.assign(img.style, {
        position: "fixed",
        width: `${size}px`,
        height: `${size}px`,
        left: `${startX - size / 2}px`,
        top: `${startY - size / 2}px`,
        transformOrigin: "center center",
        pointerEvents: "none",
        zIndex: "9999",
        filter: "drop-shadow(0 0 16px rgba(125,211,252,0.85))",
      });
      layer.appendChild(img);

      gsap
        .timeline({
          onComplete: () => {
            img.remove();
            setDisplayWildCount((c) => c + 1);
            if (wildCountTextRef.current) {
              gsap.fromTo(wildCountTextRef.current, { scale: 1.7 }, { scale: 1, duration: 0.35, ease: "elastic.out(1, 0.6)" });
            }
            resolve();
          },
        })
        .to(img, { scale: 2, duration: WILD_FLIGHT_SCALE_UP_S, ease: "back.out(1.7)" })
        .to(img, { left: centerX - size / 2, top: centerY - size / 2, duration: WILD_FLIGHT_TO_CENTER_S, ease: "power2.inOut" })
        .to({}, { duration: WILD_FLIGHT_HOLD_S })
        .to(img, {
          left: destX - size / 2,
          top: destY - size / 2,
          scale: 0.6,
          duration: WILD_FLIGHT_TO_COUNTER_S,
          ease: "power1.in",
        })
        // Fully arrives at the counter (still visible) before hiding — a distinct "landed, then
        // gone" beat instead of fading away mid-flight.
        .to(img, { scale: 0.2, opacity: 0, duration: WILD_FLIGHT_HIDE_S, ease: "power1.in" });
    });
  }, []);

  /** Runs one wild's flight at a time, in landed order (left-to-right reel) — see
   * findWildPositions. Dims the reels for the whole sequence and, since callers await this
   * before runSpin's finally clears `spinning`, blocks the next spin from starting underneath
   * it — no-op (no dim, resolves immediately) when nothing landed. */
  const playWildFlights = useCallback(
    async (positions: [number, number][]) => {
      if (positions.length === 0) return;
      setDimReelsForWildFlight(true);
      try {
        for (const position of positions) {
          await playOneWildFlight(position[0], position[1]);
        }
      } finally {
        setDimReelsForWildFlight(false);
      }
    },
    [playOneWildFlight]
  );

  // Blink ticking: only runs while there's something to blink; resets whenever winGroups
  // changes (a fresh spin's groups, or stopWinCycle clearing them to []).
  useEffect(() => {
    if (winGroups.length === 0) return;
    const id = window.setInterval(() => setWinBlinkOn((v) => !v), WIN_BLINK_TOGGLE_MS);
    return () => window.clearInterval(id);
  }, [winGroups]);

  // Cycle advancing: only meaningful with more than one winning line/scatter to rotate through;
  // wraps back to the first forever (per the spec — infinite until the next spin cancels it).
  useEffect(() => {
    if (winGroups.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveGroupIndex((i) => (i + 1) % winGroups.length);
      setWinBlinkOn(true); // each line's turn always starts "on" (its real color), not mid-fade
    }, WIN_LINE_HOLD_MS);
    return () => window.clearInterval(id);
  }, [winGroups]);

  // Renders whichever group is currently active, in its real color or black — the single place
  // that actually touches the canvas for this feature, driven purely by the state above so the
  // canvas and the sidebar ticks (see PaylineDot below) blink off the exact same clock.
  useEffect(() => {
    sceneRef.current?.drawActiveGroup(winGroups[activeGroupIndex] ?? null, winBlinkOn);
  }, [winGroups, activeGroupIndex, winBlinkOn]);

  const runSpin = useCallback(
    async (isFreeSpin: boolean) => {
      if (!sceneRef.current || spinning) return;
      if (!isFreeSpin && (!user || user.balance < bet)) {
        setError("Insufficient balance");
        setAutoplay(false);
        return;
      }

      setError(null);
      setSpinning(true);
      setWinAmount(0);
      setFreeSpinsSummary(null);
      setPaylinesVisible(false);
      stopWinCycle();
      if (!sceneRef.current) return;

      try {
        const spinBet = isFreeSpin ? betLevels[freeSpins?.lockedBetIndex ?? betIndex] : bet;
        const result = await spinRequest(spinBet, isFreeSpin);
        await sceneRef.current.spin(result.grid, fast);

        setWinAmount(result.winAmount);
        setBalance(result.balance);

        if (result.evaluation.winningPositions.length > 0 || result.evaluation.scatter.triggered) {
          const groups = sceneRef.current.buildWinGroups(result.evaluation.lineWins, result.evaluation.scatter.positions, LINE_DOT_COLORS);
          setWinGroups(groups);
        }

        if (result.tier) {
          setCelebration({ tier: result.tier, winAmount: result.winAmount });
        }

        if (isFreeSpin) {
          const wildPositions = findWildPositions(result.grid);
          if (result.freeSpinRoundResult) {
            // Round just ended (server-authoritative) — let this spin's own wilds finish flying
            // to the counter before the outro covers the screen with the final multiplied total.
            await playWildFlights(wildPositions);
            const r = result.freeSpinRoundResult;
            setFreeSpinsSummary({ totalWin: r.totalWin, wildCount: r.wildCount, multiplier: r.multiplier, bonusWin: r.bonusWin, finalWin: r.finalWin });
            setFreeSpins(null);
          } else {
            // No retriggering — a coin during an active free-spins round only ever adds to
            // totalWin via its cash scatter prize (already folded into result.winAmount), never
            // more free spins (the server never sets freeSpinsAwarded on a free spin).
            setFreeSpins((prev) => (prev ? { ...prev, remaining: prev.remaining - 1, totalWin: prev.totalWin + result.winAmount } : prev));
            // Awaited (not fire-and-forget) — spinning stays true for the whole flight, so the
            // next free spin can't start behind it, and the dim overlay below actually applies.
            await playWildFlights(wildPositions);
          }
        } else if (result.freeSpinsAwarded) {
          setFreeSpinAward(result.freeSpinsAwarded);
          setDisplayWildCount(0);
          setFreeSpins({
            remaining: result.freeSpinsAwarded,
            total: result.freeSpinsAwarded,
            totalWin: 0,
            lockedBetIndex: betIndex,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Spin failed";
        setError(message);
        if (isFreeSpin) setFreeSpins(null);
        else setAutoplay(false);
      } finally {
        setSpinning(false);
      }
    },
    [bet, betIndex, betLevels, freeSpins, spinning, user, setBalance, fast, stopWinCycle, playWildFlights]
  );

  const startManualSpin = useCallback(() => {
    if (!sceneRef.current || spinning || freeSpins) return;
    runSpin(false);
  }, [freeSpins, runSpin, spinning]);

  useEffect(() => {
    if (!autoplay || spinning || !ready || freeSpins || celebration) return;
    const id = window.setTimeout(() => runSpin(false), AUTOPLAY_GAP_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, spinning, ready, freeSpins, celebration, runSpin]);

  // Round-ending is handled synchronously inside runSpin (the server's freeSpinRoundResult is
  // authoritative on when the round is over), so freeSpins here is only ever seen with spins
  // still remaining — this just paces the next one.
  useEffect(() => {
    if (!freeSpins || spinning || !ready || celebration || freeSpinAward !== null) return;
    const id = window.setTimeout(() => runSpin(true), FREE_SPIN_GAP_MS);
    return () => window.clearTimeout(id);
  }, [freeSpins, spinning, ready, celebration, freeSpinAward, runSpin]);

  const changeBet = (direction: 1 | -1) => {
    if (spinning || autoplay || freeSpins) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  };

  const togglePaylines = () => {
    if (!sceneRef.current || spinning) return;
    const next = !paylinesVisible;
    setPaylinesVisible(next);
    sceneRef.current.setAllPaylinesVisible(next, PAYLINES, LINE_DOT_COLORS);
  };

  const scaledWidth = CANVAS_WIDTH * fitScale;
  const scaledHeight = CANVAS_HEIGHT * fitScale;
  const spinDisabled = !ready || spinning || inFreeSpins;
  /** Whichever line's sidebar dot should blink right now, in step with the canvas — null while
   * nothing's cycling, or while the scatter (no sidebar dot) is the active group. */
  const activeLineNumber = winGroups[activeGroupIndex]?.lineNumber ?? null;

  return (
    <>
      <div className="relative overflow-hidden" style={{ width: scaledWidth, height: scaledHeight }}>
        <div
          ref={gameCardRef}
          className="relative flex flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            background: "radial-gradient(ellipse at center, #0f2f4f 0%, #04101f 75%)",
            transform: fitScale !== 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {/* Header */}
          <div className="relative z-10 flex w-full items-center justify-between px-10 pt-6">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-white text-black hover:bg-white"
                aria-label="Home"
              >
                <HomeIcon size={28} />
              </Link>
              <div className="flex items-center gap-2 rounded-full border-2 border-amber-300 bg-black/70 px-5 py-2 shadow-[0_0_12px_rgba(0,0,0,0.6)]">
                <CoinIcon size={30} />
                <span className="text-2xl font-black text-white">{balance.toFixed(2)}</span>
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
              <div
                className="relative flex items-center justify-center px-16 py-3"
                style={{
                  background: "linear-gradient(180deg,#fff2b0 0%,#f2c14e 35%,#c8890f 70%,#8a5a00 100%)",
                  clipPath:
                    "polygon(4% 0%, 96% 0%, 100% 30%, 92% 50%, 100% 70%, 96% 100%, 4% 100%, 8% 70%, 0% 50%, 8% 30%)",
                  boxShadow: "0 6px 14px rgba(0,0,0,0.55)",
                }}
              >
                <span
                  className="text-4xl font-black italic tracking-wide"
                  style={{ color: "#1a2a52", textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
                >
                  LIFE OF LUXURY
                </span>
              </div>
              <span
                className="-mt-1 text-2xl font-black italic tracking-widest"
                style={{ color: "#f2c14e", textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}
              >
                GOOD LUCK
              </span>
            </div>

            {inFreeSpins ? (
              <div className="flex items-center gap-3 rounded-full bg-black/80 border-2 border-amber-400 px-5 py-2 text-amber-300 font-black text-lg tracking-wide">
                <span>FREE SPINS</span>
                <span className="text-white">
                  {freeSpins!.remaining} left (of {freeSpins!.total})
                </span>
                <span className="text-lime-300">Win: {freeSpins!.totalWin.toFixed(2)}</span>
                <div ref={wildCounterRef} className="flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-950/80 px-2.5 py-1">
                  <img src="/symbols/lifeOfLuxury/daimond.png" alt="Wild" className="h-6 w-6 rounded-full object-cover" />
                  <span ref={wildCountTextRef} className="inline-block text-sky-200">
                    x{displayWildCount}
                  </span>
                </div>
              </div>
            ) : (
              <button
                aria-label="Menu"
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-white text-black hover:bg-white"
              >
                <MenuIcon size={28} />
              </button>
            )}
          </div>

          {/* Reels */}
          <div className="relative z-10 flex flex-1 items-center justify-center px-10">
            <div
              className="relative flex items-stretch rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
              style={
                inFreeSpins
                  ? {
                      backgroundImage: "url(/symbols/lifeOfLuxury/reelBg.png)",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { backgroundColor: "#ffffff" }
              }
            >
              {/* Left payline dots — 3 per row, grouped by each line's reel-1 row */}
              <div className="absolute right-full top-0 flex h-full flex-col justify-between py-2">
                {LEFT_DOT_GROUPS.map((group, row) => (
                  <div key={row} className="flex flex-col gap-2">
                    {group.map(({ lineIndex, angleDeg }) => (
                      <PaylineDot
                        key={lineIndex}
                        color={LINE_DOT_COLORS[lineIndex]}
                        side="left"
                        value={bet}
                        angleDeg={angleDeg}
                        blinking={lineIndex + 1 === activeLineNumber}
                        blinkOn={winBlinkOn}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* Right payline dots — 2 per row, same row grouping as the left side */}
              <div className="absolute left-full top-0 flex h-full flex-col justify-between py-2">
                {RIGHT_DOT_GROUPS.map((group, row) => (
                  <div key={row} className="flex flex-col gap-2">
                    {group.map(({ lineIndex, angleDeg }) => (
                      <PaylineDot
                        key={lineIndex}
                        color={LINE_DOT_COLORS[lineIndex]}
                        side="right"
                        value={bet}
                        angleDeg={angleDeg}
                        blinking={lineIndex + 1 === activeLineNumber}
                        blinkOn={winBlinkOn}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div ref={canvasHostRef} style={{ width: GRID_WIDTH, height: GRID_HEIGHT }} />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-sky-900/60">Loading reels...</div>
              )}
              {/* Covers every symbol while a wild is flying to the counter (see
                  dimReelsForWildFlight/playWildFlights) so nothing spins behind it and the eye
                  stays on the animation. */}
              {dimReelsForWildFlight && (
                <div className="pointer-events-none absolute inset-0 z-20 bg-black/75 transition-opacity duration-200" />
              )}
            </div>
          </div>

          {error && (
            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 mx-3 rounded bg-red-900/60 px-10 py-5 text-4xl text-center text-red-100">
              {error}
            </div>
          )}

          {/* Footer controls */}
          <div className="relative z-10 flex w-full items-center justify-between gap-4 border-t border-white/10 bg-gradient-to-b from-emerald-950 via-black to-black px-6 py-4">
            <div className="flex items-center gap-3">
              <CtrlButton ariaLabel="Info" className="h-[64px] w-[64px]" onClick={() => {}}>
                <InfoIcon />
              </CtrlButton>
              <button
                onClick={togglePaylines}
                disabled={spinning}
                aria-label={paylinesVisible ? "Hide paylines" : "Show paylines"}
                aria-pressed={paylinesVisible}
                className={`flex flex-col items-center justify-center rounded-lg border-2 px-4 py-1.5 leading-tight transition-colors disabled:opacity-50 ${
                  paylinesVisible ? "border-amber-300 bg-amber-500/20" : "border-amber-400 bg-black/70 hover:bg-black/50"
                }`}
              >
                <span className="text-3xl font-black text-white">{LINE_COUNT}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-amber-300">Lines</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <CtrlButton onClick={() => changeBet(-1)} disabled={betIndex === 0 || spinning || autoplay || inFreeSpins} ariaLabel="Decrease bet" className="h-[56px] w-[56px]">
                <MinusIcon />
              </CtrlButton>
              <div className="flex flex-col items-center leading-tight">
                <span className="text-sm font-bold uppercase tracking-wide text-amber-300">Bet</span>
                <span className="text-2xl font-bold text-white">{bet.toFixed(2)}</span>
              </div>
              <CtrlButton onClick={() => changeBet(1)} disabled={betIndex === betLevels.length - 1 || spinning || autoplay || inFreeSpins} ariaLabel="Increase bet" className="h-[56px] w-[56px]">
                <PlusIcon />
              </CtrlButton>
            </div>

            <div className="flex min-w-[260px] flex-1 max-w-md flex-col items-center justify-center rounded-lg border border-black bg-black/70 py-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
              <span className="text-5xl font-black text-amber-300">{winAmount.toFixed(2)}</span>
              <span className="text-lg font-bold uppercase tracking-wide text-white">Win</span>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => setAutoplay((v) => !v)}
                disabled={inFreeSpins}
                aria-label="Autoplay"
                className={`relative flex h-[90px] w-[90px] items-center justify-center rounded-full border-2 text-lg font-black tracking-wide transition-all duration-150 ease-out active:translate-y-[2px] disabled:opacity-40 disabled:active:translate-y-0 ${
                  autoplay
                    ? "border-amber-300 bg-amber-500/30 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.55)]"
                    : "border-white/15 bg-white/[0.06] text-white/80 hover:border-amber-300/40 hover:bg-white/[0.1]"
                }`}
              >
                AUTO
              </button>

              <button
                onClick={() => setFast((v) => !v)}
                aria-label="Fast spin"
                className={`relative flex h-[80px] w-[80px] items-center justify-center rounded-full border-2 border-red-950 bg-gradient-to-b from-red-500 to-red-800 text-sm font-black italic text-white shadow-[0_4px_0_#450a0a] transition-transform duration-100 active:translate-y-[2px] ${
                  fast ? "ring-4 ring-red-300" : ""
                }`}
              >
                FAST
              </button>

              <button
                onClick={startManualSpin}
                disabled={spinDisabled}
                className="relative flex h-[130px] w-[190px] flex-col items-center justify-center rounded-3xl border-2 border-emerald-950 bg-gradient-to-b from-lime-300 via-green-500 to-emerald-700 font-black italic tracking-wide text-white transition-transform duration-100 ease-out active:translate-y-[3px] disabled:opacity-60 disabled:active:translate-y-0"
                style={{
                  boxShadow: "0 5px 0 #052e16, 0 9px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.6), inset 0 -5px 8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="pointer-events-none absolute inset-x-[12%] top-[8%] h-[28%] rounded-full bg-white/40" style={{ filter: "blur(3px)" }} />
                <span className="text-5xl">{spinning ? "..." : "SPIN"}</span>
                <span className="text-xs font-bold not-italic tracking-wide text-emerald-100">HOLD FOR AUTOSPIN</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Flying wild-to-counter GIFs are mounted here imperatively (see playOneWildFlight) — a
          plain fixed overlay outside the scaled/transformed game card so getBoundingClientRect
          viewport coordinates apply directly, with no containing-block transform to fight. */}
      <div ref={wildFlightLayerRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9998 }} />

      {celebration && (
        <WinCelebration tier={celebration.tier} winAmount={celebration.winAmount} onDismiss={() => setCelebration(null)} />
      )}

      {freeSpinAward !== null && <FreeSpinIntro onDismiss={() => setFreeSpinAward(null)} />}

      {freeSpinsSummary && (
        <FreeSpinOutro
          totalWin={freeSpinsSummary.totalWin}
          wildCount={freeSpinsSummary.wildCount}
          multiplier={freeSpinsSummary.multiplier}
          finalWin={freeSpinsSummary.finalWin}
          onDismiss={() => setFreeSpinsSummary(null)}
        />
      )}

      {showLoadingScreen && (
        <LoadingScreen title="Life of Luxury" ready={ready} onDone={() => setShowLoadingScreen(false)} />
      )}
    </>
  );
}

function PaylineDot({
  color,
  side,
  value,
  angleDeg,
  blinking = false,
  blinkOn = true,
}: {
  color: string;
  side: "left" | "right";
  value: number;
  angleDeg: number;
  /** True while this line is the currently-active one in the win cycle (see LifeOfLuxuryGame's
   * winGroups/activeGroupIndex) — makes the tick blink black/color in step with its canvas
   * border+bridge, off the same winBlinkOn clock. */
  blinking?: boolean;
  blinkOn?: boolean;
}) {
  const tickColor = blinking && !blinkOn ? "#000000" : color;
  return (
    <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-[18px] font-black invert shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        style={{ backgroundColor: color, border: "2px solid rgba(255,255,255,0.8)" }}
      >
        {value.toFixed(2)}
      </span>
      <span className="h-[8px] w-10" style={{ backgroundColor: tickColor, transform: `rotate(${angleDeg}deg)` }} />
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

function MenuIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <line x1="4" y1="7" x2="20" y2="7" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <line x1="4" y1="17" x2="20" y2="17" strokeLinecap="round" />
    </svg>
  );
}

function CoinIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#92400e" strokeWidth="1.5" />
      <text x="12" y="16.5" fontSize="12" fontWeight="bold" fill="#92400e" textAnchor="middle">
        $
      </text>
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

function MinusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <rect x="4" y="10.5" width="16" height="3" rx="1.5" fill="black" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <rect x="4" y="10.5" width="16" height="3" rx="1.5" fill="black" />
      <rect x="10.5" y="4" width="3" height="16" rx="1.5" fill="black" />
    </svg>
  );
}

function CtrlButton({
  onClick,
  disabled = false,
  ariaLabel,
  className = "",
  children,
}: {
  onClick: () => void;
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
      className={`relative flex items-center justify-center rounded-full border-2 border-black/70 bg-gradient-to-b from-white via-neutral-100 to-neutral-300 transition-transform duration-100 ease-out hover:brightness-105 active:translate-y-[3px] disabled:opacity-40 disabled:active:translate-y-0 disabled:pointer-events-none ${className}`}
      style={{
        boxShadow: "0 4px 0 #0a0a0a, 0 7px 10px rgba(255,255,255,0.9), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -4px 5px rgba(0,0,0,0.22)",
      }}
    >
      <span className="pointer-events-none absolute inset-x-[16%] top-[9%] h-[36%] rounded-full bg-white/55" style={{ filter: "blur(2px)" }} />
      {children}
    </button>
  );
}
