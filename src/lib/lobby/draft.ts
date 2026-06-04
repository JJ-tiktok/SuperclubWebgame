import type { DraftPlayerRow } from "./types";
import { ARCHETYPE_META, normalizePlayerArchetype } from "@/lib/lobby/archetypes";
import type {
  CardTier,
  ChemistrySymbol,
  PlayerAgeGroup,
  PlayerCardData,
  PlayerCardPosition,
} from "@/types/player-card";

export const DRAFT_PLAYER_SELECT =
  "id, content_key, display_name, position, eligible_positions, attacker_archetype, defender_archetype, role, nationality, age, age_group, base_stars, potential_stars, skill_max, veteran_fallback, chemistry_left, chemistry_right, chemistry_symbol, scouting_price, minimum_bid, region, metadata, visibility";

const positions = new Set<PlayerCardPosition>(["GK", "DEF", "MID", "ATT"]);
const ageGroups = new Set<PlayerAgeGroup>(["talent", "prime", "veteran"]);
const chemistrySymbols = new Set<ChemistrySymbol>(["star", "dot", "link"]);

export function mapDbPlayerToPlayerCardData(player: DraftPlayerRow): PlayerCardData {
  const position = normalizePosition(player.position);
  const currentStars = Number(player.base_stars ?? 1);
  const potentialStars = Math.max(currentStars, currentStars + Number(player.potential_stars ?? 0));
  const maxStars = Math.max(Number(player.skill_max ?? 5), potentialStars);
  const marketTransfer = moneyToMillions(player.minimum_bid ?? 0);
  const marketScouting = moneyToMillions(player.scouting_price ?? 0);
  const attackerArchetype = normalizePlayerArchetype(player.attacker_archetype);
  const defenderArchetype = normalizePlayerArchetype(player.defender_archetype);

  return {
    id: player.id,
    name: player.display_name,
    position,
    positions: normalizeEligiblePositions(player.eligible_positions, position),
    role: player.role ?? player.region ?? undefined,
    nationality: player.nationality ?? undefined,
    age: player.age ?? undefined,
    ageGroup: ageGroups.has(player.age_group as PlayerAgeGroup) ? (player.age_group as PlayerAgeGroup) : "prime",
    skill: {
      current: currentStars,
      potential: potentialStars,
      max: maxStars,
      veteranFallback: player.veteran_fallback ?? null,
    },
    chemistry: {
      left: Boolean(player.chemistry_left),
      right: Boolean(player.chemistry_right),
      symbol: chemistrySymbols.has(player.chemistry_symbol as ChemistrySymbol)
        ? (player.chemistry_symbol as ChemistrySymbol)
        : "star",
    },
    archetypes: {
      attack: attackerArchetype
        ? {
            key: attackerArchetype,
            label: ARCHETYPE_META[attackerArchetype].attackLabel,
            role: "attack",
            symbol: ARCHETYPE_META[attackerArchetype].symbol,
          }
        : null,
      defense: defenderArchetype
        ? {
            key: defenderArchetype,
            label: ARCHETYPE_META[defenderArchetype].defenseLabel,
            role: "defense",
            symbol: ARCHETYPE_META[defenderArchetype].symbol,
          }
        : null,
    },
    market: {
      transferFee: marketTransfer,
      scoutingFee: marketScouting,
      currency: "M",
    },
    cardStyle: {
      tier: getDefaultCardTier(player.age_group),
    },
  };
}

export function shuffleDraftPlayers<T>(players: T[]) {
  const copy = [...players];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function normalizePosition(position: string): PlayerCardPosition {
  return positions.has(position as PlayerCardPosition) ? (position as PlayerCardPosition) : "MID";
}

function normalizeEligiblePositions(eligiblePositions: string[] | null | undefined, fallback: PlayerCardPosition) {
  const normalized = (eligiblePositions ?? []).filter((position): position is PlayerCardPosition =>
    positions.has(position as PlayerCardPosition),
  );

  return normalized.length > 0 ? normalized : [fallback];
}

function moneyToMillions(value: number | string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return numeric >= 100000 ? numeric / 1000000 : numeric;
}

function getDefaultCardTier(ageGroup: string | null | undefined): CardTier {
  return ageGroup === "veteran" ? "veteran" : "standard";
}
