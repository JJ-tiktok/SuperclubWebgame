import { getTrainingCapacity } from "@/lib/game/rules";

export type TrainingEventMetadata = {
  after_stars: number;
  before_stars: number;
  club_player_id: string;
  dice_roll: number;
  game_phase: string;
  guaranteed_bonus_used: boolean;
  player_id: string;
  season_number: number;
  success: boolean;
  training_level: number;
};

export type TrainingEventSnapshot = {
  after_stars: number;
  before_stars: number;
  club_player_id: string;
  created_at: string;
  dice_roll: number;
  game_phase: string;
  guaranteed_bonus_used: boolean;
  id: string;
  player_id: string;
  season_number: number;
  success: boolean;
  training_level: number;
};

export type TrainingStatusSnapshot = {
  attempts_used: number;
  capacity_players: number;
  guaranteed_bonus_available: boolean;
  guaranteed_bonus_used: boolean;
  max_gain_per_player: number;
  training_level: number;
};

export type TrainingResolution = {
  afterStars: number;
  beforeStars: number;
  diceRoll: number;
  guaranteedBonusUsed: boolean;
  success: boolean;
};

export function resolveTrainingAttempt(params: {
  currentStars: number;
  diceRoll: number;
  guaranteedBonusAvailable: boolean;
  skillMax: number;
  trainingLevel: number;
}): TrainingResolution {
  const beforeStars = Math.trunc(params.currentStars);
  const skillMax = Math.trunc(params.skillMax);
  const trainingLevel = Math.max(1, Math.min(4, Math.trunc(params.trainingLevel)));
  const diceRoll = Math.max(1, Math.min(6, Math.trunc(params.diceRoll)));

  if (beforeStars >= skillMax) {
    return {
      afterStars: beforeStars,
      beforeStars,
      diceRoll,
      guaranteedBonusUsed: false,
      success: false,
    };
  }

  const trainingCap = Math.min(beforeStars + trainingLevel, skillMax);
  const rolledTarget = Math.min(diceRoll, trainingCap);
  const rollSucceeded = rolledTarget > beforeStars;

  // Guaranteed bonus only activates when the dice roll failed — it saves the first failed roll as +1
  const guaranteedActivates = params.guaranteedBonusAvailable && !rollSucceeded;
  const guaranteedTarget = guaranteedActivates ? Math.min(beforeStars + 1, skillMax) : beforeStars;
  const afterStars = Math.max(beforeStars, rolledTarget, guaranteedTarget);

  return {
    afterStars,
    beforeStars,
    diceRoll,
    guaranteedBonusUsed: guaranteedActivates && guaranteedTarget > beforeStars,
    success: afterStars > beforeStars,
  };
}

export function getTrainingStatus(params: {
  events: TrainingEventSnapshot[];
  trainingLevel: number;
  extraPlayers?: number;
}): TrainingStatusSnapshot {
  const capacity = getTrainingCapacity(params.trainingLevel);
  const guaranteedBonusUsed = params.events.some((event) => event.guaranteed_bonus_used);

  return {
    attempts_used: params.events.length,
    capacity_players: capacity.players + (params.extraPlayers ?? 0),
    guaranteed_bonus_available: capacity.guaranteedStarForPlayers > 0 && !guaranteedBonusUsed,
    guaranteed_bonus_used: guaranteedBonusUsed,
    max_gain_per_player: capacity.maxStarsPerPlayer,
    training_level: Math.max(1, Math.min(4, Math.trunc(params.trainingLevel))),
  };
}

export function canTrainOwnedPlayer(params: {
  alreadyTrained: boolean;
  attemptsUsed: number;
  capacityPlayers: number;
  currentStars: number;
  injured: boolean;
  skillMax: number;
}) {
  if (params.injured) {
    return { ok: false, reason: "player_injured" } as const;
  }

  if (params.currentStars >= params.skillMax) {
    return { ok: false, reason: "skill_max_reached" } as const;
  }

  if (params.alreadyTrained) {
    return { ok: false, reason: "already_trained" } as const;
  }

  if (params.attemptsUsed >= params.capacityPlayers) {
    return { ok: false, reason: "training_capacity_used" } as const;
  }

  return { ok: true } as const;
}

export function parseTrainingEvent(row: {
  created_at: string;
  id: string;
  metadata: unknown;
}): TrainingEventSnapshot | null {
  if (!row.metadata || typeof row.metadata !== "object") {
    return null;
  }

  const metadata = row.metadata as Record<string, unknown>;
  const clubPlayerId = typeof metadata.club_player_id === "string" ? metadata.club_player_id : "";
  const playerId = typeof metadata.player_id === "string" ? metadata.player_id : "";

  if (!clubPlayerId || !playerId) {
    return null;
  }

  return {
    after_stars: Number(metadata.after_stars ?? 0),
    before_stars: Number(metadata.before_stars ?? 0),
    club_player_id: clubPlayerId,
    created_at: row.created_at,
    dice_roll: Number(metadata.dice_roll ?? 0),
    game_phase: typeof metadata.game_phase === "string" ? metadata.game_phase : "",
    guaranteed_bonus_used: Boolean(metadata.guaranteed_bonus_used),
    id: row.id,
    player_id: playerId,
    season_number: Number(metadata.season_number ?? 1),
    success: Boolean(metadata.success),
    training_level: Number(metadata.training_level ?? 1),
  };
}

export function getTrainingReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    already_trained: "Bereits trainiert",
    player_injured: "Verletzt",
    skill_max_reached: "Maximum erreicht",
    training_capacity_used: "Training voll",
  };

  return labels[String(reason)] ?? "Nicht trainierbar";
}
