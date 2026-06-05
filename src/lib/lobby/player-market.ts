import type { SupabaseClient } from "@supabase/supabase-js";

const MILLION = 1_000_000;

export function computePlayerMarketValues(params: { potentialStars?: number; stars: number }) {
  const stars = Math.max(0, Number(params.stars));
  const potential = Math.max(0, Number(params.potentialStars ?? 0));

  return {
    minimumBid: (18 + stars * 6 + potential * 4) * MILLION,
    scoutingPrice: (12 + stars * 4 + potential * 3) * MILLION,
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
