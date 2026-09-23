import { Lock, Smartphone } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

/** Shared with GamePage.tsx, which only attempts screen.orientation.lock() at this same
 * phone-width breakpoint — desktop/tablet browsers never trigger either. */
export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";
const LOCK_QUERY = `(orientation: portrait) and ${MOBILE_BREAKPOINT_QUERY}`;

/** iPhone/iPod only (iPad rarely hits this gate at all — it's already wider than
 * MOBILE_BREAKPOINT_QUERY in portrait on every current model). Used purely to pick which set of
 * rotate instructions to show — iOS has no API a website can use to force landscape (see
 * GamePage.tsx's orientation.lock attempt, which iOS Safari doesn't support at all), so this is
 * the only remaining lever: tell the player exactly where their phone's own toggle lives. */
const isIOS = () => /iPhone|iPod/.test(navigator.userAgent);

/**
 * Blocks its children behind a full-screen "rotate your device" prompt whenever
 * the viewport is portrait *and* phone-width. Doesn't render `children` at all
 * while locked — so the wrapped game (and its loading-screen timer, PixiJS init,
 * etc.) genuinely doesn't mount until the player actually rotates, instead of
 * running invisibly behind the prompt and potentially finishing before they
 * ever see it start.
 *
 * On Android this is mostly a rare fallback — GamePage.tsx's screen.orientation.lock() call
 * already force-rotates the page there even if the phone's own auto-rotate is switched off, so
 * this only shows if that lock attempt itself fails. On iOS there's no such API, so this is the
 * only thing standing between the player and the game; its copy tells them exactly which iOS
 * control to flip, since no website can deep-link into that setting for them.
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
          {isIOS() ? (
            <p className="mt-1.5 text-sm text-slate-400">
              Turn your phone sideways. If nothing happens, open{" "}
              <span className="inline-flex items-center gap-1 text-slate-300">
                Control Center <Lock size={14} className="inline" />
              </span>{" "}
              (swipe down from the top-right corner), tap the rotation-lock icon to turn Portrait
              Orientation Lock off, then rotate again.
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">
              Turn your phone sideways. If nothing happens, swipe down from the top of the screen and
              make sure Auto-rotate is turned on in your quick settings, then rotate again.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
