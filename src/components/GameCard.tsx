import { Link } from "react-router-dom";
import type { GameTag } from "../games/registry";
import shamrockSpinThumbnail from "../../public/symbols/shamrockSpin/thumbnail.png";
import cashMachineThumbnail from "../../public/symbols/moneyMachine/thumbnail.png";
import buffalo777Thumbnail from "../../public/symbols/buffalo777/thumbnail.png";
import crazy777Thumbnail from "../../public/symbols/carzy777/thumnail.png";
import fivexRewindThumbnail from "../../public/symbols/5xRewind/thumbnail.png";
import sizzlingThumbnail from "../../public/symbols/sizzling7s/thumbnail.png";
import crystalCloverThumbnail from "../../public/symbols/crystalClover/thumbnail.png";
import fruity777Thumbnail from "../../public/symbols/fruity777/thumbnail.png";
import mega10xPayThumbnail from "../../public/symbols/mega10x/thumbnail.png";
import vegasHitsThumbnail from "../../public/symbols/vegasHit/thumbnail.png";
import lifeOfLuxuryThumbnail from "../../public/symbols/lifeOfLuxury/thumbnail.png";
import rubberDuckThumbnail from "../../public/symbols/rubberDuck/thumbnail.png";
// No dedicated thumbnail.png shipped for this game yet — reusing the Top Dollar logo medallion
// as a reasonable stand-in until a real card thumbnail is provided.
import topDollarThumbnail from "../../public/symbols/dollarGame/thumbnail.png";
// Gems Deluxe is a duplicate of Top Dollar reskinned under a new name — reuses the same
// placeholder thumbnail (frontEnd/public/symbols/gemsDeluxe/) until real gem art is provided.
import gemsDeluxeThumbnail from "../../public/symbols/gemsDeluxe/thumbnail.png";
import hexaKenoThumbnail from "../../public/symbols/hexaKeno/thumbnail.png";
import superKenoBallsThumbnail from "../../public/symbols/superKenoBall/thumbnail.png";

const THUMBNAILS: Record<string, string> = {
  "shamrock-spin": shamrockSpinThumbnail,
  "cash-machine": cashMachineThumbnail,
  "buffalo-777": buffalo777Thumbnail,
  "crazy-777": crazy777Thumbnail,
  "5x-rewind": fivexRewindThumbnail,
  "sizzling-7s": sizzlingThumbnail,
  "crystal-clover": crystalCloverThumbnail,
  "fruity-777": fruity777Thumbnail,
  "mega-10x-pay": mega10xPayThumbnail,
  "vegas-hits": vegasHitsThumbnail,
  "life-of-luxury": lifeOfLuxuryThumbnail,
  "rubber-duck": rubberDuckThumbnail,
  "top-dollar": topDollarThumbnail,
  "gems-deluxe": gemsDeluxeThumbnail,
  "hexa-keno": hexaKenoThumbnail,
  "super-keno-balls": superKenoBallsThumbnail,
};

interface GameCardProps {
  slug: string;
  name: string;
  description: string;
  tag?: GameTag;
  status?: "coming-soon";
  thumbnailGradient?: string;
  icon?: string;
}

export function GameCard({ slug, name, tag, status, thumbnailGradient, icon }: GameCardProps) {
  const isComingSoon = status === "coming-soon";

  const thumb = (
    <div
      className={`relative h-[200px] overflow-hidden ${
        thumbnailGradient ? `bg-gradient-to-br ${thumbnailGradient}` : "bg-gradient-to-b from-slate-800 to-slate-900"
      }`}
    >
      {tag && !isComingSoon && (
        <span
          className={`absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            tag === "HOT" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
          }`}
        >
          {tag}
        </span>
      )}

      {icon ? (
        <span className="flex h-full w-full items-center justify-center text-6xl drop-shadow-lg">{icon}</span>
      ) : (
        <img src={THUMBNAILS[slug]} alt={name} className="h-full w-full object-cover" />
      )}

      {isComingSoon ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/55">
          <span className="text-lg">🔒</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-100">Coming Soon</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors group-hover:bg-slate-950/35">
          <span className="rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 opacity-0 transition-opacity group-hover:opacity-100">
            ▶ Play
          </span>
        </div>
      )}
    </div>
  );

  const body = (
    <div className="px-4 py-2">
      <h3 className="text-lg font-bold text-white">{name}</h3>
      {/* <p className="mt-1 text-sm text-slate-400">{description}</p> */}
    </div>
  );

  if (isComingSoon) {
    return (
      <div className="flex cursor-not-allowed flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 opacity-90">
        {thumb}
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/games/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition hover:-translate-y-1 hover:border-indigo-400/60 hover:shadow-[0_0_24px_rgba(129,140,248,0.25)]"
    >
      {thumb}
      {body}
    </Link>
  );
}
