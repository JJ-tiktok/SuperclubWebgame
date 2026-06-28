import { MAX_SQUAD_SIZE } from "@/lib/game/rules";
import { getClubPlayerMarketValues } from "@/lib/lobby/player-market";
import { normalizeTransferCashAmount } from "@/lib/lobby/transfers";

export function resolvePoachMinimumBid(owned: {
  current_stars: number | string;
  player: {
    base_stars?: number | string | null;
    minimum_bid?: number | string | null;
    potential_stars?: number | string | null;
    scouting_price?: number | string | null;
    skill_max?: number | string | null;
  };
}) {
  return getClubPlayerMarketValues(owned).minimumBid;
}

export function getPoachMinimumBidMillions(minimumBid: number) {
  return Math.max(1, Math.ceil(Number(minimumBid) / 1_000_000));
}

export type PoachRequestStatus = "open" | "accepted" | "declined" | "cancelled";

export function normalizePlayerStarsForPoach(currentStars: number) {
  return Math.round(Number(currentStars));
}

export function isPlayerUnavailableForSeason(currentSeason: number, unavailableUntilSeason?: number | null) {
  if (unavailableUntilSeason == null) {
    return false;
  }

  return Number(unavailableUntilSeason) >= Number(currentSeason);
}

export function wasPlayerBenchedLastSeason(currentSeason: number, unavailableUntilSeason?: number | null) {
  if (unavailableUntilSeason == null) {
    return false;
  }

  return Number(unavailableUntilSeason) === Number(currentSeason) - 1;
}

export function isPlayerPoachable(params: {
  buyerAttractivenessStars: number;
  playerStars: number;
  sellerAttractivenessStars: number;
}) {
  const playerStars = normalizePlayerStarsForPoach(params.playerStars);
  const sellerStars = Number(params.sellerAttractivenessStars);
  const buyerStars = Number(params.buyerAttractivenessStars);

  return playerStars > sellerStars && playerStars <= buyerStars;
}

export function canCreatePoachRequest(params: {
  buyerAttractivenessStars: number;
  buyerClubId: string;
  buyerMoney: number;
  buyerSquadSize: number;
  cashAmount: number;
  currentSeason: number;
  hasOpenRequestForPair: boolean;
  hasPoachRequestLastSeason: boolean;
  isOffseason: boolean;
  minimumMarketValue: number;
  playerStars: number;
  sellerAttractivenessStars: number;
  sellerClubId: string;
  targetClubId: string;
  transfersBlocked: boolean;
  unavailableUntilSeason?: number | null;
}) {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" } as const;
  }

  if (params.transfersBlocked) {
    return { ok: false, reason: "transfers_blocked" } as const;
  }

  if (params.buyerClubId === params.sellerClubId || params.targetClubId !== params.sellerClubId) {
    return { ok: false, reason: "invalid_target" } as const;
  }

  if (params.hasOpenRequestForPair) {
    // One poach request per buyer/seller club pair per season (any target player).
    return { ok: false, reason: "pair_request_exists" } as const;
  }

  if (params.hasPoachRequestLastSeason) {
    return { ok: false, reason: "back_to_back_player" } as const;
  }

  if (isPlayerUnavailableForSeason(params.currentSeason, params.unavailableUntilSeason)) {
    return { ok: false, reason: "player_unavailable" } as const;
  }

  if (
    !isPlayerPoachable({
      buyerAttractivenessStars: params.buyerAttractivenessStars,
      playerStars: params.playerStars,
      sellerAttractivenessStars: params.sellerAttractivenessStars,
    })
  ) {
    return { ok: false, reason: "not_poachable" } as const;
  }

  const normalizedCash = normalizeTransferCashAmount(params.cashAmount);
  if (normalizedCash <= 0) {
    return { ok: false, reason: "empty_offer" } as const;
  }

  if (normalizedCash < params.minimumMarketValue) {
    return { ok: false, reason: "below_market_value" } as const;
  }

  if (params.buyerMoney < normalizedCash) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  if (params.buyerSquadSize + 1 > MAX_SQUAD_SIZE) {
    return { ok: false, reason: "squad_full" } as const;
  }

  return { ok: true, cashAmount: normalizedCash } as const;
}

export function canAcceptPoachRequest(params: {
  buyerMoney: number;
  buyerSquadSize: number;
  cashAmount: number;
  isOffseason: boolean;
  sellerClubId: string;
  status: PoachRequestStatus;
  targetClubId: string;
  transfersBlocked: boolean;
}) {
  if (!params.isOffseason) {
    return { ok: false, reason: "not_offseason" } as const;
  }

  if (params.transfersBlocked) {
    return { ok: false, reason: "transfers_blocked" } as const;
  }

  if (params.status !== "open") {
    return { ok: false, reason: "not_open" } as const;
  }

  if (params.buyerMoney < params.cashAmount) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  if (params.buyerSquadSize + 1 > MAX_SQUAD_SIZE) {
    return { ok: false, reason: "squad_full" } as const;
  }

  if (!params.sellerClubId || !params.targetClubId) {
    return { ok: false, reason: "invalid_target" } as const;
  }

  return { ok: true } as const;
}

export function getPoachUnavailableSeason(currentSeason: number) {
  return Number(currentSeason);
}

export function getPoachReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    back_to_back_player: "Spieler wurde letzte Saison bereits angefragt",
    below_market_value: "Gebot unter Marktwert",
    empty_offer: "Gebot leer",
    insufficient_money: "Zu wenig Geld",
    invalid_target: "Ungueltiges Ziel",
    not_offseason: "Nur Offseason",
    not_open: "Anfrage nicht offen",
    not_poachable: "Spieler nicht abwerbbar",
    pair_request_exists: "Pro Saison nur ein Abwerbungsangebot pro Verein",
    player_unavailable: "Spieler gesperrt",
    squad_full: "Kader voll",
    transfers_blocked: "Transfers gesperrt",
  };

  return labels[reason] ?? "Nicht moeglich";
}

export function filterPoachablePlayersForBuyer(params: {
  buyerAttractivenessStars: number;
  currentSeason: number;
  players: Array<{
    club_player_id: string;
    current_stars: number;
    unavailable_until_season?: number | null;
    was_poached_last_season?: boolean;
  }>;
  sellerAttractivenessStars: number;
}) {
  return params.players.filter((player) => {
    if (player.was_poached_last_season) {
      return false;
    }

    if (isPlayerUnavailableForSeason(params.currentSeason, player.unavailable_until_season)) {
      return false;
    }

    return isPlayerPoachable({
      buyerAttractivenessStars: params.buyerAttractivenessStars,
      playerStars: player.current_stars,
      sellerAttractivenessStars: params.sellerAttractivenessStars,
    });
  });
}
