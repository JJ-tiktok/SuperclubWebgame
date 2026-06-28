import type { ClubStatus } from "@/lib/game/types";
import type { LobbyClub } from "@/lib/lobby/types";

export const CLUB_STATUS_ORDER: ClubStatus[] = ["newly_promoted", "established", "mid_table", "title_contender"];

export const ATTRACTIVENESS_BY_CLUB_STATUS: Record<ClubStatus, number> = {
  newly_promoted: 3,
  established: 4,
  mid_table: 5,
  title_contender: 6,
};

export function normalizeClubStatus(status: string | undefined | null): ClubStatus {
  if (status === "established" || status === "mid_table" || status === "title_contender") {
    return status;
  }
  return "newly_promoted";
}

export function isClubStatusOverrideActive(
  club: Pick<LobbyClub, "status_override" | "status_override_until_season">,
  seasonNumber: number,
) {
  const overrideUntil = club.status_override_until_season ?? null;
  return Boolean(club.status_override && (overrideUntil == null || overrideUntil >= seasonNumber));
}

export function resolveEffectiveClubStatus(
  club: Pick<LobbyClub, "status" | "status_override" | "status_override_until_season">,
  seasonNumber: number,
): ClubStatus {
  if (isClubStatusOverrideActive(club, seasonNumber)) {
    return normalizeClubStatus(club.status_override);
  }
  return normalizeClubStatus(club.status);
}

export function applyClubStatusDelta(current: ClubStatus, delta: number): ClubStatus {
  const currentIdx = CLUB_STATUS_ORDER.indexOf(current);
  const baseIdx = currentIdx < 0 ? 0 : currentIdx;
  const nextIdx = Math.max(0, Math.min(CLUB_STATUS_ORDER.length - 1, baseIdx + delta));
  return CLUB_STATUS_ORDER[nextIdx];
}

/** Eingefrorener Wert vom Saisonende — nicht live aus aktuellem Kader berechnen. */
export function resolvePoachAttractivenessStars(
  club: Pick<LobbyClub, "attractiveness_stars" | "status" | "status_override" | "status_override_until_season">,
  seasonNumber: number,
): number {
  if (club.attractiveness_stars != null) {
    return Number(club.attractiveness_stars);
  }

  const status = resolveEffectiveClubStatus(club, seasonNumber);
  return ATTRACTIVENESS_BY_CLUB_STATUS[status];
}
