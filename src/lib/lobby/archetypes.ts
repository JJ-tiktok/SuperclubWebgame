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

export function normalizePlayerArchetype(value: unknown): PlayerArchetype | null {
  return archetypeSet.has(String(value)) ? (value as PlayerArchetype) : null;
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
