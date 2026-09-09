import { Link } from "react-router-dom";
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
import lifeOfLuxuryThumbnail from "../../public/symbols/lifeOfLuxury/thumbnail.svg";

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
};

interface GameCardProps {
  slug: string;
  name: string;
  description: string;
}

export function GameCard({ slug, name }: GameCardProps) {
  return (
    <Link
      to={`/games/${slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition hover:border-indigo-400/60 hover:shadow-[0_0_24px_rgba(129,140,248,0.25)]"
    >
      <div className="flex h-[200px] items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 text-amber-400">
        <img src={THUMBNAILS[slug]} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="px-4 py-2">
        <h3 className="text-lg font-bold text-white">{name}</h3>
        {/* <p className="mt-1 text-sm text-slate-400">{description}</p> */}
      </div>
    </Link>
  );
}
