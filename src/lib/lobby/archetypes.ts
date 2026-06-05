export const PLAYER_ARCHETYPES = ["alpha", "beta", "gamma"] as const;

export type PlayerArchetype = (typeof PLAYER_ARCHETYPES)[number];
export type ArchetypeDuelWinner = "attacker" | "defender" | "neutral";
export type ArchetypeRole = "attack" | "defense";
export type ArchetypeSymbol = "circle" | "square" | "triangle";

export const ARCHETYPE_META: Record<
  PlayerArchetype,
  {
    attackLabel: string;
    defenseLabel: string;
    symbol: ArchetypeSymbol;
  }
> = {
  alpha: {
    attackLabel: "Sprinter",
    defenseLabel: "Stopper",
    symbol: "triangle",
  },
  beta: {
    attackLabel: "Techniker",
    defenseLabel: "Pressing",
    symbol: "circle",
  },
  gamma: {
    attackLabel: "Zielspieler",
    defenseLabel: "Absicherung",
    symbol: "square",
  },
};

const archetypeSet = new Set<string>(PLAYER_ARCHETYPES);
const ALLROUNDER_POSITIONS = ["ATT", "DEF", "GK", "MID"] as const;

export function normalizePlayerArchetype(value: unknown): PlayerArchetype | null {
  return archetypeSet.has(String(value)) ? (value as PlayerArchetype) : null;
}

export function isAllrounderPositions(
  position: string | null | undefined,
  eligiblePositions: Array<string | null | undefined> | null | undefined,
) {
  const positions = new Set((eligiblePositions?.length ? eligiblePositions : [position]).filter(Boolean).map(String));

  return ALLROUNDER_POSITIONS.every((item) => positions.has(item));
}

export function normalizeApplicablePlayerArchetype(
  value: unknown,
  position: string | null | undefined,
  eligiblePositions: Array<string | null | undefined> | null | undefined,
) {
  return isAllrounderPositions(position, eligiblePositions) ? null : normalizePlayerArchetype(value);
}

export function compareArchetypes(
  attackerArchetype: PlayerArchetype | null | undefined,
  defenderArchetype: PlayerArchetype | null | undefined,
): ArchetypeDuelWinner {
  if (!attackerArchetype || !defenderArchetype || attackerArchetype === defenderArchetype) {
    return "neutral";
  }

  if (
    (attackerArchetype === "alpha" && defenderArchetype === "beta") ||
    (attackerArchetype === "beta" && defenderArchetype === "gamma") ||
    (attackerArchetype === "gamma" && defenderArchetype === "alpha")
  ) {
    return "attacker";
  }

  return "defender";
}

export function areArchetypesEnabled(settings?: unknown) {
  const value =
    settings && typeof settings === "object"
      ? (settings as { archetypes_enabled?: unknown }).archetypes_enabled
      : undefined;
  return value !== false;
}
