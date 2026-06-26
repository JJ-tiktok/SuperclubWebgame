"use client";

import Link from "next/link";
import { getPlayerHighlights } from "@/components/game/lib/player-highlights";
import { Panel, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";
import { Clock3, Sparkles, Star, TrendingUp, Users } from "lucide-react";

const CATEGORY_ICONS = {
  top_rated: Star,
  highest_potential: Sparkles,
  highest_growth_potential: TrendingUp,
  longest_tenure: Clock3,
} as const;

export function PlayerHighlightsPanel({
  roomCode,
  squad,
}: {
  roomCode?: string;
  squad: ClubPlayerSnapshot[];
}) {
  const highlights = getPlayerHighlights(squad);

  if (highlights.length === 0) {
    return null;
  }

  return (
    <Panel className="border-[var(--club-border)] bg-zinc-950/85" id="player-highlights">
      <PanelHeader>
        <div>
          <PanelTitle>Kader-Highlights</PanelTitle>
          <PanelDescription>Deine praeegenden Spieler — inklusive eigener Namen.</PanelDescription>
        </div>
        <Users size={18} className="text-[var(--club-color)]" aria-hidden />
      </PanelHeader>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {highlights.map((entry) => {
          const Icon = CATEGORY_ICONS[entry.category];
          return (
            <div
              className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3"
              key={entry.category}
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Icon size={14} className="text-[var(--club-color)]" aria-hidden />
                {entry.label}
              </div>
              <p className="text-base font-semibold text-zinc-50">{entry.displayName}</p>
              <p className="mt-1 text-sm text-zinc-400">{entry.detail}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {entry.player.player.position}
                {entry.player.custom_name?.trim() ? " · umbenannt" : ""}
              </p>
            </div>
          );
        })}
      </div>

      {roomCode ? (
        <p className="mt-3 text-right text-xs">
          <Link
            className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
            href={`/games/${roomCode}?view=hall_of_fame`}
          >
            Alle Legenden ansehen
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}
