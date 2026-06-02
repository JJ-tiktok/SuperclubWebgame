"use client";

import { useMemo, useState } from "react";
import type { ClubGameChangerSnapshot, ClubPendingEffectSnapshot } from "@/lib/lobby/types";
import { Badge } from "@/components/ui/badge";
import {
  describePendingEffect,
  getCategoryStyle,
  PENDING_SCOPE_LABELS,
} from "@/lib/game/game-changer-ui";
import { cn } from "@/lib/utils";

function resolveGameChangerSeason(
  gc: ClubGameChangerSnapshot,
  pendingEffects: ClubPendingEffectSnapshot[],
  currentSeasonNumber: number,
): number {
  if (gc.season_number != null && gc.season_number > 0) {
    return gc.season_number;
  }
  const linked = pendingEffects.find((e) => e.source_club_game_changer_id === gc.id);
  if (linked) return linked.season_number;
  return currentSeasonNumber;
}

export function PendingEffectsList({
  effects,
  gameChangers,
  currentSeasonNumber,
}: {
  effects: ClubPendingEffectSnapshot[];
  gameChangers: ClubGameChangerSnapshot[];
  currentSeasonNumber: number;
}) {
  const sourceById = new Map(gameChangers.map((gc) => [gc.id, gc] as const));
  const seasonEffects = effects.filter((e) => e.season_number === currentSeasonNumber);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Aktive Karteneffekte (Saison {currentSeasonNumber})
      </h4>
      {seasonEffects.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-500">
          Keine offenen Effekte in dieser Saison. Ziehe Good- oder Bad-News-Karten ueber Doppel-Wuerfel im Match.
        </div>
      ) : (
        <ul className="space-y-2">
          {seasonEffects.map((effect) => {
            const source = effect.source_club_game_changer_id
              ? sourceById.get(effect.source_club_game_changer_id)
              : undefined;
            const categoryStyle = source ? getCategoryStyle(source.card.category) : null;
            const tone = source?.card.category === "bad_news"
              ? "border-rose-800/60 bg-rose-950/30"
              : source?.card.category === "good_news"
                ? "border-emerald-800/60 bg-emerald-950/30"
                : "border-amber-800/60 bg-amber-950/30";

            return (
              <li key={effect.id} className={`rounded-md border p-3 text-sm ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {source ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-zinc-100">{source.card.display_name}</p>
                        {categoryStyle ? (
                          <span className={`text-xs font-medium ${categoryStyle.accent}`}>
                            {categoryStyle.label}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className={source ? "mt-0.5 text-xs text-zinc-300" : "font-medium text-zinc-100"}>
                      {describePendingEffect(effect)}
                    </p>
                  </div>
                  <Badge>{PENDING_SCOPE_LABELS[effect.scope] ?? effect.scope}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DrawnGameChangersList({
  gameChangers,
  pendingEffects,
  currentSeasonNumber,
}: {
  gameChangers: ClubGameChangerSnapshot[];
  pendingEffects: ClubPendingEffectSnapshot[];
  currentSeasonNumber: number;
}) {
  const [selectedSeason, setSelectedSeason] = useState(currentSeasonNumber);

  const newsCards = useMemo(
    () =>
      gameChangers.filter((gc) => gc.card.category === "good_news" || gc.card.category === "bad_news"),
    [gameChangers],
  );

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    for (const gc of newsCards) {
      seasons.add(resolveGameChangerSeason(gc, pendingEffects, currentSeasonNumber));
    }
    seasons.add(currentSeasonNumber);
    return [...seasons].sort((a, b) => b - a);
  }, [newsCards, pendingEffects, currentSeasonNumber]);

  const drawn = useMemo(
    () =>
      newsCards
        .filter(
          (gc) =>
            resolveGameChangerSeason(gc, pendingEffects, currentSeasonNumber) === selectedSeason,
        )
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        }),
    [newsCards, pendingEffects, currentSeasonNumber, selectedSeason],
  );

  const openEffectSourceIds = new Set(
    pendingEffects
      .filter((e) => e.season_number === selectedSeason)
      .map((e) => e.source_club_game_changer_id)
      .filter((id): id is string => Boolean(id)),
  );

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Gezogene Karten</h4>
        {availableSeasons.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {availableSeasons.map((season) => (
              <button
                key={season}
                type="button"
                onClick={() => setSelectedSeason(season)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium transition",
                  selectedSeason === season
                    ? "bg-[var(--club-color)] text-white"
                    : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
                )}
              >
                Saison {season}
                {season === currentSeasonNumber ? " (aktuell)" : ""}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-600">Saison {selectedSeason}</span>
        )}
      </div>

      {drawn.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-500">
          {selectedSeason === currentSeasonNumber
            ? "In dieser Saison noch keine Good- oder Bad-News-Karten gezogen."
            : `Keine Karten in Saison ${selectedSeason}.`}
        </div>
      ) : (
        <ul className="space-y-2">
          {drawn.map((gc) => {
            const style = getCategoryStyle(gc.card.category);
            const hasOpenEffect = openEffectSourceIds.has(gc.id);
            const statusLabel = hasOpenEffect
              ? "Effekt aktiv"
              : gc.used_at
                ? "Umgesetzt"
                : gc.status === "pending"
                  ? "Auswahl offen"
                  : "Abgeschlossen";

            return (
              <li
                key={gc.id}
                className={`rounded-md border p-3 text-sm ${style.chipBg} ${style.chipBorder}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-zinc-100">{gc.card.display_name}</p>
                      <span className={`text-xs font-medium ${style.accent}`}>{style.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">{gc.card.description}</p>
                    {gc.created_at ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        {new Date(gc.created_at).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={hasOpenEffect ? "green" : "neutral"}>{statusLabel}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
