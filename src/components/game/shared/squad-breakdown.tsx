"use client";

import type { LobbySnapshot } from "@/lib/lobby/types";

const POSITIONS = [
  { key: "GK", label: "TW" },
  { key: "DEF", label: "ABW" },
  { key: "MID", label: "MIT" },
  { key: "ATT", label: "ANG" },
] as const;

/**
 * Counts squad members per zone (eligible positions). Used in the squad
 * overview and the dashboard hero panel.
 */
export function SquadPositionBreakdown({ squad }: { squad: NonNullable<LobbySnapshot["club_overview"]>["squad"] }) {
  const counts = Object.fromEntries(
    POSITIONS.map(({ key }) => [
      key,
      squad.filter((p) => {
        const positions = p.player.eligible_positions?.length ? p.player.eligible_positions : [p.player.position];
        return positions.includes(key);
      }).length,
    ]),
  ) as Record<string, number>;

  return (
    <div className="flex flex-wrap gap-2">
      {POSITIONS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
          <span className="text-sm font-bold text-zinc-100">{counts[key]}</span>
        </div>
      ))}
    </div>
  );
}
