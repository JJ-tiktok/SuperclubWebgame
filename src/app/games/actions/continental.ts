"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildNextRoundFixtures,
  getNextContinentalRound,
  isContinentalFinalRound,
  pickRandomLineupIndex,
  type ContinentalRound,
} from "@/lib/lobby/continental-cup";
import {
  autoSimulateContinentalCpuFixtures,
  computeClubLockedPower,
  ensureContinentalTournament,
  finalizeContinentalTournament,
  FIXTURE_SELECT,
  getContinentalParticipants,
  hasContinentalQualifiers,
  isContinentalTournamentComplete,
  resolveContinentalFixtureServer,
  touchGameSave,
  type ContinentalFixtureRow,
} from "@/lib/lobby/continental-server";
import type { LobbyGame } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseServiceClient } from "@/app/games/actions/_shared";

export {
  ensureContinentalTournament,
  hasContinentalQualifiers,
  isContinentalTournamentComplete,
};

async function getGameClubContext(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, phase, host_clerk_user_id, settings, room_code")
    .eq("id", gameId)
    .maybeSingle<LobbyGame & { room_code?: string }>();
  if (gameError || !game) {
    throw gameError ?? new Error("Spiel nicht gefunden.");
  }
  const { data: ownClub, error: clubError } = await supabase
    .from("clubs")
    .select("id, club_name, clerk_user_id")
    .eq("game_id", gameId)
    .eq("clerk_user_id", userId)
    .maybeSingle<{ id: string; club_name: string; clerk_user_id: string }>();
  if (clubError || !ownClub) {
    throw clubError ?? new Error("Club nicht gefunden.");
  }
  return { game, ownClub };
}

export async function initializeContinentalCupAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();
  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=continental`);
  }
  const { data: game } = await supabase.from("games").select("id, host_clerk_user_id, settings").eq("id", gameId).maybeSingle();
  if (!game || game.host_clerk_user_id !== userId) {
    redirect(`/games/${roomCode}?view=continental`);
  }
  const seasonNumber = Number((game.settings as LobbyGame["settings"])?.seasonNumber ?? 1);
  await ensureContinentalTournament(supabase, gameId, seasonNumber);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=continental`);
}

export async function lockContinentalLineupAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const supabase = createSupabaseServiceClient();
  if (!userId || !gameId || !roomCode || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}?view=continental`);
  }
  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "champions_league") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const { data: fixture, error } = await supabase
    .from("continental_fixtures")
    .select(`${FIXTURE_SELECT}, tournament_id`)
    .eq("id", fixtureId)
    .maybeSingle<ContinentalFixtureRow & { tournament_id: string }>();
  if (error || !fixture || fixture.status === "completed") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const participants = await getContinentalParticipants(supabase, fixture.tournament_id);
  const home = participants.get(fixture.home_participant_id);
  const away = participants.get(fixture.away_participant_id);
  let side: "home" | "away" | null = null;
  if (home?.club_id === ownClub.id) side = "home";
  if (away?.club_id === ownClub.id) side = "away";
  if (!side) {
    throw new Error("Nur dein eigenes Continental-Spiel kann gelockt werden.");
  }

  const powers = await computeClubLockedPower(supabase, ownClub.id);
  const lockUpdate =
    side === "home"
      ? { home_lineup_locked: true, home_locked_def: powers.DEF, home_locked_mid: powers.MID, home_locked_att: powers.ATT }
      : { away_lineup_locked: true, away_locked_def: powers.DEF, away_locked_mid: powers.MID, away_locked_att: powers.ATT };

  await supabase.from("continental_fixtures").update(lockUpdate).eq("id", fixtureId);
  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=continental`);
}

export async function resolveContinentalFixtureAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const supabase = createSupabaseServiceClient();
  if (!userId || !gameId || !roomCode || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}?view=continental`);
  }
  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "champions_league") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const { data: fixture, error } = await supabase
    .from("continental_fixtures")
    .select(`${FIXTURE_SELECT}, tournament_id`)
    .eq("id", fixtureId)
    .maybeSingle<ContinentalFixtureRow & { tournament_id: string }>();
  if (error || !fixture || fixture.status === "completed") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const participants = await getContinentalParticipants(supabase, fixture.tournament_id);
  const home = participants.get(fixture.home_participant_id)!;
  const away = participants.get(fixture.away_participant_id)!;
  const homeHuman = home.kind === "human";
  const awayHuman = away.kind === "human";
  const ownSide = home.club_id === ownClub.id ? "home" : away.club_id === ownClub.id ? "away" : null;
  const canResolve =
    (ownSide && (!homeHuman || !awayHuman)) ||
    (!homeHuman && !awayHuman && game.host_clerk_user_id === userId) ||
    (homeHuman && awayHuman && game.host_clerk_user_id === userId);

  if (!canResolve) {
    throw new Error("Dieses Continental-Spiel darfst du nicht auflösen.");
  }
  if ((homeHuman && !fixture.home_lineup_locked) || (awayHuman && !fixture.away_lineup_locked)) {
    redirect(`/games/${roomCode}?view=continental`);
  }

  await resolveContinentalFixtureServer(supabase, fixture, participants, game, userId);
  await autoSimulateContinentalCpuFixtures(supabase, fixture.tournament_id, game, userId);

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=continental`);
}

export async function advanceContinentalRoundAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();
  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, phase, host_clerk_user_id, settings")
    .eq("id", gameId)
    .maybeSingle<LobbyGame>();
  if (!game || game.host_clerk_user_id !== userId || game.phase !== "champions_league") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const { data: tournament, error: tournamentError } = await supabase
    .from("continental_tournaments")
    .select("id, current_round, status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ id: string; current_round: number; status: string }>();
  if (tournamentError || !tournament || tournament.status === "completed") {
    redirect(`/games/${roomCode}?view=continental`);
  }

  const currentRound = tournament.current_round as ContinentalRound;
  const { data: roundFixtures, error: fixturesError } = await supabase
    .from("continental_fixtures")
    .select("id, match_index, status, winner_participant_id")
    .eq("tournament_id", tournament.id)
    .eq("round", currentRound)
    .order("match_index", { ascending: true });
  if (fixturesError) throw fixturesError;

  const incomplete = (roundFixtures ?? []).some((fixture) => fixture.status !== "completed");
  if (incomplete) {
    await autoSimulateContinentalCpuFixtures(supabase, tournament.id, game, userId);
    redirect(`/games/${roomCode}?view=continental`);
  }

  const winners = (roundFixtures ?? [])
    .sort((left, right) => Number(left.match_index) - Number(right.match_index))
    .map((fixture) => fixture.winner_participant_id as string);

  const nextRound = getNextContinentalRound(currentRound);
  if (!nextRound) {
    if (isContinentalFinalRound(currentRound) && winners.length === 1) {
      const participants = await getContinentalParticipants(supabase, tournament.id);
      const { data: fullTournament } = await supabase
        .from("continental_tournaments")
        .select("id, game_id, season_number, status, prize_amount")
        .eq("id", tournament.id)
        .maybeSingle<{ id: string; game_id: string; season_number: number; status: string; prize_amount: number }>();
      if (fullTournament && fullTournament.status !== "completed") {
        await finalizeContinentalTournament(supabase, fullTournament, winners[0]!, participants, userId);
      }
    }
    revalidatePath(`/games/${roomCode}`);
    redirect(`/games/${roomCode}?view=continental`);
  }

  const participants = await getContinentalParticipants(supabase, tournament.id);
  const nextPairs = buildNextRoundFixtures(currentRound, winners);
  const fixtureRows = nextPairs.map((pair) => {
    const home = participants.get(pair.home_participant_id);
    const away = participants.get(pair.away_participant_id);
    return {
      tournament_id: tournament.id,
      round: pair.round,
      match_index: pair.match_index,
      home_participant_id: pair.home_participant_id,
      away_participant_id: pair.away_participant_id,
      home_continental_cpu_lineup_id: null,
      away_continental_cpu_lineup_id: null,
      home_cpu_formation_index: home?.kind === "cpu" ? pickRandomLineupIndex(3) : null,
      away_cpu_formation_index: away?.kind === "cpu" ? pickRandomLineupIndex(3) : null,
      home_lineup_locked: home?.kind === "cpu",
      away_lineup_locked: away?.kind === "cpu",
    };
  });

  await supabase.from("continental_fixtures").insert(fixtureRows);
  await supabase.from("continental_tournaments").update({ current_round: nextRound }).eq("id", tournament.id);

  await autoSimulateContinentalCpuFixtures(supabase, tournament.id, game, userId);
  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=continental`);
}
