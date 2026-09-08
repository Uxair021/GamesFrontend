import { Smartphone } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

const LOCK_QUERY = "(orientation: portrait) and (max-width: 767px)";

/**
 * Blocks its children behind a full-screen "rotate your device" prompt whenever
 * the viewport is portrait *and* phone-width. Doesn't render `children` at all
 * while locked — so the wrapped game (and its loading-screen timer, PixiJS init,
 * etc.) genuinely doesn't mount until the player actually rotates, instead of
 * running invisibly behind the prompt and potentially finishing before they
 * ever see it start.
 */
export function LandscapeGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => window.matchMedia(LOCK_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(LOCK_QUERY);
    const handleChange = () => setLocked(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  if (locked) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-slate-950 px-10 text-center text-slate-100">
        <Smartphone size={56} className="rotate-90 text-indigo-400" />
        <div>
          <p className="text-lg font-bold">Rotate your device</p>
          <p className="mt-1.5 text-sm text-slate-400">
            This site works best in landscape — turn your phone sideways and turn on the rotation from your device
            settings or browser controls to continue.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
