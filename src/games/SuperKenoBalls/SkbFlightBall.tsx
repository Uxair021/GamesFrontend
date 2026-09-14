import { useEffect, useRef, type RefObject } from "react";

export const SKB_BALL_SIZE = 74;
export const SKB_BALL_GAP = 6;
export const SKB_BALL_PITCH = SKB_BALL_SIZE + SKB_BALL_GAP;
/** Fixed 2-across pile — skb-balls-fall is explicitly sized (in SuperKenoBallsGame.tsx) to match exactly. */
export const SKB_BALL_COLS = 2;

interface SkbFlightBallProps {
  n: number;
  /** Position among all revealed balls this round, oldest first (0 = first drawn). */
  index: number;
  matched: boolean;
  cabinetRef: RefObject<HTMLDivElement | null>;
  titlebarRef: RefObject<HTMLDivElement | null>;
  ballsFallRef: RefObject<HTMLDivElement | null>;
  fitScale: number;
}

/**
 * A single ball that travels across the titlebar (spinning, left to right)
 * and then falls straight down into its resting slot in skb-balls-fall —
 * one continuous element, not a handoff between two separate animations.
 *
 * Both containers (titlebar, balls-fall) are real siblings inside
 * .skb-cabinet, at arbitrary responsive positions, so the only way to make
 * one element travel convincingly between them is to actually measure their
 * live screen positions (getBoundingClientRect) and convert to coordinates
 * local to .skb-cabinet — which is what this does, once, the moment this
 * specific ball first mounts (key={n} in the parent guarantees that's
 * exactly once per ball, never re-triggered by later reveals).
 *
 * .skb-cabinet itself is scaled via CSS transform on phone-sized viewports
 * (see useFitScale in SuperKenoBallsGame.tsx) — screen-space measurements
 * are post-scale, but this element's own position is interpreted pre-scale
 * (it's a transformed child of the transformed cabinet), so every measured
 * delta is divided by fitScale to land back in the cabinet's local
 * coordinate space. Without that correction the flight path would be right
 * on desktop and wrong everywhere the cabinet is shrunk to fit.
 *
 * Piles 2-across (SKB_BALL_COLS) — skb-balls-fall is explicitly sized in
 * SuperKenoBallsGame.tsx (via inline style, from these same SKB_BALL_*
 * constants) to fit exactly that grid with no leftover space, so the
 * column count here is a fixed constant rather than something measured
 * from the container.
 */
export function SkbFlightBall({ n, index, matched, cabinetRef, titlebarRef, ballsFallRef, fitScale }: SkbFlightBallProps) {
  const ballRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ball = ballRef.current;
    const cabinet = cabinetRef.current;
    const titlebar = titlebarRef.current;
    const ballsFall = ballsFallRef.current;
    if (!ball || !cabinet || !titlebar || !ballsFall) return;

    const cabinetRect = cabinet.getBoundingClientRect();
    const titlebarRect = titlebar.getBoundingClientRect();
    const ballsFallRect = ballsFall.getBoundingClientRect();

    const toLocal = (x: number, y: number) => ({
      x: (x - cabinetRect.left) / fitScale,
      y: (y - cabinetRect.top) / fitScale,
    });

    const cols = SKB_BALL_COLS;

    // translate() moves this element's own top-left corner (it's
    // position:absolute; top:0; left:0 in CSS), so every target below is a
    // top-left coordinate, not a center — rotate() still pivots around the
    // ball's own center regardless, since that's the default transform-origin.
    const titlebarTopY = titlebarRect.top + titlebarRect.height / 2 - SKB_BALL_SIZE / 2;

    // Final resting slot: bottom-up pile, same "stones in a jar" placement
    // as Hexa Keno's port — the first ball drawn lands in the bottom row,
    // each later batch of `cols` stacks directly above it.
    const col = index % cols;
    const row = Math.floor(index / cols);
    const slotLeft = ballsFallRect.left + SKB_BALL_GAP + col * SKB_BALL_PITCH;
    const slotTop = ballsFallRect.bottom - SKB_BALL_GAP - SKB_BALL_SIZE - row * SKB_BALL_PITCH;

    const start = toLocal(titlebarRect.left - SKB_BALL_SIZE, titlebarTopY);
    // Travels to be directly above its own final column before descending —
    // no horizontal drift during the fall, just a straight drop.
    const arrive = toLocal(slotLeft, titlebarTopY);
    const end = toLocal(slotLeft, slotTop);

    ball.animate(
      [
        { transform: `translate(${start.x}px, ${start.y}px) rotate(0deg) scale(0.6)`, opacity: 0, offset: 0 },
        { transform: `translate(${start.x}px, ${start.y}px) rotate(0deg) scale(1)`, opacity: 1, offset: 0.06 },
        { transform: `translate(${arrive.x}px, ${arrive.y}px) rotate(720deg) scale(1)`, offset: 0.55 },
        { transform: `translate(${end.x}px, ${end.y}px) rotate(270deg) scale(1.08)`, offset: 0.85 },
        { transform: `translate(${end.x}px, ${end.y}px) rotate(360deg) scale(1)`, offset: 1 },
      ],
      { duration: 900, easing: "cubic-bezier(0.32, 0.6, 0.35, 1)", fill: "forwards" },
    );
    // Runs exactly once per ball — key={n} on the parent already guarantees
    // this component only mounts once for a given number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  return (
    <span ref={ballRef} className={`skb-feed-ball ${matched ? "skb-feed-ball--hit" : ""}`}>
      {n}
    </span>
  );
}
