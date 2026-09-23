import { LuPlus, LuGamepad2, LuZap, LuCrown, LuArrowRight } from "react-icons/lu";
import { useHomeAuthActions } from "../shared/useHomeAuthActions";
import { initialsOf } from "../shared/initials";
import { CARD_IMAGES, HOME_IMAGES } from "../shared/images";

// Demo content — no games API exists for these ported pages yet, so every interactive tile
// just prompts login when signed out (same pattern as /home1 and /home3).
const GAMES = [
  { title: "Classic Slots", image: CARD_IMAGES[0], border: "border-pink-500/60 hover:border-pink-400" },
  { title: "Mega Wheels", image: CARD_IMAGES[1], border: "border-blue-500/60 hover:border-blue-400" },
  { title: "Jackpot Rush", image: CARD_IMAGES[2], border: "border-purple-500/60 hover:border-purple-400" },
  { title: "Lucky Fortune", image: CARD_IMAGES[3], border: "border-orange-500/60 hover:border-orange-400" },
  { title: "Fruit Blast", image: CARD_IMAGES[4], border: "border-yellow-400/60 hover:border-yellow-300" },
  { title: "Retro Spins", image: CARD_IMAGES[5], border: "border-fuchsia-500/60 hover:border-fuchsia-400" },
  { title: "Adventureland", image: HOME_IMAGES.adventureCard, border: "border-emerald-500/60 hover:border-emerald-400" },
  { title: "Hero Quest", image: HOME_IMAGES.heroQuestCard, border: "border-sky-500/60 hover:border-sky-400" },
];

const PROMO_BUTTON = "bg-gradient-to-b from-green-500 to-green-700";

const PROMO_CARDS = [
  {
    title: "Play & Win",
    description: "Spin, match, and play your way through exciting challenges!",
    icon: LuGamepad2,
    image: HOME_IMAGES.promo1Bg,
    iconBg: "bg-blue-600",
    border: "border-blue-500/50",
    scrim: "from-blue-950/95 via-blue-950/50 to-transparent",
    button: PROMO_BUTTON,
  },
  {
    title: "Feel the Thrill",
    description: "Fast-paced gameplay, exciting rounds, and big winning moments!",
    icon: LuZap,
    image: HOME_IMAGES.promo2Bg,
    iconBg: "bg-emerald-600",
    border: "border-emerald-500/50",
    scrim: "from-emerald-950/95 via-emerald-950/50 to-transparent",
    button: PROMO_BUTTON,
  },
  {
    title: "Your Next Game",
    description: "Pick a game, test your luck, and see if you can hit the jackpot!",
    icon: LuCrown,
    image: HOME_IMAGES.promo3Bg,
    iconBg: "bg-amber-500",
    border: "border-amber-400/60",
    scrim: "from-amber-950/95 via-amber-950/50 to-transparent",
    button: PROMO_BUTTON,
  },
];

const HEADER_ICONS = [
  { src: HOME_IMAGES.bonusReward, alt: "Reward" },
  { src: HOME_IMAGES.cashPrize, alt: "Cash prize" },
  { src: HOME_IMAGES.settings, alt: "Settings" },
  { src: HOME_IMAGES.trophy, alt: "Trophy" },
  { src: HOME_IMAGES.notification, alt: "Announcements" },
];

const FOOTER_ITEMS = [
  { label: "Fav", icon: HOME_IMAGES.fav },
  { label: "All", icon: HOME_IMAGES.all },
  { label: "Reels", icon: HOME_IMAGES.reels },
  { label: "Share", icon: HOME_IMAGES.share, big: true },
  { label: "Fish", icon: HOME_IMAGES.fish },
  { label: "Other", icon: HOME_IMAGES.others },
  { label: "Daily Bonus", icon: HOME_IMAGES.dailyBonus },
];

const CARD_SHADOW =
  "shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.2),inset_0_-3px_6px_rgba(0,0,0,0.35)]";

/** Ported from GameFun's /home4 — a single self-contained casino-panel layout (header with
 * balance/icons, hero + 3 promo cards, an 8-game grid, footer nav). Wired to this app's own
 * auth (see useHomeAuthActions) instead of the source project's login modal. */
export function Home2Page() {
  const { user, requireAuth, goToDashboard } = useHomeAuthActions();

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-2 font-ui sm:p-1">
      <div className="relative w-full max-w-[1800px] overflow-hidden rounded-md border-1 border-blue-400/40 bg-gradient-to-b from-[#0a1230] via-[#0a1230] to-[#050814] shadow-[0_0_60px_rgba(96,165,250,0.15),0_20px_50px_-10px_rgba(236,72,153,0.45)]">
        {/* Header */}
        <header className="grid grid-cols-1 items-center gap-3 border-b-2 border-blue-400/30 bg-[#0a1230]/70 px-2 py-2 sm:px-20 lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-wrap items-center justify-self-start gap-7">
            <div
              onClick={requireAuth(goToDashboard)}
              className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-blue-300/60 bg-gradient-to-b from-[#1a2a5c] to-[#0a1230] font-title text-lg font-bold text-white shadow-[0_0_14px_rgba(96,165,250,0.55)]"
            >
              {user ? initialsOf(user.username) : "U"}
            </div>

            <div className="flex items-center gap-4 rounded-xl border border-amber-400/50 bg-[#0a1230]/70 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 text-xs font-bold text-amber-900">
                $
              </span>
              <span className="font-stats text-lg font-bold text-white">{user ? user.balance.toFixed(2) : "45,230"}</span>
              <button
                type="button"
                onClick={requireAuth()}
                aria-label="Add funds"
                className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-400/70 bg-black text-amber-400 transition-colors hover:bg-amber-400 hover:text-black"
              >
                <LuPlus size={14} />
              </button>
            </div>

            <div className="flex items-center gap-4 rounded-xl border border-amber-400/50 bg-[#0a1230]/70 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-sky-300 to-blue-500 text-[10px] text-white">
                ★
              </span>
              <span className="font-stats text-lg font-bold tracking-[0.3em] text-white">*****</span>
            </div>
          </div>

          <div className="flex items-center justify-center justify-self-center gap-3">
            <button
              type="button"
              onClick={requireAuth()}
              className="rounded-xl border-2 border-amber-300 bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-600 px-14 py-2 font-title text-xl font-extrabold text-slate-900 shadow-[0_4px_10px_rgba(0,0,0,0.4),inset_0_2px_2px_rgba(255,255,255,0.5)] transition-transform active:scale-95"
            >
              BUY
            </button>
            <button
              type="button"
              onClick={requireAuth()}
              className="rounded-xl border-2 border-fuchsia-300 bg-gradient-to-b from-violet-500 via-fuchsia-500 to-purple-700 px-14 py-2 font-title text-xl font-extrabold text-white shadow-[0_4px_10px_rgba(0,0,0,0.4),inset_0_2px_2px_rgba(255,255,255,0.35)] transition-transform active:scale-95"
            >
              DEAL
            </button>
          </div>

          <div className="flex items-center justify-self-end gap-10">
            {HEADER_ICONS.map((ic) => (
              <button
                key={ic.alt}
                type="button"
                onClick={requireAuth()}
                className="shrink-0 transition-transform hover:scale-110 active:scale-90"
              >
                <img src={ic.src} alt={ic.alt} className="h-10 w-10 object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)]" />
              </button>
            ))}
          </div>
        </header>

        {/* Hero + promo row */}
        <div className="grid grid-cols-1 gap-4 p-2 sm:p-3 lg:grid-cols-[2.4fr_1fr_1fr_1fr]">
          <div
            className={`relative min-h-[280px] overflow-hidden rounded-md border-2 border-blue-400/50 bg-cover bg-center ${CARD_SHADOW}`}
            style={{ backgroundImage: `url(${HOME_IMAGES.heroBg})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
            <div className="relative flex h-full flex-col justify-center gap-4 p-3">
              <h1 className="font-title text-4xl font-black uppercase leading-[1.05] text-white sm:text-5xl">
                Ready to Win
                <br />
                <span className="text-amber-400">Big Today?</span>
              </h1>
              <p className="max-w-xs text-slate-300">Play your favorite games &amp; win amazing rewards!</p>
              <button
                type="button"
                onClick={requireAuth()}
                className="flex w-fit items-center gap-3 rounded-md border-2 border-amber-300 bg-gradient-to-b from-yellow-300 to-amber-500 py-3 pl-6 pr-2 font-title text-lg font-extrabold text-slate-900 shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-transform active:scale-95"
              >
                Play Now
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-amber-400">
                  <LuArrowRight size={16} />
                </span>
              </button>
            </div>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i === 0 ? "bg-amber-400" : "bg-white/30"}`} />
              ))}
            </div>
          </div>

          {PROMO_CARDS.map((p) => (
            <div
              key={p.title}
              className={`relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded border-2 ${p.border} bg-cover bg-center p-5 ${CARD_SHADOW}`}
              style={{ backgroundImage: `url(${p.image})` }}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${p.scrim}`} />
              <div className="relative">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md ${p.iconBg}`}>
                  <p.icon size={18} />
                </span>
                <h3 className="mt-3 font-title text-lg font-bold text-white">{p.title}</h3>
                <p className="mt-1 text-xs text-slate-300">{p.description}</p>
              </div>
              <button
                type="button"
                onClick={requireAuth()}
                className={`relative mt-3 flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xs font-title font-bold text-white shadow-md transition-transform active:scale-95 ${p.button}`}
              >
                Play Now <LuArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Games grid */}
        <div className="px-2 pb-3 sm:px-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {GAMES.map((g) => (
              <button
                key={g.title}
                type="button"
                onClick={requireAuth()}
                className={`group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-transform hover:scale-[1.03] ${g.border} ${CARD_SHADOW}`}
              >
                <img src={g.image} alt={g.title} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-black/80 px-2 py-2 text-center">
                  <p className="truncate font-title text-xs font-bold uppercase tracking-wide text-white">{g.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t-2 border-pink-400/40 bg-[#0a1230]/70 px-4 py-4 shadow-[0_-10px_30px_rgba(236,72,153,0.3)]">
          <div className="flex items-center justify-around">
            {FOOTER_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={requireAuth()}
                className="flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-90"
              >
                <img
                  src={item.icon}
                  alt={item.label}
                  className={`${item.big ? "h-14 w-14" : "h-10 w-10"} object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.6)]`}
                />
                <span className={`text-[11px] font-bold uppercase ${item.big ? "text-amber-300" : "text-slate-300"}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
