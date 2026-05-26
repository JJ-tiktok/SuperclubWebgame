import Link from "next/link";
import { Clock, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { SavedGameSummary } from "@/lib/lobby/types";

type SavedGamesListProps = {
  games: SavedGameSummary[];
};

export function SavedGamesList({ games }: SavedGamesListProps) {
  if (games.length === 0) {
    return (
      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Spielstaende</PanelTitle>
            <PanelDescription>Noch kein gespeicherter Room fuer deinen Account.</PanelDescription>
          </div>
          <FolderOpen size={18} className="text-zinc-500" aria-hidden />
        </PanelHeader>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>Spielstaende</PanelTitle>
          <PanelDescription>Erstellte und beigetretene Spiele koennen spaeter wieder geladen werden.</PanelDescription>
        </div>
        <FolderOpen size={18} className="text-zinc-500" aria-hidden />
      </PanelHeader>
      <div className="grid gap-3 md:grid-cols-2">
        {games.map((game) => (
          <article key={game.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={game.is_host ? "amber" : "neutral"}>{game.is_host ? "Host" : "Mitspieler"}</Badge>
              <Badge>{game.phase}</Badge>
              <Badge>v{game.save_version}</Badge>
            </div>
            <h2 className="mt-3 truncate text-base font-semibold text-zinc-50">{game.save_name}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Room <span className="font-mono text-zinc-300">{game.room_code}</span>
              {game.own_club_name ? ` - ${game.own_club_name}` : ""}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <Clock size={14} aria-hidden />
              {formatSavedAt(game.last_saved_at)}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {game.ready_count}/{game.club_count} bereit
              </p>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md bg-lime-300 px-3 text-sm font-medium text-zinc-950 transition hover:bg-lime-200"
                href={`/games/${game.room_code}`}
              >
                Laden
              </Link>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function formatSavedAt(value: string) {
  if (!value) {
    return "Noch kein Speicherzeitpunkt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
