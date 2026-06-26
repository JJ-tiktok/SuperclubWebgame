import { formatStars } from "@/components/game/lib/dashboard-helpers";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";
import { resolvePlayerSkillDisplayMax } from "@/lib/lobby/player-market";
import { normalizeSeasonsAtClub } from "@/lib/lobby/player-tenure";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

export type PlayerHighlightCategory =
  | "top_rated"
  | "highest_potential"
  | "highest_growth_potential"
  | "longest_tenure";

export type PlayerHighlightEntry = {
  category: PlayerHighlightCategory;
  label: string;
  player: ClubPlayerSnapshot;
  displayName: string;
  detail: string;
};

const HIGHLIGHT_LABELS: Record<PlayerHighlightCategory, string> = {
  top_rated: "Bestbewertet",
  highest_potential: "Hoechstes Potenzial",
  highest_growth_potential: "Hoechstes Steigerungspotenzial",
  longest_tenure: "Laengste Vereinszugehoerigkeit",
};

/** Trainings-Deckel auf der Karte: skill_max aus dem Katalog (leere Sterne bis max). */
export function getOwnedPlayerSkillMax(player: ClubPlayerSnapshot): number {
  return resolvePlayerSkillDisplayMax({
    baseStars: player.player.base_stars,
    currentStars: player.current_stars,
    potentialStars: player.player.potential_stars,
    skillMax: player.player.skill_max,
  });
}

export function getOwnedPlayerCurrentStars(player: ClubPlayerSnapshot): number {
  return Math.max(0, Math.trunc(Number(player.current_stars)));
}

/** Differenz zwischen aktuellem Stand und skill_max. */
export function getOwnedPlayerGrowthHeadroom(player: ClubPlayerSnapshot): number {
  return Math.max(0, getOwnedPlayerSkillMax(player) - getOwnedPlayerCurrentStars(player));
}

export function hasUnreachedSkillMax(player: ClubPlayerSnapshot): boolean {
  return getOwnedPlayerGrowthHeadroom(player) > 0;
}

function compareByStarsDesc(left: ClubPlayerSnapshot, right: ClubPlayerSnapshot) {
  const starsDiff = Number(right.current_stars) - Number(left.current_stars);
  if (starsDiff !== 0) {
    return starsDiff;
  }
  return getClubPlayerDisplayName(left).localeCompare(getClubPlayerDisplayName(right), "de");
}

function compareByUnreachedSkillMaxDesc(left: ClubPlayerSnapshot, right: ClubPlayerSnapshot) {
  const skillMaxDiff = getOwnedPlayerSkillMax(right) - getOwnedPlayerSkillMax(left);
  if (skillMaxDiff !== 0) {
    return skillMaxDiff;
  }
  return compareByStarsDesc(left, right);
}

function compareByGrowthHeadroomDesc(left: ClubPlayerSnapshot, right: ClubPlayerSnapshot) {
  const headroomDiff = getOwnedPlayerGrowthHeadroom(right) - getOwnedPlayerGrowthHeadroom(left);
  if (headroomDiff !== 0) {
    return headroomDiff;
  }

  const skillMaxDiff = getOwnedPlayerSkillMax(right) - getOwnedPlayerSkillMax(left);
  if (skillMaxDiff !== 0) {
    return skillMaxDiff;
  }

  return compareByStarsDesc(left, right);
}

function compareByTenureDesc(left: ClubPlayerSnapshot, right: ClubPlayerSnapshot) {
  const tenureDiff = normalizeSeasonsAtClub(right.seasons_at_club) - normalizeSeasonsAtClub(left.seasons_at_club);
  if (tenureDiff !== 0) {
    return tenureDiff;
  }

  const acquiredDiff = String(left.acquired_at ?? "").localeCompare(String(right.acquired_at ?? ""));
  if (acquiredDiff !== 0) {
    return acquiredDiff;
  }

  return compareByStarsDesc(left, right);
}

function pickHighlight(
  squad: ClubPlayerSnapshot[],
  category: PlayerHighlightCategory,
  compare: (left: ClubPlayerSnapshot, right: ClubPlayerSnapshot) => number,
  detail: (player: ClubPlayerSnapshot) => string,
): PlayerHighlightEntry | null {
  if (squad.length === 0) {
    return null;
  }

  const player = [...squad].sort(compare)[0];
  if (!player) {
    return null;
  }

  return {
    category,
    detail: detail(player),
    displayName: getClubPlayerDisplayName(player),
    label: HIGHLIGHT_LABELS[category],
    player,
  };
}

export function getPlayerHighlights(squad: ClubPlayerSnapshot[]): PlayerHighlightEntry[] {
  const normalizedSquad = squad.map((player) => ({
    ...player,
    seasons_at_club: normalizeSeasonsAtClub(player.seasons_at_club),
  }));
  const developingSquad = normalizedSquad.filter(hasUnreachedSkillMax);

  return [
    pickHighlight(normalizedSquad, "top_rated", compareByStarsDesc, (player) => `${formatStars(Number(player.current_stars))} Sterne`),
    pickHighlight(
      developingSquad,
      "highest_potential",
      compareByUnreachedSkillMaxDesc,
      (player) =>
        `${formatStars(getOwnedPlayerSkillMax(player))} max. Sterne (aktuell ${formatStars(getOwnedPlayerCurrentStars(player))})`,
    ),
    pickHighlight(
      developingSquad,
      "highest_growth_potential",
      compareByGrowthHeadroomDesc,
      (player) =>
        `+${formatStars(getOwnedPlayerGrowthHeadroom(player))} bis ${formatStars(getOwnedPlayerSkillMax(player))} Sterne`,
    ),
    pickHighlight(
      normalizedSquad,
      "longest_tenure",
      compareByTenureDesc,
      (player) => `${normalizeSeasonsAtClub(player.seasons_at_club)} Saison${normalizeSeasonsAtClub(player.seasons_at_club) === 1 ? "" : "en"}`,
    ),
  ].filter((entry): entry is PlayerHighlightEntry => entry != null);
}
