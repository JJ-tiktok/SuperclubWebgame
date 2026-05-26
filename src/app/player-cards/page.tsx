import { PlayerCardsDemo } from "@/components/player-card/PlayerCardsDemo";
import samplePlayerCards from "@/data/sample-player-cards.json";
import type { PlayerCardData } from "@/types/player-card";

const players = samplePlayerCards as PlayerCardData[];

export default function PlayerCardsPage() {
  return (
    <main className="min-h-screen bg-[#06120d] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <PlayerCardsDemo players={players} />
    </main>
  );
}
