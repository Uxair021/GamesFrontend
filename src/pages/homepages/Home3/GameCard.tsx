import { motion, useReducedMotion } from "motion/react";
import { GameBadge } from "./data";

const BADGE_STYLES: Record<GameBadge, string> = {
  HOT: "bg-gradient-to-r from-rose-500 to-orange-500 text-white",
  NEW: "bg-gradient-to-r from-emerald-400 to-green-500 text-slate-900",
  JACKPOT: "bg-gradient-to-r from-[color:var(--color-nx-gold)] to-amber-500 text-slate-900",
  TRENDING: "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white",
  EXCLUSIVE: "bg-gradient-to-r from-violet-600 to-indigo-600 text-white",
};

export function GameCard({ title, image, badge }: { title: string; image: string; badge?: GameBadge }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative w-40 shrink-0 overflow-hidden rounded border border-white/20 bg-[color:var(--color-nx-surface)] shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.35),inset_0_-3px_6px_rgba(0,0,0,0.35)] transition-colors duration-300 hover:border-[color:var(--color-nx-violet)]/60 hover:shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.35),inset_0_-3px_6px_rgba(0,0,0,0.35),0_0_24px_rgba(147,51,234,0.25)] sm:w-44"
    >
      <div className="relative aspect-[2.8/4] cursor-pointer overflow-hidden">
        <motion.img
          src={image}
          alt={title}
          className="h-full w-full object-cover"
          whileHover={reduceMotion ? undefined : { scale: 1.08 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />

        {badge && (
          <span
            className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-title font-bold tracking-wide shadow-md ${BADGE_STYLES[badge]}`}
          >
            {badge}
          </span>
        )}
      </div>
    </motion.div>
  );
}
