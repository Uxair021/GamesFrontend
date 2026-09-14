import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../../context/AuthContext";
import { getSuperKenoBallsConfig, spinSuperKenoBalls, SuperKenoBallsConfigResponse, WinTierName } from "./api";
import { SKB_BALL_COLS, SKB_BALL_GAP, SKB_BALL_SIZE, SkbFlightBall } from "./SkbFlightBall";
import { WinCelebration } from "../shared/WinCelebration";
import { LoadingScreen } from "../shared/LoadingScreen";
import { useFitScale } from "../shared/useFitScale";
import * as sound from "../shared/sound/soundEngine";
import "./SuperKenoBalls.css";

const swalDarkStyle = {
  background: "#0e1b2e",
  color: "#f3f3f3",
  confirmButtonColor: "#38bdf8",
};

const DEFAULT_BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
const DEFAULT_POOL_SIZE = 80;
const DEFAULT_DRAWN_COUNT = 20;
const DEFAULT_MAX_PICKS = 10;
const DEFAULT_BONUS_MULTIPLIER = 4;
const ROW_SIZE = 10;
/** How long each drawn number takes to "land" during the reveal sequence. */
const REVEAL_STAGGER_MS = 180;
/** Spot count used by the "Quick pick" shortcut — a reasonable default, not a hard rule. */
const QUICK_PICK_COUNT = 10;

type CellState = "idle" | "picked" | "hit" | "miss";

function toRows(numbers: number[]) {
  return Array.from({ length: numbers.length / ROW_SIZE }, (_, r) => numbers.slice(r * ROW_SIZE, r * ROW_SIZE + ROW_SIZE));
}

export function SuperKenoBallsGame() {
  const navigate = useNavigate();
  const { user, setBalance } = useAuth();
  const balance = user?.balance ?? 0;

  // A fixed-resolution "virtual canvas" holding the cabinet AND the right rail
  // together (see .skb-stage in SuperKenoBalls.css), uniformly scaled up or down
  // to fill whatever screen this renders on — fillViewport keeps this active on
  // every device (not just narrow/mobile ones), so desktop, tablet, and phone
  // all render the exact same layout, just at a different zoom level.
  const stageRef = useRef<HTMLDivElement>(null);
  const fitScale = useFitScale([stageRef], { fillViewport: true, extraShrink: 0.97 });
  const cabinetRef = useRef<HTMLDivElement>(null);
  // Measured live so each drawn ball can travel from the titlebar into its
  // resting slot in skb-balls-fall — see SkbFlightBall.tsx.
  const titlebarRef = useRef<HTMLDivElement>(null);
  const ballsFallRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState<SuperKenoBallsConfigResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [betLevels, setBetLevels] = useState<number[]>(DEFAULT_BET_LEVELS);
  const [betIndex, setBetIndex] = useState(0);
  const bet = betLevels[betIndex] ?? betLevels[0];

  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [matched, setMatched] = useState<number[]>([]);
  const [bonusHit, setBonusHit] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ tier: WinTierName; winAmount: number } | null>(null);

  useEffect(() => {
    getSuperKenoBallsConfig()
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
  const bonusMultiplier = config?.bonusMultiplier ?? DEFAULT_BONUS_MULTIPLIER;
  const paytable = config?.paytable ?? [];

  const numbers = useMemo(() => Array.from({ length: poolSize }, (_, i) => i + 1), [poolSize]);
  const halves = useMemo(() => [numbers.slice(0, poolSize / 2), numbers.slice(poolSize / 2)], [numbers, poolSize]);

  const skbBallRows = Math.ceil(drawnCount / SKB_BALL_COLS);
  const skbTankWidth = SKB_BALL_COLS * SKB_BALL_SIZE + (SKB_BALL_COLS - 1) * SKB_BALL_GAP + 2 * SKB_BALL_GAP;
  const skbTankHeight = skbBallRows * SKB_BALL_SIZE + (skbBallRows - 1) * SKB_BALL_GAP + 2 * SKB_BALL_GAP;

  const pickedSet = useMemo(() => new Set(picks), [picks]);
  const revealedBalls = useMemo(() => drawn.slice(0, revealedCount), [drawn, revealedCount]);
  const drawnRevealedSet = useMemo(() => new Set(revealedBalls), [revealedBalls]);
  const matchedRevealedSet = useMemo(
    () => new Set(matched.filter((n) => drawnRevealedSet.has(n))),
    [matched, drawnRevealedSet]
  );

  const drawComplete = drawn.length > 0 && revealedCount >= drawn.length;
  const canPlay = ready && !spinning && picks.length > 0 && balance >= bet;

  // Compact hits/pays list for the rail — base payout only (the bonus-ball
  // multiplier is a surprise applied after the draw, not baked into the
  // preview). Drops the "0 matches" row and collapses consecutive
  // equal-payout rows into one.
  const displayPaytableRows = useMemo(() => {
    if (picks.length === 0) return [];
    const row = paytable[picks.length] ?? [];
    const rows = row
      .map((multiplier, matches) => ({ matches, payout: Math.round(multiplier * bet) }))
      .filter((r) => r.matches !== 0);

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
  }, [paytable, picks.length, bet, drawComplete, matched]);

  function cellState(n: number): CellState {
    if (drawnRevealedSet.has(n)) {
      return matchedRevealedSet.has(n) ? "hit" : "miss";
    }
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
      title: "How to play Super Keno Balls",
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.5;">
          <p>Pick up to ${maxPicks} numbers on the card (or use QUIK PICK).</p>
          <p>Hit PLAY GAME — ${drawnCount} numbers are drawn. The very last ball drawn is the <strong>Bonus Ball</strong>.</p>
          <p>If the Bonus Ball is one of your matches, your payout for that round is multiplied <strong>${bonusMultiplier}x</strong>.</p>
        </div>
      `,
    });
  }

  function handleWipeCard() {
    if (spinning) return;
    setPicks([]);
    setDrawn([]);
    setRevealedCount(0);
    setMatched([]);
    setBonusHit(false);
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
    setBonusHit(false);
    setPicks(chosen);
  }

  function changeBet(direction: 1 | -1) {
    if (spinning) return;
    setBetIndex((i) => Math.min(Math.max(i + direction, 0), betLevels.length - 1));
  }

  async function handlePlay() {
    if (!canPlay) return;
    sound.resumeAudio();
    setSpinning(true);
    setError(null);
    setDrawn([]);
    setRevealedCount(0);
    setMatched([]);
    setBonusHit(false);
    setLastWin(0);

    try {
      const result = await spinSuperKenoBalls(bet, picks);
      setBalance(result.balance);
      setDrawn(result.drawn);
      setMatched(result.matched);

      // Reveal the drawn numbers one at a time — the last one revealed is
      // always the Bonus Ball, so this doubles as the reveal for that too.
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

      setBonusHit(result.bonusHit);
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

  const showBonusHit = bonusHit && lastWin > 0;

  return (
    <>
      <div className="skb-gameArea">
        {celebration && (
          <WinCelebration
            tier={celebration.tier}
            winAmount={celebration.winAmount}
            onDismiss={() => setCelebration(null)}
          />
        )}

        <div
          className="skb-stage"
          ref={stageRef}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${fitScale})`,
            transformOrigin: "center center",
          }}
        >
        <div className="skb-cabinet" ref={cabinetRef}>
          <div className="skb-titlebar" ref={titlebarRef}>
            <span>SUPER KENO BALLS</span>
          </div>

          <div className="skb-ball-flight-layer">
            {revealedBalls.map((n, index) => (
              <SkbFlightBall
                key={n}
                n={n}
                index={index}
                matched={matched.includes(n)}
                cabinetRef={cabinetRef}
                titlebarRef={titlebarRef}
                ballsFallRef={ballsFallRef}
                fitScale={fitScale}
              />
            ))}
          </div>

          <div className="skb-body">
            <div className="skb-board-frame">
              <div className="skb-board">
                {toRows(halves[0]).map((row, r) => (
                  <div key={r} className="skb-row">
                    {row.map((n) => {
                      const state = cellState(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`skb-cell skb-cell--${state}`}
                          onClick={() => togglePick(n)}
                          disabled={spinning}
                          aria-pressed={pickedSet.has(n)}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="skb-bonus-banner">
                <span className={`skb-bonus-banner-line2 text-center ${showBonusHit ? "skb-bonus-banner-line2--won" : ""}`}>
                  {showBonusHit ? (
                    <>BONUS HIT &mdash; PAID {bonusMultiplier}X!</>
                  ) : (
                    <>
                      LAST BALL IS THE <strong>BONUS BALL</strong> <br /> PAYS {bonusMultiplier}X ON HIT
                    </>
                  )}
                </span>
              </div>

              <div className="skb-board">
                {toRows(halves[1]).map((row, r) => (
                  <div key={r} className="skb-row">
                    {row.map((n) => {
                      const state = cellState(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`skb-cell skb-cell--${state}`}
                          onClick={() => togglePick(n)}
                          disabled={spinning}
                          aria-pressed={pickedSet.has(n)}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="skb-balls-fall"
              ref={ballsFallRef}
              style={{ width: skbTankWidth, height: skbTankHeight }}
            >
              <div className="hex-bar">
                <div className="hex-bar__piece hex-bar__piece--left"></div>
                <div className="hex-bar__piece hex-bar__piece--right"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="skb-side-right">
          <div className="skb-rail-main">
            <div className="skb-rail-row2">
              <button className="skb-rail-btn" type="button" onClick={handleHelp}>
                HELP
              </button>
              <button className="skb-rail-btn" type="button" onClick={handleExit}>
                EXIT
              </button>
            </div>
            <div className="skb-rail-pinned">
              <div className="skb-rail-stacklist">
                <div className="skb-rail-stackrow">
                  <span className="skb-rail-stacklabel">CASH</span>
                  <span className="skb-rail-stackvalue">{balance.toFixed(2)}</span>
                </div>
                <div className="skb-rail-stackrow">
                  <span className="skb-rail-stacklabel skb-rail-stacklabel--bet">BET</span>
                  <span className="skb-rail-stackvalue">{bet.toFixed(2)}</span>
                </div>
                <div className="skb-rail-stackrow">
                  <span className="skb-rail-stacklabel">WINS</span>
                  <span className="skb-rail-stackvalue">{lastWin.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="skb-rail-row2">
              <button className="skb-rail-btn" type="button" onClick={handleWipeCard} disabled={spinning}>
                WIPE
                <br />
                CARD
              </button>
              <button
                className="skb-rail-btn"
                type="button"
                onClick={() => changeBet(1)}
                disabled={spinning || betIndex === betLevels.length - 1}
                aria-label="Increase bet"
              >
                <span className="skb-rail-btn-arrows">▲▲</span>
                <br />
                BET
              </button>
            </div>

            <div className="skb-rail-row2">
              <button className="skb-rail-btn" type="button" onClick={handleQuickPick} disabled={spinning}>
                QUIK
                <br />
                PICK
              </button>
              <button
                className="skb-rail-btn"
                type="button"
                onClick={() => changeBet(-1)}
                disabled={spinning || betIndex === 0}
                aria-label="Decrease bet"
              >
                <span className="skb-rail-btn-arrows">▼▼</span>
                <br />
                BET
              </button>
            </div>

            <div className="skb-rail-info">
              <div className="skb-rail-stackrow">
                <span className="skb-rail-stacklabel">PICKS</span>
                <span className="skb-rail-stackvalue">{picks.length}</span>
              </div>
              <div className="skb-rail-hits-header">
                <span>HITS</span>
                <span>PAYS</span>
              </div>
              <div className="skb-rail-hits-list">
                {displayPaytableRows.length === 0 ? (
                  <p className="skb-rail-hits-hint">Pick numbers to see payouts</p>
                ) : (
                  displayPaytableRows.map((row) => (
                    <div
                      key={row.matches}
                      className={`skb-rail-hits-row ${drawComplete && matched.length === row.matches ? "skb-rail-hits-row--active" : ""}`}
                    >
                      <span>{row.matches}</span>
                      <span>{row.payout.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="flex h-full flex-col justify-end">
            <button className="skb-play-button" type="button" onClick={handlePlay} disabled={!canPlay}>
              {spinning ? "..." : "PLAY GAME"}
            </button>
          </div>
        </div>
        </div>

        {!spinning && picks.length > 0 && balance < bet && <div className="skb-error">Not enough balance for this bet.</div>}
        {error && <div className="skb-error">{error}</div>}
      </div>

      {showLoadingScreen && (
        <LoadingScreen title="Super Keno Balls" ready={ready} onDone={() => setShowLoadingScreen(false)} />
      )}
    </>
  );
}
