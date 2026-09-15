import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../../context/AuthContext";
import { getHexaKenoConfig, spinHexaKeno, HexaKenoConfigResponse, WinTierName } from "./api";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";
import "./HexaKeno.css";

const swalDarkStyle = {
  background: "#1a1035",
  color: "#f3f3f3",
  confirmButtonColor: "#ff9f1c",
};

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
const DEFAULT_POOL_SIZE = 80;
const DEFAULT_DRAWN_COUNT = 20;
const DEFAULT_MAX_PICKS = 10;

const COL_COUNT = 10;
/** Spelled out top-to-bottom along both edges of the board as decorative framing. */
const BOARD_LETTERS = ["H", "E", "X", "A", "K", "E", "N", "O"];
const BOARD_LETTERS_UP = ["H", "E", "X", "A"];
const BOARD_LETTERS_DOWN = ["K", "E", "N", "O"];
/** How long each drawn number takes to "land" during the reveal sequence. */
const REVEAL_STAGGER_MS = 180;
// Matches .keno-draw-feed-balls' fixed grid-template-columns and each
// .keno-feed-ball's own size + gap — used to compute where each ball must
// travel from so every one appears to fall from the same real point (the
// port image's notch, top-right) instead of a fixed offset that only looks
// right for whichever slot happened to be used when it was tuned.
const BALL_GRID_COLS = 3;
const BALL_CELL_PITCH = 78;
const BALL_FALL_EXTRA_X = 20;
const BALL_FALL_EXTRA_Y = 30;
/** Spot count used by the "Quick pick" shortcut — a reasonable default, not a hard rule. */
const QUICK_PICK_COUNT = 10;

type CellState = "idle" | "picked" | "hit" | "miss";

export function HexaKenoGame() {
  const navigate = useNavigate();
  const { user, setBalance } = useAuth();
  const balance = user?.balance ?? 0;

  // A fixed 1600x900 "virtual canvas" (see HexaKeno.css), uniformly scaled up or
  // down to fill whatever screen this renders on — fillViewport keeps this
  // active on every device (not just narrow/mobile ones), so desktop, tablet,
  // and phone all render the exact same layout, just at a different zoom level.
  const tableRef = useRef<HTMLDivElement>(null);
  const fitScale = useFitScale([tableRef], { fillViewport: true, extraShrink: 0.97 });

  const [config, setConfig] = useState<HexaKenoConfigResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const bet = betLevels[betIndex] ?? betLevels[0];

  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [matched, setMatched] = useState<number[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ tier: WinTierName; winAmount: number } | null>(null);

  useEffect(() => {
    getHexaKenoConfig()
      .then((c) => {
        setConfig(c);
        setBetLevels(c.betLevels);
      })
      .catch(() => {
        /* fall back to defaults already set */
      })
      .finally(() => setReady(true));
  }, []);

  const poolSize = config?.poolSize ?? DEFAULT_POOL_SIZE;
  const drawnCount = config?.drawnCount ?? DEFAULT_DRAWN_COUNT;
  const maxPicks = config?.maxPicks ?? DEFAULT_MAX_PICKS;
  const paytable = config?.paytable ?? [];
  const ballGridRows = Math.ceil(drawnCount / BALL_GRID_COLS);

  const numbers = useMemo(() => Array.from({ length: poolSize }, (_, i) => i + 1), [poolSize]);
  const columns = useMemo(
    () =>
      Array.from({ length: COL_COUNT }, (_, c) =>
        Array.from({ length: poolSize / COL_COUNT }, (_, r) => c + 1 + r * COL_COUNT)
      ),
    [poolSize]
  );

  const pickedSet = useMemo(() => new Set(picks), [picks]);
  const revealedBalls = useMemo(() => drawn.slice(0, revealedCount), [drawn, revealedCount]);
  const drawnRevealedSet = useMemo(() => new Set(revealedBalls), [revealedBalls]);
  const matchedRevealedSet = useMemo(
    () => new Set(matched.filter((n) => drawnRevealedSet.has(n))),
    [matched, drawnRevealedSet]
  );

  const drawComplete = drawn.length > 0 && revealedCount >= drawn.length;
  const canPlay = ready && !spinning && picks.length > 0 && balance >= bet;

  // Live paytable for however many spots are currently picked — every possible
  // match count from 0 up to picks.length, and what it's actually worth at the
  // current bet, so the payout is never a mystery before hitting PLAY.
  const paytableRows = useMemo(() => {
    if (picks.length === 0) return [];
    const row = paytable[picks.length] ?? [];
    return row.map((multiplier, matches) => ({ matches, multiplier, payout: Math.round(multiplier * bet) }));
  }, [paytable, picks.length, bet]);

  // Drops the "0 matches" row (never informative) and collapses any run of
  // consecutive equal-payout rows (almost always a streak of zeros at the
  // low end) into a single row, so the list doesn't repeat "0" five times.
  const displayPaytableRows = useMemo(() => {
    const rows = paytableRows.filter((row) => row.matches !== 0);
    const collapsed: { matches: number; payout: number }[] = [];

    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1].payout === rows[i].payout) j++;

      if (i === j) {
        collapsed.push(rows[i]);
      } else {
        const activeInRange = drawComplete && matched.length >= rows[i].matches && matched.length <= rows[j].matches;
        collapsed.push({ matches: activeInRange ? matched.length : rows[i].matches, payout: rows[i].payout });
      }
      i = j + 1;
    }

    return collapsed;
  }, [paytableRows, drawComplete, matched]);

  function cellState(n: number): CellState {
    if (drawnRevealedSet.has(n)) return matchedRevealedSet.has(n) ? "hit" : "miss";
    return pickedSet.has(n) ? "picked" : "idle";
  }

  function togglePick(n: number) {
    if (spinning) return;
    setPicks((current) => {
      if (current.includes(n)) return current.filter((p) => p !== n);
      if (current.length >= maxPicks) return current;
      return [...current, n];
    });
  }

  async function handleExit() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    navigate("/");
  }

  function handleHelp() {
    Swal.fire({
      ...swalDarkStyle,
      title: "How to play Hexa Keno",
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.5;">
          <p>Pick up to ${maxPicks} numbers on the hex board (or use QUICK PICK).</p>
          <p>Hit PLAY GAME — ${drawnCount} numbers are drawn, and the paytable on the left shows what each match count pays for your current bet.</p>
          <p>Use MAX BET to jump straight to the highest bet, or the -/+ steppers to fine-tune it.</p>
        </div>
      `,
    });
  }

  function handleClear() {
    if (spinning) return;
    setPicks([]);
    setDrawn([]);
    setRevealedCount(0);
    setMatched([]);
  }

  function handleQuickPick() {
    if (spinning) return;
    const pool = [...numbers];
    const chosen: number[] = [];
    for (let i = 0; i < Math.min(QUICK_PICK_COUNT, maxPicks); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool[idx]);
      pool.splice(idx, 1);
    }
    setDrawn([]);
    setRevealedCount(0);
    setMatched([]);
    setPicks(chosen);
  }

  function changeBet(direction: 1 | -1) {
    if (spinning) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  }

  function maxOutBet() {
    if (spinning) return;
    setBetIndex(betLevels.length - 1);
  }

  async function handlePlay() {
    if (!canPlay) return;
    sound.resumeAudio();
    setSpinning(true);
    setError(null);
    setDrawn([]);
    setRevealedCount(0);
    setMatched([]);
    setLastWin(0);

    try {
      const result = await spinHexaKeno(bet, picks);
      setBalance(result.balance);
      setDrawn(result.drawn);
      setMatched(result.matched);

      // Reveal the drawn numbers one at a time instead of all at once — this
      // is the actual "draw" moment, not just a number lookup.
      await new Promise<void>((resolve) => {
        let i = 0;
        const id = setInterval(() => {
          i += 1;
          setRevealedCount(i);
          if (i >= result.drawn.length) {
            clearInterval(id);
            resolve();
          }
        }, REVEAL_STAGGER_MS);
      });

      setLastWin(result.winAmount);
      if (result.tier) {
        sound.playCelebration(result.tier);
        setCelebration({ tier: result.tier, winAmount: result.winAmount });
      } else if (result.winAmount > 0) {
        sound.playWinChime();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draw failed");
    } finally {
      setSpinning(false);
    }
  }

  return (
    <>
      <div className="keno-gameArea">
        {celebration && (
          <WinCelebration
            tier={celebration.tier}
            winAmount={celebration.winAmount}
            onDismiss={() => setCelebration(null)}
          />
        )}

        <div
          className="keno-table"
          ref={tableRef}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${fitScale})`,
            transformOrigin: "center center",
          }}
        >
          <div className="keno-side-left">
            <div className="keno-draw-feed">
              <div className="keno-draw-feed-balls">
                {revealedBalls.length === 0 ? (
                  <span className="keno-draw-feed-empty me-[32px]"></span>
                ) : (
                  revealedBalls.map((n, i) => {
                    const col = i % BALL_GRID_COLS;
                    const row = Math.floor(i / BALL_GRID_COLS);
                    const fallX = (BALL_GRID_COLS - 1 - col) * BALL_CELL_PITCH + BALL_FALL_EXTRA_X;
                    const fallY = -((row + 1) * BALL_CELL_PITCH + BALL_FALL_EXTRA_Y);
                    return (
                      <span
                        key={n}
                        className={`keno-feed-ball ${matched.includes(n) ? "keno-feed-ball--hit" : ""}`}
                        style={
                          {
                            "--fall-x": `${fallX}px`,
                            "--fall-y": `${fallY}px`,
                            gridRow: ballGridRows - row,
                            gridColumn: col + 1,
                          } as React.CSSProperties
                        }
                      >
                        {n}
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            <div className="keno-paytable">
              <div className="keno-paytable-header">
                <span>HIT</span>
                <span>PAYS</span>
              </div>
              <div className="keno-paytable-rows">
                {paytableRows.length === 0 ? (
                  <p className="keno-paytable-hint">Pick numbers to see payouts</p>
                ) : (
                  displayPaytableRows.map((row) => (
                    <div
                      key={row.matches}
                      className={`keno-paytable-row ${drawComplete && matched.length === row.matches ? "keno-paytable-row--active" : ""}`}
                    >
                      <span>{row.matches}</span>
                      <span>{row.payout.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-black text-center rounded-xl border border-white/20 py-3 text-white/50">
              <h3 className="text-3xl font-bold">PICKS {maxPicks}</h3>
            </div>
          </div>

          <div className="keno-board-wrap">
            <div className="keno-board-letters keno-board-letters--left" aria-hidden="true">
              {BOARD_LETTERS.map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            <div className="keno-board-letters keno-board-letters--UP" aria-hidden="true">
              {BOARD_LETTERS_UP.map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            <div className="keno-board-letters keno-board-letters--DOWN" aria-hidden="true">
              {BOARD_LETTERS_DOWN.map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>

            <div className="keno-board">
              {columns.map((col, c) => (
                <div key={c} className={`keno-col ${c % 2 === 0 ? "keno-col--offset" : ""}`}>
                  {col.map((n) => {
                    const state = cellState(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`keno-cell keno-cell--${state}`}
                        onClick={() => togglePick(n)}
                        disabled={spinning}
                        aria-pressed={pickedSet.has(n)}
                      >
                        <span className="z-10">{n}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="keno-board-letters keno-board-letters--right" aria-hidden="true">
              {BOARD_LETTERS.map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>

            <div className="keno-board-actions flex justify-between items-stretch gap-2 mt-4">
              <button className="keno-action-btn w-[10%] items-stretch" type="button" onClick={handleClear} disabled={spinning}>
                CLEAR CARD
              </button>
              <div className="w-[75%] bg-black text-center rounded-xl border border-white/20 py-3 text-yellow-300/70 uppercase text-xl font-bold tracking-wider px-4 py-6 shadow-lg shadow-yellow-500/50">
                Select Max {maxPicks} Numbers Choose a new card
              </div>
              <button className="keno-action-btn w-[10%]" type="button" onClick={handleQuickPick} disabled={spinning}>
                QUICK PICK
              </button>
            </div>
          </div>

          <div className="keno-side-right">
            <div className="keno-rail-topbtns">
              <button className="keno-oval-btn" type="button" onClick={handleExit}>
                EXIT
              </button>
              <button className="keno-oval-btn" type="button" onClick={handleHelp}>
                HELP
              </button>
            </div>

            <div className="keno-rail-readout">
              <span className="keno-rail-readout-label">CREDIT</span>
              <span className="keno-rail-readout-value">{balance.toFixed(2)}</span>
            </div>

            <div className="keno-rail-readout">
              <span className="keno-rail-readout-label">WINS</span>
              <span className="keno-rail-readout-value">{lastWin.toFixed(2)}</span>
            </div>

            <div className="keno-rail-picks">
              <span className="keno-hud-tiny-label">PICKS</span>
              <span className="keno-hud-value">
                {picks.length}/{maxPicks}
              </span>
            </div>

            <button className="keno-maxbet-btn" type="button" onClick={maxOutBet} disabled={spinning}>
              MAX BET
            </button>

            <div className="keno-rail-bet-group">
              <button
                className="keno-bet-trapezoid keno-bet-trapezoid--minus"
                type="button"
                onClick={() => changeBet(-1)}
                disabled={spinning || betIndex === 0}
                aria-label="Decrease bet"
              >
                &minus;
              </button>
              <span className="keno-rail-bet-value">{bet.toFixed(2)}</span>
              <button
                className="keno-bet-trapezoid keno-bet-trapezoid--plus"
                type="button"
                onClick={() => changeBet(1)}
                disabled={spinning || betIndex === betLevels.length - 1}
                aria-label="Increase bet"
              >
                +
              </button>
            </div>

            <button className="keno-play-button" type="button" onClick={handlePlay} disabled={!canPlay}>
              {spinning ? "..." : "PLAY GAME"}
            </button>
          </div>
        </div>

        {!spinning && picks.length > 0 && balance < bet && <div className="keno-error">Not enough balance for this bet.</div>}
        {error && <div className="keno-error">{error}</div>}
      </div>

      {showLoadingScreen && (
        <LoadingScreen title="Hexa Keno" ready={ready} onDone={() => setShowLoadingScreen(false)} />
      )}
    </>
  );
}
