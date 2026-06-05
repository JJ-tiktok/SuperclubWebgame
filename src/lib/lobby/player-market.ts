import type { SupabaseClient } from "@supabase/supabase-js";

const MILLION = 1_000_000;

/**
 * Marktwert-Regeln (aktuell = club_players.current_stars, Restpotential = Deckel − aktuell):
 * - Transfer: aktuell × 10M + Restpotential × 2M
 * - Scouting: aktuell × 5M  + Restpotential × 1M
 *
 * Beispiele:
 * - 5★, 0 Rest  → 50M / 25M
 * - 3★, 2 Rest  → 34M / 17M
 * - 5★, Deckel 6 → 52M / 26M
 */
export const PLAYER_MARKET_STAR_TRANSFER_MILLIONS = 10;
export const PLAYER_MARKET_STAR_SCOUTING_MILLIONS = 5;
export const PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS = 2;
export const PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS = 1;

export type PlayerMarketInput = {
  stars: number;
  baseStars?: number;
  potentialStars?: number;
  skillMax?: number;
  potentialCeiling?: number;
};

/** Potential-Deckel aus Karte: base + bonus, mindestens aktuell, hart gedeckelt durch skill_max. */
export function resolvePlayerPotentialCeiling(params: {
  baseStars?: number | string | null;
  currentStars?: number | string | null;
  potentialStars?: number | string | null;
  skillMax?: number | string | null;
}): number {
  const current = Math.max(0, Math.trunc(Number(params.currentStars ?? params.baseStars ?? 0)));
  const base = Math.max(0, Math.trunc(Number(params.baseStars ?? current)));
  const raw = Math.max(0, Math.trunc(Number(params.potentialStars ?? 0)));
  const skillMax = Math.max(0, Math.trunc(Number(params.skillMax ?? 0)));

  const ceiling = Math.max(current, base + raw);

  return skillMax > 0 ? Math.min(ceiling, skillMax) : ceiling;
}

export function getRemainingPotentialPoints(input: PlayerMarketInput): number {
  const stars = Math.max(0, Math.trunc(Number(input.stars)));

  const ceiling =
    input.potentialCeiling !== undefined
      ? Math.trunc(Number(input.potentialCeiling))
      : resolvePlayerPotentialCeiling({
          baseStars: input.baseStars ?? stars,
          currentStars: stars,
          potentialStars: input.potentialStars,
          skillMax: input.skillMax,
        });

  return Math.max(0, ceiling - stars);
}

export function computePlayerMarketValues(input: PlayerMarketInput) {
  const stars = Math.max(0, Math.trunc(Number(input.stars)));
  const remainingPotential = getRemainingPotentialPoints(input);

  return {
    minimumBid:
      (stars * PLAYER_MARKET_STAR_TRANSFER_MILLIONS + remainingPotential * PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS) *
      MILLION,
    scoutingPrice:
      (stars * PLAYER_MARKET_STAR_SCOUTING_MILLIONS + remainingPotential * PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS) *
      MILLION,
  };
}

export function readSyncedPlayerMarketValues(player: {
  minimum_bid?: number | string | null;
  scouting_price?: number | string | null;
}): { minimumBid: number; scoutingPrice: number } | null {
  const minimumBid = Number(player.minimum_bid ?? 0);
  const scoutingPrice = Number(player.scouting_price ?? 0);

  if (!Number.isFinite(minimumBid) || !Number.isFinite(scoutingPrice)) {
    return null;
  }

  if (minimumBid <= 0 && scoutingPrice <= 0) {
    return null;
  }

  return { minimumBid, scoutingPrice };
}

export function computeOwnedPlayerMarketValues(owned: {
  current_stars: number | string;
  player: {
    base_stars?: number | string | null;
    potential_stars?: number | string | null;
    skill_max?: number | string | null;
  };
}) {
  const currentStars = Math.max(0, Math.trunc(Number(owned.current_stars)));
  const potentialCeiling = resolvePlayerPotentialCeiling({
    baseStars: owned.player.base_stars,
    currentStars,
    potentialStars: owned.player.potential_stars,
    skillMax: owned.player.skill_max,
  });

  return computePlayerMarketValues({
    potentialCeiling,
    stars: currentStars,
  });
}

export function getClubPlayerMarketValues(owned: {
  current_stars: number | string;
  player: {
    base_stars?: number | string | null;
    minimum_bid?: number | string | null;
    potential_stars?: number | string | null;
    scouting_price?: number | string | null;
    skill_max?: number | string | null;
  };
}) {
  return computeOwnedPlayerMarketValues(owned);
}

export function toPlayerMarketColumns(market: { minimumBid: number; scoutingPrice: number }) {
  return {
    minimum_bid: market.minimumBid,
    scouting_price: market.scoutingPrice,
  };
}

export async function syncPlayerRowMarketValues(
  supabase: SupabaseClient,
  playerId: string,
  input: PlayerMarketInput,
): Promise<void> {
  const { error } = await supabase
    .from("players")
    .update(toPlayerMarketColumns(computePlayerMarketValues(input)))
    .eq("id", playerId);

  if (error) {
    throw error;
  }
}

export async function syncOwnedPlayerRowMarketValues(
  supabase: SupabaseClient,
  playerId: string,
  owned: {
    current_stars: number | string;
    player: {
      base_stars?: number | string | null;
      potential_stars?: number | string | null;
      skill_max?: number | string | null;
    };
  },
): Promise<void> {
  const currentStars = Math.max(0, Math.trunc(Number(owned.current_stars)));
  const potentialCeiling = resolvePlayerPotentialCeiling({
    baseStars: owned.player.base_stars,
    currentStars,
    potentialStars: owned.player.potential_stars,
    skillMax: owned.player.skill_max,
  });

  await syncPlayerRowMarketValues(supabase, playerId, {
    potentialCeiling,
    stars: currentStars,
  });
}
