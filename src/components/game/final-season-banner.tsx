"use client";

import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSeasonNumber, isFinalSeason } from "@/lib/lobby/phases";
import type { LobbyGame } from "@/lib/lobby/types";

export function FinalSeasonBanner({ game }: { game: LobbyGame }) {
  if (game.phase === "completed" || !isFinalSeason(game.settings)) {
    return null;
  }

  const seasonNumber = getSeasonNumber(game.settings);

  return (
    <div className="overflow-hidden rounded-lg border border-amber-600/70 bg-gradient-to-r from-amber-950/90 via-amber-900/40 to-zinc-950/90 shadow-lg shadow-amber-950/30">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-200">
            <Flag size={20} aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-amber-100">Finale Saison</p>
              <Badge tone="amber">Saison {seasonNumber}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-amber-100/80">
              Ein Manager hat das Prestige-Ziel erreicht. Dies ist die letzte Saison des Spiels. Nach Saisonabschluss
              {game.settings.continental_cup_enabled !== false ? " und ggf. Continental Cup" : ""} wird der Sieger nach
              hoechstem Prestige ermittelt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
