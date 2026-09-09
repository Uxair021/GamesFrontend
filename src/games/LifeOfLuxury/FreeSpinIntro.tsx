import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useFitScale } from "../shared/useFitScale";

const HOLD_MS = 2200;
const ZOOM_IN_S = 0.45;
const ZOOM_OUT_S = 0.35;

interface FreeSpinIntroProps {
  onDismiss: () => void;
}

/** Full-screen "you've won free spins" banner — just the game's own freespin.png art (it
 * already bakes in the spin count text). The art itself zooms in on arrival and zooms back out
 * on the way out (the backdrop still just fades, as before); tap-to-skip + auto-dismiss like
 * every other celebration overlay in this app. */
export function FreeSpinIntro({ onDismiss }: FreeSpinIntroProps) {
  const [dismissing, setDismissing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fitScale = useFitScale([contentRef]);

  // Zoom in on arrival.
  useEffect(() => {
    if (!imgRef.current) return;
    gsap.fromTo(imgRef.current, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: ZOOM_IN_S, ease: "back.out(1.6)" });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDismissing(true), HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Zoom back out, then actually dismiss once that animation (not a fixed timer) finishes.
  useEffect(() => {
    if (!dismissing) return;
    if (!imgRef.current) {
      onDismiss();
      return;
    }
    gsap.to(imgRef.current, { scale: 0.4, opacity: 0, duration: ZOOM_OUT_S, ease: "power2.in", onComplete: onDismiss });
  }, [dismissing, onDismiss]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black/75 transition-opacity duration-300 ${
        dismissing ? "opacity-0" : "opacity-100"
      }`}
      onClick={() => setDismissing(true)}
      role="button"
      tabIndex={0}
    >
      <div ref={contentRef} style={fitScale < 1 ? { transform: `scale(${fitScale})` } : undefined}>
        <img
          ref={imgRef}
          src="/symbols/lifeOfLuxury/freespin.png"
          alt="Free Spins"
          className="max-h-[90vh] max-w-[92vw] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        />
      </div>
    </div>
  );
}
