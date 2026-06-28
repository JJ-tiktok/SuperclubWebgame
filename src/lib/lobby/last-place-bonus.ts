import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOffseasonCardCandidates,
  isOffseasonCardChoicePayload,
  pickWeightedIndex,
  parseEffects,
} from "@/lib/game/game-changer-effects";
import type { GameChangerCategory } from "@/lib/lobby/types";
import type { LastPlaceBonusSnapshot } from "@/lib/lobby/types";
import { normalizePrestigeState, type PrestigeState } from "@/lib/lobby/prestige";

export type { LastPlaceBonusSnapshot };
export { getOffseasonCardCandidates, isOffseasonCardChoicePayload };

export const LAST_PLACE_BONUS_MONEY = 5_000_000;
export const OFFSEASON_GAME_CHANGER_CATEGORIES: GameChangerCategory[] = ["good_news", "secret_weapon"];

export type LastPlaceBonusType = "training" | "money" | "game_changer";

export type OffseasonGameChangerCandidate = {
  card_id: string;
  display_name: string;
  description: string;
  category: GameChangerCategory;
  effects: unknown[];
};

export function isLastPlaceBonusEligible(state: PrestigeState, seasonNumber: number): boolean {
  return state.last_place_bonus_season === seasonNumber;
}

export function hasClaimedLastPlaceBonus(state: PrestigeState, seasonNumber: number): boolean {
  return state.last_place_bonus_claimed_season === seasonNumber;
}

export function canClaimLastPlaceBonus(state: PrestigeState, seasonNumber: number): boolean {
  return isLastPlaceBonusEligible(state, seasonNumber) && !hasClaimedLastPlaceBonus(state, seasonNumber);
}

export function buildLastPlaceBonusSnapshot(
  prestigeState: unknown,
  seasonNumber: number,
  pendingOffseasonChoice: boolean,
): LastPlaceBonusSnapshot {
  const state = normalizePrestigeState(prestigeState);
  const consecutive = state.consecutive_last_manager_seasons ?? 0;
  const eligible = canClaimLastPlaceBonus(state, seasonNumber);

  return {
    eligible,
    consecutive_last_seasons: consecutive,
    blocked_reason:
      !eligible && consecutive >= 2 && !isLastPlaceBonusEligible(state, seasonNumber)
        ? "consecutive_last"
        : null,
    pending_game_changer_choice: pendingOffseasonChoice,
  };
}

export function markLastPlaceBonusClaimed(state: PrestigeState, seasonNumber: number): PrestigeState {
  return {
    ...state,
    last_place_bonus_claimed_season: seasonNumber,
    last_place_bonus_season: null,
  };
}

type GameChangerCardRow = {
  id: string;
  category: GameChangerCategory;
  effects: unknown[];
  display_name: string;
  description: string;
  draw_weight?: number | null;
};

export async function drawOffseasonGameChangerCandidates(
  supabase: SupabaseClient,
  count = 2,
): Promise<OffseasonGameChangerCandidate[]> {
  const runQuery = async (withWeight: boolean) => {
    let query = supabase
      .from("game_changer_cards")
      .select(
        withWeight
          ? "id, category, effects, display_name, description, draw_weight"
          : "id, category, effects, display_name, description",
      )
      .in("category", OFFSEASON_GAME_CHANGER_CATEGORIES)
      .limit(120);
    return query.returns<GameChangerCardRow[]>();
  };

  let { data: cards, error } = await runQuery(true);
  if (error?.code === "42703") {
    const fallback = await runQuery(false);
    cards = fallback.data;
    error = fallback.error;
  }

  if (error || !cards?.length) {
    return [];
  }

  const pool = [...cards];
  const picked: GameChangerCardRow[] = [];
  const targetCount = Math.min(Math.max(1, count), pool.length);

  while (picked.length < targetCount && pool.length > 0) {
    const weights = pool.map((card) => Math.max(1, Math.trunc(Number(card.draw_weight ?? 1))));
    const index = pickWeightedIndex(weights);
    const chosen = pool.splice(index >= 0 ? index : 0, 1)[0];
    if (chosen) {
      picked.push(chosen);
    }
  }

  return picked.map((card) => ({
    card_id: card.id,
    display_name: card.display_name,
    description: card.description,
    category: card.category,
    effects: parseEffects(card.effects),
  }));
}

export async function applyLastPlaceTrainingBonus(
  supabase: SupabaseClient,
  clubId: string,
  seasonNumber: number,
): Promise<void> {
  await supabase.from("club_pending_effects").insert({
    club_id: clubId,
    season_number: seasonNumber,
    effect_type: "training_capacity_delta",
    payload: { delta: 1 },
    scope: "current_offseason",
  });
}

export async function applyLastPlaceMoneyBonus(
  supabase: SupabaseClient,
  gameId: string,
  clubId: string,
  seasonNumber: number,
): Promise<boolean> {
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("id")
    .eq("game_id", gameId)
    .eq("club_id", clubId)
    .eq("reason", "last_place_bonus")
    .contains("metadata", { season_number: seasonNumber })
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (existingError) {
    throw existingError;
  }

  if (existing?.length) {
    return false;
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("money")
    .eq("id", clubId)
    .single<{ money: number | string }>();

  if (clubError) {
    throw clubError;
  }

  const nextMoney = Number(club.money ?? 0) + LAST_PLACE_BONUS_MONEY;
  const { error: updateError } = await supabase.from("clubs").update({ money: nextMoney }).eq("id", clubId);
  if (updateError) {
    throw updateError;
  }

  const { error: transactionError } = await supabase.from("transactions").insert({
    game_id: gameId,
    club_id: clubId,
    amount: LAST_PLACE_BONUS_MONEY,
    reason: "last_place_bonus",
    metadata: { season_number: seasonNumber },
  });

  if (transactionError) {
    throw transactionError;
  }

  return true;
}
