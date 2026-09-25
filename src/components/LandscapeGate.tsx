import { Lock, RotateCw, Smartphone } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useDeviceTilt } from "./useDeviceTilt";
import { RotatedViewportContext } from "../games/shared/rotatedViewport";

/** Matches phones AND tablets (touch-as-primary-input devices) while excluding desktop/laptop —
 * including touchscreen laptops/2-in-1s, since a device with a mouse/trackpad still reports its
 * PRIMARY pointer as fine/hover-capable even when a touchscreen is also present. Deliberately not
 * a width breakpoint: a resized desktop browser window and a large tablet can have the same
 * width, but only one of them is actually touch-first. Shared with GamePage.tsx, which only
 * attempts screen.orientation.lock() on devices this same query matches — desktop never triggers
 * either, regardless of window size. */
export const TOUCH_DEVICE_QUERY = "(hover: none) and (pointer: coarse)";
const LOCK_QUERY = `(orientation: portrait) and ${TOUCH_DEVICE_QUERY}`;

/** Whether this browser can force real landscape itself (see GamePage.tsx's
 * screen.orientation.lock() attempt) — Android/Chrome-family, not iOS Safari, which has never
 * implemented the Screen Orientation API's lock() at all. Devices without it get the sensor-driven
 * fallback below instead of waiting on an API call that will never resolve. */
const hasOrientationLockAPI = () => typeof screen !== "undefined" && "lock" in screen.orientation;

/** iPhone/iPod plus iPad — including modern iPadOS, whose Safari UA no longer contains "iPad" by
 * default (it reports as desktop Safari), hence the maxTouchPoints check alongside the UA one.
 * Only used to word the last-resort fallback message (permission denied, or a browser with
 * neither the lock API nor DeviceOrientationEvent at all) — everything else here is API-driven,
 * not UA-sniffed. */
const isIOS = () =>
  /iPhone|iPod|iPad/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return size;
}

function RotateIcon() {
  return <Smartphone size={56} className="rotate-90 text-indigo-400" />;
}

function PromptShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-slate-950 px-10 text-center text-slate-100">
      {children}
    </div>
  );
}

/**
 * Android/Chrome-family path — unchanged from before this file grew a second (sensor-driven) path
 * below. GamePage.tsx's screen.orientation.lock() call already force-rotates the page here even
 * with the device's own auto-rotate switched off, so this only ever renders as a rare fallback if
 * that lock attempt itself fails or hasn't resolved yet.
 */
function OrientationApiGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => window.matchMedia(LOCK_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(LOCK_QUERY);
    const handleChange = () => setLocked(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  if (!locked) return <>{children}</>;

  return (
    <PromptShell>
      <RotateIcon />
      <div>
        <p className="text-lg font-bold">Rotate your device</p>
        <p className="mt-1.5 text-sm text-slate-400">
          Turn your device sideways. If nothing happens, swipe down from the top of the screen and
          make sure Auto-rotate is turned on in your quick settings, then rotate again.
        </p>
      </div>
    </PromptShell>
  );
}

/**
 * iOS path (or any other touch browser without screen.orientation.lock) — since there's no API
 * that can make the browser itself rotate, this reads the device's actual physical tilt straight
 * from the accelerometer (useDeviceTilt) instead, which works regardless of the OS's auto-rotate
 * setting, and CSS-rotates the game itself to match. The player never has to open any OS setting:
 * open the game in portrait, tap once to allow motion access, then just turn the phone sideways.
 *
 * Once tilt has read landscape *once*, `children` stays mounted for good — later portrait
 * readings only toggle a prompt overlay on top of it, never unmount it again. Real handheld
 * tilt is noisy enough that, even with useDeviceTilt's own hysteresis/debounce, an unmount-and-
 * remount-on-every-dip design would repeatedly tear down and rebuild the whole game (its PixiJS
 * app, WebGL context, in-flight asset loading) — mobile Safari has a real, low ceiling on
 * concurrent WebGL contexts, and cycling through it fast enough starts failing new context
 * creation silently, which is what used to show up as a permanently stuck "Loading..." screen on
 * real iPhones after rotating a few times. Mounting once and only ever overlaying afterward
 * removes that failure mode structurally instead of just making it rarer.
 */
function SensorRotateGate({ children }: { children: ReactNode }) {
  const { supported, permission, tilt, requestAccess } = useDeviceTilt();
  const windowSize = useWindowSize();

  const isLandscape = tilt === "landscape-left" || tilt === "landscape-right";

  // Remembers the last real landscape reading (direction + size) even after tilt drops back to
  // portrait, so the mounted game keeps a valid rotation/size to render at underneath the prompt
  // overlay instead of needing to unmount for lack of one. `everLandscape` is the actual "have we
  // mounted children yet" switch — set once, never reset, which is the whole point of this fix.
  const [everLandscape, setEverLandscape] = useState(false);
  const [lastLandscapeTilt, setLastLandscapeTilt] = useState<"landscape-left" | "landscape-right" | null>(null);
  useEffect(() => {
    if (isLandscape) {
      setEverLandscape(true);
      setLastLandscapeTilt(tilt as "landscape-left" | "landscape-right");
    }
  }, [isLandscape, tilt]);

  if (everLandscape && lastLandscapeTilt) {
    // The wrapper's own box is the SWAPPED window size (so after a 90deg rotation its visual
    // footprint exactly matches the real, portrait-shaped screen), centered and rotated around
    // its own middle — that works for any window size with no separate top/left offset math.
    // landscape-right/-left pick opposite rotation directions to compensate for which way the
    // player physically turned the phone, so content lands right-side-up either way (see
    // useDeviceTilt's classify() doc comment on the one part of this that needs a real-device
    // sign check).
    const rotation = lastLandscapeTilt === "landscape-right" ? -90 : 90;
    const rotatedSize = { width: windowSize.height, height: windowSize.width };

    return (
      <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center"
          style={{
            width: rotatedSize.width,
            height: rotatedSize.height,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        >
          <RotatedViewportContext.Provider value={rotatedSize}>{children}</RotatedViewportContext.Provider>
        </div>
        {!isLandscape && (
          <PromptShell>
            <RotateIcon />
            <div>
              <p className="text-lg font-bold">Rotate your device</p>
              <p className="mt-1.5 text-sm text-slate-400">Turn your device sideways to play.</p>
            </div>
          </PromptShell>
        )}
      </div>
    );
  }

  // Permission not asked yet — a single tap enables motion access on iOS (the browser prompt
  // itself only appears in response to this), and needs no prompt at all elsewhere.
  if (permission === "unknown") {
    return (
      <PromptShell>
        <RotateCw size={56} className="text-indigo-400" />
        <div>
          <p className="text-lg font-bold">Enable auto-rotate</p>
          <p className="mt-1.5 text-sm text-slate-400">
            Tap below once, then just turn your device sideways to play — no settings to change.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void requestAccess()}
          className="rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
        >
          Enable auto-rotate
        </button>
      </PromptShell>
    );
  }

  // Permission denied, or this browser has neither the lock API nor DeviceOrientationEvent at
  // all — last-resort fallback so the player still has *something* actionable, same wording as
  // the Android path used before the sensor approach existed.
  if (permission === "denied" || !supported) {
    return (
      <PromptShell>
        <RotateIcon />
        <div>
          <p className="text-lg font-bold">Rotate your device</p>
          {isIOS() ? (
            <p className="mt-1.5 text-sm text-slate-400">
              Turn your device sideways. If nothing happens, open{" "}
              <span className="inline-flex items-center gap-1 text-slate-300">
                Control Center <Lock size={14} className="inline" />
              </span>{" "}
              (swipe down from the top-right corner), tap the rotation-lock icon to turn Portrait
              Orientation Lock off, then rotate again.
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">
              Turn your device sideways. If nothing happens, swipe down from the top of the screen
              and make sure Auto-rotate is turned on in your quick settings, then rotate again.
            </p>
          )}
        </div>
      </PromptShell>
    );
  }

  // Permission granted, waiting on the first sensor reading (near-instant in practice) or the
  // player just hasn't turned the phone yet — no settings mentioned, since we already have
  // sensor access at this point.
  return (
    <PromptShell>
      <RotateIcon />
      <div>
        <p className="text-lg font-bold">Rotate your device</p>
        <p className="mt-1.5 text-sm text-slate-400">Turn your device sideways to play.</p>
      </div>
    </PromptShell>
  );
}

/**
 * Blocks its children behind a full-screen "rotate your device" prompt whenever the viewport is
 * portrait *and* the device is touch-primary (phone or tablet — see TOUCH_DEVICE_QUERY; desktop
 * never matches, any window size). Doesn't render `children` at all while locked — so the wrapped
 * game (and its loading-screen timer, PixiJS init, etc.) genuinely doesn't mount until the player
 * actually rotates, instead of running invisibly behind the prompt and potentially finishing
 * before they ever see it start.
 *
 * Delegates to one of two real implementations depending on whether this browser can force
 * landscape itself (see hasOrientationLockAPI): OrientationApiGate for Android/Chrome-family
 * (matchMedia-driven, rare fallback only), SensorRotateGate for iOS/anything else (physical-tilt
 * sensor-driven, since no API exists there to lean on — see that component's own doc comment).
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

  // Either not a touch-primary device at all (desktop), or the browser is already genuinely
  // reporting landscape — the latter covers not just Android post-lock() but also iOS whenever
  // the player's own OS auto-rotate happens to already be on, letting it just work natively with
  // no sensor/permission machinery engaged at all. Only reached the two gates below when the
  // browser truly can't/won't rotate itself.
  if (!locked) {
    return <>{children}</>;
  }

  return hasOrientationLockAPI() ? (
    <OrientationApiGate>{children}</OrientationApiGate>
  ) : (
    <SensorRotateGate>{children}</SensorRotateGate>
  );
}
