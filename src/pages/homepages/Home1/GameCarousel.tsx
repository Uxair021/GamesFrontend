import { useEffect, useRef } from "react";
import { useHomeAuthActions } from "../shared/useHomeAuthActions";
import { CARD_IMAGES, SMALL_CARD_IMAGES } from "../shared/images";

interface CardProps {
  label: string;
  index: number;
  className?: string;
  onClick: () => void;
  images?: string[];
}

function Card({ label, index, className = "", onClick, images = CARD_IMAGES }: CardProps) {
  const image = images[index % images.length];
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute -inset-2 rounded-xl bg-gradient-to-br from-indigo-600 via-fuchsia-600 to-amber-400 opacity-70 blur-md" />
      <button
        type="button"
        onClick={onClick}
        className="relative z-10 h-full w-full cursor-pointer overflow-hidden rounded-lg border-2 border-amber-400/20 shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.35),inset_0_-3px_6px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-105 active:scale-90"
      >
        <img src={image} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-center text-xs font-bold text-white drop-shadow">
          {label}
        </span>
      </button>
    </div>
  );
}

// 6 slots visible per screen: (100% / 6) - (5rem gap-total / 6), pre-divided to avoid a bare "/" in the arbitrary value
const SLOT_WIDTH = "w-[calc(17.6%)]";

export function GameCarousel() {
  const { requireAuth } = useHomeAuthActions();
  const singleCards = Array.from({ length: 10 }, (_, i) => i + 1);
  const doubleSlots = Array.from({ length: 10 }, (_, i) => i);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScrollLeft: 0, distance: 0 });

  useEffect(() => {
    const handleWindowWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (scrollerRef.current) scrollerRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    };
    window.addEventListener("wheel", handleWindowWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWindowWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    drag.current = {
      active: true,
      startX: e.pageX,
      startScrollLeft: scrollerRef.current?.scrollLeft ?? 0,
      distance: 0,
    };
  };

  const stopDrag = () => {
    drag.current.active = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !scrollerRef.current) return;
    e.preventDefault();
    const delta = e.pageX - drag.current.startX;
    drag.current.distance = Math.abs(delta);
    scrollerRef.current.scrollLeft = drag.current.startScrollLeft - delta;
  };

  // No real per-game destination exists yet, so every card just prompts login when signed out
  // (same demo-content pattern as the source project) — a real click is distinguished from the
  // end of a drag by distance, same as the original.
  const requireLogin = requireAuth();
  const onCardClick = () => {
    if (drag.current.distance > 5) return;
    requireLogin();
  };

  return (
    <div
      ref={scrollerRef}
      className="homepages-scrollbar-hide w-full cursor-grab overflow-x-auto px-22 pt-15 py-6 active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <div className="flex snap-x snap-mandatory items-stretch gap-15 px-6">
        {singleCards.map((n) => (
          <Card key={`single-${n}`} label={`Game ${n}`} index={n} className={`${SLOT_WIDTH} h-105 shrink-0 snap-start`} onClick={onCardClick} />
        ))}

        {doubleSlots.map((slot) => {
          const topN = 10 + slot * 2 + 1;
          const bottomN = topN + 1;
          return (
            <div key={`double-${slot}`} className={`${SLOT_WIDTH} flex h-105 shrink-0 snap-start flex-col gap-15`}>
              <Card label={`Game ${topN}`} index={topN} className="flex-1" onClick={onCardClick} images={SMALL_CARD_IMAGES} />
              <Card label={`Game ${bottomN}`} index={bottomN} className="flex-1" onClick={onCardClick} images={SMALL_CARD_IMAGES} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
