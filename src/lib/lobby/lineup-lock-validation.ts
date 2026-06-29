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
  implicitDefaultGoalkeeper: boolean;
  isComplete: boolean;
  starterCount: number;
  zoneCounts: LineupZoneCounts;
};

export type LineupLockValidationOptions = {
  implicitDefaultGoalkeeper?: boolean;
};

export type LineupSaveSquadPlayer = LineupLockPlayer & {
  player?: {
    eligible_positions?: string[] | null;
    position?: string | null;
  } | null;
};

export type SubmittedLineupZone = {
  club_player_id: string;
  zone: string;
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

export function getLineupLockValidation(
  players: LineupLockPlayer[],
  options: LineupLockValidationOptions = {},
): LineupLockValidation {
  const implicitDefaultGoalkeeper = options.implicitDefaultGoalkeeper ?? false;
  const hasInjuredInLineup = players.some((player) => player.injured && player.current_zone !== "bench");
  const healthyStarters = players.filter((player) => !player.injured && player.current_zone !== "bench");
  const zoneCounts: LineupZoneCounts = { ATT: 0, DEF: 0, GK: 0, MID: 0 };

  for (const player of healthyStarters) {
    if (isLineupZone(player.current_zone)) {
      zoneCounts[player.current_zone] += 1;
    }
  }

  const effectiveZoneCounts: LineupZoneCounts = implicitDefaultGoalkeeper
    ? { ...zoneCounts, GK: zoneCounts.GK + 1 }
    : zoneCounts;
  const effectiveStarterCount = healthyStarters.length + (implicitDefaultGoalkeeper ? 1 : 0);
  const isComplete = effectiveStarterCount === 11 && matchesKnownFormation(effectiveZoneCounts);

  return {
    hasIncompleteLineup: !isComplete,
    hasInjuredInLineup,
    implicitDefaultGoalkeeper,
    isComplete,
    starterCount: healthyStarters.length,
    zoneCounts,
  };
}

export function getLineupValidationAfterSave(
  squadPlayers: LineupSaveSquadPlayer[],
  submitted: SubmittedLineupZone[],
  options: { shouldUseDefaultGivenKeeper: (params: {
    lineupPlayers: Array<{ current_zone: string; injured?: boolean | null }>;
    squadPlayers: LineupSaveSquadPlayer[];
  }) => boolean },
): LineupLockValidation {
  const submittedById = new Map(submitted.map((item) => [item.club_player_id, item]));
  const postSavePlayers = squadPlayers.map((row) => ({
    current_zone: submittedById.get(row.id)?.zone ?? "bench",
    injured: row.injured,
  }));

  return getLineupLockValidation(postSavePlayers, {
    implicitDefaultGoalkeeper: options.shouldUseDefaultGivenKeeper({
      lineupPlayers: postSavePlayers,
      squadPlayers,
    }),
  });
}
