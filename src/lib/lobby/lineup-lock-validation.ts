export type LineupLockPlayer = {
  current_zone: string;
  injured: boolean;
};

export type LineupZoneCounts = {
  ATT: number;
  DEF: number;
  GK: number;
  MID: number;
};

export type LineupLockValidation = {
  hasIncompleteLineup: boolean;
  hasInjuredInLineup: boolean;
  isComplete: boolean;
  starterCount: number;
  zoneCounts: LineupZoneCounts;
};

const FORMATION_ZONE_COUNTS: Array<Pick<LineupZoneCounts, "ATT" | "DEF" | "MID"> & { GK: 1 }> = [
  { ATT: 3, DEF: 3, MID: 4, GK: 1 },
  { ATT: 2, DEF: 4, MID: 4, GK: 1 },
  { ATT: 3, DEF: 4, MID: 3, GK: 1 },
  { ATT: 2, DEF: 3, MID: 5, GK: 1 },
  { ATT: 2, DEF: 5, MID: 3, GK: 1 },
];

function isLineupZone(value: string): value is keyof LineupZoneCounts {
  return value === "ATT" || value === "DEF" || value === "GK" || value === "MID";
}

function matchesKnownFormation(zoneCounts: LineupZoneCounts) {
  return FORMATION_ZONE_COUNTS.some(
    (formation) =>
      formation.ATT === zoneCounts.ATT &&
      formation.DEF === zoneCounts.DEF &&
      formation.MID === zoneCounts.MID &&
      formation.GK === zoneCounts.GK,
  );
}

export function getLineupLockValidation(players: LineupLockPlayer[]): LineupLockValidation {
  const hasInjuredInLineup = players.some((player) => player.injured && player.current_zone !== "bench");
  const healthyStarters = players.filter((player) => !player.injured && player.current_zone !== "bench");
  const zoneCounts: LineupZoneCounts = { ATT: 0, DEF: 0, GK: 0, MID: 0 };

  for (const player of healthyStarters) {
    if (isLineupZone(player.current_zone)) {
      zoneCounts[player.current_zone] += 1;
    }
  }

  const isComplete = healthyStarters.length === 11 && matchesKnownFormation(zoneCounts);

  return {
    hasIncompleteLineup: !isComplete,
    hasInjuredInLineup,
    isComplete,
    starterCount: healthyStarters.length,
    zoneCounts,
  };
}
