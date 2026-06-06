import { mapDbPlayerToPlayerCardData } from "@/lib/lobby/draft";
import {
  computeCatalogPlayerMarketValues,
  computeOwnedPlayerMarketValues,
  resolvePlayerPotentialCeiling,
  resolvePlayerSkillDisplayMax,
  toCardMarketDisplay,
} from "@/lib/lobby/player-market";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";
import type { DraftPlayerRow } from "@/lib/lobby/types";
import type { PlayerCardData } from "@/types/player-card";

/** Katalog-Spieler (Draft, Scouting-Draw, Deadline) — immer aus base_stars berechnen. */
export const mapCatalogPlayerToCardData = mapDbPlayerToPlayerCardData;

export function mapOwnedPlayerToCardData(owned: ClubPlayerSnapshot): PlayerCardData {
  const card = mapDbPlayerToPlayerCardData(owned.player);
  const currentStars = Math.max(0, Math.trunc(Number(owned.current_stars)));
  const potentialCeiling = resolvePlayerPotentialCeiling({
    baseStars: owned.player.base_stars,
    currentStars,
    potentialStars: owned.player.potential_stars,
    skillMax: owned.player.skill_max,
  });
  const skillMax = resolvePlayerSkillDisplayMax({
    baseStars: owned.player.base_stars,
    currentStars,
    potentialStars: owned.player.potential_stars,
    skillMax: owned.player.skill_max,
  });
  const market = toCardMarketDisplay(computeOwnedPlayerMarketValues(owned));
  const isNlzTalent =
    owned.player.metadata &&
    typeof owned.player.metadata === "object" &&
    (owned.player.metadata as Record<string, unknown>).nlz_origin === true;

  return {
    ...card,
    cardStyle: isNlzTalent ? { ...card.cardStyle, theme: "purple" } : card.cardStyle,
    name: getClubPlayerDisplayName(owned),
    market,
    skill: {
      ...card.skill,
      current: currentStars,
      potential: potentialCeiling,
      max: skillMax,
    },
  };
}

export function mapOwnedPlayerToLineupCardData(owned: ClubPlayerSnapshot): PlayerCardData & {
  injured?: boolean;
  sourceZone?: string;
  lineupSlot?: number | null;
} {
  return {
    ...mapOwnedPlayerToCardData(owned),
    id: owned.id,
    injured: owned.injured,
    lineupSlot: owned.lineup_slot,
    sourceZone: owned.current_zone,
  };
}

const MILLION = 1_000_000;

export function getCardTransferMoney(market: PlayerCardData["market"]): number {
  return market.transferFee * MILLION;
}

export function getCardScoutingMoney(market: PlayerCardData["market"]): number {
  return market.scoutingFee * MILLION;
}

export function getOwnedCardTransferMillions(card: PlayerCardData): number {
  return Math.max(1, Math.round(card.market.transferFee));
}

export function getCatalogMinimumBidFromPlayer(
  player: Pick<DraftPlayerRow, "base_stars" | "potential_stars" | "skill_max">,
): number {
  return computeCatalogPlayerMarketValues(player).minimumBid;
}
