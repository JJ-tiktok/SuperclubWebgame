import type { PlayerCardData, PlayerCardPosition } from "@/types/player-card";
import type { LineupPowerPlayer } from "@/lib/lobby/lineup-power";

export const DEFAULT_GIVEN_KEEPER_ID = "default-given-gk";

export type LineupAssignmentCard = PlayerCardData & {
  injured?: boolean;
  unavailable?: boolean;
  lockedDefault?: boolean;
  sourceZone?: string;
  lineupSlot?: number | null;
};

export type FormationSlot = {
  id: string;
  label: string;
  required: boolean;
  zone: PlayerCardPosition;
  x: number;
  y: number;
};

export function isLineupPlayerBlocked(
  player?: Pick<LineupAssignmentCard, "injured" | "lockedDefault" | "unavailable">,
) {
  return Boolean(player?.injured || player?.unavailable || player?.lockedDefault);
}

export function isLineupPlayerAssignable(
  player?: Pick<LineupAssignmentCard, "injured" | "unavailable">,
) {
  return Boolean(player && !player.injured && !player.unavailable);
}

export function isLineupPlayerActive(
  player?: Pick<LineupAssignmentCard, "injured" | "unavailable" | "lockedDefault">,
) {
  return Boolean(player && !player.injured && !player.unavailable);
}

export function hasFitGoalkeeper(cards: LineupAssignmentCard[]) {
  return cards.some((card) => card.positions.includes("GK") && isLineupPlayerAssignable(card));
}

export function createDefaultGivenKeeperCard(): LineupAssignmentCard {
  return {
    ageGroup: "prime",
    cardStyle: { tier: "standard", theme: "dark" },
    chemistry: { left: false, right: false, symbol: "star" },
    id: DEFAULT_GIVEN_KEEPER_ID,
    lockedDefault: true,
    market: { currency: "M", scoutingFee: 0, transferFee: 0 },
    name: "Given",
    position: "GK",
    positions: ["GK"],
    role: "Default Torhueter",
    skill: { current: 1, max: 1, potential: 1 },
    sourceZone: "GK",
  };
}

export function createDefaultGivenKeeperPowerPlayer(): LineupPowerPlayer {
  return {
    id: DEFAULT_GIVEN_KEEPER_ID,
    chemistry_left: false,
    chemistry_right: false,
    current_stars: 1,
    current_zone: "GK",
    position: "GK",
    positions: ["GK"],
  };
}

export type SquadGoalkeeperCheckPlayer = {
  injured?: boolean | null;
  player?: {
    eligible_positions?: string[] | null;
    position?: string | null;
  } | null;
};

export function hasGoalkeeperInLineup(players: Array<{ current_zone: string; injured?: boolean | null }>) {
  return players.some((player) => !player.injured && player.current_zone === "GK");
}

export function hasFitGoalkeeperInSquad(players: SquadGoalkeeperCheckPlayer[]) {
  return players.some((row) => {
    if (row.injured) {
      return false;
    }

    const positions = row.player?.eligible_positions?.length
      ? row.player.eligible_positions
      : row.player?.position
        ? [row.player.position]
        : [];

    return positions.includes("GK");
  });
}

export function shouldUseDefaultGivenKeeper(params: {
  lineupPlayers: Array<{ current_zone: string; injured?: boolean | null }>;
  squadPlayers: SquadGoalkeeperCheckPlayer[];
}) {
  if (hasGoalkeeperInLineup(params.lineupPlayers)) {
    return false;
  }

  return !hasFitGoalkeeperInSquad(params.squadPlayers);
}

export function applyDefaultGivenKeeperToLineupPowerPlayers(
  lineupPlayers: LineupPowerPlayer[],
  squadPlayers: SquadGoalkeeperCheckPlayer[],
) {
  if (!shouldUseDefaultGivenKeeper({ lineupPlayers, squadPlayers })) {
    return lineupPlayers;
  }

  return [...lineupPlayers, createDefaultGivenKeeperPowerPlayer()];
}

export function ensureDefaultKeeper(cards: LineupAssignmentCard[]) {
  if (hasFitGoalkeeper(cards)) {
    return cards;
  }

  return [createDefaultGivenKeeperCard(), ...cards];
}

function normalizeZone(value: string | undefined): PlayerCardPosition | "bench" | null {
  if (value === "GK" || value === "DEF" || value === "MID" || value === "ATT" || value === "bench") {
    return value;
  }

  return null;
}

export function getSlotIdsByZone(slots: FormationSlot[]) {
  const initial: Record<PlayerCardPosition, string[]> = { ATT: [], DEF: [], GK: [], MID: [] };

  return slots.reduce(
    (groups, slot) => {
      groups[slot.zone].push(slot.id);
      return groups;
    },
    initial,
  );
}

function assignCard(
  card: LineupAssignmentCard,
  zone: PlayerCardPosition,
  assignments: Record<string, string>,
  used: Set<string>,
  slotIdsByZone: Record<PlayerCardPosition, string[]>,
  options: { ignorePositionCheck?: boolean } = {},
) {
  const slots = slotIdsByZone[zone] ?? [];

  if (!isLineupPlayerAssignable(card)) {
    return;
  }

  for (const slotId of slots) {
    if (assignments[slotId]) {
      continue;
    }

    if (!options.ignorePositionCheck && !card.positions.includes(zone)) {
      continue;
    }

    assignments[slotId] = card.id;
    used.add(card.id);
    return;
  }
}

export function buildInitialAssignments(
  cards: LineupAssignmentCard[],
  formationSlots: FormationSlot[],
  fillRemaining: boolean,
) {
  const assignments: Record<string, string> = {};
  const used = new Set<string>();
  const orderedCards = [...cards].sort((a, b) => Number(a.lineupSlot ?? 999) - Number(b.lineupSlot ?? 999));
  const slotIdsByZone = getSlotIdsByZone(formationSlots);

  for (const card of orderedCards) {
    const preferredZone = normalizeZone(card.sourceZone);
    if (!preferredZone || preferredZone === "bench") {
      continue;
    }

    assignCard(card, preferredZone, assignments, used, slotIdsByZone, { ignorePositionCheck: true });
  }

  if (fillRemaining) {
    for (const card of orderedCards) {
      if (used.has(card.id)) {
        continue;
      }

      const primaryZone = card.positions[0];
      if (primaryZone) {
        assignCard(card, primaryZone, assignments, used, slotIdsByZone);
      }
    }
  }

  return assignments;
}

export function stripUnavailableAssignments(
  assignments: Record<string, string>,
  cardById: Map<string, LineupAssignmentCard>,
) {
  const next: Record<string, string> = {};

  for (const [slotId, playerId] of Object.entries(assignments)) {
    const card = cardById.get(playerId);
    if (card && isLineupPlayerAssignable(card)) {
      next[slotId] = playerId;
    }
  }

  return next;
}

export function ensureGoalkeeperAssigned(
  assignments: Record<string, string>,
  cards: LineupAssignmentCard[],
  formationSlots: FormationSlot[],
) {
  const goalkeeperSlot = formationSlots.find((slot) => slot.zone === "GK");
  if (!goalkeeperSlot) {
    return assignments;
  }

  const pool = ensureDefaultKeeper(cards);
  const cardById = new Map(pool.map((card) => [card.id, card]));
  const next = { ...assignments };
  const currentPlayerId = next[goalkeeperSlot.id];
  const currentPlayer = currentPlayerId ? cardById.get(currentPlayerId) : undefined;

  if (currentPlayer && isLineupPlayerActive(currentPlayer) && currentPlayer.positions.includes("GK")) {
    return next;
  }

  if (currentPlayerId) {
    delete next[goalkeeperSlot.id];
  }

  for (const card of pool) {
    if (!isLineupPlayerAssignable(card) || !card.positions.includes("GK")) {
      continue;
    }

    next[goalkeeperSlot.id] = card.id;
    return next;
  }

  return next;
}

export function rebuildLineupAssignments(
  cards: LineupAssignmentCard[],
  formationSlots: FormationSlot[],
  fillRemaining: boolean,
) {
  const pool = ensureDefaultKeeper(cards);
  const assignments = buildInitialAssignments(pool, formationSlots, fillRemaining);
  return ensureGoalkeeperAssigned(assignments, pool, formationSlots);
}

export function getFormationCounts(
  assignments: Record<string, string>,
  playerById: Map<string, LineupAssignmentCard>,
  formationSlots: FormationSlot[],
) {
  return formationSlots.reduce(
    (counts, slot) => {
      const player = playerById.get(assignments[slot.id] ?? "");
      if (player && isLineupPlayerActive(player)) {
        counts[slot.zone] += 1;
      }
      return counts;
    },
    { ATT: 0, DEF: 0, GK: 0, MID: 0 } satisfies Record<PlayerCardPosition, number>,
  );
}
