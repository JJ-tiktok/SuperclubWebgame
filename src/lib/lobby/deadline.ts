import { MAX_SQUAD_SIZE } from "@/lib/game/rules";
import type { LobbyClub } from "@/lib/lobby/types";

export const DEADLINE_BID_STEP = 1_000_000;
export const DEADLINE_TURN_SECONDS = 30;

export type DeadlineBidCheck =
  | { ok: true; normalizedAmount: number }
  | { ok: false; reason: "bid_too_low" | "insufficient_money" | "not_turn" | "squad_full" };

export function getDeadlineAuctionCount(clubCount: number) {
  return Math.max(0, clubCount + 1);
}

export function normalizeDeadlineBid(value: number) {
  return Math.max(0, Math.trunc(value / DEADLINE_BID_STEP) * DEADLINE_BID_STEP);
}

export function getMinimumNextBid(currentAmount: number, minimumBid: number) {
  return currentAmount > 0 ? currentAmount + DEADLINE_BID_STEP : minimumBid;
}

export function canPlaceDeadlineBid(params: {
  amount: number;
  currentAmount: number;
  currentBidClubId?: string | null;
  minimumBid: number;
  ownClubId: string;
  ownMoney: number;
  squadSize: number;
}) {
  if (params.currentBidClubId !== params.ownClubId) {
    return { ok: false, reason: "not_turn" } as const;
  }

  if (params.squadSize >= MAX_SQUAD_SIZE) {
    return { ok: false, reason: "squad_full" } as const;
  }

  const normalizedAmount = normalizeDeadlineBid(params.amount);
  if (normalizedAmount < getMinimumNextBid(params.currentAmount, params.minimumBid)) {
    return { ok: false, reason: "bid_too_low" } as const;
  }

  if (normalizedAmount > params.ownMoney) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  return { ok: true, normalizedAmount } as const;
}

export function getNextDeadlineBidClubId(params: {
  bidOrderClubIds: string[];
  currentClubId: string;
  highestBidClubId?: string | null;
  passedClubIds: string[];
}) {
  const { bidOrderClubIds, currentClubId, highestBidClubId } = params;
  const passed = new Set(params.passedClubIds);
  const currentIndex = bidOrderClubIds.indexOf(currentClubId);

  for (let offset = 1; offset <= bidOrderClubIds.length; offset += 1) {
    const nextClubId = bidOrderClubIds[(Math.max(0, currentIndex) + offset) % bidOrderClubIds.length];

    if (!nextClubId || nextClubId === currentClubId || nextClubId === highestBidClubId || passed.has(nextClubId)) {
      continue;
    }

    return nextClubId;
  }

  return null;
}

export function getFirstDeadlineBidClubId(clubs: Array<Pick<LobbyClub, "id">>) {
  return clubs[0]?.id ?? null;
}

export function getDeadlineActionLabel(reason: string) {
  const labels: Record<string, string> = {
    bid_too_low: "Gebot zu niedrig",
    insufficient_money: "Zu wenig Geld",
    not_turn: "Nicht am Zug",
    squad_full: "Kader voll",
  };

  return labels[reason] ?? "Nicht moeglich";
}
