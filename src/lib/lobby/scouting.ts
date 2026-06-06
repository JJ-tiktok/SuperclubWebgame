import type { SupabaseClient } from "@supabase/supabase-js";
import { getScoutingCapacity, MAX_SQUAD_SIZE } from "@/lib/game/rules";
import { OFFSEASON_MANAGEMENT_PHASES, isOffseasonManagementPhase } from "@/lib/lobby/phases";
import { isOffseasonPendingScopeActive } from "@/lib/lobby/offseason-pending-effects";
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

export function sumStaffScoutingBonus(staffEffects: Array<Record<string, unknown>>) {
  return staffEffects
    .filter((e) => e.type === "scouting_extra_cards")
    .reduce((sum, e) => sum + Number(e.cards ?? 0), 0);
}

/**
 * Off-season draw limit: snapshotted at phase start so paid facility upgrades do not
 * grant extra draws. Raises above the snapshot when level increased without a scouting
 * investment (e.g. Game Changer free_facility_upgrade).
 */
export function computeOffseasonScoutingBaseCapacity(params: {
  scoutingLevel: number;
  snapshotCapacity: number | null | undefined;
  staffBonus: number;
  drawnCount: number;
  hadScoutingInvestmentThisSeason: boolean;
}): number {
  const live = getScoutingCapacity(params.scoutingLevel ?? 1).players + params.staffBonus;

  if (params.snapshotCapacity != null) {
    if (!params.hadScoutingInvestmentThisSeason && live > params.snapshotCapacity) {
      return live;
    }
    return params.snapshotCapacity;
  }

  if (params.drawnCount > 0 && live > params.drawnCount) {
    return params.drawnCount;
  }

  return live;
}

/** After a Game Changer scouting upgrade, raise the frozen off-season draw cap if needed. */
export async function refreshOffseasonScoutingSnapshot(
  supabase: SupabaseClient,
  clubId: string,
  scoutingLevel: number,
) {
  const { data: club } = await supabase
    .from("clubs")
    .select("offseason_scouting_capacity")
    .eq("id", clubId)
    .maybeSingle<{ offseason_scouting_capacity: number | null }>();
  if (club?.offseason_scouting_capacity == null) {
    return;
  }

  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("card:staff_cards(effects)")
    .eq("club_id", clubId)
    .returns<Array<{ card: { effects: Array<Record<string, unknown>> } | null }>>();

  const live =
    getScoutingCapacity(scoutingLevel).players +
    sumStaffScoutingBonus((staffRows ?? []).flatMap((row) => row.card?.effects ?? []));

  if (live > club.offseason_scouting_capacity) {
    await supabase.from("clubs").update({ offseason_scouting_capacity: live }).eq("id", clubId);
  }
}

export type ScoutingPendingEffect = {
  consumed_at?: string | null;
  effect_type: string;
  payload: Record<string, unknown>;
  scope: string;
};

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

/** Bonus draws from Game Changer cards (active off-season scopes only). */
export function getFreeScoutingDrawCount(
  pendingEffects: ScoutingPendingEffect[],
  phase?: string,
) {
  return pendingEffects
    .filter(
      (eff) =>
        !eff.consumed_at &&
        eff.effect_type === "free_scouting_draw" &&
        isOffseasonPendingScopeActive(eff.scope, phase),
    )
    .reduce((sum, eff) => sum + Math.max(0, Math.trunc(Number(eff.payload.count ?? 0))), 0);
}

/** Total draws allowed before buy/pass (facility snapshot + free draws). */
export function getEffectiveScoutingDrawCapacity(
  baseCapacity: number,
  pendingEffects: ScoutingPendingEffect[],
  phase?: string,
) {
  return baseCapacity + getFreeScoutingDrawCount(pendingEffects, phase);
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

export function isOffseasonTransfersBlocked(
  pendingEffects: ScoutingPendingEffect[],
  phase?: string,
) {
  return pendingEffects.some((eff) => {
    if (eff.consumed_at) return false;
    if (eff.effect_type !== "offseason_lock" || !isOffseasonPendingScopeActive(eff.scope, phase)) {
      return false;
    }
    const blocks = (eff.payload.blocks as string[] | undefined) ?? [];
    return blocks.includes("transfers");
  });
}

export function getScoutingPurchasePrice(basePrice: number, pendingEffects: ScoutingPendingEffect[]) {
  const active = pendingEffects.filter((eff) => !eff.consumed_at);
  const transferDeltaEffect = active.find(
    (eff) => eff.effect_type === "next_transfer_price_delta" && eff.scope === "next_transfer",
  );
  const transferDelta = transferDeltaEffect ? Number((transferDeltaEffect.payload.amount as number | undefined) ?? 0) : 0;
  const freeBuyEffect = active.find(
    (eff) =>
      eff.effect_type === "free_scouting_buy_next" &&
      eff.scope === "next_transfer" &&
      Number((eff.payload.count as number | undefined) ?? 0) > 0,
  );
  return freeBuyEffect ? 0 : Math.max(0, basePrice + transferDelta);
}

export function canBuyScoutedPlayer(params: {
  drawnCount: number;
  money: number;
  ownClubId: string;
  playerPrice: number;
  scoutingCapacity: number;
  squadSize: number;
  transfersBlocked?: boolean;
}) {
  if (params.transfersBlocked) {
    return { ok: false, reason: "transfers_blocked" } as const;
  }

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

export function isSquadOverCapacity(squadSize: number) {
  return squadSize > MAX_SQUAD_SIZE;
}

export function resolveClubPlayerSaleValue(params: { scoutingPrice: number; squadSize: number }) {
  return isSquadOverCapacity(params.squadSize) ? 0 : params.scoutingPrice;
}

export type ClubPlayerSaleCheck =
  | { mode: "release"; ok: true }
  | { mode: "sale"; ok: true }
  | { ok: false; reason: string };

export function canSellClubPlayer(params: {
  isOffseason: boolean;
  salesCount: number;
  squadSize: number;
}): ClubPlayerSaleCheck {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" };
  }

  if (isSquadOverCapacity(params.squadSize)) {
    return { ok: true, mode: "release" };
  }

  if (params.salesCount >= 2) {
    return { ok: false, reason: "sale_limit" };
  }

  return { ok: true, mode: "sale" };
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
    squad_over_capacity: "Kader zu gross",
    squad_full: "Kader voll",
    transfers_blocked: "Transfers gesperrt",
  };

  return labels[reason] ?? "Nicht moeglich";
}
