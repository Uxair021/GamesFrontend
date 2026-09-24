import { createContext, useContext } from "react";

/**
 * The "logical" viewport size every game should fit itself against — normally just
 * `window.innerWidth`/`innerHeight` (see useFitScale's fallback), but on iOS (which has no API a
 * website can use to force real landscape — see LandscapeGate.tsx) the game instead renders
 * inside a CSS-rotated wrapper that keeps the *browser's own* viewport portrait-shaped while
 * visually presenting landscape content. Inside that wrapper the real window dimensions are
 * backwards for sizing purposes — this context carries the swapped (width/height reversed) pair
 * so useFitScale (and anything else viewport-size-sensitive) fits against the *visual*, rotated
 * shape instead of the physical one, with zero per-game changes needed.
 *
 * null (the default, via LandscapeGateProvider not being present) means "use the real viewport" —
 * the normal case on desktop and on Android, where the Screen Orientation API does the actual
 * rotating and no CSS trick or size-swapping is involved at all.
 */
export const RotatedViewportContext = createContext<{ width: number; height: number } | null>(null);

export function useRotatedViewportSize() {
  return useContext(RotatedViewportContext);
}
