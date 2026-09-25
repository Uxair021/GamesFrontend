import { useEffect, useMemo, useRef, useState } from "react";
import { useFitScale } from "../shared/useFitScale";
import "./FreeSpinCelebration.css";

const HOLD_MS = 2200;
const PARTICLE_COUNT = 320;
const PARTICLE_COLORS = ["#ffe066", "#ff9f1c", "#ffd166", "#fff3bf", "#ffb300"];

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

interface FreeSpinCelebrationProps {
  count: number;
  onDismiss: () => void;
}

/**
 * Full-screen banner celebrating a free-spin trigger — same visual language
 * as WinCelebration (particle burst, glow, pop-in, tap-to-skip, auto-dismiss)
 * but shows a flat spin count instead of a counting-up money amount.
 */
export function FreeSpinCelebration({ count, onDismiss }: FreeSpinCelebrationProps) {
  const [dismissing, setDismissing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const fitScale = useFitScale([contentRef]);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.8 + Math.random() * 1.2,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        rotate: Math.random() * 360,
      })),
    []
  );

  useEffect(() => {
    const dismissTimer = window.setTimeout(() => setDismissing(true), HOLD_MS);
    return () => window.clearTimeout(dismissTimer);
  }, []);

  useEffect(() => {
    if (!dismissing) return;
    const timer = window.setTimeout(onDismiss, 300); // matches the fade-out CSS duration
    return () => window.clearTimeout(timer);
  }, [dismissing, onDismiss]);

  function handleSkip() {
    setDismissing(true);
  }

  return (
    <div
      className={`free-spin-celebration ${dismissing ? "free-spin-celebration--dismissing" : ""}`}
      onClick={handleSkip}
      role="button"
      tabIndex={0}
    >
      <div className="free-spin-celebration-particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="free-spin-celebration-particle"
            style={{
              left: `${p.left}%`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>

      <div
        ref={contentRef}
        className="free-spin-celebration-fit"
        style={fitScale < 1 ? { transform: `scale(${fitScale})` } : undefined}
      >
        <div className="free-spin-celebration-content">
          <div className="free-spin-celebration-glow" />
          <img className="free-spin-celebration-title-image" src="/images/freeSpin.png" alt="Free Spins" />
          <div className="free-spin-celebration-count">{count} FREE SPINS</div>
          <div className="free-spin-celebration-hint">tap to skip</div>
        </div>
      </div>
    </div>
  );
}
