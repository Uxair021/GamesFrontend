import { gameRegistry } from "../games/registry";
import { GameCard } from "../components/GameCard";

export function HomePage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-950">
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-black text-white">Welcome to Texas Slots</h1>
          <p className="mt-2 text-slate-400">Pick a game and spin.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3">
          {gameRegistry.map((game) => (
            <GameCard key={game.slug} slug={game.slug} name={game.name} description={game.description} />
          ))}
        </div>
      </div>
    </div>
  );
}
