import type { SupabaseClient } from "@supabase/supabase-js";

const MILLION = 1_000_000;

/**
 * Marktwert-Regeln (Current = aktuelle Sterne, Gap = Karten-Max − Current):
 * - Transfer: Current × 10M + Gap × 4M
 * - Scouting: Current × 5M  + Gap × 2M  (= Transfer / 2)
 *
 * Gewinn pro trainiertem Stern (Scouting-Kauf → Pool-Verkauf): +3M
 *
 * Beispiele:
 * - 5★, 0 Gap  → 50M / 25M
 * - 3★, Gap 2  → 38M / 19M
 * - 1★, Max 4★ → 22M / 11M
 */
export const PLAYER_MARKET_STAR_TRANSFER_MILLIONS = 10;
export const PLAYER_MARKET_STAR_SCOUTING_MILLIONS = 5;
export const PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS = 4;
export const PLAYER_MARKET_POTENTIAL_SCOUTING_MILLIONS = 2;

export type PlayerMarketInput = {
  stars: number;
  baseStars?: number;
  potentialStars?: number;
  skillMax?: number;
  potentialCeiling?: number;
};

type PlayerSkillBounds = {
  baseStars?: number | string | null;
  currentStars?: number | string | null;
  potentialStars?: number | string | null;
  skillMax?: number | string | null;
};

/** Potential-Deckel aus Karte: base + bonus, mindestens aktuell, hart gedeckelt durch skill_max. */
export function resolvePlayerPotentialCeiling(params: PlayerSkillBounds): number {
  const current = Math.max(0, Math.trunc(Number(params.currentStars ?? params.baseStars ?? 0)));
  const base = Math.max(0, Math.trunc(Number(params.baseStars ?? current)));
  const raw = Math.max(0, Math.trunc(Number(params.potentialStars ?? 0)));
  const skillMax = Math.max(0, Math.trunc(Number(params.skillMax ?? 0)));

  const ceiling = Math.max(current, base + raw);

  return skillMax > 0 ? Math.min(ceiling, skillMax) : ceiling;
}

/** Stern-Anzeige auf Karten: max(skill_max, Potential-Deckel). */
export function resolvePlayerSkillDisplayMax(params: PlayerSkillBounds): number {
  const potentialCeiling = resolvePlayerPotentialCeiling(params);
  const skillMax = Math.trunc(Number(params.skillMax ?? 0));

  return Math.max(skillMax > 0 ? skillMax : 5, potentialCeiling);
}

/** Markt-Deckel = angezeigtes Kartenmaximum (eine Quelle fuer Karte und Preis). */
export function resolvePlayerMarketMax(params: PlayerSkillBounds): number {
  return resolvePlayerSkillDisplayMax(params);
}

/** @deprecated Nutze resolvePlayerMarketMax. */
export function resolvePlayerMarketCeiling(params: PlayerSkillBounds): number {
  return resolvePlayerMarketMax(params);
}

export function getRemainingPotentialPoints(input: PlayerMarketInput): number {
  const stars = Math.max(0, Math.trunc(Number(input.stars)));

  const marketMax =
    input.potentialCeiling !== undefined
      ? Math.trunc(Number(input.potentialCeiling))
      : resolvePlayerMarketMax({
          baseStars: input.baseStars ?? stars,
          currentStars: stars,
          potentialStars: input.potentialStars,
          skillMax: input.skillMax,
        });

  return Math.max(0, marketMax - stars);
}

export function computePlayerMarketValues(input: PlayerMarketInput) {
  const stars = Math.max(0, Math.trunc(Number(input.stars)));
  const remainingPotential = getRemainingPotentialPoints(input);
  const minimumBid =
    (stars * PLAYER_MARKET_STAR_TRANSFER_MILLIONS + remainingPotential * PLAYER_MARKET_POTENTIAL_TRANSFER_MILLIONS) *
    MILLION;

  return {
    minimumBid,
    scoutingPrice: minimumBid / 2,
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

/** Marktwerte fuer Katalog-/Draft-Spieler (base_stars, noch nicht im Verein). */
export function computeCatalogPlayerMarketValues(player: {
  base_stars?: number | string | null;
  potential_stars?: number | string | null;
  skill_max?: number | string | null;
}) {
  const currentStars = Math.max(0, Math.trunc(Number(player.base_stars ?? 0)));
  const marketMax = resolvePlayerMarketMax({
    baseStars: currentStars,
    currentStars,
    potentialStars: player.potential_stars,
    skillMax: player.skill_max,
  });

  return computePlayerMarketValues({
    potentialCeiling: marketMax,
    stars: currentStars,
  });
}

export function toCardMarketDisplay(market: { minimumBid: number; scoutingPrice: number }) {
  return {
    currency: "M" as const,
    scoutingFee: market.scoutingPrice / MILLION,
    transferFee: market.minimumBid / MILLION,
  };
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
  const marketMax = resolvePlayerMarketMax({
    baseStars: owned.player.base_stars,
    currentStars,
    potentialStars: owned.player.potential_stars,
    skillMax: owned.player.skill_max,
  });

  return computePlayerMarketValues({
    potentialCeiling: marketMax,
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
  const market = computeOwnedPlayerMarketValues(owned);

  const { error } = await supabase.from("players").update(toPlayerMarketColumns(market)).eq("id", playerId);

  if (error) {
    throw error;
  }
}
