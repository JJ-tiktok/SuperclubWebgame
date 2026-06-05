import type { SupabaseClient } from "@supabase/supabase-js";

const MILLION = 1_000_000;

/** Volle Sterne: 10 Mio Transferwert, 5 Mio Scouting. */
export const PLAYER_MARKET_STAR_TRANSFER_MILLIONS = 10;
export const PLAYER_MARKET_STAR_SCOUTING_MILLIONS = 5;

/** Pro verbleibendem Potential-Punkt: +2 Mio Transfer, +1 Mio Scouting. */
export const PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS = 2;
export const PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS = 1;

export type PlayerMarketInput = {
  stars: number;
  baseStars?: number;
  potentialStars?: number;
  skillMax?: number;
  potentialCeiling?: number;
};

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

  const fromBaseDelta = base + raw;
  const fromAbsolute = raw >= current ? raw : 0;
  const ceiling = Math.max(current, fromBaseDelta, fromAbsolute);

  return skillMax > 0 ? Math.min(ceiling, skillMax) : ceiling;
}

export function getRemainingPotentialPoints(input: PlayerMarketInput): number {
  const stars = Math.max(0, Math.trunc(Number(input.stars)));

  if (input.potentialCeiling !== undefined) {
    return Math.max(0, Math.trunc(Number(input.potentialCeiling)) - stars);
  }

  const ceiling = resolvePlayerPotentialCeiling({
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

export function getClubPlayerMarketValues(owned: {
  current_stars: number | string;
  player: {
    base_stars?: number | string | null;
    potential_stars?: number | string | null;
    skill_max?: number | string | null;
  };
}) {
  return computePlayerMarketValues({
    baseStars: Number(owned.player.base_stars ?? owned.current_stars),
    potentialStars: Number(owned.player.potential_stars ?? 0),
    skillMax: Number(owned.player.skill_max ?? 0),
    stars: Number(owned.current_stars),
  });
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
