"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatchGameChangerEffects } from "@/lib/game/dispatch-game-changer-effects";
import { parseEffects } from "@/lib/game/game-changer-effects";
import type { GameChangerCategory } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseServiceClient } from "@/app/games/actions/_shared";

function assertDevelopmentLab() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Game-Changer-Lab ist nur in Development verfuegbar.");
  }
}

async function getGameClubContextByRoomCode(supabase: SupabaseServiceClient, roomCode: string, userId: string) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, room_code, phase, host_clerk_user_id, settings")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle<{ id: string; room_code: string; phase: string; host_clerk_user_id: string; settings: { seasonNumber?: number } }>();

  if (gameError) throw gameError;
  if (!game) throw new Error("Spielstand nicht gefunden.");

  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id, game_id, clerk_user_id, club_name")
    .eq("game_id", game.id)
    .returns<Array<{ id: string; game_id: string; clerk_user_id: string; club_name: string }>>();

  if (clubsError) throw clubsError;

  const ownClub = (clubs ?? []).find((club) => club.clerk_user_id === userId);
  if (!ownClub) {
    throw new Error("Du bist in diesem Spielstand keinem Club zugeordnet. Bitte zuerst einloggen und dem Spiel beitreten.");
  }

  return { game, ownClub };
}

async function resolveLatestMatchday(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data } = await supabase
    .from("fixtures")
    .select("matchday")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .order("matchday", { ascending: false })
    .limit(1)
    .maybeSingle<{ matchday: number }>();
  return Math.max(1, Math.trunc(Number(data?.matchday ?? 1)));
}

async function insertClubGameChanger(
  supabase: SupabaseServiceClient,
  clubId: string,
  cardId: string,
  seasonNumber: number,
) {
  const baseRow = {
    club_id: clubId,
    game_changer_card_id: cardId,
    status: "resolved" as const,
    season_number: seasonNumber,
  };

  let { data: inserted, error: insertError } = await supabase
    .from("club_game_changers")
    .insert(baseRow)
    .select("id")
    .single<{ id: string }>();

  if (insertError?.code === "42703") {
    const fallback = await supabase
      .from("club_game_changers")
      .insert({ club_id: clubId, game_changer_card_id: cardId, status: "resolved" })
      .select("id")
      .single<{ id: string }>();
    inserted = fallback.data;
    insertError = fallback.error;
  }

  if (insertError || !inserted?.id) {
    throw insertError ?? new Error("club_game_changers insert failed.");
  }

  return inserted.id;
}

export async function devApplyGameChangerAction(formData: FormData) {
  assertDevelopmentLab();

  const { userId } = await auth();
  const roomCode = String(formData.get("room_code") || "").trim().toUpperCase();
  const cardId = String(formData.get("game_changer_card_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !roomCode || !cardId || !supabase) {
    redirect("/game-changer-lab?apply_error=missing_input");
  }

  try {
    const { game, ownClub } = await getGameClubContextByRoomCode(supabase, roomCode, userId);
    const seasonNumber = Number(game.settings?.seasonNumber ?? 1);

    const { data: card, error: cardError } = await supabase
      .from("game_changer_cards")
      .select("id, category, effects, display_name")
      .eq("id", cardId)
      .maybeSingle<{ id: string; category: GameChangerCategory; effects: unknown; display_name: string }>();

    if (cardError) throw cardError;
    if (!card) {
      redirect("/game-changer-lab?apply_error=card_not_found");
    }

    const effects = parseEffects(card.effects);
    const clubGameChangerId = await insertClubGameChanger(supabase, ownClub.id, card.id, seasonNumber);
    const matchday = await resolveLatestMatchday(supabase, game.id, seasonNumber);

    const result = await dispatchGameChangerEffects({
      supabase,
      clubId: ownClub.id,
      clubGameChangerId,
      effects,
      ctx: { matchday, seasonNumber },
    });

    const status = result.status;
    const details = result.details.join(" | ");
    revalidatePath(`/games/${roomCode}`);
    redirect(
      `/game-changer-lab?apply_ok=1&room=${encodeURIComponent(roomCode)}&card=${encodeURIComponent(card.display_name)}&status=${status}&details=${encodeURIComponent(details)}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    redirect(`/game-changer-lab?apply_error=${encodeURIComponent(message)}`);
  }
}
