"use client";

import { countSquadByOverviewPosition, DRAFT_OVERVIEW_POSITIONS } from "@/lib/lobby/draft";
import type { LobbySnapshot } from "@/lib/lobby/types";
import { cn } from "@/lib/utils";

/**
 * Counts squad members per position bucket (GK/DEF/MID/ATT/UTIL).
 * UTIL = Allrounder mit allen vier Positionen.
 */
export function SquadPositionBreakdown({
  className,
  squad,
}: {
  className?: string;
  squad: NonNullable<LobbySnapshot["club_overview"]>["squad"];
}) {
  if (squad.length === 0) {
    return null;
  }

  const counts = countSquadByOverviewPosition(squad.map((owned) => owned.player));
  const total = squad.length;

  return (
    <div className={cn("rounded-md border border-zinc-800 bg-zinc-900/60 p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Positionen im Kader</p>
        <p className="text-xs text-zinc-500">{total} Spieler gesamt</p>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        {DRAFT_OVERVIEW_POSITIONS.map(({ key, label }) => (
          <div
            className={cn("rounded-md px-2 py-2", key === "UTIL" ? "bg-violet-950/50" : "bg-zinc-950/70")}
            key={key}
          >
            <p className={cn("font-semibold uppercase", key === "UTIL" ? "text-violet-300" : "text-zinc-400")}>{label}</p>
            <p
              className={cn(
                "mt-1 text-lg font-black tabular-nums",
                counts[key] > 0
                  ? key === "UTIL"
                    ? "text-violet-100"
                    : "text-zinc-50"
                  : "text-zinc-600",
              )}
            >
              {counts[key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
