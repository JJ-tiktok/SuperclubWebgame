"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildNextRoundFixtures,
  buildRound32Fixtures,
  CONTINENTAL_PRIZE_AMOUNT,
  getNextContinentalRound,
  isContinentalFinalRound,
  pickRandomLineupIndex,
  requiredContinentalCpuCount,
  shuffleParticipants,
  type ContinentalRound,
} from "@/lib/lobby/continental-cup";
import { calculateLineupPower, type CaptainBoost } from "@/lib/lobby/lineup-power";
import { areArchetypesEnabled, normalizeApplicablePlayerArchetype } from "@/lib/lobby/archetypes";
import { buildLineupSnapshotFromPlayers } from "@/lib/lobby/lineup-snapshot";
import { getMatchPointsMode, resolveFixture, type FixtureSideInput } from "@/lib/lobby/season";
import type { LobbyGame } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseServiceClient } from "@/app/games/actions/_shared";

type ContinentalParticipantRow = {
  id: string;
  tournament_id: string;
  kind: "human" | "cpu";
  club_id: string | null;
  continental_cpu_team_id: string | null;
  display_name: string;
  bracket_seed: number;
  eliminated_round: number | null;
};

type ContinentalFixtureRow = {
  id: string;
  tournament_id: string;
  round: ContinentalRound;
  match_index: number;
  home_participant_id: string;
  away_participant_id: string;
  home_continental_cpu_lineup_id: string | null;
  away_continental_cpu_lineup_id: string | null;
  home_lineup_locked: boolean;
  away_lineup_locked: boolean;
  status: "scheduled" | "completed";
  winner_participant_id: string | null;
};

type ContinentalLineupRow = {
  id: string;
  att_stars: number | string;
  def_stars: number | string;
  mid_stars: number | string;
};

const FIXTURE_SELECT =
  "id, tournament_id, round, match_index, home_participant_id, away_participant_id, home_continental_cpu_lineup_id, away_continental_cpu_lineup_id, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, status, match_state, winner_participant_id";

async function touchGameSave(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  await supabase
    .from("games")
    .update({ last_saved_at: new Date().toISOString(), last_saved_by_clerk_user_id: userId })
    .eq("id", gameId);
}

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

async function loadClubCaptain(supabase: SupabaseServiceClient, clubId: string): Promise<CaptainBoost | null> {
  const { data } = await supabase
    .from("clubs")
    .select("captain_club_player_id, captain_boost_rank")
    .eq("id", clubId)
    .maybeSingle<{ captain_club_player_id: string | null; captain_boost_rank: number | null }>();
  const boost = Math.trunc(Number(data?.captain_boost_rank ?? 0));
  if (!data?.captain_club_player_id || boost <= 0) return null;
  return { clubPlayerId: data.captain_club_player_id, boost };
}

async function computeClubLockedPower(supabase: SupabaseServiceClient, clubId: string) {
  const [{ data: playerData }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, current_stars, current_zone, lineup_slot, injured, player:players(chemistry_left, chemistry_right, position, eligible_positions)")
      .eq("club_id", clubId)
      .neq("current_zone", "bench")
      .eq("injured", false),
    supabase
      .from("club_staff")
      .select("staff_card:staff_cards(effects)")
      .eq("club_id", clubId),
  ]);
  const staffEffects = (staffData ?? []).flatMap((s) => {
    const card = s.staff_card as { effects?: Array<{ type: string; zone?: string; stars?: number }> } | null;
    return card?.effects ?? [];
  });
  const captain = await loadClubCaptain(supabase, clubId);
  const powers = calculateLineupPower(
    (playerData ?? []).map((p) => {
      const player = p.player as {
        chemistry_left?: boolean | null;
        chemistry_right?: boolean | null;
        position?: string | null;
        eligible_positions?: string[] | null;
      } | null;
      return {
        id: p.id as string,
        chemistry_left: player?.chemistry_left,
        chemistry_right: player?.chemistry_right,
        current_stars: p.current_stars as number | string,
        current_zone: p.current_zone as string,
        lineup_slot: p.lineup_slot as number | null,
        position: player?.position,
        positions: player?.eligible_positions?.length ? player.eligible_positions : player?.position ? [player.position] : undefined,
      };
    }),
    staffEffects,
    captain,
  );
  return { DEF: powers.DEF.total, MID: powers.MID.total, ATT: powers.ATT.total };
}

async function getContinentalLineupsByTeamId(supabase: SupabaseServiceClient, teamIds: string[]) {
  const map = new Map<string, ContinentalLineupRow[]>();
  if (teamIds.length === 0) return map;
  const { data, error } = await supabase
    .from("continental_cpu_lineups")
    .select("id, continental_cpu_team_id, def_stars, mid_stars, att_stars, sort_order")
    .in("continental_cpu_team_id", teamIds)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) {
    const teamId = row.continental_cpu_team_id as string;
    const list = map.get(teamId) ?? [];
    list.push({
      id: row.id as string,
      def_stars: row.def_stars as number | string,
      mid_stars: row.mid_stars as number | string,
      att_stars: row.att_stars as number | string,
    });
    map.set(teamId, list);
  }
  return map;
}

function pickCpuLineupId(lineups: ContinentalLineupRow[]) {
  if (lineups.length === 0) return null;
  return lineups[pickRandomLineupIndex(lineups.length)]?.id ?? null;
}

export async function ensureContinentalTournament(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
) {
  const { data: existing } = await supabase
    .from("continental_tournaments")
    .select("id")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    return existing.id;
  }

  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id, club_name, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });
  if (clubsError) throw clubsError;

  const humanCount = clubs?.length ?? 0;
  const cpuNeeded = requiredContinentalCpuCount(humanCount);
  if (humanCount + cpuNeeded !== 32) {
    throw new Error(`Continental Cup benoetigt 32 Teams, aber ${humanCount} Menschen + ${cpuNeeded} CPU ergibt nicht 32.`);
  }

  const { data: cpuPool, error: cpuError } = await supabase
    .from("continental_cpu_teams")
    .select("id, display_name")
    .eq("active", true);
  if (cpuError) throw cpuError;

  const catalogSize = cpuPool?.length ?? 0;
  if (catalogSize < cpuNeeded) {
    throw new Error(
      `Zu wenige Continental-CPU-Teams im Katalog (${catalogSize}/${cpuNeeded}). ` +
        "Bitte in Supabase `supabase/continental_cpu_catalog_expand.sql` (oder `champions_league_upgrade.sql`) ausfuehren.",
    );
  }

  const cpuCatalog = shuffleParticipants(cpuPool ?? []).slice(0, cpuNeeded);

  const { data: tournament, error: tournamentError } = await supabase
    .from("continental_tournaments")
    .insert({
      game_id: gameId,
      season_number: seasonNumber,
      status: "in_progress",
      bracket_size: 32,
      prize_amount: CONTINENTAL_PRIZE_AMOUNT,
      current_round: 32,
    })
    .select("id")
    .single<{ id: string }>();
  if (tournamentError) throw tournamentError;

  const tournamentId = tournament.id;
  const participantRows = [
    ...(clubs ?? []).map((club, index) => ({
      tournament_id: tournamentId,
      kind: "human" as const,
      club_id: club.id,
      continental_cpu_team_id: null,
      display_name: club.club_name,
      bracket_seed: index + 1,
    })),
    ...(cpuCatalog ?? []).map((cpu, index) => ({
      tournament_id: tournamentId,
      kind: "cpu" as const,
      club_id: null,
      continental_cpu_team_id: cpu.id,
      display_name: cpu.display_name,
      bracket_seed: humanCount + index + 1,
    })),
  ];

  const { data: participants, error: participantsError } = await supabase
    .from("continental_participants")
    .insert(participantRows)
    .select("id, kind, club_id, continental_cpu_team_id")
    .returns<Array<{ id: string; kind: string; club_id: string | null; continental_cpu_team_id: string | null }>>();
  if (participantsError) throw participantsError;

  const cpuTeamIds = [...new Set((participants ?? []).flatMap((p) => (p.continental_cpu_team_id ? [p.continental_cpu_team_id] : [])))];
  const lineupsByTeam = await getContinentalLineupsByTeamId(supabase, cpuTeamIds);

  const shuffledIds = shuffleParticipants((participants ?? []).map((p) => p.id));
  const roundPairs = buildRound32Fixtures(shuffledIds);

  const fixtureRows = roundPairs.map((pair) => {
    const home = participants?.find((p) => p.id === pair.home_participant_id);
    const away = participants?.find((p) => p.id === pair.away_participant_id);
    const homeCpuLineup =
      home?.kind === "cpu" && home.continental_cpu_team_id
        ? pickCpuLineupId(lineupsByTeam.get(home.continental_cpu_team_id) ?? [])
        : null;
    const awayCpuLineup =
      away?.kind === "cpu" && away.continental_cpu_team_id
        ? pickCpuLineupId(lineupsByTeam.get(away.continental_cpu_team_id) ?? [])
        : null;
    return {
      tournament_id: tournamentId,
      round: pair.round,
      match_index: pair.match_index,
      home_participant_id: pair.home_participant_id,
      away_participant_id: pair.away_participant_id,
      home_continental_cpu_lineup_id: homeCpuLineup,
      away_continental_cpu_lineup_id: awayCpuLineup,
      home_lineup_locked: home?.kind === "cpu",
      away_lineup_locked: away?.kind === "cpu",
    };
  });

  const { error: fixtureError } = await supabase.from("continental_fixtures").insert(fixtureRows);
  if (fixtureError) throw fixtureError;

  return tournamentId;
}

async function getContinentalParticipants(
  supabase: SupabaseServiceClient,
  tournamentId: string,
): Promise<Map<string, ContinentalParticipantRow>> {
  const { data, error } = await supabase
    .from("continental_participants")
    .select("id, tournament_id, kind, club_id, continental_cpu_team_id, display_name, bracket_seed, eliminated_round")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p as ContinentalParticipantRow]));
}

async function buildContinentalFixtureSide(
  supabase: SupabaseServiceClient,
  participant: ContinentalParticipantRow,
  cpuLineupId: string | null,
): Promise<FixtureSideInput> {
  if (participant.kind === "cpu") {
    const { data, error } = await supabase
      .from("continental_cpu_lineups")
      .select("id, def_stars, mid_stars, att_stars")
      .eq("id", cpuLineupId ?? "")
      .maybeSingle<ContinentalLineupRow>();
    if (error || !data) {
      throw error ?? new Error("Continental CPU lineup missing.");
    }
    return {
      canReceiveEvents: false,
      clubId: null,
      lineup: { ATT: [], DEF: [], GK: [], MID: [] },
      participantId: participant.id,
      powers: {
        ATT: Number(data.att_stars),
        DEF: Number(data.def_stars),
        MID: Number(data.mid_stars),
      },
      zone_players: [],
    };
  }

  if (!participant.club_id) {
    throw new Error("Human continental participant without club.");
  }

  const [{ data: playerData }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, chemistry_left, chemistry_right, defender_archetype, display_name, position, eligible_positions)")
      .eq("club_id", participant.club_id)
      .neq("current_zone", "bench")
      .eq("injured", false),
    supabase.from("club_staff").select("staff_card:staff_cards(effects)").eq("club_id", participant.club_id),
  ]);

  const staffEffects = (staffData ?? []).flatMap((s) => {
    const card = s.staff_card as { effects?: Array<{ type: string; zone?: string; stars?: number }> } | null;
    return card?.effects ?? [];
  });
  const captain = await loadClubCaptain(supabase, participant.club_id);
  const powers = calculateLineupPower(
    (playerData ?? []).map((p) => {
      const player = p.player as {
        chemistry_left?: boolean | null;
        chemistry_right?: boolean | null;
        position?: string | null;
        eligible_positions?: string[] | null;
      } | null;
      return {
        id: p.id as string,
        chemistry_left: player?.chemistry_left,
        chemistry_right: player?.chemistry_right,
        current_stars: p.current_stars as number | string,
        current_zone: p.current_zone as string,
        lineup_slot: p.lineup_slot as number | null,
        position: player?.position,
        positions: player?.eligible_positions?.length ? player.eligible_positions : player?.position ? [player.position] : undefined,
      };
    }),
    staffEffects,
    captain,
  );

  return {
    canReceiveEvents: true,
    clubId: participant.club_id,
    lineup: { ATT: [], DEF: [], GK: [], MID: [] },
    participantId: participant.id,
    powers: { ATT: powers.ATT.total, DEF: powers.DEF.total, MID: powers.MID.total },
    zone_players: (playerData ?? [])
      .filter((p) => ["ATT", "DEF", "GK", "MID"].includes(String(p.current_zone)))
      .map((p) => {
        const player = p.player as {
          attacker_archetype?: string | null;
          defender_archetype?: string | null;
          display_name?: string | null;
          eligible_positions?: string[] | null;
          position?: string | null;
        } | null;
        return {
          attacker_archetype: normalizeApplicablePlayerArchetype(
            player?.attacker_archetype,
            player?.position,
            player?.eligible_positions,
          ),
          current_stars: Number(p.current_stars ?? 0),
          current_zone: p.current_zone as "ATT" | "DEF" | "GK" | "MID",
          defender_archetype: normalizeApplicablePlayerArchetype(
            player?.defender_archetype,
            player?.position,
            player?.eligible_positions,
          ),
          display_name: player?.display_name ?? null,
          id: p.id as string,
          lineup_slot: p.lineup_slot as number | null,
          position: player?.position ?? null,
        };
      }),
  };
}

async function finalizeContinentalTournament(
  supabase: SupabaseServiceClient,
  tournament: { id: string; game_id: string; season_number: number; prize_amount: number },
  winnerParticipantId: string,
  participants: Map<string, ContinentalParticipantRow>,
  userId: string,
) {
  const winner = participants.get(winnerParticipantId);
  const winnerClubId = winner?.club_id ?? null;
  if (winnerClubId) {
    const { data: club } = await supabase.from("clubs").select("money").eq("id", winnerClubId).single<{ money: number }>();
    await supabase
      .from("clubs")
      .update({ money: Number(club?.money ?? 0) + Number(tournament.prize_amount ?? CONTINENTAL_PRIZE_AMOUNT) })
      .eq("id", winnerClubId);
    await supabase.from("transactions").insert({
      game_id: tournament.game_id,
      club_id: winnerClubId,
      amount: Number(tournament.prize_amount ?? CONTINENTAL_PRIZE_AMOUNT),
      reason: "continental_cup_prize",
      metadata: { season_number: tournament.season_number },
    });
  }
  await supabase
    .from("continental_tournaments")
    .update({ status: "completed", winner_club_id: winnerClubId, current_round: 2 })
    .eq("id", tournament.id);
  await supabase.from("match_news").insert({
    game_id: tournament.game_id,
    club_id: winnerClubId,
    category: "good_news",
    headline: "Continental Cup gewonnen!",
    detail: `+${Math.round(Number(tournament.prize_amount ?? CONTINENTAL_PRIZE_AMOUNT) / 1_000_000)}M Praemie`,
  });
  await touchGameSave(supabase, tournament.game_id, userId);
}

async function resolveContinentalFixtureServer(
  supabase: SupabaseServiceClient,
  fixture: ContinentalFixtureRow & {
    home_continental_cpu_lineup_id?: string | null;
    away_continental_cpu_lineup_id?: string | null;
  },
  participants: Map<string, ContinentalParticipantRow>,
  game: LobbyGame,
  userId: string,
) {
  const home = participants.get(fixture.home_participant_id);
  const away = participants.get(fixture.away_participant_id);
  if (!home || !away) {
    throw new Error("Continental fixture participants missing.");
  }

  const [homeSide, awaySide] = await Promise.all([
    buildContinentalFixtureSide(supabase, home, fixture.home_continental_cpu_lineup_id ?? null),
    buildContinentalFixtureSide(supabase, away, fixture.away_continental_cpu_lineup_id ?? null),
  ]);

  const resolution = resolveFixture({
    archetypesEnabled: areArchetypesEnabled(game.settings),
    away: awaySide,
    home: homeSide,
    matchPointsMode: getMatchPointsMode(game.settings),
  });

  const winnerParticipantId =
    resolution.home_match_points > resolution.away_match_points
      ? home.id
      : resolution.away_match_points > resolution.home_match_points
        ? away.id
        : homeSide.participantId;

  const loserId = winnerParticipantId === home.id ? away.id : home.id;

  const [homePlayers, awayPlayers] = await Promise.all([
    home.club_id
      ? supabase
          .from("club_players")
          .select("current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
          .eq("club_id", home.club_id)
          .neq("current_zone", "bench")
          .order("lineup_slot", { ascending: true })
      : Promise.resolve({ data: [] as [] }),
    away.club_id
      ? supabase
          .from("club_players")
          .select("current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
          .eq("club_id", away.club_id)
          .neq("current_zone", "bench")
          .order("lineup_slot", { ascending: true })
      : Promise.resolve({ data: [] as [] }),
  ]);

  const lineupSnapshot = {
    away: buildLineupSnapshotFromPlayers(awayPlayers.data ?? []),
    home: buildLineupSnapshotFromPlayers(homePlayers.data ?? []),
  };

  await supabase
    .from("continental_fixtures")
    .update({
      away_score: resolution.away_match_points,
      away_third_points: resolution.away_third_points,
      completed_at: new Date().toISOString(),
      home_score: resolution.home_match_points,
      home_third_points: resolution.home_third_points,
      result: { ...resolution, lineup_snapshot: lineupSnapshot },
      status: "completed",
      match_state: "completed",
      winner_participant_id: winnerParticipantId,
    })
    .eq("id", fixture.id);

  await supabase
    .from("continental_participants")
    .update({ eliminated_round: fixture.round })
    .eq("id", loserId);

  const { data: tournament } = await supabase
    .from("continental_tournaments")
    .select("id, game_id, season_number, current_round, status, prize_amount")
    .eq("id", fixture.tournament_id)
    .single<{
      id: string;
      game_id: string;
      season_number: number;
      current_round: number;
      status: string;
      prize_amount: number;
    }>();

  if (tournament && isContinentalFinalRound(fixture.round)) {
    await finalizeContinentalTournament(supabase, tournament, winnerParticipantId, participants, userId);
    return;
  }

  await touchGameSave(supabase, tournament!.game_id, userId);
}

export async function autoSimulateContinentalCpuFixtures(
  supabase: SupabaseServiceClient,
  tournamentId: string,
  game: LobbyGame,
  userId: string,
) {
  const participants = await getContinentalParticipants(supabase, tournamentId);
  const { data: pending } = await supabase
    .from("continental_fixtures")
    .select(`${FIXTURE_SELECT}`)
    .eq("tournament_id", tournamentId)
    .eq("status", "scheduled");
  if (!pending?.length) return;

  for (const fixture of pending as ContinentalFixtureRow[]) {
    const home = participants.get(fixture.home_participant_id);
    const away = participants.get(fixture.away_participant_id);
    if (home?.kind === "cpu" && away?.kind === "cpu") {
      await resolveContinentalFixtureServer(supabase, fixture, participants, game, userId);
    }
  }
}

export async function isContinentalTournamentComplete(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data } = await supabase
    .from("continental_tournaments")
    .select("status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ status: string }>();
  return data?.status === "completed";
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
    .select(`${FIXTURE_SELECT}, tournament_id, home_continental_cpu_lineup_id, away_continental_cpu_lineup_id`)
    .eq("id", fixtureId)
    .maybeSingle<ContinentalFixtureRow & { tournament_id: string; home_continental_cpu_lineup_id: string | null; away_continental_cpu_lineup_id: string | null }>();
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
    throw new Error("Dieses Continental-Spiel darfst du nicht aufloesen.");
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

  const incomplete = (roundFixtures ?? []).some((f) => f.status !== "completed");
  if (incomplete) {
    await autoSimulateContinentalCpuFixtures(supabase, tournament.id, game, userId);
    redirect(`/games/${roomCode}?view=continental`);
  }

  const winners = (roundFixtures ?? [])
    .sort((a, b) => Number(a.match_index) - Number(b.match_index))
    .map((f) => f.winner_participant_id as string);

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
  const cpuTeamIds = [...new Set([...participants.values()].flatMap((p) => (p.continental_cpu_team_id ? [p.continental_cpu_team_id] : [])))];
  const lineupsByTeam = await getContinentalLineupsByTeamId(supabase, cpuTeamIds);

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
      home_continental_cpu_lineup_id:
        home?.kind === "cpu" && home.continental_cpu_team_id
          ? pickCpuLineupId(lineupsByTeam.get(home.continental_cpu_team_id) ?? [])
          : null,
      away_continental_cpu_lineup_id:
        away?.kind === "cpu" && away.continental_cpu_team_id
          ? pickCpuLineupId(lineupsByTeam.get(away.continental_cpu_team_id) ?? [])
          : null,
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
