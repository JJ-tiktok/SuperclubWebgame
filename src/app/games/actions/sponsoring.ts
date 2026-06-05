"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { LobbyClub, LobbyGame } from "@/lib/lobby/types";
import type { SupabaseServiceClient } from "@/app/games/actions/_shared";
import { resolveEffectiveClubStatus } from "@/lib/lobby/club-status";
import { canSignSponsorDeal, isSponsoringEnabled } from "@/lib/lobby/sponsoring";
import {
  applySponsorReward,
  loadClubSponsorContracts,
  signSponsorContract,
} from "@/lib/lobby/sponsoring-server";
import { buildSponsorContractSnapshot } from "@/lib/lobby/sponsoring";

async function getGameClubContext(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  const [{ data: game, error: gameError }, { data: clubs, error: clubsError }] = await Promise.all([
    supabase.from("games").select("id, room_code, phase, settings").eq("id", gameId).single<LobbyGame>(),
    supabase
      .from("clubs")
      .select("id, game_id, clerk_user_id, club_name, status, status_override, status_override_until_season")
      .eq("game_id", gameId)
      .returns<LobbyClub[]>(),
  ]);
  if (gameError) throw gameError;
  if (clubsError) throw clubsError;
  const ownClub = (clubs ?? []).find((club) => club.clerk_user_id === userId);
  if (!ownClub) throw new Error("Du bist in diesem Spielstand keinem Club zugeordnet.");
  return { game, ownClub };
}

async function touchGameSave(supabase: ReturnType<typeof createSupabaseServiceClient>, gameId: string, userId: string) {
  if (!supabase) return;
  await supabase
    .from("games")
    .update({ last_saved_at: new Date().toISOString(), last_saved_by_clerk_user_id: userId })
    .eq("id", gameId);
}

export async function signSponsorDealAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const dealId = String(formData.get("deal_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !dealId || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (!isSponsoringEnabled(game.settings)) {
    redirect(`/games/${roomCode}?view=grounds&sponsor_error=${encodeURIComponent("Sponsoring ist in dieser Lobby ausgeschaltet")}`);
  }
  const contracts = await loadClubSponsorContracts(supabase, ownClub.id);
  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const clubStatus = resolveEffectiveClubStatus(ownClub, seasonNumber);
  const check = canSignSponsorDeal({ phase: game.phase, contracts, dealId, clubStatus });

  if (!check.ok) {
    redirect(`/games/${roomCode}?view=grounds&sponsor_error=${encodeURIComponent(check.reason)}`);
  }

  await signSponsorContract(supabase, {
    gameId,
    clubId: ownClub.id,
    dealId: check.deal.id,
    prestigeTier: check.deal.prestige_tier,
    seasonNumber,
  });

  await supabase.from("match_news").insert({
    game_id: gameId,
    club_id: ownClub.id,
    category: "good_news",
    headline: `Sponsoring: ${check.deal.display_name}`,
    detail: check.deal.task_description,
  });

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}

export async function pickSponsorRewardPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const contractId = String(formData.get("contract_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !contractId || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (!isSponsoringEnabled(game.settings)) {
    redirect(`/games/${roomCode}?view=grounds&sponsor_error=${encodeURIComponent("Sponsoring ist in dieser Lobby ausgeschaltet")}`);
  }
  const playerIds = formData.getAll("club_player_id").map(String).filter(Boolean);

  const { data: contract, error } = await supabase
    .from("club_sponsor_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("club_id", ownClub.id)
    .eq("status", "awaiting_reward_pick")
    .maybeSingle();

  if (error || !contract) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const snapshot = buildSponsorContractSnapshot(contract);
  const pickCount = Number(snapshot.deal.reward_config.pick_count ?? 1);
  if (playerIds.length < pickCount && snapshot.deal.reward_type !== "player_max_level") {
    redirect(`/games/${roomCode}?view=grounds&sponsor_error=${encodeURIComponent("Spielerauswahl unvollstaendig")}`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  await applySponsorReward(supabase, contract, seasonNumber, playerIds);

  await supabase
    .from("club_sponsor_contracts")
    .update({ status: "completed", reward_payload: { club_player_ids: playerIds } })
    .eq("id", contractId);

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}
