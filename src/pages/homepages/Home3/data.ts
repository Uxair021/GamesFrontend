import { CARD_IMAGES, SMALL_CARD_IMAGES } from "../shared/images";

export type GameBadge = "HOT" | "NEW" | "JACKPOT" | "TRENDING" | "EXCLUSIVE";

export interface PopularGame {
  id: string;
  title: string;
  image: string;
  badge: GameBadge;
  rating: number;
}

// Static content for the /home3 premium gaming page — no game API exists for these ported pages
// yet, so this drives the Popular Games carousel locally, reusing the same card artwork /home1
// and /home2 already use rather than inventing placeholder imagery.
export const popularGames: PopularGame[] = [
  { id: "p1", title: "Golden Dragon", image: CARD_IMAGES[0], badge: "HOT", rating: 4.8 },
  { id: "p2", title: "Mega Wheel", image: CARD_IMAGES[1], badge: "HOT", rating: 4.7 },
  { id: "p3", title: "Diamond Slots", image: CARD_IMAGES[2], badge: "NEW", rating: 4.6 },
  { id: "p4", title: "Fortune King", image: CARD_IMAGES[3], badge: "HOT", rating: 4.8 },
  { id: "p5", title: "Luxe 777", image: CARD_IMAGES[4], badge: "NEW", rating: 4.7 },
  { id: "p6", title: "Fruit Blast", image: CARD_IMAGES[5], badge: "HOT", rating: 4.6 },
  { id: "p7", title: "Starlight Quest", image: SMALL_CARD_IMAGES[0], badge: "NEW", rating: 4.4 },
  { id: "p8", title: "Crimson Bandits", image: SMALL_CARD_IMAGES[1], badge: "TRENDING", rating: 4.3 },
  { id: "p9", title: "Frost Kingdom", image: SMALL_CARD_IMAGES[2], badge: "HOT", rating: 4.6 },
  { id: "p10", title: "Sunset Rally", image: SMALL_CARD_IMAGES[3], badge: "NEW", rating: 4.2 },
  { id: "p11", title: "Void Runners", image: SMALL_CARD_IMAGES[4], badge: "EXCLUSIVE", rating: 4.5 },
  { id: "p12", title: "Emerald Isle", image: SMALL_CARD_IMAGES[5], badge: "JACKPOT", rating: 4.7 },
];

export type PromoAccent = "violet" | "gold" | "green";

export interface PromoCardData {
  id: "daily-bonus" | "vip-club" | "lucky-wheel";
  title: string;
  description: string;
  cta: string;
  accent: PromoAccent;
}

export const promoCards: PromoCardData[] = [
  {
    id: "daily-bonus",
    title: "Play & Win",
    description: "Spin, match, and play your way through exciting challenges!",
    cta: "Play Now",
    accent: "violet",
  },
  {
    id: "vip-club",
    title: "Feel the Thrill",
    description: "Fast-paced gameplay, exciting rounds, and big winning moments!",
    cta: "Play Now",
    accent: "gold",
  },
  {
    id: "lucky-wheel",
    title: "Your Next Game",
    description: "Pick a game, test your luck, and see if you can hit the jackpot!",
    cta: "Play Now",
    accent: "green",
  },
];
