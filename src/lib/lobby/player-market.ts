import type { SupabaseClient } from "@supabase/supabase-js";

const MILLION = 1_000_000;

/** Volle Sterne: 10 Mio Transferwert, 5 Mio Scouting. */
export const PLAYER_MARKET_STAR_TRANSFER_MILLIONS = 10;
export const PLAYER_MARKET_STAR_SCOUTING_MILLIONS = 5;

/** Pro Potential-Punkt: +2 Mio Transfer, +1 Mio Scouting. */
export const PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS = 2;
export const PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS = 1;

export function computePlayerMarketValues(params: { potentialStars?: number; stars: number }) {
  const stars = Math.max(0, Math.trunc(Number(params.stars)));
  const potential = Math.max(0, Math.trunc(Number(params.potentialStars ?? 0)));

  return {
    minimumBid:
      (stars * PLAYER_MARKET_STAR_TRANSFER_MILLIONS + potential * PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS) * MILLION,
    scoutingPrice:
      (stars * PLAYER_MARKET_STAR_SCOUTING_MILLIONS + potential * PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS) * MILLION,
  };
}

export function getClubPlayerMarketValues(owned: {
  current_stars: number | string;
  player: {
    potential_stars?: number | string | null;
  };
}) {
  return computePlayerMarketValues({
    potentialStars: Number(owned.player.potential_stars ?? 0),
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
  stars: number,
  potentialStars = 0,
): Promise<void> {
  const { error } = await supabase
    .from("players")
    .update(toPlayerMarketColumns(computePlayerMarketValues({ potentialStars, stars })))
    .eq("id", playerId);

  if (error) {
    throw error;
  }
}
