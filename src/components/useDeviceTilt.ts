import { useCallback, useEffect, useRef, useState } from "react";

export type TiltOrientation = "portrait" | "landscape-left" | "landscape-right";
export type MotionPermissionState = "unknown" | "granted" | "denied" | "unavailable";

/** iOS 13+ gates DeviceOrientationEvent behind an explicit, gesture-triggered permission prompt
 * (Android/other browsers fire the event freely, no prompt) — this isn't in TypeScript's bundled
 * DOM lib since it's a non-standard Safari-only addition. */
type GatedDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** Once tilt is read as landscape, don't flip back to portrait until it drops well below this —
 * a plain single threshold would flicker back and forth a few times a second while the player's
 * hand holds the phone roughly (but not perfectly) sideways, since gamma naturally jitters a
 * couple of degrees from micro hand movement. */
const ENTER_LANDSCAPE_GAMMA = 50;
const EXIT_LANDSCAPE_GAMMA = 35;
/** A momentary single-sample crossing (even past the hysteresis gap above) isn't enough on its
 * own to commit to a new classification — the reading has to hold steady past the threshold for
 * this long first. Catches brief single-frame spikes/dips from natural hand wobble that the
 * gamma-magnitude hysteresis alone doesn't fully filter out, on top of it rather than instead of
 * it (see classify's doc comment on why both matter — this one specifically exists because
 * LandscapeGate's SensorRotateGate keeps the game mounted permanently, but still visually swaps
 * to the rotate-prompt overlay on every "portrait" reading — this debounce is what keeps that
 * overlay from flashing in and out during ordinary handheld micro-movement). */
const TILT_DEBOUNCE_MS = 600;

function classify(gamma: number, previous: TiltOrientation | null): TiltOrientation {
  const threshold = previous === "portrait" || previous === null ? ENTER_LANDSCAPE_GAMMA : EXIT_LANDSCAPE_GAMMA;
  if (Math.abs(gamma) < threshold) return "portrait";
  // NOTE — this sign mapping (which physical turn direction is "landscape-right" vs
  // "-left") is the one thing here that genuinely can't be confirmed without a real iOS
  // device: gamma's sign convention for a phone held upright and turned like a steering
  // wheel isn't something this environment can test. If a real-device check finds content
  // rendering upside-down after rotating, flip this single comparison (gamma > 0 ↔ the
  // other branch) — everything downstream (the CSS rotation direction in LandscapeGate)
  // derives from this one classification, so it's a one-line fix in that case.
  return gamma > 0 ? "landscape-right" : "landscape-left";
}

interface DeviceTiltResult {
  /** Whether the DeviceOrientationEvent API exists in this browser at all. */
  supported: boolean;
  /** Whether an explicit, gesture-triggered permission prompt is required before events fire
   * (iOS Safari) — if false, requestAccess() still needs calling once to start listening, but
   * won't show any browser prompt. */
  needsPermission: boolean;
  permission: MotionPermissionState;
  /** Physical tilt once permission is granted and a first reading has arrived; null until then. */
  tilt: TiltOrientation | null;
  /** Must be invoked directly from a click/tap handler — iOS only grants motion access inside a
   * fresh user gesture, the same restriction GamePage.tsx's requestFullscreen() has. Safe to call
   * on platforms that don't need it too (just starts listening immediately). */
  requestAccess: () => Promise<void>;
}

/**
 * Reads the device's actual physical tilt via the accelerometer (DeviceOrientationEvent),
 * independent of the OS's own auto-rotate setting or the browser's rendered CSS orientation —
 * unlike screen.orientation/matchMedia("orientation: ..."), which only reflect physical tilt when
 * the OS has auto-rotate switched on. This is what lets LandscapeGate detect "the player turned
 * their phone sideways" on iOS, where no API exists to force the browser to rotate itself (see
 * GamePage.tsx's screen.orientation.lock() attempt, which iOS Safari doesn't implement at all).
 */
export function useDeviceTilt(): DeviceTiltResult {
  const supported = typeof DeviceOrientationEvent !== "undefined";
  const gated = supported ? (DeviceOrientationEvent as GatedDeviceOrientationEvent) : null;
  const needsPermission = typeof gated?.requestPermission === "function";

  const [permission, setPermission] = useState<MotionPermissionState>(() =>
    !supported ? "unavailable" : needsPermission ? "unknown" : "granted"
  );
  const [tilt, setTilt] = useState<TiltOrientation | null>(null);
  const tiltRef = useRef<TiltOrientation | null>(null);
  /** A candidate classification that differs from the current committed `tilt`, and when it was
   * first seen — only promoted to the real `tilt` once it's held for TILT_DEBOUNCE_MS straight
   * (reset back to null the moment a reading disagrees with it again). */
  const pendingRef = useRef<{ value: TiltOrientation; since: number } | null>(null);

  useEffect(() => {
    if (permission !== "granted") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      const next = classify(e.gamma, tiltRef.current);

      if (next === tiltRef.current) {
        pendingRef.current = null;
        return;
      }

      const now = performance.now();
      if (pendingRef.current?.value !== next) {
        pendingRef.current = { value: next, since: now };
        return;
      }
      if (now - pendingRef.current.since >= TILT_DEBOUNCE_MS) {
        tiltRef.current = next;
        setTilt(next);
        pendingRef.current = null;
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [permission]);

  const requestAccess = useCallback(async () => {
    if (!supported) {
      setPermission("unavailable");
      return;
    }
    if (!needsPermission) {
      setPermission("granted");
      return;
    }
    try {
      const result = await gated!.requestPermission!();
      setPermission(result === "granted" ? "granted" : "denied");
    } catch {
      setPermission("denied");
    }
  }, [supported, needsPermission, gated]);

  return { supported, needsPermission, permission, tilt, requestAccess };
}
