import { formatStars } from "@/components/game/lib/dashboard-helpers";
import type { OpponentTopPlayerSnapshot } from "@/lib/lobby/types";

export function TeamTopPlayersList({ players }: { players: OpponentTopPlayerSnapshot[] }) {
  if (players.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Top-Spieler</p>
      <ul className="mt-1.5 space-y-1">
        {players.map((player) => (
          <li className="flex items-center justify-between gap-2 text-xs" key={`${player.name}-${player.stars}-${player.position ?? ""}`}>
            <span className="truncate font-medium text-zinc-200" title={player.name}>
              {player.name}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-400">
              {formatStars(player.stars)}
              {player.position ? <span className="ml-1 text-zinc-600">({player.position})</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
