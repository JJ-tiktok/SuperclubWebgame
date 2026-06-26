import { auth } from "@clerk/nextjs/server";
import { getContinentalLineupStars, type ContinentalCpuTier } from "@/lib/lobby/continental-cup";
import { normalizeRoomCode } from "./rules";
import { DRAFT_PLAYER_SELECT } from "./draft";
import { mergeCarriedSecretWeapons } from "@/lib/lobby/club-game-changers";
import { buildNextMatchZoneBoostsByClubId } from "@/lib/game/game-changer-effects";
import {
  buildLineupSnapshotFromPlayers,
  type LineupSnapshotClubPlayerRow,
  type LineupSnapshotSide,
} from "@/lib/lobby/lineup-snapshot";
import {
  canRevealDeadlineAuctionPlayers,
  getMedicalHealsRemaining,
} from "@/lib/lobby/endgame-facilities";
import type {
  ClubGameChangerSnapshot,
  CpuStrengthTier,
  ClubOverviewSnapshot,
  ClubPendingEffectSnapshot,
  ClubPlayerSnapshot,
  ClubSquadSnapshot,
  DeadlineAuctionSnapshot,
  DeadlineBidSnapshot,
  DeadlineSnapshot,
  ClubStaffSnapshot,
  DraftPickSnapshot,
  DraftPlayerRow,
  DraftRoundSnapshot,
  InvestmentSnapshot,
  LobbyClub,
  LobbyGame,
  LobbyMember,
  LobbyPhase,
  LobbySnapshot,
  ManagerStandingSnapshot,
  MatchNewsSnapshot,
  SavedGameSummary,
  ScoutingDrawSnapshot,
  ScoutingSnapshot,
  ContinentalFixtureSnapshot,
  ContinentalTournamentSnapshot,
  SeasonFixtureSnapshot,
  SeasonSnapshot,
  SeasonStandingSnapshot,
  StaffCardRow,
  StaffOfferSnapshot,
  TransferMarketSnapshot,
  TransferOfferSnapshot,
} from "./types";
import { calculateManagerScore, getManagerScoreBand, getPlacementReward, getStadiumIncome, getTrainingCapacity } from "@/lib/game/rules";
import { getDeadlineAuctionCount } from "@/lib/lobby/deadline";
import {
  computeOffseasonScoutingBaseCapacity,
  getEffectiveScoutingDrawCapacity,
  getNextPendingScoutingClubId,
  sumStaffScoutingBonus,
  type ScoutingPendingEffect,
} from "@/lib/lobby/scouting";
import { computeTrainingExtraPlayers, isOffseasonPendingScopeActive } from "@/lib/lobby/offseason-pending-effects";
import { getTrainingStatus, parseTrainingEvent } from "@/lib/lobby/training";
import { isClubStatusOverrideActive, resolveEffectiveClubStatus } from "@/lib/lobby/club-status";
import {
  buildClubSponsorOverview,
  EMPTY_SPONSOR_OVERVIEW,
  isSponsoringEnabled,
  normalizeSponsorProgress,
  type SponsorContractRow,
} from "@/lib/lobby/sponsoring";
import { SPONSOR_PRESTIGE_LABELS } from "@/lib/lobby/sponsor-deals";
import {
  getClubOverviewLoadProfileForView as getClubOverviewLoadProfile,
  shouldLoadClubOverviewForView as shouldLoadClubOverviewSnapshot,
  shouldLoadScoutingForView as shouldLoadScoutingSnapshot,
} from "@/lib/lobby/snapshot-load-policy";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getTransferOfferCreatorClubId, getTransferOfferResponderClubId } from "@/lib/lobby/transfers";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";

const GAME_SELECT_LEGACY =
  "id, room_code, phase, host_clerk_user_id, current_turn_club_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id, created_at, updated_at";
const GAME_SELECT = `${GAME_SELECT_LEGACY}, live_seq`;

const CLUB_SELECT_LEGACY =
  "id, game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, money, points, season_rank, status, stadium_level, scouting_level, training_level, offseason_scouting_capacity, offseason_training_capacity, supercup_cards, captain_boost_rank, is_ready, image_url, created_at";
const CLUB_SELECT_V3 =
  "id, game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, money, points, season_rank, status, status_override, status_override_until_season, stadium_level, stadium_level_cap, stadium_level_cap_until_season, scouting_level, training_level, offseason_scouting_capacity, offseason_training_capacity, supercup_cards, captain_boost_rank, is_ready, image_url, created_at";
const CLUB_SELECT_V4 = `${CLUB_SELECT_V3}, captain_club_player_id`;
const CLUB_SELECT_V5 = `${CLUB_SELECT_V4}, medical_center_level, analytics_hub_level, youth_academy_level, construction_yard_built, medical_heals_used_season, nlz_archetype_respecs_used_season`;
const CLUB_SELECT_V6 = `${CLUB_SELECT_V5}, squad_stars`;
const CLUB_SELECT_V7 = `${CLUB_SELECT_V6}, squad_size`;
const CLUB_SELECT = CLUB_SELECT_V3;

const CLUB_GAME_CHANGER_SELECT_LEGACY =
  "id, game_changer_card_id, used_at, fixture_id, applied_third, card:game_changer_cards(id, content_key, display_name, description, category, timing, effects, visibility)";
const CLUB_GAME_CHANGER_SELECT_V3 =
  "id, game_changer_card_id, season_number, used_at, fixture_id, applied_third, status, choice_payload, resolved_payload, created_at, card:game_changer_cards(id, content_key, display_name, description, category, timing, effects, visibility)";
const CLUB_GAME_CHANGER_SELECT_V4 =
  "id, game_changer_card_id, season_number, used_at, fixture_id, applied_third, applied_window, status, choice_payload, resolved_payload, created_at, card:game_changer_cards(id, content_key, display_name, description, category, timing, play_window, draw_weight, effects, visibility)";

/**
 * Detects Postgres "undefined column" errors so callers can retry with a smaller column set.
 * Used to keep the snapshot loader working before the v3 migration is applied to a given DB.
 */
function isUndefinedColumnError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && error.code === "42703");
}

function isUndefinedTableError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && error.code === "42P01");
}

function normalizeGameRow<T extends LobbyGame>(game: T): T {
  return { ...game, live_seq: game.live_seq ?? 0 };
}

type GamesQueryResult = { data: LobbyGame[] | null; error: { code?: string; message?: string } | null };

async function queryGamesByIds(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
  gameIds: string[],
): Promise<GamesQueryResult> {
  let result = await supabase
    .from("games")
    .select(GAME_SELECT)
    .in("id", gameIds)
    .order("last_saved_at", { ascending: false })
    .returns<LobbyGame[]>();

  if (isUndefinedColumnError(result.error)) {
    result = await supabase
      .from("games")
      .select(GAME_SELECT_LEGACY)
      .in("id", gameIds)
      .order("last_saved_at", { ascending: false })
      .returns<LobbyGame[]>();
  }

  return {
    data: result.data ? result.data.map(normalizeGameRow) : null,
    error: result.error,
  };
}

async function queryGameByRoomCode(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
  roomCode: string,
): Promise<{ data: LobbyGame | null; error: { code?: string; message?: string } | null }> {
  let result = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("room_code", roomCode)
    .maybeSingle<LobbyGame>();

  if (isUndefinedColumnError(result.error)) {
    result = await supabase
      .from("games")
      .select(GAME_SELECT_LEGACY)
      .eq("room_code", roomCode)
      .maybeSingle<LobbyGame>();
  }

  return {
    data: result.data ? normalizeGameRow(result.data) : null,
    error: result.error,
  };
}

export async function getLobbySnapshotByRoomCode(roomCodeParam: string, options?: { activeView?: string }) {
  const { userId } = await auth();
  const supabase = createSupabaseServiceClient();

  if (!userId || !supabase) {
    return { snapshot: null, currentUserId: userId };
  }

  const roomCode = normalizeRoomCode(roomCodeParam);
  const { data: game, error: gameError } = await queryGameByRoomCode(supabase, roomCode);

  if (gameError) {
    throw gameError;
  }

  if (!game) {
    return { snapshot: null, currentUserId: userId };
  }

  const [clubsResultV7, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("clubs")
      .select(CLUB_SELECT_V7)
      .eq("game_id", game.id)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>(),
    supabase
      .from("game_members")
      .select("id, game_id, clerk_user_id, display_name, image_url, is_host, phase_done, phase_done_at, joined_at")
      .eq("game_id", game.id)
      .order("joined_at", { ascending: true })
      .returns<LobbyMember[]>(),
  ]);

  let clubs = clubsResultV7.data;
  let clubsError = clubsResultV7.error;
  // Fallback chain for DBs without the latest migrations: V7 -> V6 -> V5 -> V4 -> V3 -> legacy.
  if (isUndefinedColumnError(clubsError)) {
    const v6 = await supabase
      .from("clubs")
      .select(CLUB_SELECT_V6)
      .eq("game_id", game.id)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>();
    if (!isUndefinedColumnError(v6.error)) {
      clubs = v6.data;
      clubsError = v6.error;
    }
  }
  if (isUndefinedColumnError(clubsError)) {
    const v5 = await supabase
      .from("clubs")
      .select(CLUB_SELECT_V5)
      .eq("game_id", game.id)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>();
    if (!isUndefinedColumnError(v5.error)) {
      clubs = v5.data;
      clubsError = v5.error;
    }
  }
  if (isUndefinedColumnError(clubsError)) {
    const v4 = await supabase
      .from("clubs")
      .select(CLUB_SELECT_V4)
      .eq("game_id", game.id)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>();
    if (!isUndefinedColumnError(v4.error)) {
      clubs = v4.data;
      clubsError = v4.error;
    }
  }
  if (isUndefinedColumnError(clubsError)) {
    const v3 = await supabase
      .from("clubs")
      .select(CLUB_SELECT_V3)
      .eq("game_id", game.id)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>();
    if (!isUndefinedColumnError(v3.error)) {
      clubs = v3.data;
      clubsError = v3.error;
    } else {
      const fallback = await supabase
        .from("clubs")
        .select(CLUB_SELECT_LEGACY)
        .eq("game_id", game.id)
        .order("created_at", { ascending: true })
        .returns<LobbyClub[]>();
      clubs = fallback.data;
      clubsError = fallback.error;
    }
  }

  if (clubsError) {
    throw clubsError;
  }

  if (membersError) {
    throw membersError;
  }

  const clubsWithStars = await addSquadStars(clubs ?? []);
  const ownClub = clubsWithStars.find((club) => club.clerk_user_id === userId);
  const activeView = normalizeSnapshotView(options?.activeView);
  const perf = createSnapshotPerfTimer(game, activeView);

  // These snapshot slices are independent of each other, so load the ones the
  // current view needs in parallel instead of sequentially. Most views activate
  // only 1-3 of these, but parallelizing removes serial round-trip latency.
  const [draft, scouting, deadline, season, continental, clubOverview, clubSquads, transferMarket, matchNews] =
    await Promise.all([
      shouldLoadDraftSnapshot(game.phase, activeView) ? perf.time("draft", () => getDraftSnapshot(game, clubsWithStars)) : Promise.resolve(null),
      shouldLoadScoutingSnapshot(game.phase, activeView) ? perf.time("scouting", () => getScoutingSnapshot(game, clubsWithStars)) : Promise.resolve(null),
      shouldLoadDeadlineSnapshot(game.phase, activeView) ? perf.time("deadline", () => getDeadlineSnapshot(game, clubsWithStars, ownClub)) : Promise.resolve(null),
      shouldLoadSeasonSnapshot(game.phase, activeView) ? perf.time("season", () => getSeasonSnapshot(game, ownClub)) : Promise.resolve(null),
      shouldLoadContinentalSnapshot(game.phase, activeView) ? perf.time("continental", () => getContinentalSnapshot(game)) : Promise.resolve(null),
      ownClub && shouldLoadClubOverviewSnapshot(game.phase, activeView)
        ? perf.time("club_overview", () => getClubOverviewSnapshot(game, ownClub, clubsWithStars.length, activeView))
        : Promise.resolve(null),
      ownClub && (activeView === "squad" || activeView === "transfer")
        ? perf.time("club_squads", () => getClubSquadsSnapshot(game, clubsWithStars))
        : Promise.resolve(null),
      ownClub && (activeView === "squad" || activeView === "transfer")
        ? perf.time("transfer_market", () => getTransferMarketSnapshot(game, ownClub, clubsWithStars))
        : Promise.resolve(null),
      shouldLoadMatchNewsSnapshot(game.phase, activeView) ? perf.time("match_news", () => getMatchNewsSnapshot(game)) : Promise.resolve([]),
    ]);

  const snapshot: LobbySnapshot = {
    game,
    clubs: clubsWithStars,
    members: members ?? [],
    draft,
    deadline,
    season,
    continental,
    scouting,
    club_squads: clubSquads,
    club_overview: clubOverview,
    transfer_market: transferMarket,
    match_news: matchNews,
  };

  perf.done();

  return { snapshot, currentUserId: userId };
}

function normalizeSnapshotView(value: string | undefined) {
  return value && value.length > 0 ? value : "dashboard";
}

function createSnapshotPerfTimer(game: LobbyGame, view: string) {
  const enabled = process.env.GAME_PERF_LOG === "1" || process.env.NEXT_PUBLIC_GAME_PERF_LOG === "1";
  const startedAt = Date.now();
  const parts: Array<{ label: string; ms: number }> = [];

  return {
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      if (!enabled) {
        return fn();
      }

      const partStartedAt = Date.now();
      try {
        return await fn();
      } finally {
        parts.push({ label, ms: Date.now() - partStartedAt });
      }
    },
    done() {
      if (!enabled) {
        return;
      }

      const detail = parts.map((part) => `${part.label}=${part.ms}ms`).join(" ");
      console.info(
        `[game-snapshot] game=${game.id} room=${game.room_code} phase=${game.phase} view=${view} total=${Date.now() - startedAt}ms ${detail}`,
      );
    },
  };
}

function shouldLoadDraftSnapshot(phase: LobbyPhase, view: string) {
  return phase === "draft" || view === "draft";
}

function shouldLoadDeadlineSnapshot(phase: LobbyPhase, view: string) {
  return phase === "deadline_day" || view === "deadline";
}

function shouldLoadSeasonSnapshot(phase: LobbyPhase, view: string) {
  if (phase === "season_end") {
    return view === "dashboard" || view === "matchday" || view === "table";
  }

  if (phase === "season" || phase === "prematch" || phase === "match") {
    return view === "lineup" || view === "matchday" || view === "table";
  }

  return false;
}

function shouldLoadContinentalSnapshot(phase: LobbyPhase, view: string) {
  return phase === "champions_league" || view === "continental";
}

function shouldLoadMatchNewsSnapshot(phase: LobbyPhase, view: string) {
  if (phase === "season_end" && view === "dashboard") {
    return true;
  }

  return view === "matchday" || view === "continental";
}

type ScoutingDrawRow = {
  id: string;
  game_id: string;
  club_id: string;
  season_number: number;
  pile_key: string;
  draw_index: number;
  player_id: string;
  status: "drawn" | "bought" | "passed";
  created_at: string;
  resolved_at?: string | null;
  player: DraftPlayerRow;
};

async function getScoutingSnapshot(game: LobbyGame, clubs: LobbyClub[]): Promise<ScoutingSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase || (game.phase !== "off_season" && game.phase !== "offseason_scouting")) {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const clubIds = clubs.map((c) => c.id);
  const [{ data: draws, error: drawsError }, { data: saleRows, error: saleRowsError }, { data: staffEffectRows }, { data: pendingEffectRows }, { data: scoutingInvestmentRows }] =
    await Promise.all([
    supabase
      .from("scouting_draws")
      .select(`id, game_id, club_id, season_number, pile_key, draw_index, player_id, status, created_at, resolved_at, player:players(${DRAFT_PLAYER_SELECT})`)
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("draw_index", { ascending: true })
      .limit(500)
      .returns<ScoutingDrawRow[]>(),
    supabase
      .from("transactions")
      .select("club_id")
      .eq("game_id", game.id)
      .eq("reason", "player_sale")
      .contains("metadata", { season_number: seasonNumber })
      .returns<Array<{ club_id: string | null }>>(),
    supabase
      .from("club_staff")
      .select("club_id, card:staff_cards(effects)")
      .in("club_id", clubIds)
      .returns<Array<{ club_id: string; card: { effects: Array<Record<string, unknown>> } }>>(),
    clubIds.length > 0
      ? supabase
          .from("club_pending_effects")
          .select("club_id, effect_type, payload, scope, consumed_at")
          .in("club_id", clubIds)
          .is("consumed_at", null)
          .returns<Array<ScoutingPendingEffect & { club_id: string }>>()
      : Promise.resolve({ data: [], error: null }),
    clubIds.length > 0
      ? supabase
          .from("investments")
          .select("club_id")
          .in("club_id", clubIds)
          .eq("season_number", seasonNumber)
          .eq("action", "scouting")
          .returns<Array<{ club_id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (drawsError) {
    throw drawsError;
  }

  if (saleRowsError) {
    throw saleRowsError;
  }

  const salesByClubId: Record<string, number> = {};

  for (const row of saleRows ?? []) {
    if (row.club_id) {
      salesByClubId[row.club_id] = (salesByClubId[row.club_id] ?? 0) + 1;
    }
  }

  const scoutingBonusByClubId: Record<string, number> = {};
  for (const row of staffEffectRows ?? []) {
    const bonus = sumStaffScoutingBonus(row.card?.effects ?? []);
    if (bonus > 0) {
      scoutingBonusByClubId[row.club_id] = (scoutingBonusByClubId[row.club_id] ?? 0) + bonus;
    }
  }

  const hadScoutingInvestmentByClubId = new Set((scoutingInvestmentRows ?? []).map((row) => row.club_id));

  const normalizedDraws: ScoutingDrawSnapshot[] = draws ?? [];
  const statusByClubId: ScoutingSnapshot["status_by_club_id"] = {};

  const pendingByClubId = new Map<string, ScoutingPendingEffect[]>();
  for (const row of pendingEffectRows ?? []) {
    const list = pendingByClubId.get(row.club_id) ?? [];
    list.push({
      consumed_at: row.consumed_at,
      effect_type: row.effect_type,
      payload: row.payload,
      scope: row.scope,
    });
    pendingByClubId.set(row.club_id, list);
  }

  for (const club of clubs) {
    const clubDraws = normalizedDraws.filter((draw) => draw.club_id === club.id);
    const openCount = clubDraws.filter((draw) => draw.status === "drawn").length;
    const drawnCount = clubDraws.length;
    const baseCapacity = computeOffseasonScoutingBaseCapacity({
      scoutingLevel: club.scouting_level ?? 1,
      snapshotCapacity: club.offseason_scouting_capacity,
      staffBonus: scoutingBonusByClubId[club.id] ?? 0,
      drawnCount,
      hadScoutingInvestmentThisSeason: hadScoutingInvestmentByClubId.has(club.id),
    });
    const capacity = getEffectiveScoutingDrawCapacity(
      baseCapacity,
      pendingByClubId.get(club.id) ?? [],
      game.phase,
    );

    statusByClubId[club.id] = {
      bought_count: clubDraws.filter((draw) => draw.status === "bought").length,
      capacity,
      club_id: club.id,
      draw_count: clubDraws.length,
      finished: clubDraws.length >= capacity && openCount === 0,
      open_count: openCount,
      passed_count: clubDraws.filter((draw) => draw.status === "passed").length,
      sales_count: salesByClubId[club.id] ?? 0,
    };
  }

  const nextPendingClubId = getNextPendingScoutingClubId(clubs, normalizedDraws);

  return {
    all_finished: nextPendingClubId === null,
    current_club_id: null, // Scouting is parallel — no turn concept
    draws: normalizedDraws,
    next_pending_club_id: nextPendingClubId,
    sales_by_club_id: salesByClubId,
    status_by_club_id: statusByClubId,
  };
}

async function getContinentalSnapshot(game: LobbyGame): Promise<ContinentalTournamentSnapshot | null> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const shouldLoad = game.phase === "champions_league" || game.phase === "season_end";
  if (!shouldLoad && game.phase !== "off_season") {
    return null;
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("continental_tournaments")
    .select("id, season_number, status, current_round, prize_amount, winner_club_id")
    .eq("game_id", game.id)
    .eq("season_number", seasonNumber)
    .maybeSingle<{
      id: string;
      season_number: number;
      status: string;
      current_round: number;
      prize_amount: number;
      winner_club_id: string | null;
    }>();

  if (tournamentError?.code === "42P01") {
    return null;
  }

  if (tournamentError) {
    throw tournamentError;
  }

  if (!tournament) {
    if (game.phase === "champions_league") {
      return {
        id: "",
        season_number: seasonNumber,
        status: "setup",
        current_round: 32,
        prize_amount: 100_000_000,
        winner_club_id: null,
        participants: [],
        fixtures: [],
        setup_error: "Continental Cup fehlt. Host kann das Turnier initialisieren.",
      };
    }
    return null;
  }

  const [{ data: participants, error: participantsError }, { data: fixtures, error: fixturesError }] = await Promise.all([
    supabase
      .from("continental_participants")
      .select("id, kind, club_id, display_name, bracket_seed, eliminated_round, cpu_strength_tier")
      .eq("tournament_id", tournament.id)
      .order("bracket_seed", { ascending: true }),
    supabase
      .from("continental_fixtures")
      .select(
        `id, round, match_index, status, match_state,
        home_lineup_locked, away_lineup_locked,
        home_locked_def, home_locked_mid, home_locked_att,
        away_locked_def, away_locked_mid, away_locked_att,
        home_score, away_score, home_third_points, away_third_points,
        partial_result, result, winner_participant_id,
        home_cpu_formation_index, away_cpu_formation_index,
        home_participant:continental_participants!continental_fixtures_home_participant_id_fkey(id, kind, club_id, display_name, bracket_seed, eliminated_round, cpu_strength_tier),
        away_participant:continental_participants!continental_fixtures_away_participant_id_fkey(id, kind, club_id, display_name, bracket_seed, eliminated_round, cpu_strength_tier)`,
      )
      .eq("tournament_id", tournament.id)
      .order("round", { ascending: false })
      .order("match_index", { ascending: true })
      .returns<ContinentalFixtureSnapshot[]>(),
  ]);

  if (participantsError || fixturesError) {
    return {
      id: tournament.id,
      season_number: tournament.season_number,
      status: tournament.status,
      current_round: tournament.current_round,
      prize_amount: Number(tournament.prize_amount),
      winner_club_id: tournament.winner_club_id,
      participants: [],
      fixtures: [],
      setup_error: "Continental-Tabellen fehlen. Bitte `supabase/champions_league_upgrade.sql` ausfuehren.",
    };
  }

  return {
    id: tournament.id,
    season_number: tournament.season_number,
    status: tournament.status,
    current_round: tournament.current_round,
    prize_amount: Number(tournament.prize_amount),
    winner_club_id: tournament.winner_club_id,
    participants: (participants ?? []).map((p) => ({
      id: p.id as string,
      kind: p.kind as "human" | "cpu",
      club_id: p.club_id as string | null,
      display_name: p.display_name as string,
      bracket_seed: Number(p.bracket_seed),
      eliminated_round: p.eliminated_round != null ? Number(p.eliminated_round) : null,
      cpu_strength_tier: (p.cpu_strength_tier as ContinentalCpuTier | null) ?? null,
    })),
    fixtures: (fixtures ?? []).map((fixture) => mapContinentalFixtureSnapshot(fixture)),
  };
}

function mapContinentalFixtureSnapshot(
  fixture: ContinentalFixtureSnapshot & {
    home_cpu_formation_index?: number | null;
    away_cpu_formation_index?: number | null;
    home_participant: ContinentalFixtureSnapshot["home_participant"] & { cpu_strength_tier?: ContinentalCpuTier | null };
    away_participant: ContinentalFixtureSnapshot["away_participant"] & { cpu_strength_tier?: ContinentalCpuTier | null };
  },
): ContinentalFixtureSnapshot {
  return {
    ...fixture,
    home_participant: {
      ...fixture.home_participant,
      cpu_strength_tier: fixture.home_participant.cpu_strength_tier ?? null,
    },
    away_participant: {
      ...fixture.away_participant,
      cpu_strength_tier: fixture.away_participant.cpu_strength_tier ?? null,
    },
    home_cpu_lineup: buildContinentalCpuLineupSnapshot(
      fixture.home_participant,
      fixture.home_cpu_formation_index ?? null,
    ),
    away_cpu_lineup: buildContinentalCpuLineupSnapshot(
      fixture.away_participant,
      fixture.away_cpu_formation_index ?? null,
    ),
  };
}

function buildContinentalCpuLineupSnapshot(
  participant: ContinentalFixtureSnapshot["home_participant"] & { cpu_strength_tier?: ContinentalCpuTier | null },
  formationIndex: number | null,
) {
  if (participant.kind !== "cpu" || !participant.cpu_strength_tier) {
    return null;
  }
  const stars = getContinentalLineupStars(participant.cpu_strength_tier, formationIndex ?? 0);
  return {
    id: `${participant.id}-${formationIndex ?? 0}`,
    display_name: stars.display_name,
    def_stars: stars.def,
    mid_stars: stars.mid,
    att_stars: stars.att,
  };
}

type TransferOfferRow = Omit<TransferOfferSnapshot, "cash_amount" | "from_club" | "offered_club_player" | "status" | "target_club_player" | "to_club"> & {
  cash_amount: number | string;
  from_club: Pick<LobbyClub, "club_color" | "club_name" | "id"> | null;
  offered_club_player?: ClubPlayerSnapshot | null;
  status: string;
  target_club_player?: ClubPlayerSnapshot | null;
  to_club: Pick<LobbyClub, "club_color" | "club_name" | "id"> | null;
};

async function getClubSquadsSnapshot(game: LobbyGame, clubs: LobbyClub[]): Promise<ClubSquadSnapshot[] | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    return null;
  }

  const clubIds = clubs.map((club) => club.id);
  const { data, error } = clubIds.length
    ? await supabase
        .from("club_players")
        .select(
          `id, club_id, player_id, custom_name, current_stars, current_zone, injured, lineup_slot, acquired_at,
          player:players(${DRAFT_PLAYER_SELECT})`,
        )
        .in("club_id", clubIds)
        .order("acquired_at", { ascending: true })
        .returns<ClubPlayerSnapshot[]>()
    : { data: [], error: null };

  if (error) {
    throw error;
  }

  const playersByClubId = new Map<string, ClubPlayerSnapshot[]>();
  for (const row of data ?? []) {
    const rows = playersByClubId.get(row.club_id) ?? [];
    rows.push(row);
    playersByClubId.set(row.club_id, rows);
  }

  return clubs.map((club) => {
    const squad = sortClubPlayers(playersByClubId.get(club.id) ?? []);
    const squadStars = squad.reduce((sum, player) => sum + Number(player.current_stars), 0);

    return {
      club: {
        club_color: club.club_color,
        club_name: club.club_name,
        id: club.id,
        image_url: club.image_url,
        manager_name: club.manager_name,
        squad_stars: club.squad_stars ?? squadStars,
      },
      injured_count: squad.filter((player) => player.injured).length,
      player_count: squad.length,
      squad,
      squad_stars: club.squad_stars ?? squadStars,
    };
  });
}

async function getTransferMarketSnapshot(
  game: LobbyGame,
  ownClub: LobbyClub,
  clubs: LobbyClub[],
): Promise<TransferMarketSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const otherClubIds = clubs.filter((club) => club.id !== ownClub.id).map((club) => club.id);
  const transferOfferSelect = `id, game_id, season_number, parent_offer_id, created_by_club_id, responder_club_id,
    from_club_id, to_club_id, target_club_player_id, target_player_id,
    offered_club_player_id, offered_player_id, cash_amount, status, created_at, resolved_at,
    from_club:clubs!transfer_offers_from_club_id_fkey(id, club_name, club_color),
    to_club:clubs!transfer_offers_to_club_id_fkey(id, club_name, club_color),
    target_club_player:club_players!transfer_offers_target_club_player_id_fkey(id, club_id, player_id, custom_name, current_stars, current_zone, injured, lineup_slot, acquired_at, player:players(${DRAFT_PLAYER_SELECT})),
    offered_club_player:club_players!transfer_offers_offered_club_player_id_fkey(id, club_id, player_id, custom_name, current_stars, current_zone, injured, lineup_slot, acquired_at, player:players(${DRAFT_PLAYER_SELECT}))`;

  const [
    { data: otherPlayers, error: otherPlayersError },
    { data: offerRows, error: offersError },
    { data: acceptedRows, error: acceptedError },
  ] = await Promise.all([
    otherClubIds.length
      ? supabase
          .from("club_players")
          .select(
            `id, club_id, player_id, custom_name, current_stars, current_zone, injured, lineup_slot, acquired_at,
            player:players(${DRAFT_PLAYER_SELECT})`,
          )
          .in("club_id", otherClubIds)
          .order("acquired_at", { ascending: true })
          .returns<ClubPlayerSnapshot[]>()
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("transfer_offers")
      .select(transferOfferSelect)
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .eq("status", "open")
      .or(`created_by_club_id.eq.${ownClub.id},responder_club_id.eq.${ownClub.id},from_club_id.eq.${ownClub.id},to_club_id.eq.${ownClub.id}`)
      .order("created_at", { ascending: false })
      .returns<TransferOfferRow[]>(),
    supabase
      .from("transfer_offers")
      .select("from_club_id, to_club_id, offered_club_player_id")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .eq("status", "accepted")
      .or(`from_club_id.eq.${ownClub.id},to_club_id.eq.${ownClub.id}`)
      .returns<Array<{ from_club_id: string; offered_club_player_id: string | null; to_club_id: string }>>(),
  ]);

  if (isUndefinedTableError(offersError) || isUndefinedTableError(acceptedError)) {
    return {
      incoming_offers: [],
      manager_departures_count: 0,
      other_clubs: [],
      outgoing_offers: [],
      setup_error: "Manager-Transfers fehlen noch in Supabase. Bitte `supabase/manager_transfers_upgrade.sql` ausfuehren.",
    };
  }

  if (otherPlayersError) {
    throw otherPlayersError;
  }

  if (offersError) {
    throw offersError;
  }

  if (acceptedError) {
    throw acceptedError;
  }

  const otherPlayersByClubId = new Map<string, ClubPlayerSnapshot[]>();
  for (const row of otherPlayers ?? []) {
    const rows = otherPlayersByClubId.get(row.club_id) ?? [];
    rows.push(row);
    otherPlayersByClubId.set(row.club_id, rows);
  }

  const offers = (offerRows ?? []).map(normalizeTransferOfferRow);
  const managerDeparturesCount = (acceptedRows ?? []).reduce((count, row) => {
    if (row.to_club_id === ownClub.id) {
      count += 1;
    }
    if (row.from_club_id === ownClub.id && row.offered_club_player_id) {
      count += 1;
    }
    return count;
  }, 0);

  return {
    incoming_offers: offers.filter((offer) => getTransferOfferResponderClubId(offer) === ownClub.id),
    manager_departures_count: managerDeparturesCount,
    other_clubs: clubs
      .filter((club) => club.id !== ownClub.id)
      .map((club) => ({
        club: {
          club_color: club.club_color,
          club_name: club.club_name,
          id: club.id,
          manager_name: club.manager_name,
        },
        squad: otherPlayersByClubId.get(club.id) ?? [],
      })),
    outgoing_offers: offers.filter((offer) => getTransferOfferCreatorClubId(offer) === ownClub.id),
  };
}

function normalizeTransferOfferRow(row: TransferOfferRow): TransferOfferSnapshot {
  return {
    ...row,
    cash_amount: Number(row.cash_amount ?? 0),
    from_club: row.from_club ?? { club_color: null, club_name: "Club", id: row.from_club_id },
    offered_club_player: row.offered_club_player ?? null,
    status: normalizeTransferOfferStatus(row.status),
    target_club_player: row.target_club_player ?? null,
    to_club: row.to_club ?? { club_color: null, club_name: "Club", id: row.to_club_id },
  };
}

function normalizeTransferOfferStatus(status: string): TransferOfferSnapshot["status"] {
  if (status === "accepted" || status === "cancelled" || status === "countered" || status === "declined" || status === "expired") {
    return status;
  }

  return "open";
}

function sortClubPlayers(squad: ClubPlayerSnapshot[]) {
  return [...squad].sort((a, b) => {
    const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
    const posDiff = (posOrder[a.player.position] ?? 4) - (posOrder[b.player.position] ?? 4);
    if (posDiff !== 0) return posDiff;

    const starsDiff = Number(b.current_stars) - Number(a.current_stars);
    if (starsDiff !== 0) return starsDiff;

    return getClubPlayerDisplayName(a).localeCompare(getClubPlayerDisplayName(b), "de");
  });
}

async function loadClubLockedLineupSnapshot(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
  clubId: string,
): Promise<LineupSnapshotSide> {
  const { data, error } = await supabase
    .from("club_players")
    .select("custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
    .eq("club_id", clubId)
    .neq("current_zone", "bench")
    .order("lineup_slot", { ascending: true })
    .returns<LineupSnapshotClubPlayerRow[]>();

  if (error) {
    throw error;
  }

  return buildLineupSnapshotFromPlayers(data ?? []);
}

async function getSeasonSnapshot(game: LobbyGame, viewerClub?: LobbyClub): Promise<SeasonSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase || !["season", "prematch", "match", "season_end"].includes(game.phase)) {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const buildFixturesSelect = (includeV4: boolean) =>
    `id, game_id, season_number, matchday, home_participant_id, away_participant_id, status,
        match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result,
        home_lineup_locked, away_lineup_locked,
        home_locked_def, home_locked_mid, home_locked_att,
        away_locked_def, away_locked_mid, away_locked_att,
        home_score, away_score, home_third_points, away_third_points, result, completed_at,
        ${includeV4 ? "derby_day, retro_win_used, retro_win_result," : ""}
        home_participant:season_participants!fixtures_home_participant_id_fkey(id, game_id, season_number, kind, club_id, cpu_team_id, display_name),
        away_participant:season_participants!fixtures_away_participant_id_fkey(id, game_id, season_number, kind, club_id, cpu_team_id, display_name),
        home_cpu_lineup:cpu_lineups!fixtures_home_cpu_lineup_id_fkey(id, display_name, def_stars, mid_stars, att_stars),
        away_cpu_lineup:cpu_lineups!fixtures_away_cpu_lineup_id_fkey(id, display_name, def_stars, mid_stars, att_stars)`;
  const fetchFixtures = async (includeV4: boolean) =>
    supabase
      .from("fixtures")
      .select(buildFixturesSelect(includeV4))
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("matchday", { ascending: true })
      .returns<SeasonFixtureSnapshot[]>();
  const [fixturesResult, { data: standings, error: standingsError }] = await Promise.all([
    fetchFixtures(true),
    supabase
      .from("season_standings")
      .select(
        `participant_id, season_number, played, wins, draws, losses, match_points, third_points_for, third_points_against,
        fixture_points_for, fixture_points_against, rank,
        participant:season_participants(id, game_id, season_number, kind, club_id, cpu_team_id, display_name)`,
      )
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("rank", { ascending: true })
      .returns<SeasonStandingSnapshot[]>(),
  ]);

  // Fall back to the pre-v4 column set if derby_day/retro_win_* are not present yet.
  let { data: fixtures, error: fixturesError } = fixturesResult;
  if (isUndefinedColumnError(fixturesError)) {
    const legacy = await fetchFixtures(false);
    fixtures = legacy.data;
    fixturesError = legacy.error;
  }

  if (fixturesError || standingsError) {
    return {
      current_matchday: 1,
      fixtures: [],
      manager_standings: [],
      setup_error: "Saison-Tabellen fehlen noch in Supabase. Bitte `supabase/season_matchday_upgrade.sql` ausfuehren.",
      standings: [],
    };
  }

  const normalizedFixtures = fixtures ?? [];
  const currentMatchday = normalizedFixtures.find((fixture) => fixture.status !== "completed")?.matchday ?? normalizedFixtures.at(-1)?.matchday ?? 1;
  const humanClubIds = [
    ...new Set(
      normalizedFixtures.flatMap((fixture) => [
        fixture.home_participant?.club_id,
        fixture.away_participant?.club_id,
      ].filter((id): id is string => Boolean(id))),
    ),
  ];
  let nextMatchZoneBoostsByClubId: Record<string, Record<"ATT" | "DEF" | "MID", number>> = {};
  if (humanClubIds.length > 0) {
    const { data: nextMatchEffectRows } = await supabase
      .from("club_pending_effects")
      .select("club_id, effect_type, payload, scope")
      .in("club_id", humanClubIds)
      .eq("scope", "next_match")
      .is("consumed_at", null)
      .returns<Array<{ club_id: string; effect_type: string; payload: Record<string, unknown>; scope: string }>>();
    nextMatchZoneBoostsByClubId = buildNextMatchZoneBoostsByClubId(nextMatchEffectRows ?? []);
  }
  const managerStandings = await getManagerStandings(game, standings ?? []);
  const tierByCpuTeamId = await loadCpuTierByTeamId(supabase, standings ?? [], normalizedFixtures);
  const enrichedStandings = enrichParticipantsWithCpuTier(standings ?? [], tierByCpuTeamId);
  const enrichedFixtures = enrichFixtureParticipantsWithCpuTier(normalizedFixtures, tierByCpuTeamId);

  const opponent_locked_lineups: SeasonSnapshot["opponent_locked_lineups"] = [];
  const analyticsLevel = viewerClub?.analytics_hub_level ?? 0;
  if (viewerClub && analyticsLevel >= 2 && supabase) {
    const currentFixtures = enrichedFixtures.filter(
      (fixture) => fixture.matchday === currentMatchday && fixture.status !== "completed",
    );
    for (const fixture of currentFixtures) {
      const isHome = fixture.home_participant.club_id === viewerClub.id;
      const isAway = fixture.away_participant.club_id === viewerClub.id;
      if (!isHome && !isAway) {
        continue;
      }
      const opponentClubId = isHome ? fixture.away_participant.club_id : fixture.home_participant.club_id;
      const opponentLocked = isHome ? fixture.away_lineup_locked : fixture.home_lineup_locked;
      if (!opponentClubId || !opponentLocked) {
        continue;
      }
      opponent_locked_lineups.push({
        fixture_id: fixture.id,
        opponent_club_id: opponentClubId,
        lineup: await loadClubLockedLineupSnapshot(supabase, opponentClubId),
      });
    }
  }

  return {
    current_matchday: currentMatchday,
    fixtures: enrichedFixtures,
    manager_standings: managerStandings,
    next_match_zone_boosts_by_club_id: nextMatchZoneBoostsByClubId,
    opponent_locked_lineups,
    standings: enrichedStandings,
  };
}

type CpuTierMap = Map<string, CpuStrengthTier>;

async function loadCpuTierByTeamId(
  supabase: NonNullable<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServiceClient>>,
  standings: SeasonStandingSnapshot[],
  fixtures: SeasonFixtureSnapshot[],
): Promise<CpuTierMap> {
  const cpuIds = new Set<string>();
  for (const row of standings) {
    if (row.participant.kind === "cpu" && row.participant.cpu_team_id) {
      cpuIds.add(row.participant.cpu_team_id);
    }
  }
  for (const fixture of fixtures) {
    if (fixture.home_participant?.kind === "cpu" && fixture.home_participant.cpu_team_id) {
      cpuIds.add(fixture.home_participant.cpu_team_id);
    }
    if (fixture.away_participant?.kind === "cpu" && fixture.away_participant.cpu_team_id) {
      cpuIds.add(fixture.away_participant.cpu_team_id);
    }
  }
  if (cpuIds.size === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("cpu_teams")
    .select("id, strength_tier")
    .in("id", [...cpuIds])
    .returns<Array<{ id: string; strength_tier: string }>>();

  if (error?.code === "42703" || !data) {
    return new Map();
  }

  return new Map(data.map((row) => [row.id, row.strength_tier as CpuStrengthTier]));
}

function enrichParticipantsWithCpuTier(
  standings: SeasonStandingSnapshot[],
  tierByCpuTeamId: CpuTierMap,
): SeasonStandingSnapshot[] {
  return standings.map((row) => {
    if (row.participant.kind !== "cpu" || !row.participant.cpu_team_id) {
      return row;
    }
    return {
      ...row,
      participant: {
        ...row.participant,
        cpu_strength_tier: tierByCpuTeamId.get(row.participant.cpu_team_id) ?? null,
      },
    };
  });
}

function enrichFixtureParticipantsWithCpuTier(
  fixtures: SeasonFixtureSnapshot[],
  tierByCpuTeamId: CpuTierMap,
): SeasonFixtureSnapshot[] {
  const enrichOne = (participant: SeasonFixtureSnapshot["home_participant"]) => {
    if (!participant || participant.kind !== "cpu" || !participant.cpu_team_id) {
      return participant;
    }
    return {
      ...participant,
      cpu_strength_tier: tierByCpuTeamId.get(participant.cpu_team_id) ?? null,
    };
  };

  return fixtures.map((fixture) => ({
    ...fixture,
    home_participant: enrichOne(fixture.home_participant),
    away_participant: enrichOne(fixture.away_participant),
  }));
}

async function getMatchNewsSnapshot(game: LobbyGame): Promise<MatchNewsSnapshot[]> {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return [];

  const selectV3 =
    "id, game_id, fixture_id, club_id, club_game_changer_id, category, headline, detail, created_at";
  const selectLegacy =
    "id, game_id, fixture_id, club_id, category, headline, detail, created_at";

  const { data, error } = await supabase
    .from("match_news")
    .select(selectV3)
    .eq("game_id", game.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<MatchNewsSnapshot[]>();

  if (isUndefinedColumnError(error)) {
    const fallback = await supabase
      .from("match_news")
      .select(selectLegacy)
      .eq("game_id", game.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<MatchNewsSnapshot[]>();
    return fallback.data ?? [];
  }

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getManagerStandings(game: LobbyGame, standings: SeasonStandingSnapshot[]): Promise<ManagerStandingSnapshot[]> {
  const supabase = createSupabaseServiceClient();
  const humanClubIds = standings
    .map((standing) => standing.participant)
    .filter((participant) => participant.kind === "human" && participant.club_id)
    .map((participant) => participant.club_id as string);

  if (!supabase || humanClubIds.length === 0) {
    return [];
  }

  let clubsResult = await supabase
    .from("clubs")
    .select("id, club_name, points, season_rank, status, squad_stars")
    .in("id", humanClubIds)
    .returns<Array<{ club_name: string; id: string; points: number | string; season_rank: number | null; squad_stars?: number | string | null; status: string | null }>>();

  if (isUndefinedColumnError(clubsResult.error)) {
    clubsResult = await supabase
      .from("clubs")
      .select("id, club_name, points, season_rank, status")
      .in("id", humanClubIds)
      .returns<Array<{ club_name: string; id: string; points: number | string; season_rank: number | null; squad_stars?: number | string | null; status: string | null }>>();
  }

  if (clubsResult.error) {
    throw clubsResult.error;
  }

  const clubs = clubsResult.data ?? [];
  const missingSquadStarClubIds = humanClubIds.filter((clubId) => {
    const club = clubs.find((row) => row.id === clubId);
    return club?.squad_stars == null;
  });
  const starsByClubId = new Map<string, number>();

  if (missingSquadStarClubIds.length > 0) {
    const { data: squadRows, error: squadError } = await supabase
      .from("club_players")
      .select("club_id, current_stars")
      .in("club_id", missingSquadStarClubIds)
      .returns<Array<{ club_id: string; current_stars: number | string }>>();

    if (squadError) {
      throw squadError;
    }

    for (const row of squadRows ?? []) {
      starsByClubId.set(row.club_id, (starsByClubId.get(row.club_id) ?? 0) + Number(row.current_stars ?? 0));
    }
  }

  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const rows = standings
    .filter((standing) => standing.participant.kind === "human" && standing.participant.club_id)
    .map((standing) => {
      const clubId = standing.participant.club_id as string;
      const club = clubsById.get(clubId);
      const squadStars = Number(club?.squad_stars ?? starsByClubId.get(clubId) ?? 0);
      const seasonScore = calculateManagerScore(squadStars, standing.match_points);
      const band = getManagerScoreBand(seasonScore);

      return {
        attractiveness_stars: band.attractivenessStars,
        club_id: clubId,
        club_name: club?.club_name ?? standing.participant.display_name,
        rank: Number(club?.season_rank ?? 1),
        season_match_points: Number(standing.match_points ?? 0),
        season_score: seasonScore,
        squad_stars: squadStars,
        status: band.status,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.season_score - a.season_score;
      if (scoreDiff !== 0) return scoreDiff;
      const squadDiff = b.squad_stars - a.squad_stars;
      if (squadDiff !== 0) return squadDiff;
      return a.club_name.localeCompare(b.club_name);
    });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

type DeadlineAuctionRow = Omit<DeadlineAuctionSnapshot, "bids"> & {
  bids: DeadlineBidSnapshot[] | null;
};

function redactScheduledDeadlinePlayer<T extends DraftPlayerRow>(player: T): T {
  return {
    ...player,
    attacker_archetype: "beta",
    base_stars: 0,
    chemistry_left: false,
    chemistry_right: false,
    chemistry_symbol: "star",
    defender_archetype: "beta",
    display_name: "Verdeckt",
    eligible_positions: [],
    minimum_bid: 0,
    nationality: "?",
    position: "?",
    potential_stars: 0,
    region: "hidden",
    scouting_price: 0,
    skill_max: 0,
    visibility: "hidden",
  };
}

function emptyQueryResult<T>(data: T): Promise<{ data: T; error: null }> {
  return Promise.resolve({ data, error: null });
}

async function getDeadlineSnapshot(
  game: LobbyGame,
  clubs: LobbyClub[],
  viewerClub?: LobbyClub,
): Promise<DeadlineSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase || game.phase !== "deadline_day") {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const { data, error } = await supabase
    .from("auctions")
    .select(
      `id, game_id, player_id, status, minimum_bid, winning_club_id, opened_by_club_id, season_number, auction_index,
      current_bid_club_id, current_amount, turn_started_at, passed_club_ids, bid_order_club_ids, created_at, resolved_at,
      player:players(${DRAFT_PLAYER_SELECT}),
      bids(id, auction_id, club_id, amount, locked, created_at)`,
    )
    .eq("game_id", game.id)
    .eq("season_number", seasonNumber)
    .order("auction_index", { ascending: true })
    .returns<DeadlineAuctionRow[]>();

  if (error) {
    return {
      active_auction: null,
      auction_count: getDeadlineAuctionCount(clubs.length),
      auctions: [],
      completed_count: 0,
      setup_error:
        "Deadline-Day-Spalten fehlen noch in Supabase. Bitte die SQL-Erweiterung `supabase/deadline_day_upgrade.sql` ausfuehren.",
    };
  }

  const revealScheduledPlayers = canRevealDeadlineAuctionPlayers(viewerClub?.analytics_hub_level ?? 0);
  const auctions = (data ?? []).map((auction): DeadlineAuctionSnapshot => {
    const player =
      auction.status === "scheduled" && !revealScheduledPlayers
        ? redactScheduledDeadlinePlayer(auction.player)
        : auction.player;
    return {
      ...auction,
      player,
      bids: auction.bids ?? [],
      current_amount: Number(auction.current_amount ?? 0),
      minimum_bid: Number(auction.minimum_bid ?? 0),
      passed_club_ids: auction.passed_club_ids ?? [],
      bid_order_club_ids: auction.bid_order_club_ids ?? [],
    };
  });
  const activeAuction = auctions.find((auction) => auction.status === "open") ?? null;
  const completedCount = auctions.filter((auction) => auction.status === "resolved" || auction.status === "passed").length;

  return {
    active_auction: activeAuction,
    auction_count: getDeadlineAuctionCount(clubs.length),
    auctions,
    completed_count: completedCount,
  };
}

async function getClubOverviewSnapshot(
  game: LobbyGame,
  club: LobbyClub,
  clubCount: number,
  activeView: string,
): Promise<ClubOverviewSnapshot> {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    throw new Error("Supabase service client is not configured.");
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const profile = getClubOverviewLoadProfile(game.phase, activeView);
  const [
    { data: clubPlayers, error: clubPlayersError },
    { data: staffRows, error: staffError },
    { data: gameChangerRows, error: gameChangerError },
    { data: carriedSecretWeaponRows, error: carriedSecretWeaponError },
    { data: pendingEffectRows, error: pendingEffectsError },
    { data: investments, error: investmentsError },
    { data: trainingTransactions, error: trainingTransactionsError },
    { data: saleTransactions, error: saleTransactionsError },
    { data: openOfferRows, error: openOfferError },
    { data: sponsorContractRows, error: sponsorContractsError },
  ] = await Promise.all([
    profile.loadSquad
      ? supabase
          .from("club_players")
          .select(
            `id, club_id, player_id, custom_name, current_stars, current_zone, injured, lineup_slot, acquired_at,
            player:players(${DRAFT_PLAYER_SELECT})`,
          )
          .eq("club_id", club.id)
          .order("acquired_at", { ascending: true })
          .returns<ClubPlayerSnapshot[]>()
      : emptyQueryResult<ClubPlayerSnapshot[]>([]),
    profile.loadStaff
      ? supabase
          .from("club_staff")
          .select("id, staff_card_id, hired_at, card:staff_cards(id, content_key, display_name, price, effects, visibility)")
          .eq("club_id", club.id)
          .order("hired_at", { ascending: true })
          .returns<ClubStaffSnapshot[]>()
      : emptyQueryResult<ClubStaffSnapshot[]>([]),
    profile.loadGameChangers
      ? supabase
          .from("club_game_changers")
          .select(CLUB_GAME_CHANGER_SELECT_V4)
          .eq("club_id", club.id)
          .eq("season_number", seasonNumber)
          .order("created_at", { ascending: true, nullsFirst: false })
          .limit(80)
          .returns<ClubGameChangerSnapshot[]>()
      : emptyQueryResult<ClubGameChangerSnapshot[]>([]),
    profile.loadGameChangers && seasonNumber > 1
      ? supabase
          .from("club_game_changers")
          .select(CLUB_GAME_CHANGER_SELECT_V4)
          .eq("club_id", club.id)
          .lt("season_number", seasonNumber)
          .is("used_at", null)
          .order("created_at", { ascending: true, nullsFirst: false })
          .limit(40)
          .returns<ClubGameChangerSnapshot[]>()
      : emptyQueryResult<ClubGameChangerSnapshot[]>([]),
    profile.loadPendingEffects
      ? supabase
          .from("club_pending_effects")
          .select("id, club_id, season_number, effect_type, payload, scope, consumed_at, fixture_id, source_club_game_changer_id, created_at")
          .eq("club_id", club.id)
          .eq("season_number", seasonNumber)
          .is("consumed_at", null)
          .order("created_at", { ascending: true })
          .returns<ClubPendingEffectSnapshot[]>()
      : emptyQueryResult<ClubPendingEffectSnapshot[]>([]),
    profile.loadInvestments
      ? supabase
          .from("investments")
          .select("id, game_id, club_id, season_number, action, cost, created_at")
          .eq("club_id", club.id)
          .eq("season_number", seasonNumber)
          .order("created_at", { ascending: false })
          .limit(200)
          .returns<InvestmentSnapshot[]>()
      : emptyQueryResult<InvestmentSnapshot[]>([]),
    profile.loadTrainingTransactions
      ? supabase
          .from("transactions")
          .select("id, created_at, metadata")
          .eq("game_id", game.id)
          .eq("club_id", club.id)
          .eq("reason", "training")
          .contains("metadata", { season_number: seasonNumber })
          .order("created_at", { ascending: false })
          .limit(80)
          .returns<Array<{ id: string; created_at: string; metadata: unknown }>>()
      : emptyQueryResult<Array<{ id: string; created_at: string; metadata: unknown }>>([]),
    profile.loadSalesTransactions
      ? supabase
          .from("transactions")
          .select("id, metadata")
          .eq("game_id", game.id)
          .eq("club_id", club.id)
          .eq("reason", "player_sale")
          .contains("metadata", { season_number: seasonNumber })
          .limit(3)
          .returns<Array<{ id: string; metadata: unknown }>>()
      : emptyQueryResult<Array<{ id: string; metadata: unknown }>>([]),
    profile.loadOpenStaffOffer
      ? supabase
          .from("staff_offers")
          .select("id, season_number, status, offered_card_ids, chosen_card_id")
          .eq("club_id", club.id)
          .eq("season_number", seasonNumber)
          .eq("status", "open")
          .limit(1)
          .returns<Array<{ id: string; season_number: number; status: string; offered_card_ids: string[]; chosen_card_id: string | null }>>()
      : emptyQueryResult<Array<{ id: string; season_number: number; status: string; offered_card_ids: string[]; chosen_card_id: string | null }>>([]),
    profile.loadSponsorContracts
      ? supabase
          .from("club_sponsor_contracts")
          .select("*")
          .eq("club_id", club.id)
          .order("created_at", { ascending: true })
          .returns<SponsorContractRow[]>()
      : emptyQueryResult<SponsorContractRow[]>([]),
  ]);

  if (clubPlayersError) {
    throw clubPlayersError;
  }

  if (staffError) {
    throw staffError;
  }

  // Defensive fallbacks when newer migrations have not been applied to a given DB.
  // V4 (play_window/draw_weight/applied_window) -> V3 -> legacy.
  let gameChangerRowsFinal = gameChangerRows;
  let gameChangerErrorFinal = gameChangerError;
  if (isUndefinedColumnError(gameChangerErrorFinal)) {
    const v3 = await supabase
      .from("club_game_changers")
      .select(CLUB_GAME_CHANGER_SELECT_V3)
      .eq("club_id", club.id)
      .order("created_at", { ascending: true, nullsFirst: false })
      .returns<ClubGameChangerSnapshot[]>();
    if (!v3.error) {
      gameChangerRowsFinal = v3.data;
      gameChangerErrorFinal = null;
    } else if (isUndefinedColumnError(v3.error)) {
      const fallback = await supabase
        .from("club_game_changers")
        .select(CLUB_GAME_CHANGER_SELECT_LEGACY)
        .eq("club_id", club.id)
        .order("id", { ascending: true })
        .returns<Array<Omit<ClubGameChangerSnapshot, "status" | "choice_payload" | "resolved_payload" | "created_at">>>();
      if (fallback.error) {
        throw fallback.error;
      }
      gameChangerRowsFinal = (fallback.data ?? []).map((row) => ({
        ...row,
        status: "resolved" as const,
        choice_payload: null,
        resolved_payload: null,
        created_at: null,
      }));
      gameChangerErrorFinal = null;
    } else {
      gameChangerErrorFinal = v3.error;
    }
  }

  if (gameChangerErrorFinal) {
    throw gameChangerErrorFinal;
  }

  if (
    profile.loadGameChangers &&
    seasonNumber > 1 &&
    !isUndefinedColumnError(carriedSecretWeaponError) &&
    carriedSecretWeaponError
  ) {
    throw carriedSecretWeaponError;
  }

  if (profile.loadGameChangers && seasonNumber > 1 && (carriedSecretWeaponRows?.length ?? 0) > 0) {
    gameChangerRowsFinal = mergeCarriedSecretWeapons(gameChangerRowsFinal ?? [], carriedSecretWeaponRows ?? []);
  }

  // pendingEffectsError can occur when the v3 migration has not been applied yet.
  // Treat it as no pending effects so the app still works against an older DB.
  const pendingEffects: ClubPendingEffectSnapshot[] = pendingEffectsError ? [] : (pendingEffectRows ?? []);

  if (investmentsError) {
    throw investmentsError;
  }

  if (trainingTransactionsError) {
    throw trainingTransactionsError;
  }

  if (saleTransactionsError) {
    throw saleTransactionsError;
  }

  // openOfferError may occur when the table does not yet exist in the schema cache; treat as no offer
  let openStaffOffer: StaffOfferSnapshot | null = null;
  const openOfferRow = !openOfferError ? openOfferRows?.[0] : undefined;
  if (openOfferRow) {
    const { data: offeredCards } = await supabase
      .from("staff_cards")
      .select("id, content_key, display_name, price, effects, visibility")
      .in("id", openOfferRow.offered_card_ids)
      .returns<StaffCardRow[]>();

    openStaffOffer = {
      id: openOfferRow.id,
      season_number: openOfferRow.season_number,
      status: openOfferRow.status as "open",
      offered_card_ids: openOfferRow.offered_card_ids,
      chosen_card_id: openOfferRow.chosen_card_id,
      offered_cards: offeredCards ?? [],
    };
  }

  const trainingEvents = (trainingTransactions ?? [])
    .map(parseTrainingEvent)
    .filter((event): event is NonNullable<ReturnType<typeof parseTrainingEvent>> => Boolean(event))
    .filter((event) => event.season_number === seasonNumber);
  const squadStars = profile.loadSquad
    ? (clubPlayers ?? []).reduce((total, owned) => total + Number(owned.current_stars), 0)
    : Number(club.squad_stars ?? 0);

  // Resolve status_override (Pressekonferenz / Fanmarsch) for the current season
  const overrideActive = isClubStatusOverrideActive(club, seasonNumber);
  const effectiveStatus = resolveEffectiveClubStatus(club, seasonNumber);

  // Resolve stadium_level_cap (Sicherheitsluecke im Konzept) for the current season
  const capUntil = club.stadium_level_cap_until_season ?? null;
  const capActive = club.stadium_level_cap != null && (capUntil == null || capUntil >= seasonNumber);
  const stadiumLevelEffective = capActive
    ? Math.min(club.stadium_level ?? 1, club.stadium_level_cap ?? 1)
    : (club.stadium_level ?? 1);

  const stadiumIncome = getStadiumIncome(stadiumLevelEffective, effectiveStatus);
  const placementReward = getPlacementReward(club.season_rank ?? 1, clubCount);
  const wages = squadStars * 1_000_000;

  const allGameChangers = gameChangerRowsFinal ?? [];
  const pendingChoices = allGameChangers.filter((row) => row.status === "pending");

  const sponsorContracts = isUndefinedTableError(sponsorContractsError)
    ? []
    : sponsorContractsError
      ? (() => {
          throw sponsorContractsError;
        })()
      : (sponsorContractRows ?? []).map((row) => ({
          ...row,
          progress: normalizeSponsorProgress(row.progress),
        }));
  const sponsorOverview = !isSponsoringEnabled(game.settings)
    ? { ...EMPTY_SPONSOR_OVERVIEW, sponsor_prestige_tier: effectiveStatus, sponsor_prestige_label: SPONSOR_PRESTIGE_LABELS[effectiveStatus] }
    : sponsorContracts.length || !isUndefinedTableError(sponsorContractsError)
    ? buildClubSponsorOverview(sponsorContracts, game.phase, effectiveStatus)
    : { ...EMPTY_SPONSOR_OVERVIEW, sponsor_prestige_tier: effectiveStatus, sponsor_prestige_label: SPONSOR_PRESTIGE_LABELS[effectiveStatus] };

  return {
    season_number: seasonNumber,
    sales_count: saleTransactions?.length ?? 0,
    squad: clubPlayers ?? [],
    staff: staffRows ?? [],
    game_changers: allGameChangers,
    pending_game_changer_choices: pendingChoices,
    pending_effects: pendingEffects,
    investments: investments ?? [],
    open_staff_offer: openStaffOffer,
    training: {
      events: trainingEvents,
      status: (() => {
        const baseCapacity = getTrainingCapacity(club.training_level ?? 1).players;
        const offseasonPending = pendingEffects.filter((eff) =>
          isOffseasonPendingScopeActive(eff.scope, game.phase),
        );
        const extraPlayers = computeTrainingExtraPlayers({
          baseCapacity,
          offseasonTrainingCapacity: club.offseason_training_capacity ?? null,
          staffEffects: (staffRows ?? []).flatMap((s) => (s.card?.effects ?? []) as Array<Record<string, unknown>>),
          pendingEffects: offseasonPending,
          phase: game.phase,
        });
        return getTrainingStatus({
          events: trainingEvents,
          trainingLevel: club.training_level ?? 1,
          extraPlayers,
        });
      })(),
    },
    finance: {
      money: Number(club.money),
      squad_stars: squadStars,
      wages,
      stadium_income: stadiumIncome,
      placement_reward: placementReward,
      projected_income: stadiumIncome + placementReward,
      projected_net: stadiumIncome + placementReward - wages,
      effective_status: effectiveStatus,
      status_override_active: overrideActive,
    },
    ...sponsorOverview,
    medical_heals_remaining: getMedicalHealsRemaining(
      club.medical_center_level ?? 0,
      club.medical_heals_used_season ?? 0,
    ),
    nlz_archetype_respec_available:
      (club.youth_academy_level ?? 0) >= 2 && (club.nlz_archetype_respecs_used_season ?? 0) < 1,
  };
}

export async function getSavedGamesForCurrentUser() {
  const { userId } = await auth();
  const supabase = createSupabaseServiceClient();

  if (!userId || !supabase) {
    return [];
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("game_members")
    .select("game_id, is_host")
    .eq("clerk_user_id", userId)
    .returns<Array<{ game_id: string; is_host: boolean }>>();

  if (membershipsError) {
    throw membershipsError;
  }

  const gameIds = [...new Set((memberships ?? []).map((membership) => membership.game_id))];

  if (gameIds.length === 0) {
    return [];
  }

  const [{ data: games, error: gamesError }, { data: clubs, error: clubsError }] = await Promise.all([
    queryGamesByIds(supabase, gameIds),
    supabase
      .from("clubs")
      .select(CLUB_SELECT)
      .in("game_id", gameIds)
      .returns<LobbyClub[]>(),
  ]);

  if (gamesError) {
    throw gamesError;
  }

  if (clubsError) {
    throw clubsError;
  }

  const clubsWithStars = await addSquadStars(clubs ?? []);
  const membershipByGameId = new Map((memberships ?? []).map((membership) => [membership.game_id, membership]));
  const clubsByGameId = new Map<string, LobbyClub[]>();

  for (const club of clubsWithStars) {
    const gameClubs = clubsByGameId.get(club.game_id) ?? [];
    gameClubs.push(club);
    clubsByGameId.set(club.game_id, gameClubs);
  }

  return (games ?? []).map((game): SavedGameSummary => {
    const gameClubs = clubsByGameId.get(game.id) ?? [];
    const ownClub = gameClubs.find((club) => club.clerk_user_id === userId);

    return {
      id: game.id,
      room_code: game.room_code,
      phase: game.phase,
      host_clerk_user_id: game.host_clerk_user_id,
      save_name: game.save_name || `Room ${game.room_code}`,
      save_status: game.save_status ?? "active",
      save_version: game.save_version ?? 1,
      last_saved_at: game.last_saved_at ?? game.updated_at ?? game.created_at ?? "",
      created_at: game.created_at ?? "",
      updated_at: game.updated_at ?? "",
      is_host: membershipByGameId.get(game.id)?.is_host ?? game.host_clerk_user_id === userId,
      club_count: gameClubs.length,
      ready_count: gameClubs.filter((club) => club.is_ready).length,
      own_club_name: ownClub?.club_name,
    };
  });
}

async function addSquadStars(clubs: LobbyClub[]) {
  const supabase = createSupabaseServiceClient();
  const missingClubs = clubs.filter((club) => club.squad_stars == null || club.squad_size == null);
  const clubIds = missingClubs.map((club) => club.id);

  if (clubIds.length === 0) {
    return clubs.map((club) => ({
      ...club,
      squad_stars: Number(club.squad_stars ?? 0),
      squad_size: Number(club.squad_size ?? 0),
    }));
  }

  if (!supabase) {
    return clubs.map((club) => ({
      ...club,
      squad_stars: Number(club.squad_stars ?? 0),
      squad_size: Number(club.squad_size ?? 0),
    }));
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("club_id, current_stars")
    .in("club_id", clubIds)
    .returns<Array<{ club_id: string; current_stars: number | string }>>();

  if (error) {
    throw error;
  }

  const starsByClubId = new Map<string, number>();
  const sizeByClubId = new Map<string, number>();

  for (const row of data ?? []) {
    starsByClubId.set(row.club_id, (starsByClubId.get(row.club_id) ?? 0) + Number(row.current_stars));
    sizeByClubId.set(row.club_id, (sizeByClubId.get(row.club_id) ?? 0) + 1);
  }

  return clubs.map((club) => ({
    ...club,
    squad_stars: club.squad_stars == null ? (starsByClubId.get(club.id) ?? 0) : Number(club.squad_stars),
    squad_size: club.squad_size == null ? (sizeByClubId.get(club.id) ?? 0) : Number(club.squad_size),
  }));
}

type DraftRoundRow = {
  id: string;
  game_id: string;
  round_index: number;
  board_player_ids: string[];
  pick_order_club_ids: string[];
  picks: unknown;
  completed: boolean;
  created_at: string;
};

async function getDraftSnapshot(game: LobbyGame, clubs: LobbyClub[]): Promise<DraftRoundSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase || game.phase !== "draft") {
    return null;
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("draft_rounds")
    .select("id, game_id, round_index, board_player_ids, pick_order_club_ids, picks, completed, created_at")
    .eq("game_id", game.id)
    .order("completed", { ascending: true })
    .order("round_index", { ascending: false })
    .limit(1)
    .returns<DraftRoundRow[]>();

  if (roundsError) {
    throw roundsError;
  }

  const round = rounds?.[0];

  if (!round) {
    return null;
  }

  const boardPlayerIds = round.board_player_ids ?? [];
  const [{ data: players, error: playersError }, { data: clubPlayers, error: clubPlayersError }] = await Promise.all([
    boardPlayerIds.length > 0
      ? supabase.from("players").select(DRAFT_PLAYER_SELECT).in("id", boardPlayerIds).returns<DraftPlayerRow[]>()
      : Promise.resolve({ data: [], error: null }),
    clubs.length > 0
      ? supabase
          .from("club_players")
          .select("club_id")
          .in(
            "club_id",
            clubs.map((club) => club.id),
          )
          .returns<Array<{ club_id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (playersError) {
    throw playersError;
  }

  if (clubPlayersError) {
    throw clubPlayersError;
  }

  const playersById = new Map((players ?? []).map((player) => [player.id, player]));
  const boardPlayers = boardPlayerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is DraftPlayerRow => Boolean(player));
  const squadCounts: Record<string, number> = {};

  for (const clubPlayer of clubPlayers ?? []) {
    squadCounts[clubPlayer.club_id] = (squadCounts[clubPlayer.club_id] ?? 0) + 1;
  }

  const picks = normalizeDraftPicks(round.picks);
  const currentPickIndex = picks.length;

  return {
    id: round.id,
    game_id: round.game_id,
    round_index: round.round_index,
    board_player_ids: boardPlayerIds,
    pick_order_club_ids: round.pick_order_club_ids ?? [],
    picks,
    completed: round.completed,
    created_at: round.created_at,
    board_players: boardPlayers,
    current_pick_index: currentPickIndex,
    current_club_id: round.pick_order_club_ids?.[currentPickIndex] ?? null,
    squad_counts: squadCounts,
  };
}

function normalizeDraftPicks(value: unknown): DraftPickSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((pick, index) => {
    if (!pick || typeof pick !== "object") {
      return [];
    }

    const draftPick = pick as Record<string, unknown>;
    const clubId = typeof draftPick.clubId === "string" ? draftPick.clubId : undefined;
    const playerId = typeof draftPick.playerId === "string" ? draftPick.playerId : undefined;

    if (!clubId || !playerId) {
      return [];
    }

    return [
      {
        pickIndex: Number(draftPick.pickIndex ?? index),
        clubId,
        playerId,
        pickedAt: typeof draftPick.pickedAt === "string" ? draftPick.pickedAt : undefined,
      },
    ];
  });
}
