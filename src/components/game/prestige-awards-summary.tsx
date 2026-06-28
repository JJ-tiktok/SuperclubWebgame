"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatPrestigeAwardLabel,
  formatPrestigeAwardPoints,
  prestigePointsClassName,
  sumPrestigeAwardPoints,
} from "@/lib/lobby/prestige";
import type { PrestigeAwardSnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

export function PrestigeSeasonAwardsSummary({
  awards,
  seasonNumber,
  title = "Prestige diese Saison",
}: {
  awards: PrestigeAwardSnapshot[];
  seasonNumber: number;
  title?: string;
}) {
  const seasonAwards = awards.filter((award) => award.season_number === seasonNumber);
  const seasonSum = sumPrestigeAwardPoints(seasonAwards);

  if (seasonAwards.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium uppercase text-zinc-500">{title}</p>
        <p className="mt-2 text-sm text-zinc-500">Keine Prestige-Aenderungen in Saison {seasonNumber}.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase text-zinc-500">{title}</p>
      <div className="mt-3 space-y-2">
        {seasonAwards.map((award) => (
          <div
            key={award.id}
            className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/55 px-3 py-2"
          >
            <p className="min-w-0 truncate text-sm text-zinc-200">
              {formatPrestigeAwardLabel(award.category, award.metadata)}
            </p>
            <Badge tone={award.points < 0 ? "red" : "green"}>{formatPrestigeAwardPoints(award.points)}</Badge>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Saison-Saldo:{" "}
        <span className={cn("font-semibold", prestigePointsClassName(seasonSum))}>
          {formatPrestigeAwardPoints(seasonSum)}
        </span>
      </p>
    </div>
  );
}
