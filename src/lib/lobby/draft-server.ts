import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFT_SQUAD_SIZE, getDraftPickOrder } from "@/lib/game/rules";
import { DRAFT_PLAYER_SELECT, shuffleDraftPlayers } from "./draft";
import type { DraftPlayerRow, LobbyClub, LobbyGame } from "./types";

type DraftRoundRow = {
  id: string;
  game_id: string;
  round_index: number;
  board_player_ids: string[];
  pick_order_club_ids: string[];
  picks: unknown[];
  completed: boolean;
};

export async function ensureDraftRound(params: {
  supabase: SupabaseClient;
  game: LobbyGame;
  clubs: LobbyClub[];
  roundIndex?: number;
}) {
  const { supabase, game, clubs, roundIndex = 0 } = params;

  const { data: existing, error: existingError } = await supabase
    .from("draft_rounds")
    .select("id, game_id, round_index, board_player_ids, pick_order_club_ids, picks, completed")
    .eq("game_id", game.id)
    .eq("completed", false)
    .order("round_index", { ascending: false })
    .limit(1)
    .returns<DraftRoundRow[]>();

  if (existingError) {
    throw existingError;
  }

  if (existing?.[0]) {
    return existing[0];
  }

  return createDraftRound({ supabase, game, clubs, roundIndex });
}

export async function createDraftRound(params: {
  supabase: SupabaseClient;
  game: LobbyGame;
  clubs: LobbyClub[];
  roundIndex: number;
}) {
  const { supabase, game, clubs, roundIndex } = params;
  const clubIds = clubs.map((club) => club.id);

  if (clubIds.length < 1) {
    throw new Error("Der Draft braucht mindestens einen Club.");
  }

  const ownedPlayerIds = await getOwnedPlayerIds(supabase, clubIds);
  const maxDraftStars = Number(game.settings?.max_draft_stars ?? 5);
  let query = supabase
    .from("players")
    .select(DRAFT_PLAYER_SELECT)
    .lte("base_stars", maxDraftStars)
    .in("visibility", ["room", "public"])
    .limit(300);

  if (ownedPlayerIds.length > 0) {
    query = query.not("id", "in", `(${ownedPlayerIds.join(",")})`);
  }

  const { data: players, error: playersError } = await query.returns<DraftPlayerRow[]>();

  if (playersError) {
    throw playersError;
  }

  const boardPlayers = shuffleDraftPlayers(players ?? []).slice(0, 16);

  if (boardPlayers.length < 16) {
    throw new Error(
      `Nicht genug Draft-Spieler gefunden. Benoetigt werden 16 Spieler mit maximal ${maxDraftStars} Sternen.`,
    );
  }

  const pickOrderClubIds = getDraftPickOrder(clubIds, roundIndex, 16);
  const boardPlayerIds = boardPlayers.map((player) => player.id);

  const { data: draftRound, error: insertError } = await supabase
    .from("draft_rounds")
    .insert({
      game_id: game.id,
      round_index: roundIndex,
      board_player_ids: boardPlayerIds,
      pick_order_club_ids: pickOrderClubIds,
      picks: [],
      completed: false,
    })
    .select("id, game_id, round_index, board_player_ids, pick_order_club_ids, picks, completed")
    .single<DraftRoundRow>();

  if (insertError) {
    throw insertError;
  }

  const { error: turnError } = await supabase
    .from("games")
    .update({ current_turn_club_id: pickOrderClubIds[0] ?? null })
    .eq("id", game.id);

  if (turnError) {
    throw turnError;
  }

  return draftRound;
}

export async function getSquadCounts(supabase: SupabaseClient, clubIds: string[]) {
  if (clubIds.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("club_id")
    .in("club_id", clubIds)
    .returns<Array<{ club_id: string }>>();

  if (error) {
    throw error;
  }

  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    counts.set(row.club_id, (counts.get(row.club_id) ?? 0) + 1);
  }

  return counts;
}

export async function getOwnedPlayerIds(supabase: SupabaseClient, clubIds: string[]) {
  if (clubIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("player_id")
    .in("club_id", clubIds)
    .returns<Array<{ player_id: string }>>();

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.player_id))];
}

export function allDraftSquadsComplete(squadCounts: Map<string, number>, clubIds: string[]) {
  return clubIds.every((clubId) => (squadCounts.get(clubId) ?? 0) >= DRAFT_SQUAD_SIZE);
}
