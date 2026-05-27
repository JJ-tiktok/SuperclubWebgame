import { getScoutingCapacity, MAX_SQUAD_SIZE } from "@/lib/game/rules";
import { OFFSEASON_MANAGEMENT_PHASES, isOffseasonManagementPhase } from "@/lib/lobby/phases";
import type { LobbyClub, ScoutingDrawSnapshot } from "@/lib/lobby/types";

export const SCOUTING_PILES = [
  { key: "europe", label: "Europa" },
  { key: "africa", label: "Afrika" },
  { key: "asia", label: "Asien" },
  { key: "north_america", label: "Nordamerika" },
  { key: "south_america", label: "Suedamerika" },
  { key: "oceania", label: "Ozeanien" },
] as const;

export const OFFSEASON_PHASES = OFFSEASON_MANAGEMENT_PHASES;

export type ScoutingPileKey = (typeof SCOUTING_PILES)[number]["key"];

export function isScoutingPileKey(value: string): value is ScoutingPileKey {
  return SCOUTING_PILES.some((pile) => pile.key === value);
}

export function isOffseasonPhase(value: string) {
  return isOffseasonManagementPhase(value);
}

export function getClubScoutingCapacity(club: Pick<LobbyClub, "scouting_level">) {
  return getScoutingCapacity(club.scouting_level ?? 1).players;
}

export function canDrawScoutingPlayer(params: {
  drawnCount: number;
  ownClubId: string;
  scoutingCapacity: number;
}) {
  if (params.drawnCount >= params.scoutingCapacity) {
    return { ok: false, reason: "capacity_used" } as const;
  }

  return { ok: true } as const;
}

export function canResolveScoutedPlayer(params: {
  drawnCount: number;
  ownClubId: string;
  scoutingCapacity: number;
}) {
  if (params.drawnCount < params.scoutingCapacity) {
    return { ok: false, reason: "draw_first" } as const;
  }

  return { ok: true } as const;
}

export function canBuyScoutedPlayer(params: {
  drawnCount: number;
  money: number;
  ownClubId: string;
  playerPrice: number;
  scoutingCapacity: number;
  squadSize: number;
}) {
  const resolveCheck = canResolveScoutedPlayer(params);
  if (!resolveCheck.ok) {
    return resolveCheck;
  }

  if (params.money < params.playerPrice) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  if (params.squadSize >= MAX_SQUAD_SIZE) {
    return { ok: false, reason: "squad_full" } as const;
  }

  return { ok: true } as const;
}

export function canSellClubPlayer(params: {
  isOffseason: boolean;
  salesCount: number;
}) {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" } as const;
  }

  if (params.salesCount >= 2) {
    return { ok: false, reason: "sale_limit" } as const;
  }

  return { ok: true } as const;
}

export function getNextPendingScoutingClubId(clubs: Array<Pick<LobbyClub, "id" | "scouting_level">>, draws: Array<Pick<ScoutingDrawSnapshot, "club_id" | "status">>) {
  for (const club of clubs) {
    const clubDraws = draws.filter((draw) => draw.club_id === club.id);
    const openDraws = clubDraws.filter((draw) => draw.status === "drawn");

    if (clubDraws.length < getClubScoutingCapacity(club) || openDraws.length > 0) {
      return club.id;
    }
  }

  return null;
}

export function getScoutingActionLabel(reason: string) {
  const labels: Record<string, string> = {
    capacity_used: "Alle Karten gezogen",
    draw_first: "Erst alle ziehen",
    insufficient_money: "Zu wenig Geld",
    not_offseason: "Nur Offseason",
    sale_limit: "Verkaufslimit",
    squad_full: "Kader voll",
  };

  return labels[reason] ?? "Nicht moeglich";
}
