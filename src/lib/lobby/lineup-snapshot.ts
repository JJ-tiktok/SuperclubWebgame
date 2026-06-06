import type { PlayerArchetype } from "@/lib/lobby/types";
import { getClubPlayerDisplayNameFromRow } from "@/lib/lobby/player-names";

export type LineupSnapshotStarter = {
  display_name: string;
  zone: string;
  stars: number;
  attacker_archetype?: PlayerArchetype | null;
  defender_archetype?: PlayerArchetype | null;
};

export type LineupSnapshotSide = {
  starters: LineupSnapshotStarter[];
};

export type FixtureLineupSnapshot = {
  home: LineupSnapshotSide;
  away: LineupSnapshotSide;
};

export type LineupSnapshotClubPlayerRow = {
  custom_name?: string | null;
  current_stars: number | string;
  current_zone: string;
  lineup_slot: number | null;
  player: {
    attacker_archetype?: PlayerArchetype | null;
    defender_archetype?: PlayerArchetype | null;
    display_name: string;
  } | null;
};

export function buildLineupSnapshotFromPlayers(players: LineupSnapshotClubPlayerRow[]): LineupSnapshotSide {
  const starters = players
    .filter((row) => row.current_zone !== "bench")
    .sort((left, right) => Number(left.lineup_slot ?? 999) - Number(right.lineup_slot ?? 999))
    .map((row) => ({
      display_name: getClubPlayerDisplayNameFromRow(row),
      zone: row.current_zone,
      stars: Number(row.current_stars),
      attacker_archetype: row.player?.attacker_archetype ?? null,
      defender_archetype: row.player?.defender_archetype ?? null,
    }));

  return { starters };
}
