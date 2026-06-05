import { computePlayerMarketValues } from "@/lib/lobby/player-market";
import type { PlayerArchetype } from "@/lib/lobby/types";

const YOUTH_FIRST_NAMES = [
  "Liam",
  "Noah",
  "Finn",
  "Elias",
  "Jonas",
  "Luca",
  "Milan",
  "Emil",
  "Theo",
  "Ben",
  "Max",
  "Leon",
  "Felix",
  "Paul",
  "Tim",
];

const YOUTH_LAST_NAMES = [
  "Keller",
  "Brandt",
  "Sommer",
  "Weber",
  "Hartmann",
  "Krüger",
  "Vogel",
  "Bauer",
  "Lehmann",
  "Schmidt",
  "Wolf",
  "Fischer",
];

const YOUTH_POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;

const ARCHETYPES: PlayerArchetype[] = ["alpha", "beta", "gamma"];

function pickRandom<T>(items: readonly T[], random = Math.random): T {
  return items[Math.floor(random() * items.length)]!;
}

export function buildYouthPlayerSeed(random = Math.random) {
  const first = pickRandom(YOUTH_FIRST_NAMES, random);
  const last = pickRandom(YOUTH_LAST_NAMES, random);
  const position = pickRandom(YOUTH_POSITIONS, random);
  const archetype = pickRandom(ARCHETYPES, random);
  const contentKey = `nlz-${Date.now()}-${Math.floor(random() * 1_000_000)}`;

  const market = computePlayerMarketValues({ potentialStars: 5, stars: 1 });

  return {
    age: 17,
    age_group: "talent" as const,
    attacker_archetype: position === "ATT" || position === "MID" ? archetype : "beta",
    base_stars: 1,
    chemistry_left: false,
    chemistry_right: false,
    chemistry_symbol: "star" as const,
    content_key: contentKey,
    defender_archetype: position === "DEF" || position === "GK" ? archetype : "beta",
    display_name: `${first} ${last}`,
    eligible_positions: [position],
    metadata: { nlz_origin: true },
    minimum_bid: market.minimumBid,
    nationality: "NLZ",
    position,
    potential_stars: 5,
    region: "academy",
    scouting_price: market.scoutingPrice,
    skill_max: 6,
    visibility: "private" as const,
  };
}

export function isNlzOriginPlayer(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.nlz_origin === true;
}
