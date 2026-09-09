import { lazy } from "react";
import { shamrockSpinMeta } from "./ShamrockSpin/meta";
import { cashMachineMeta } from "./CashMachine/meta";
import { buffalo777Meta } from "./Buffalo777/meta";
import { crazy777Meta } from "./Crazy777/meta";
import { fiveXRewindMeta } from "./FiveXRewind/meta";
import { sizzlingSevensMeta } from "./SizzlingSevens/meta";
import { crystalCloverMeta } from "./CrystalClover/meta";
import { fruity777Meta } from "./Fruity777/meta";
import { mega10xPayMeta } from "./Mega10XPay/meta";
import { vegasHitsMeta } from "./VegasHits/meta";
import { lifeOfLuxuryMeta } from "./LifeOfLuxury/meta";

export interface GameRegistryEntry {
  slug: string;
  name: string;
  description: string;
  component: ReturnType<typeof lazy>;
}

// Add each new game's meta + lazy component here as it's built.
export const gameRegistry: GameRegistryEntry[] = [
  {
    slug: shamrockSpinMeta.slug,
    name: shamrockSpinMeta.name,
    description: shamrockSpinMeta.description,
    component: lazy(() =>
      import("./ShamrockSpin/ShamrockSpinGame").then((m) => ({ default: m.ShamrockSpinGame }))
    ),
  },
  {
    slug: cashMachineMeta.slug,
    name: cashMachineMeta.name,
    description: cashMachineMeta.description,
    component: lazy(() =>
      import("./CashMachine/CashMachineGame").then((m) => ({ default: m.CashMachineGame }))
    ),
  },
  {
    slug: buffalo777Meta.slug,
    name: buffalo777Meta.name,
    description: buffalo777Meta.description,
    component: lazy(() =>
      import("./Buffalo777/Buffalo777Game").then((m) => ({ default: m.Buffalo777Game }))
    ),
  },
  {
    slug: crazy777Meta.slug,
    name: crazy777Meta.name,
    description: crazy777Meta.description,
    component: lazy(() =>
      import("./Crazy777/Crazy777Game").then((m) => ({ default: m.Crazy777Game }))
    ),
  },
  {
    slug: fiveXRewindMeta.slug,
    name: fiveXRewindMeta.name,
    description: fiveXRewindMeta.description,
    component: lazy(() =>
      import("./FiveXRewind/FiveXRewindGame").then((m) => ({ default: m.FiveXRewindGame }))
    ),
  },
  {
    slug: sizzlingSevensMeta.slug,
    name: sizzlingSevensMeta.name,
    description: sizzlingSevensMeta.description,
    component: lazy(() =>
      import("./SizzlingSevens/SizzlingSevensGame").then((m) => ({ default: m.SizzlingSevensGame }))
    ),
  },
  {
    slug: crystalCloverMeta.slug,
    name: crystalCloverMeta.name,
    description: crystalCloverMeta.description,
    component: lazy(() =>
      import("./CrystalClover/CrystalCloverGame").then((m) => ({ default: m.CrystalCloverGame }))
    ),
  },
  {
    slug: fruity777Meta.slug,
    name: fruity777Meta.name,
    description: fruity777Meta.description,
    component: lazy(() =>
      import("./Fruity777/Fruity777Game").then((m) => ({ default: m.Fruity777Game }))
    ),
  },
  {
    slug: mega10xPayMeta.slug,
    name: mega10xPayMeta.name,
    description: mega10xPayMeta.description,
    component: lazy(() =>
      import("./Mega10XPay/Mega10XPayGame").then((m) => ({ default: m.Mega10XPayGame }))
    ),
  },
  {
    slug: vegasHitsMeta.slug,
    name: vegasHitsMeta.name,
    description: vegasHitsMeta.description,
    component: lazy(() =>
      import("./VegasHits/VegasHitsGame").then((m) => ({ default: m.VegasHitsGame }))
    ),
  },
  {
    slug: lifeOfLuxuryMeta.slug,
    name: lifeOfLuxuryMeta.name,
    description: lifeOfLuxuryMeta.description,
    component: lazy(() =>
      import("./LifeOfLuxury/LifeOfLuxuryGame").then((m) => ({ default: m.LifeOfLuxuryGame }))
    ),
  },
];

export function getGameBySlug(slug: string): GameRegistryEntry | undefined {
  return gameRegistry.find((g) => g.slug === slug);
}
