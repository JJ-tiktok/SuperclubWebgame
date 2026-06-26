import type { ClubStatus } from "@/lib/game/types";
import { calculateManagerStandingScore } from "@/lib/game/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addSponsorPrestigeToState,
  addTrainingStarsToState,
  checkTraditionsverein,
  FACILITY_LABELS,
  getFacilitiesAtMax,
  getPhilosophyById,
  getPrestigeTarget,
  getStrongestElevenPlayerIds,
  incrementQualifiedTransferSales,
  syncTalentschmiedeState,
  isNlzPlayerAtMax,
  isPhilosophyFulfilled,
  isPrestigeEnabled,
  isQualifiedTransferProfit,
  normalizePrestigeState,
  PRESTIGE_CATEGORY,
  PRESTIGE_POINTS,
  shouldTriggerFinalSeason,
  sponsorPointsForTier,
  sumTrainingStarsForSeason,
  updateConsecutiveLeagueTitles,
  updateFacilitiesAtMaxState,
  type FacilityKey,
  type PhilosophyId,
  type PrestigeState,
} from "@/lib/lobby/prestige";
import type { ClubPlayerSnapshot, LobbyClub, LobbyGame } from "@/lib/lobby/types";
import { isNlzOriginPlayer } from "@/lib/lobby/youth-generator";

type ServiceClient = SupabaseClient;

type PrestigeClubRow = LobbyClub & {
  prestige_points: number;
  continental_wins: number;
  philosophy_id: string | null;
  philosophy_fulfilled: boolean;
  prestige_state: Record<string, unknown>;
};

type SeasonStandingRow = {
  participant_id: string;
  rank: number;
  participant: { club_id: string | null; kind: string } | null;
};

type ManagerScoreRow = {
  club_id: string;
  rank: number;
};

type SponsorContractRow = {
  club_id: string;
  prestige_tier: ClubStatus;
  resolved_season: number | null;
  status: string;
};

type ClubPlayerDbRow = {
  id: string;
  club_id: string;
  player_id: string;
  custom_name?: string | null;
  current_stars: number | string;
  seasons_at_club?: number | null;
  current_zone: string;
  injured: boolean;
  lineup_slot: number | null;
  player: {
    id: string;
    metadata?: Record<string, unknown> | null;
    skill_max?: number | string | null;
    potential_stars?: number | string | null;
    base_stars?: number | string | null;
    position?: string;
    display_name?: string;
    region?: string | null;
  };
};

async function loadHumanPrestigeClubs(supabase: ServiceClient, gameId: string): Promise<PrestigeClubRow[]> {
  const { data, error } = await supabase
    .from("clubs")
    .select(
      "id, game_id, clerk_user_id, club_name, club_color, manager_name, season_rank, prestige_points, continental_wins, philosophy_id, philosophy_fulfilled, prestige_state, training_level, scouting_level, stadium_level, medical_center_level, analytics_hub_level, youth_academy_level, construction_yard_built, squad_stars",
    )
    .eq("game_id", gameId)
    .returns<PrestigeClubRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadExistingAwardRefs(
  supabase: ServiceClient,
  clubId: string,
  category: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("prestige_awards")
    .select("ref")
    .eq("club_id", clubId)
    .eq("category", category)
    .returns<Array<{ ref: string }>>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.ref));
}

async function awardPrestigePoints(params: {
  supabase: ServiceClient;
  gameId: string;
  clubId: string;
  seasonNumber: number;
  category: string;
  ref: string;
  points: number;
  metadata?: Record<string, unknown>;
  existingRefs?: Set<string>;
}): Promise<number> {
  const { supabase, gameId, clubId, seasonNumber, category, ref, points, metadata = {} } = params;
  if (points <= 0) {
    return 0;
  }

  if (params.existingRefs?.has(ref)) {
    return 0;
  }

  const { error: insertError } = await supabase.from("prestige_awards").insert({
    game_id: gameId,
    club_id: clubId,
    season_number: seasonNumber,
    category,
    ref,
    points,
    metadata,
  });

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return 0;
    }
    throw insertError;
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("prestige_points")
    .eq("id", clubId)
    .single<{ prestige_points: number }>();

  if (clubError) {
    throw clubError;
  }

  const nextPoints = Number(club.prestige_points ?? 0) + points;
  const { error: updateError } = await supabase.from("clubs").update({ prestige_points: nextPoints }).eq("id", clubId);
  if (updateError) {
    throw updateError;
  }

  params.existingRefs?.add(ref);
  return points;
}

async function updateClubPrestigeState(
  supabase: ServiceClient,
  clubId: string,
  state: PrestigeState,
  extra?: Partial<Pick<PrestigeClubRow, "philosophy_fulfilled">>,
) {
  const { error } = await supabase
    .from("clubs")
    .update({
      prestige_state: state,
      ...(extra ?? {}),
    })
    .eq("id", clubId);

  if (error) {
    throw error;
  }
}

async function loadSeasonStandings(supabase: ServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("season_standings")
    .select("participant_id, rank, participant:season_participants(club_id, kind)")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .returns<SeasonStandingRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadManagerScoreRows(supabase: ServiceClient, gameId: string, seasonNumber: number): Promise<ManagerScoreRow[]> {
  const { data: participants, error: participantsError } = await supabase
    .from("season_participants")
    .select("id, club_id, kind")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .returns<Array<{ id: string; club_id: string | null; kind: string }>>();

  if (participantsError) {
    throw participantsError;
  }

  const humanParticipants = (participants ?? []).filter((participant) => participant.kind === "human" && participant.club_id);
  if (humanParticipants.length === 0) {
    return [];
  }

  const participantIds = humanParticipants.map((participant) => participant.id);
  const { data: standings, error: standingsError } = await supabase
    .from("season_standings")
    .select("participant_id, match_points, manager_match_points")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .in("participant_id", participantIds)
    .returns<Array<{ manager_match_points?: number | string | null; participant_id: string; match_points: number | string }>>();

  if (standingsError) {
    throw standingsError;
  }

  const clubIds = humanParticipants.map((participant) => participant.club_id as string);
  const { data: squadRows, error: squadError } = await supabase
    .from("club_players")
    .select("club_id, current_stars")
    .in("club_id", clubIds)
    .returns<Array<{ club_id: string; current_stars: number | string }>>();

  if (squadError) {
    throw squadError;
  }

  const squadStarsByClub = new Map<string, number>();
  for (const row of squadRows ?? []) {
    squadStarsByClub.set(row.club_id, (squadStarsByClub.get(row.club_id) ?? 0) + Number(row.current_stars ?? 0));
  }

  const rows = humanParticipants.map((participant) => {
    const standing = standings?.find((entry) => entry.participant_id === participant.id);
    const squadStars = squadStarsByClub.get(participant.club_id as string) ?? 0;
    const matchPoints = Number(standing?.manager_match_points ?? standing?.match_points ?? 0);
    return {
      club_id: participant.club_id as string,
      season_score: calculateManagerStandingScore(matchPoints),
      squad_stars: squadStars,
    };
  });

  rows.sort((left, right) => {
    if (right.season_score !== left.season_score) {
      return right.season_score - left.season_score;
    }
    return right.squad_stars - left.squad_stars;
  });

  return rows.map((row, index) => ({
    club_id: row.club_id,
    rank: index + 1,
  }));
}

async function loadClubSquad(supabase: ServiceClient, clubId: string): Promise<ClubPlayerSnapshot[]> {
  const { data, error } = await supabase
    .from("club_players")
    .select(
      "id, club_id, player_id, current_stars, seasons_at_club, current_zone, injured, lineup_slot, custom_name, player:players(id, display_name, position, metadata, skill_max, potential_stars, base_stars, region)",
    )
    .eq("club_id", clubId)
    .returns<ClubPlayerDbRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    club_id: row.club_id,
    player_id: row.player_id,
    current_stars: Number(row.current_stars),
    seasons_at_club: Number(row.seasons_at_club ?? 1),
    current_zone: row.current_zone,
    injured: row.injured,
    lineup_slot: row.lineup_slot,
    custom_name: row.custom_name ?? null,
    player: {
      id: row.player.id,
      display_name: row.player.display_name ?? "Spieler",
      position: row.player.position ?? "MID",
      metadata: row.player.metadata ?? null,
      skill_max: row.player.skill_max != null ? Number(row.player.skill_max) : null,
      potential_stars: Number(row.player.potential_stars ?? 0),
      base_stars: Number(row.player.base_stars ?? 0),
      region: row.player.region ?? null,
    },
  }));
}

async function loadTrainingTransactions(supabase: ServiceClient, gameId: string, clubId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("metadata")
    .eq("game_id", gameId)
    .eq("club_id", clubId)
    .eq("reason", "training")
    .returns<Array<{ metadata: unknown }>>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function loadFulfilledSponsorContracts(supabase: ServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("club_sponsor_contracts")
    .select("club_id, prestige_tier, resolved_season, status")
    .eq("game_id", gameId)
    .eq("resolved_season", seasonNumber)
    .in("status", ["completed", "awaiting_reward_pick"])
    .returns<SponsorContractRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function snapshotSeasonStartSquadStars(supabase: ServiceClient, gameId: string, seasonNumber: number) {
  const clubs = await loadHumanPrestigeClubs(supabase, gameId);
  await Promise.all(
    clubs.map(async (club) => {
      const state = normalizePrestigeState(club.prestige_state);
      const seasonStarts = { ...(state.season_start_squad_stars ?? {}) };
      seasonStarts[String(seasonNumber)] = Number(club.squad_stars ?? 0);
      await updateClubPrestigeState(supabase, club.id, {
        ...state,
        season_start_squad_stars: seasonStarts,
      });
    }),
  );
}

export async function recordQualifiedTransferSale(
  supabase: ServiceClient,
  clubId: string,
  salePrice: number,
  purchasePrice: number | null | undefined,
  playerMetadata: Record<string, unknown> | null | undefined,
) {
  if (isNlzOriginPlayer(playerMetadata)) {
    return;
  }

  if (!isQualifiedTransferProfit(salePrice, purchasePrice)) {
    return;
  }

  const { data: club, error } = await supabase
    .from("clubs")
    .select("prestige_state")
    .eq("id", clubId)
    .single<{ prestige_state: Record<string, unknown> }>();

  if (error) {
    throw error;
  }

  const state = incrementQualifiedTransferSales(normalizePrestigeState(club.prestige_state));
  await updateClubPrestigeState(supabase, clubId, state);
}

async function evaluatePhilosophyFulfillment(params: {
  supabase: ServiceClient;
  gameId: string;
  club: PrestigeClubRow;
  state: PrestigeState;
  seasonNumber: number;
  wonLeague: boolean;
  wasUnderdog: boolean;
  traditionsvereinMet: boolean;
}) {
  const { supabase, gameId, club, state, seasonNumber, wonLeague, wasUnderdog, traditionsvereinMet } = params;
  if (!club.philosophy_id || club.philosophy_fulfilled) {
    return;
  }

  const philosophyId = club.philosophy_id as PhilosophyId;
  const fulfilled = isPhilosophyFulfilled(philosophyId, state, {
    wonLeagueThisSeason: wonLeague,
    wasUnderdogAtSeasonStart: wasUnderdog,
    traditionsvereinMet,
  });

  if (!fulfilled) {
    return;
  }

  const philosophy = getPhilosophyById(philosophyId);
  const points = philosophy?.reward ?? 0;
  const existingRefs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.philosophy);
  const awarded = await awardPrestigePoints({
    supabase,
    gameId,
    clubId: club.id,
    seasonNumber,
    category: PRESTIGE_CATEGORY.philosophy,
    ref: philosophyId,
    points,
    metadata: { philosophy_id: philosophyId },
    existingRefs,
  });

  if (awarded > 0) {
    await updateClubPrestigeState(supabase, club.id, state, { philosophy_fulfilled: true });
  }
}

export async function processPrestigeAtSeasonEnd(
  supabase: ServiceClient,
  gameId: string,
  seasonNumber: number,
  settings: LobbyGame["settings"],
) {
  if (!isPrestigeEnabled(settings)) {
    return;
  }

  const clubs = await loadHumanPrestigeClubs(supabase, gameId);
  const standings = await loadSeasonStandings(supabase, gameId, seasonNumber);
  const managerRows = await loadManagerScoreRows(supabase, gameId, seasonNumber);
  const sponsorContracts = await loadFulfilledSponsorContracts(supabase, gameId, seasonNumber);

  const leagueWinnerClubId = standings.find((row) => row.rank === 1 && row.participant?.kind === "human")?.participant?.club_id ?? null;
  const humanSeasonStarts = new Map<string, number>();
  for (const club of clubs) {
    const state = normalizePrestigeState(club.prestige_state);
    humanSeasonStarts.set(club.id, state.season_start_squad_stars?.[String(seasonNumber)] ?? Number(club.squad_stars ?? 0));
  }
  const minSeasonStartSquad = Math.min(...Array.from(humanSeasonStarts.values()));

  for (const club of clubs) {
    let state = normalizePrestigeState(club.prestige_state);
    const standing = standings.find((row) => row.participant?.club_id === club.id);
    const managerRow = managerRows.find((row) => row.club_id === club.id);
    const wonLeague = leagueWinnerClubId === club.id;
    const wasUnderdog = wonLeague && humanSeasonStarts.get(club.id) === minSeasonStartSquad;

    if (standing?.rank === 1) {
      const refs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.league_champion);
      await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.league_champion,
        ref: String(seasonNumber),
        points: PRESTIGE_POINTS.league_champion,
        existingRefs: refs,
      });
    }

    if (standing?.rank === 2) {
      const refs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.league_runner_up);
      await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.league_runner_up,
        ref: String(seasonNumber),
        points: PRESTIGE_POINTS.league_runner_up,
        existingRefs: refs,
      });
    }

    if (managerRow?.rank === 1) {
      const refs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.manager_rank_1);
      await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.manager_rank_1,
        ref: String(seasonNumber),
        points: PRESTIGE_POINTS.manager_rank_1,
        existingRefs: refs,
      });
    }

    state = updateConsecutiveLeagueTitles(state, wonLeague);
    state = updateFacilitiesAtMaxState(state, club);

    for (const contract of sponsorContracts.filter((entry) => entry.club_id === club.id)) {
      const tier = contract.prestige_tier;
      const points = sponsorPointsForTier(tier);
      const refs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.sponsor_tier);
      const awarded = await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.sponsor_tier,
        ref: `${seasonNumber}:${tier}`,
        points,
        metadata: { prestige_tier: tier },
        existingRefs: refs,
      });
      if (awarded > 0) {
        state = addSponsorPrestigeToState(state, awarded);
      }
    }

    for (const facility of getFacilitiesAtMax(club)) {
      const refs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.facility_max);
      await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.facility_max,
        ref: facility,
        points: PRESTIGE_POINTS.facility_max,
        metadata: { facility, label: FACILITY_LABELS[facility as FacilityKey] },
        existingRefs: refs,
      });
    }

    const squad = await loadClubSquad(supabase, club.id);
    state = syncTalentschmiedeState(state, squad);

    const youthRefs = await loadExistingAwardRefs(supabase, club.id, PRESTIGE_CATEGORY.youth_max);
    let youthAwardsThisSeason = 0;
    for (const player of squad) {
      if (!isNlzPlayerAtMax(player)) {
        continue;
      }
      if (youthAwardsThisSeason >= 2) {
        break;
      }
      const awarded = await awardPrestigePoints({
        supabase,
        gameId,
        clubId: club.id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.youth_max,
        ref: player.id,
        points: PRESTIGE_POINTS.youth_max,
        metadata: { club_player_id: player.id },
        existingRefs: youthRefs,
      });
      if (awarded > 0) {
        youthAwardsThisSeason += 1;
      }
    }

    const trainingTransactions = await loadTrainingTransactions(supabase, gameId, club.id);
    const seasonTrainingStars = sumTrainingStarsForSeason(trainingTransactions, seasonNumber);
    state = addTrainingStarsToState(state, seasonTrainingStars);

    const lineupIds = getStrongestElevenPlayerIds(squad);
    const traditionsvereinMet = checkTraditionsverein(squad, lineupIds);

    await updateClubPrestigeState(supabase, club.id, state);
    await evaluatePhilosophyFulfillment({
      supabase,
      gameId,
      club,
      state,
      seasonNumber,
      wonLeague,
      wasUnderdog,
      traditionsvereinMet,
    });
  }
}

export async function processContinentalPrestigeAtCupEnd(
  supabase: ServiceClient,
  gameId: string,
  seasonNumber: number,
  settings: LobbyGame["settings"],
) {
  if (!isPrestigeEnabled(settings)) {
    return;
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("continental_tournaments")
    .select("id, winner_club_id, status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .maybeSingle<{ id: string; winner_club_id: string | null; status: string }>();

  if (tournamentError) {
    throw tournamentError;
  }

  if (!tournament || tournament.status !== "completed") {
    return;
  }

  const { data: participants, error: participantsError } = await supabase
    .from("continental_participants")
    .select("club_id, eliminated_round")
    .eq("tournament_id", tournament.id)
    .returns<Array<{ club_id: string | null; eliminated_round: number | null }>>();

  if (participantsError) {
    throw participantsError;
  }

  for (const participant of participants ?? []) {
    if (!participant.club_id) {
      continue;
    }

    const isWinner = tournament.winner_club_id === participant.club_id;
    const lostFinal = !isWinner && (participant.eliminated_round === 2 || participant.eliminated_round === 1);

    if (isWinner) {
      const refs = await loadExistingAwardRefs(supabase, participant.club_id, PRESTIGE_CATEGORY.continental_win);
      const awarded = await awardPrestigePoints({
        supabase,
        gameId,
        clubId: participant.club_id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.continental_win,
        ref: String(seasonNumber),
        points: PRESTIGE_POINTS.continental_win,
        existingRefs: refs,
      });

      if (awarded > 0) {
        const { data: club, error } = await supabase
          .from("clubs")
          .select("continental_wins")
          .eq("id", participant.club_id)
          .single<{ continental_wins: number }>();
        if (error) {
          throw error;
        }
        await supabase
          .from("clubs")
          .update({ continental_wins: Number(club.continental_wins ?? 0) + 1 })
          .eq("id", participant.club_id);
      }
      continue;
    }

    if (lostFinal) {
      const refs = await loadExistingAwardRefs(supabase, participant.club_id, PRESTIGE_CATEGORY.continental_finalist);
      await awardPrestigePoints({
        supabase,
        gameId,
        clubId: participant.club_id,
        seasonNumber,
        category: PRESTIGE_CATEGORY.continental_finalist,
        ref: String(seasonNumber),
        points: PRESTIGE_POINTS.continental_finalist,
        existingRefs: refs,
      });
    }
  }
}

export async function maybeTriggerFinalSeason(
  supabase: ServiceClient,
  gameId: string,
  settings: LobbyGame["settings"],
  endingSeasonNumber: number,
): Promise<LobbyGame["settings"]> {
  if (!isPrestigeEnabled(settings) || settings.final_season_number) {
    return settings;
  }

  const target = getPrestigeTarget(settings);
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("prestige_points, continental_wins")
    .eq("game_id", gameId)
    .returns<Array<{ prestige_points: number; continental_wins: number }>>();

  if (error) {
    throw error;
  }

  if (!shouldTriggerFinalSeason(clubs ?? [], target)) {
    return settings;
  }

  return {
    ...settings,
    final_season_number: endingSeasonNumber + 1,
  };
}

export async function selectPhilosophyForClub(
  supabase: ServiceClient,
  gameId: string,
  clubId: string,
  philosophyId: PhilosophyId,
) {
  const { data: club, error } = await supabase
    .from("clubs")
    .select("philosophy_id")
    .eq("id", clubId)
    .eq("game_id", gameId)
    .single<{ philosophy_id: string | null }>();

  if (error) {
    throw error;
  }

  if (club.philosophy_id) {
    throw new Error("Philosophie wurde bereits gewaehlt.");
  }

  const { error: updateError } = await supabase.from("clubs").update({ philosophy_id: philosophyId }).eq("id", clubId);
  if (updateError) {
    throw updateError;
  }
}
