import { MAX_SQUAD_SIZE } from "@/lib/game/rules";

export const MANAGER_TRANSFER_DEPARTURE_LIMIT = 2;
export const TRANSFER_MONEY_STEP = 1_000_000;

export function normalizeTransferCashAmount(value: number) {
  return Math.max(0, Math.trunc(Number(value) / TRANSFER_MONEY_STEP) * TRANSFER_MONEY_STEP);
}

export function canCreateTransferOffer(params: {
  cashAmount: number;
  hasOfferedPlayer: boolean;
  isOffseason: boolean;
  targetOwnClub: boolean;
  transfersBlocked: boolean;
}) {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" } as const;
  }

  if (params.transfersBlocked) {
    return { ok: false, reason: "transfers_blocked" } as const;
  }

  if (params.targetOwnClub) {
    return { ok: false, reason: "own_player" } as const;
  }

  if (params.cashAmount <= 0 && !params.hasOfferedPlayer) {
    return { ok: false, reason: "empty_offer" } as const;
  }

  return { ok: true } as const;
}

export function canAcceptTransferOffer(params: {
  buyerDepartureCount: number;
  buyerGivesPlayer: boolean;
  buyerMoney: number;
  buyerSquadSize: number;
  cashAmount: number;
  isOffseason: boolean;
  sellerDepartureCount: number;
  sellerSquadSize: number;
  transfersBlocked: boolean;
}) {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" } as const;
  }

  if (params.transfersBlocked) {
    return { ok: false, reason: "transfers_blocked" } as const;
  }

  if (params.buyerMoney < params.cashAmount) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  if (params.sellerDepartureCount >= MANAGER_TRANSFER_DEPARTURE_LIMIT) {
    return { ok: false, reason: "seller_departure_limit" } as const;
  }

  if (params.buyerGivesPlayer && params.buyerDepartureCount >= MANAGER_TRANSFER_DEPARTURE_LIMIT) {
    return { ok: false, reason: "buyer_departure_limit" } as const;
  }

  const buyerNextSquadSize = params.buyerSquadSize + 1 - (params.buyerGivesPlayer ? 1 : 0);
  const sellerNextSquadSize = params.sellerSquadSize - 1 + (params.buyerGivesPlayer ? 1 : 0);

  if (buyerNextSquadSize > MAX_SQUAD_SIZE || sellerNextSquadSize > MAX_SQUAD_SIZE) {
    return { ok: false, reason: "squad_full" } as const;
  }

  return { ok: true } as const;
}

export function getManagerTransferReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    buyer_departure_limit: "Kaeufer-Limit erreicht",
    empty_offer: "Angebot leer",
    insufficient_money: "Zu wenig Geld",
    not_offseason: "Nur Offseason",
    own_player: "Eigener Spieler",
    seller_departure_limit: "Abgangslimit erreicht",
    squad_full: "Kader voll",
    transfers_blocked: "Transfers gesperrt",
  };

  return labels[reason] ?? "Nicht moeglich";
}
