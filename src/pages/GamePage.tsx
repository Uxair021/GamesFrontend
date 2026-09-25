import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getGameBySlug } from "../games/registry";
import { resumeAudio } from "../games/shared/sound/soundEngine";
import { TOUCH_DEVICE_QUERY } from "../components/LandscapeGate";

/** screen.orientation.lock() isn't in TypeScript's bundled DOM lib (it's still non-standard —
 * Safari/iOS never implemented it at all), so it needs its own narrow type here rather than a
 * blind `any` cast. */
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function GamePage() {
  const { slug } = useParams();
  const game = slug ? getGameBySlug(slug) : undefined;
  const pageRef = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);

  /**
   * Safety net for WebGL context loss — normally rare, but a real risk on mobile Safari
   * specifically, which has a low ceiling on concurrent WebGL contexts (and, before
   * LandscapeGate's SensorRotateGate was fixed to keep the game mounted across tilt changes
   * instead of tearing it down and rebuilding it on every rotation wobble, was the actual cause
   * of a real bug: repeated context creation on iPhone exhausting that ceiling and leaving
   * nothing to recover from — the game just sat on its loading screen forever). This is a
   * general backstop, not specific to that bug — any other cause of context loss (backgrounding,
   * OS memory pressure, a different mobile browser's own limits) would previously hit the exact
   * same silent, unrecoverable dead end. `webglcontextlost` bubbles, so one listener up here
   * catches it regardless of which game/canvas underneath it fires it.
   */
  useEffect(() => {
    setContextLost(false);
    const node = pageRef.current;
    if (!node) return;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    node.addEventListener("webglcontextlost", handleContextLost);
    return () => node.removeEventListener("webglcontextlost", handleContextLost);
  }, [slug]);

  /**
   * Every game opens in fullscreen, covering the loading screen through gameplay, on any
   * device/viewport size. Best-effort: browsers only honor requestFullscreen shortly after
   * a real user gesture (the tap/click that navigated here) — works on most Chrome-family
   * browsers and silently no-ops where refused (notably iOS Safari, or a stale gesture),
   * which just falls back to the normal (non-fullscreen) browser view.
   *
   * On a touch-primary device (phone or tablet — see TOUCH_DEVICE_QUERY; desktop is excluded
   * regardless of window size), once fullscreen is granted, also try to force landscape via the
   * Screen Orientation API — on Android Chrome-family browsers (phone or tablet) this actually
   * rotates the page even if the device's own OS-level auto-rotate is switched off, which is the
   * closest a website can get to "auto-rotate" without a native app wrapper. iOS Safari doesn't
   * implement `lock` at all, on iPhone or iPad (feature-detected below, not just try/caught), so
   * this silently no-ops there — LandscapeGate is what carries the rest of the way for iOS players.
   */
  useEffect(() => {
    pageRef.current
      ?.requestFullscreen()
      .then(() => {
        const orientation = screen.orientation as LockableScreenOrientation | undefined;
        if (orientation?.lock && window.matchMedia(TOUCH_DEVICE_QUERY).matches) {
          orientation.lock("landscape").catch(() => {
            /* refused (e.g. some in-app browsers) — LandscapeGate's portrait prompt covers this */
          });
        }
      })
      .catch(() => {
        /* refused without a fresh-enough gesture — the game is still fully usable, just not fullscreen */
      });
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      (screen.orientation as LockableScreenOrientation | undefined)?.unlock?.();
    };
  }, [slug]);

  /**
   * Try to unlock audio right away, on the same tick as mount — the tap/click that
   * navigated onto this page is still "sticky" user activation for this document (no full
   * page reload happened, just client-side routing), so this alone is often enough for the
   * background music to actually start playing the instant the loading screen finishes,
   * with no further tap needed. As a fallback for browsers that don't honor that, also
   * unlock on the very first interaction anywhere on the page (not tied to any specific
   * button) — no browser lets audio play with truly zero interaction ever, that's an
   * OS-level restriction no site can bypass, so this is the most permissive path there is.
   */
  useEffect(() => {
    resumeAudio();
    const unlock = () => resumeAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [slug]);

  if (!game || !game.component) {
    return <Navigate to="/" replace />;
  }

  const GameComponent = game.component;

  return (
    <div
      ref={pageRef}
      className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-black"
    >
      <Suspense fallback={<div className="text-center text-white/70">Loading game...</div>}>
        <GameComponent />
      </Suspense>
      {contextLost && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-slate-950 px-10 text-center text-slate-100">
          <p className="text-lg font-bold">Something went wrong</p>
          <p className="text-sm text-slate-400">The game's graphics ran into a problem and couldn't continue.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            Tap to reload
          </button>
        </div>
      )}
    </div>
  );
}
