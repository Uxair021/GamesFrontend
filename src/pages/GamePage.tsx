import { Suspense, useEffect, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getGameBySlug } from "../games/registry";
import { resumeAudio } from "../games/shared/sound/soundEngine";
import { MOBILE_BREAKPOINT_QUERY } from "../components/LandscapeGate";

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

  /**
   * Every game opens in fullscreen, covering the loading screen through gameplay, on any
   * device/viewport size. Best-effort: browsers only honor requestFullscreen shortly after
   * a real user gesture (the tap/click that navigated here) — works on most Chrome-family
   * browsers and silently no-ops where refused (notably iOS Safari, or a stale gesture),
   * which just falls back to the normal (non-fullscreen) browser view.
   *
   * On a phone-width screen, once fullscreen is granted, also try to force landscape via the
   * Screen Orientation API — on Android Chrome-family browsers this actually rotates the page
   * even if the phone's own OS-level auto-rotate is switched off, which is the closest a website
   * can get to "auto-rotate" without a native app wrapper. iOS Safari doesn't implement `lock` at
   * all (feature-detected below, not just try/caught), so this silently no-ops there — LandscapeGate
   * is what carries the rest of the way for iOS players.
   */
  useEffect(() => {
    pageRef.current
      ?.requestFullscreen()
      .then(() => {
        const orientation = screen.orientation as LockableScreenOrientation | undefined;
        if (orientation?.lock && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches) {
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
    </div>
  );
}
