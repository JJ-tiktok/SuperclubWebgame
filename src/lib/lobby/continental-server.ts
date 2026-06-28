import {
  assignContinentalCpuSlots,
  buildNextRoundFixtures,
  buildSeededRound32Fixtures,
  classifyQualifiedHumans,
  CONTINENTAL_LINEUPS_BY_TIER,
  CONTINENTAL_PRIZE_WINNER,
  getEliminationPrizeHeadline,
  getPrizeForEliminationRound,
  isContinentalFinalRound,
  isContinentalQualified,
  pickRandomLineupIndex,
  requiredContinentalCpuCount,
  type ContinentalCpuTier,
  type ContinentalRound,
} from "@/lib/lobby/continental-cup";
import { resolveEffectiveClubStatus } from "@/lib/lobby/club-status";
import { calculateLineupPower, type CaptainBoost } from "@/lib/lobby/lineup-power";
import { areArchetypesEnabled, normalizeApplicablePlayerArchetype } from "@/lib/lobby/archetypes";
import { buildLineupSnapshotFromPlayers, type LineupSnapshotClubPlayerRow } from "@/lib/lobby/lineup-snapshot";
import { getClubPlayerDisplayNameFromRow } from "@/lib/lobby/player-names";
import { getMatchPointsMode, resolveFixture, type FixtureSideInput } from "@/lib/lobby/season";
import type { LobbyGame, SeasonStandingSnapshot } from "@/lib/lobby/types";
import type { SupabaseServiceClient } from "@/app/games/actions/_shared";

export type ContinentalParticipantRow = {
  id: string;
  tournament_id: string;
  kind: "human" | "cpu";
  club_id: string | null;
  continental_cpu_team_id: string | null;
  display_name: string;
  bracket_seed: number;
  eliminated_round: number | null;
  cpu_strength_tier: ContinentalCpuTier | null;
};

export type ContinentalFixtureRow = {
  id: string;
  tournament_id: string;
  round: ContinentalRound;
  match_index: number;
  home_participant_id: string;
  away_participant_id: string;
  home_continental_cpu_lineup_id: string | null;
  away_continental_cpu_lineup_id: string | null;
  home_cpu_formation_index: number | null;
  away_cpu_formation_index: number | null;
  home_lineup_locked: boolean;
  away_lineup_locked: boolean;
  status: "scheduled" | "completed";
  winner_participant_id: string | null;
};

export const FIXTURE_SELECT =
  "id, tournament_id, round, match_index, home_participant_id, away_participant_id, home_continental_cpu_lineup_id, away_continental_cpu_lineup_id, home_cpu_formation_index, away_cpu_formation_index, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, status, match_state, winner_participant_id";

type ClubPlayerRow = {
  id: string;
  custom_name?: string | null;
  current_stars: number | string;
  current_zone: string;
  lineup_slot: number | null;
  injured?: boolean;
  player: {
    attacker_archetype?: string | null;
    chemistry_left?: boolean | null;
    chemistry_right?: boolean | null;
    defender_archetype?: string | null;
    display_name?: string | null;
    position?: string | null;
    eligible_positions?: string[] | null;
  } | null;
};

type StaffEffect = { type: string; zone?: string; stars?: number };

function extractStaffEffects(
  staffData: Array<{ staff_card: { effects?: StaffEffect[] } | null }> | null | undefined,
): StaffEffect[] {
  return (staffData ?? []).flatMap((entry) => {
    const card = entry.staff_card as { effects?: StaffEffect[] } | null;
    return card?.effects ?? [];
  });
}

function mapClubPlayersToLineupInput(players: ClubPlayerRow[]) {
  return players.map((row) => {
    const player = row.player;
    return {
      id: row.id,
      chemistry_left: player?.chemistry_left,
      chemistry_right: player?.chemistry_right,
      current_stars: row.current_stars,
      current_zone: row.current_zone,
      lineup_slot: row.lineup_slot,
      position: player?.position,
      positions: player?.eligible_positions?.length
        ? player.eligible_positions
        : player?.position
          ? [player.position]
          : undefined,
    };
  });
}

export async function touchGameSave(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  await supabase
    .from("games")
    .update({ last_saved_at: new Date().toISOString(), last_saved_by_clerk_user_id: userId })
    .eq("id", gameId);
}

async function loadClubCaptain(supabase: SupabaseServiceClient, clubId: string): Promise<CaptainBoost | null> {
  const { data } = await supabase
    .from("clubs")
    .select("captain_club_player_id, captain_boost_rank")
    .eq("id", clubId)
    .maybeSingle<{ captain_club_player_id: string | null; captain_boost_rank: number | null }>();
  if (!data?.captain_club_player_id) return null;
  return {
    clubPlayerId: data.captain_club_player_id,
    boost: Math.max(0, Math.trunc(Number(data.captain_boost_rank ?? 0))),
  };
}

async function loadClubLineupPower(supabase: SupabaseServiceClient, clubId: string) {
  const [{ data: playerData }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, current_stars, current_zone, lineup_slot, injured, player:players(chemistry_left, chemistry_right, position, eligible_positions)")
      .eq("club_id", clubId)
      .neq("current_zone", "bench")
      .eq("injured", false),
    supabase.from("club_staff").select("staff_card:staff_cards(effects)").eq("club_id", clubId),
  ]);

  const captain = await loadClubCaptain(supabase, clubId);
  return calculateLineupPower(
    mapClubPlayersToLineupInput((playerData ?? []) as ClubPlayerRow[]),
    extractStaffEffects(staffData),
    captain,
  );
}

export async function computeClubLockedPower(supabase: SupabaseServiceClient, clubId: string) {
  const powers = await loadClubLineupPower(supabase, clubId);
  return { DEF: powers.DEF.total, MID: powers.MID.total, ATT: powers.ATT.total };
}

async function loadSeasonStandingsForContinental(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
): Promise<SeasonStandingSnapshot[]> {
  const { data: standings, error: standingsError } = await supabase
    .from("season_standings")
    .select(
      `participant_id, season_number, played, wins, draws, losses, match_points, third_points_for, third_points_against,
      fixture_points_for, fixture_points_against, rank,
      participant:season_participants(id, game_id, season_number, kind, club_id, cpu_team_id, display_name)`,
    )
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .order("rank", { ascending: true })
    .returns<SeasonStandingSnapshot[]>();

  if (standingsError) {
    throw standingsError;
  }

  return standings ?? [];
}

export async function hasContinentalQualifiers(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
) {
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, status, status_override, status_override_until_season")
    .eq("game_id", gameId);
  if (error) throw error;

  return (clubs ?? []).some((club) =>
    isContinentalQualified(resolveEffectiveClubStatus(club, seasonNumber)),
  );
}

export async function ensureContinentalTournament(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("continental_tournaments")
    .select("id")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    return existing.id;
  }

  const qualified = await hasContinentalQualifiers(supabase, gameId, seasonNumber);
  if (!qualified) {
    return null;
  }

  const [{ data: clubs, error: clubsError }, standings] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, club_name, created_at, status, status_override, status_override_until_season")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true }),
    loadSeasonStandingsForContinental(supabase, gameId, seasonNumber),
  ]);
  if (clubsError) throw clubsError;

  const qualifiedClubs = (clubs ?? [])
    .filter((club) => isContinentalQualified(resolveEffectiveClubStatus(club, seasonNumber)))
    .map((club) => ({ club_id: club.id as string, display_name: club.club_name as string }));

  const qualifiedHumans = classifyQualifiedHumans(qualifiedClubs, standings);
  const cpuNeeded = requiredContinentalCpuCount(qualifiedHumans.length);
  if (qualifiedHumans.length + cpuNeeded !== 32) {
    throw new Error(
      `Continental Cup benötigt 32 Teams, aber ${qualifiedHumans.length} Qualifikanten + ${cpuNeeded} CPU ergibt nicht 32.`,
    );
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
        "Bitte in Supabase `supabase/continental_cpu_catalog_expand.sql` (oder `champions_league_upgrade.sql`) ausführen.",
    );
  }

  const cpuSlots = assignContinentalCpuSlots(
    qualifiedHumans,
    (cpuPool ?? []).map((cpu) => ({ id: cpu.id as string, display_name: cpu.display_name as string })),
  );

  const { data: tournament, error: tournamentError } = await supabase
    .from("continental_tournaments")
    .insert({
      game_id: gameId,
      season_number: seasonNumber,
      status: "in_progress",
      bracket_size: 32,
      prize_amount: CONTINENTAL_PRIZE_WINNER,
      current_round: 32,
    })
    .select("id")
    .single<{ id: string }>();
  if (tournamentError) throw tournamentError;

  const tournamentId = tournament.id;
  const participantRows = [
    ...qualifiedHumans.map((human) => ({
      tournament_id: tournamentId,
      kind: "human" as const,
      club_id: human.club_id,
      continental_cpu_team_id: null,
      display_name: human.display_name,
      bracket_seed: human.human_league_rank,
      cpu_strength_tier: null,
    })),
    ...cpuSlots.map((cpu, index) => ({
      tournament_id: tournamentId,
      kind: "cpu" as const,
      club_id: null,
      continental_cpu_team_id: cpu.catalog_team_id,
      display_name: cpu.display_name,
      bracket_seed: qualifiedHumans.length + index + 1,
      cpu_strength_tier: cpu.tier,
    })),
  ];

  const { data: participants, error: participantsError } = await supabase
    .from("continental_participants")
    .insert(participantRows)
    .select("id, kind, club_id, continental_cpu_team_id, cpu_strength_tier")
    .returns<
      Array<{
        id: string;
        kind: string;
        club_id: string | null;
        continental_cpu_team_id: string | null;
        cpu_strength_tier: ContinentalCpuTier | null;
      }>
    >();
  if (participantsError) throw participantsError;

  const humanParticipantIds = new Map<string, string>();
  const cpuParticipants: Array<{ participant_id: string; tier: ContinentalCpuTier }> = [];
  for (const participant of participants ?? []) {
    if (participant.kind === "human" && participant.club_id) {
      humanParticipantIds.set(participant.club_id, participant.id);
    }
    if (participant.kind === "cpu" && participant.cpu_strength_tier) {
      cpuParticipants.push({
        participant_id: participant.id,
        tier: participant.cpu_strength_tier,
      });
    }
  }

  const roundPairs = buildSeededRound32Fixtures({
    humanParticipantIds,
    cpuParticipants,
    qualifiedHumans,
  });

  const participantById = new Map((participants ?? []).map((participant) => [participant.id, participant]));
  const fixtureRows = roundPairs.map((pair) => {
    const home = participantById.get(pair.home_participant_id);
    const away = participantById.get(pair.away_participant_id);
    const homeFormation = home?.kind === "cpu" ? pickRandomLineupIndex(3) : null;
    const awayFormation = away?.kind === "cpu" ? pickRandomLineupIndex(3) : null;
    return {
      tournament_id: tournamentId,
      round: pair.round,
      match_index: pair.match_index,
      home_participant_id: pair.home_participant_id,
      away_participant_id: pair.away_participant_id,
      home_continental_cpu_lineup_id: null,
      away_continental_cpu_lineup_id: null,
      home_cpu_formation_index: homeFormation,
      away_cpu_formation_index: awayFormation,
      home_lineup_locked: home?.kind === "cpu",
      away_lineup_locked: away?.kind === "cpu",
    };
  });

  const { error: fixtureError } = await supabase.from("continental_fixtures").insert(fixtureRows);
  if (fixtureError) throw fixtureError;

  return tournamentId;
}

export async function getContinentalParticipants(
  supabase: SupabaseServiceClient,
  tournamentId: string,
): Promise<Map<string, ContinentalParticipantRow>> {
  const { data, error } = await supabase
    .from("continental_participants")
    .select(
      "id, tournament_id, kind, club_id, continental_cpu_team_id, display_name, bracket_seed, eliminated_round, cpu_strength_tier",
    )
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return new Map((data ?? []).map((participant) => [participant.id as string, participant as ContinentalParticipantRow]));
}

function getCpuPowersFromParticipant(participant: ContinentalParticipantRow, formationIndex: number | null) {
  if (!participant.cpu_strength_tier) {
    throw new Error("Continental CPU participant without strength tier.");
  }
  const lineups = CONTINENTAL_LINEUPS_BY_TIER[participant.cpu_strength_tier];
  const lineup = lineups[formationIndex ?? 0] ?? lineups[0];
  if (!lineup) {
    throw new Error(`Missing continental lineup for tier ${participant.cpu_strength_tier}.`);
  }
  return {
    ATT: lineup.att,
    DEF: lineup.def,
    MID: lineup.mid,
    display_name: lineup.display_name,
  };
}

async function buildContinentalFixtureSide(
  participant: ContinentalParticipantRow,
  formationIndex: number | null,
  supabase?: SupabaseServiceClient,
): Promise<FixtureSideInput> {
  if (participant.kind === "cpu") {
    const powers = getCpuPowersFromParticipant(participant, formationIndex);
    return {
      canReceiveEvents: false,
      clubId: null,
      lineup: { ATT: [], DEF: [], GK: [], MID: [] },
      participantId: participant.id,
      powers: {
        ATT: powers.ATT,
        DEF: powers.DEF,
        MID: powers.MID,
      },
      zone_players: [],
    };
  }

  if (!participant.club_id || !supabase) {
    throw new Error("Human continental participant without club.");
  }

  const [{ data: playerData }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select(
        "id, custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, chemistry_left, chemistry_right, defender_archetype, display_name, position, eligible_positions)",
      )
      .eq("club_id", participant.club_id)
      .neq("current_zone", "bench")
      .eq("injured", false),
    supabase.from("club_staff").select("staff_card:staff_cards(effects)").eq("club_id", participant.club_id),
  ]);

  const staffEffects = extractStaffEffects(staffData);
  const captain = await loadClubCaptain(supabase, participant.club_id);
  const players = (playerData ?? []) as ClubPlayerRow[];
  const powers = calculateLineupPower(mapClubPlayersToLineupInput(players), staffEffects, captain);

  return {
    canReceiveEvents: true,
    clubId: participant.club_id,
    lineup: { ATT: [], DEF: [], GK: [], MID: [] },
    participantId: participant.id,
    powers: { ATT: powers.ATT.total, DEF: powers.DEF.total, MID: powers.MID.total },
    zone_players: players
      .filter((row) => ["ATT", "DEF", "GK", "MID"].includes(String(row.current_zone)))
      .map((row) => {
        const player = row.player;
        return {
          attacker_archetype: normalizeApplicablePlayerArchetype(
            player?.attacker_archetype,
            player?.position,
            player?.eligible_positions,
          ),
          current_stars: Number(row.current_stars ?? 0),
          current_zone: row.current_zone as "ATT" | "DEF" | "GK" | "MID",
          defender_archetype: normalizeApplicablePlayerArchetype(
            player?.defender_archetype,
            player?.position,
            player?.eligible_positions,
          ),
          display_name: getClubPlayerDisplayNameFromRow({
            custom_name: row.custom_name ?? null,
            player,
          }),
          id: row.id,
          lineup_slot: row.lineup_slot,
          position: player?.position ?? null,
        };
      }),
  };
}

async function payContinentalEliminationPrize(
  supabase: SupabaseServiceClient,
  input: {
    clubId: string;
    eliminatedRound: number;
    gameId: string;
    seasonNumber: number;
  },
) {
  const prizeAmount = getPrizeForEliminationRound(input.eliminatedRound);
  if (prizeAmount <= 0) {
    return;
  }

  const { data: club } = await supabase.from("clubs").select("money").eq("id", input.clubId).single<{ money: number }>();
  await supabase
    .from("clubs")
    .update({ money: Number(club?.money ?? 0) + prizeAmount })
    .eq("id", input.clubId);
  await supabase.from("transactions").insert({
    game_id: input.gameId,
    club_id: input.clubId,
    amount: prizeAmount,
    reason: "continental_cup_prize",
    metadata: {
      eliminated_round: input.eliminatedRound,
      milestone: input.eliminatedRound === 4 ? "semifinal" : "finalist",
      season_number: input.seasonNumber,
    },
  });

  const headline = getEliminationPrizeHeadline(input.eliminatedRound);
  if (headline) {
    await supabase.from("match_news").insert({
      game_id: input.gameId,
      club_id: input.clubId,
      category: "good_news",
      headline,
      detail: `+${Math.round(prizeAmount / 1_000_000)}M Prämie`,
    });
  }
}

export async function finalizeContinentalTournament(
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
      .update({ money: Number(club?.money ?? 0) + CONTINENTAL_PRIZE_WINNER })
      .eq("id", winnerClubId);
    await supabase.from("transactions").insert({
      game_id: tournament.game_id,
      club_id: winnerClubId,
      amount: CONTINENTAL_PRIZE_WINNER,
      reason: "continental_cup_prize",
      metadata: { milestone: "winner", season_number: tournament.season_number },
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
    detail: `+${Math.round(CONTINENTAL_PRIZE_WINNER / 1_000_000)}M Prämie`,
  });
  await touchGameSave(supabase, tournament.game_id, userId);
}

export async function resolveContinentalFixtureServer(
  supabase: SupabaseServiceClient,
  fixture: ContinentalFixtureRow,
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
    buildContinentalFixtureSide(home, fixture.home_cpu_formation_index, supabase),
    buildContinentalFixtureSide(away, fixture.away_cpu_formation_index, supabase),
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
  const loser = participants.get(loserId);

  const emptyLineupPlayers = Promise.resolve({ data: [] as LineupSnapshotClubPlayerRow[] });
  const [homePlayers, awayPlayers] = await Promise.all([
    home.club_id
      ? supabase
          .from("club_players")
          .select("custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
          .eq("club_id", home.club_id)
          .neq("current_zone", "bench")
          .order("lineup_slot", { ascending: true })
          .returns<LineupSnapshotClubPlayerRow[]>()
      : emptyLineupPlayers,
    away.club_id
      ? supabase
          .from("club_players")
          .select("custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
          .eq("club_id", away.club_id)
          .neq("current_zone", "bench")
          .order("lineup_slot", { ascending: true })
          .returns<LineupSnapshotClubPlayerRow[]>()
      : emptyLineupPlayers,
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

  if (loser?.kind === "human" && loser.club_id && tournament) {
    await payContinentalEliminationPrize(supabase, {
      clubId: loser.club_id,
      eliminatedRound: fixture.round,
      gameId: tournament.game_id,
      seasonNumber: tournament.season_number,
    });
  }

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

export async function isContinentalTournamentComplete(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
) {
  const { data } = await supabase
    .from("continental_tournaments")
    .select("status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ status: string }>();
  if (!data) {
    return true;
  }
  return data.status === "completed";
}
