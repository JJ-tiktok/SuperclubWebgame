import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameChangerCategory } from "@/lib/lobby/types";

// ---------------------------------------------------------------------------
// Effect union
// ---------------------------------------------------------------------------

export type GameChangerEffect =
  | { type: "money_change"; amount: number }
  | { type: "third_boost"; zone: "ATT" | "MID" | "DEF"; stars: number; for: "self" | "opponent" }
  | { type: "third_penalty"; zone: "ATT" | "MID" | "DEF"; stars: number; for: "self" | "opponent" }
  | { type: "reroll_third"; zone?: "ATT" | "MID" | "DEF" }
  | { type: "swap_dice_with_opponent"; zone: "ATT" | "MID" | "DEF" }
  | { type: "heal_random_injury" }
  | { type: "injure_random_opponent" }
  | { type: "steal_money"; amount: number }
  | { type: "extra_training_attempt" }
  | { type: "noop" };

// Zone modifier written into fixture.partial_result.pending_modifiers for the next third
export type ZoneModifier = {
  zone: "ATT" | "MID" | "DEF";
  delta: number; // positive = boost, negative = penalty
  for: "home" | "away";
  source_club_game_changer_id: string;
};

// Shape stored in fixture.partial_result (thirds are stored as JSON)
export type PartialResult = {
  thirds: unknown[];
  pending_modifiers: ZoneModifier[];
};

export type ThirdSummary = {
  index: 1 | 2 | 3;
  home_score: number;
  away_score: number;
  home_third_points: number;
  away_third_points: number;
  events: unknown[];
};

// ---------------------------------------------------------------------------
// Human-readable description
// ---------------------------------------------------------------------------

export function describeEffect(effect: GameChangerEffect): string {
  switch (effect.type) {
    case "money_change":
      return effect.amount >= 0
        ? `+${effect.amount / 1000}k Einnahmen`
        : `${effect.amount / 1000}k Verlust`;
    case "third_boost":
      return `+${effect.stars}★ in Zone ${effect.zone} (${effect.for === "self" ? "eigen" : "Gegner"})`;
    case "third_penalty":
      return `-${effect.stars}★ in Zone ${effect.zone} (${effect.for === "self" ? "eigen" : "Gegner"})`;
    case "reroll_third":
      return effect.zone ? `Neuauswurf in Zone ${effect.zone}` : "Neuauswurf beliebige Zone";
    case "swap_dice_with_opponent":
      return `Würfeltausch mit Gegner in Zone ${effect.zone}`;
    case "heal_random_injury":
      return "Zufälliger Spieler wird geheilt";
    case "injure_random_opponent":
      return "Zufälliger Gegner-Spieler verletzt sich";
    case "steal_money":
      return `${effect.amount / 1000}k vom Gegner gestohlen`;
    case "extra_training_attempt":
      return "Extra Trainingsversuch";
    case "noop":
      return "Kein Effekt";
  }
}

export function describeGameChangerEffects(effects: GameChangerEffect[]): string {
  if (effects.length === 0) return "Kein Effekt";
  return effects.map(describeEffect).join(", ");
}

// ---------------------------------------------------------------------------
// Immediate effect application (Good News / Bad News)
// ---------------------------------------------------------------------------

export async function applyImmediateEffect(
  supabase: SupabaseClient,
  clubId: string,
  effect: GameChangerEffect,
): Promise<void> {
  switch (effect.type) {
    case "money_change": {
      await supabase.rpc("adjust_club_money", { p_club_id: clubId, p_delta: effect.amount });
      break;
    }
    case "heal_random_injury": {
      // Fetch one random injured player and un-injure them
      const { data: injured } = await supabase
        .from("club_players")
        .select("id")
        .eq("club_id", clubId)
        .eq("injured", true)
        .limit(1)
        .maybeSingle();
      if (injured) {
        await supabase.from("club_players").update({ injured: false }).eq("id", injured.id);
      }
      break;
    }
    // Zone boosts/penalties are handled at match resolution time via pending_modifiers
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Secret Weapon buffer helpers
// ---------------------------------------------------------------------------

/**
 * Reads the current partial_result for a fixture and appends zone modifiers
 * from a played Secret Weapon into pending_modifiers.
 */
export function buildZoneModifiers(
  clubGameChangerId: string,
  forSide: "home" | "away",
  effects: GameChangerEffect[],
): ZoneModifier[] {
  const mods: ZoneModifier[] = [];
  for (const effect of effects) {
    if (effect.type === "third_boost") {
      const targetSide = effect.for === "self" ? forSide : forSide === "home" ? "away" : "home";
      mods.push({ zone: effect.zone, delta: effect.stars, for: targetSide, source_club_game_changer_id: clubGameChangerId });
    } else if (effect.type === "third_penalty") {
      const targetSide = effect.for === "self" ? forSide : forSide === "home" ? "away" : "home";
      mods.push({ zone: effect.zone, delta: -effect.stars, for: targetSide, source_club_game_changer_id: clubGameChangerId });
    }
  }
  return mods;
}

/**
 * Merges new zone modifiers into an existing partial_result object.
 */
export function mergeModifiersIntoPartialResult(
  partial: PartialResult | null | undefined,
  newMods: ZoneModifier[],
): PartialResult {
  const base: PartialResult = partial ?? { thirds: [], pending_modifiers: [] };
  return {
    ...base,
    pending_modifiers: [...base.pending_modifiers, ...newMods],
  };
}

/**
 * Extracts and clears pending modifiers, returning updated partial_result.
 */
export function consumePendingModifiers(partial: PartialResult): {
  modifiers: ZoneModifier[];
  updated: PartialResult;
} {
  const modifiers = partial.pending_modifiers ?? [];
  return {
    modifiers,
    updated: { ...partial, pending_modifiers: [] },
  };
}

// ---------------------------------------------------------------------------
// Utility: parse effects stored as JSON in the DB
// ---------------------------------------------------------------------------

export function parseEffects(raw: unknown): GameChangerEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is GameChangerEffect => typeof e === "object" && e !== null && "type" in e);
}

// ---------------------------------------------------------------------------
// Category label helper
// ---------------------------------------------------------------------------

export function categoryLabel(category: GameChangerCategory): string {
  switch (category) {
    case "good_news":
      return "Good News";
    case "bad_news":
      return "Bad News";
    case "secret_weapon":
      return "Geheimwaffe";
  }
}
