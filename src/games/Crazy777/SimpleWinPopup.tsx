import { useEffect, useRef, useState, CSSProperties, RefObject } from "react";

interface SimpleWinPopupProps {
  winAmount: number;
  targetRef: RefObject<HTMLElement | null>;
  onComplete: () => void;
}

const COUNT_UP_MS = 700;
const ENTER_MS = 350;
const HOLD_MS = 2000;
const DROP_MS = 450;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Phase = "entering" | "holding" | "dropping";

const ENTER_STYLE: CSSProperties = {
  transform: "translate(0px, 0px) scale(0.25)",
  opacity: 0,
  transition: `transform ${ENTER_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${ENTER_MS}ms ease-out`,
};

/**
 * Crazy 777 only: for a plain win (no BIG/MEGA/JACKPOT overlay), a big count-up number
 * zooms in at the center of the game frame, holds briefly, then drops/shrinks into the
 * WIN box in the control bar. `onComplete` fires exactly when it arrives there — the
 * caller updates the WIN box's own number at that moment, not before.
 */
export function SimpleWinPopup({ winAmount, targetRef, onComplete }: SimpleWinPopupProps) {
  const [displayAmount, setDisplayAmount] = useState(0);
  const [phase, setPhase] = useState<Phase>("entering");
  const [style, setStyle] = useState<CSSProperties>(ENTER_STYLE);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(Math.max((now - start) / COUNT_UP_MS, 0), 1);
      setDisplayAmount(easeOutCubic(t) * winAmount);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [winAmount]);

  useEffect(() => {
    if (phase !== "entering") return;
    const raf = requestAnimationFrame(() => {
      setStyle({ ...ENTER_STYLE, transform: "translate(0px, 0px) scale(1)", opacity: 1 });
    });
    const timer = window.setTimeout(() => setPhase("holding"), ENTER_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "holding") return;
    const timer = window.setTimeout(() => setPhase("dropping"), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "dropping") return;
    const popup = popupRef.current;
    const target = targetRef.current;
    if (!popup || !target) {
      onComplete();
      return;
    }
    const popupRect = popup.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const dx = targetRect.left + targetRect.width / 2 - (popupRect.left + popupRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (popupRect.top + popupRect.height / 2);
    setStyle({
      transform: `translate(${dx}px, ${dy}px) scale(0.3)`,
      opacity: 0,
      transition: `transform ${DROP_MS}ms cubic-bezier(0.55, 0, 0.85, 0.35), opacity ${DROP_MS}ms ease-in`,
    });
    const timer = window.setTimeout(onComplete, DROP_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div ref={popupRef} style={style}>
        <span
          className="text-6xl font-black text-amber-300 stroke-black"
          style={{ textShadow: "0 3px 8px rgba(0,0,0,0.85), 0 0 20px #ffa10a" }}
        >
          {displayAmount.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
