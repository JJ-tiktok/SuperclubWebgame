import { auth } from "@clerk/nextjs/server";
import { normalizeRoomCode } from "./rules";
import { DRAFT_PLAYER_SELECT } from "./draft";
import type {
  ClubGameChangerSnapshot,
  ClubOverviewSnapshot,
  ClubPlayerSnapshot,
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
  LobbySnapshot,
  ManagerStandingSnapshot,
  SavedGameSummary,
  ScoutingDrawSnapshot,
  ScoutingSnapshot,
  SeasonFixtureSnapshot,
  SeasonSnapshot,
  SeasonStandingSnapshot,
  StaffCardRow,
  StaffOfferSnapshot,
} from "./types";
import { calculateManagerScore, getManagerScoreBand, getPlacementReward, getStadiumIncome } from "@/lib/game/rules";
import { getDeadlineAuctionCount } from "@/lib/lobby/deadline";
import { getClubScoutingCapacity, getNextPendingScoutingClubId } from "@/lib/lobby/scouting";
import { getTrainingStatus, parseTrainingEvent } from "@/lib/lobby/training";
import type { ClubStatus } from "@/lib/game/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const GAME_SELECT =
  "id, room_code, phase, host_clerk_user_id, current_turn_club_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id, created_at, updated_at";
const CLUB_SELECT =
  "id, game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, money, points, season_rank, status, stadium_level, scouting_level, training_level, supercup_cards, captain_boost_rank, is_ready, image_url, created_at";

export async function getLobbySnapshotByRoomCode(roomCodeParam: string) {
  const { userId } = await auth();
  const supabase = createSupabaseServiceClient();

  if (!userId || !supabase) {
    return { snapshot: null, currentUserId: userId };
  }

  const roomCode = normalizeRoomCode(roomCodeParam);
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("room_code", roomCode)
    .maybeSingle<LobbyGame>();

  if (gameError) {
    throw gameError;
  }

  if (!game) {
    return { snapshot: null, currentUserId: userId };
  }

  const [{ data: clubs, error: clubsError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("clubs")
      .select(CLUB_SELECT)
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

  if (clubsError) {
    throw clubsError;
  }

  if (membersError) {
    throw membersError;
  }

  const clubsWithStars = await addSquadStars(clubs ?? []);
  const draft = await getDraftSnapshot(game, clubsWithStars);
  const scouting = await getScoutingSnapshot(game, clubsWithStars);
  const deadline = await getDeadlineSnapshot(game, clubsWithStars);
  const season = await getSeasonSnapshot(game);
  const ownClub = clubsWithStars.find((club) => club.clerk_user_id === userId);
  const clubOverview = ownClub ? await getClubOverviewSnapshot(game, ownClub, clubsWithStars.length) : null;

  const snapshot: LobbySnapshot = {
    game,
    clubs: clubsWithStars,
    members: members ?? [],
    draft,
    deadline,
    season,
    scouting,
    club_overview: clubOverview,
  };

  return { snapshot, currentUserId: userId };
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

  if (!supabase || game.phase !== "offseason_scouting") {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const clubIds = clubs.map((c) => c.id);
  const [{ data: draws, error: drawsError }, { data: saleRows, error: saleRowsError }, { data: staffEffectRows }] = await Promise.all([
    supabase
      .from("scouting_draws")
      .select(`id, game_id, club_id, season_number, pile_key, draw_index, player_id, status, created_at, resolved_at, player:players(${DRAFT_PLAYER_SELECT})`)
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("draw_index", { ascending: true })
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

  // Build a map of scouting_extra_cards bonus per club from staff effects
  const scoutingBonusByClubId: Record<string, number> = {};
  for (const row of staffEffectRows ?? []) {
    const bonus = (row.card?.effects ?? [])
      .filter((e) => e.type === "scouting_extra_cards")
      .reduce((sum, e) => sum + Number(e.cards ?? 0), 0);
    if (bonus > 0) {
      scoutingBonusByClubId[row.club_id] = (scoutingBonusByClubId[row.club_id] ?? 0) + bonus;
    }
  }

  const normalizedDraws: ScoutingDrawSnapshot[] = draws ?? [];
  const statusByClubId: ScoutingSnapshot["status_by_club_id"] = {};

  for (const club of clubs) {
    const clubDraws = normalizedDraws.filter((draw) => draw.club_id === club.id);
    const openCount = clubDraws.filter((draw) => draw.status === "drawn").length;
    const capacity = getClubScoutingCapacity(club) + (scoutingBonusByClubId[club.id] ?? 0);

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

async function getSeasonSnapshot(game: LobbyGame): Promise<SeasonSnapshot | null> {
  const supabase = createSupabaseServiceClient();

  if (!supabase || !["prematch", "match", "season_end"].includes(game.phase)) {
    return null;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [{ data: fixtures, error: fixturesError }, { data: standings, error: standingsError }] = await Promise.all([
    supabase
      .from("fixtures")
      .select(
        `id, game_id, season_number, matchday, home_participant_id, away_participant_id, status,
        home_lineup_locked, away_lineup_locked,
        home_locked_def, home_locked_mid, home_locked_att,
        away_locked_def, away_locked_mid, away_locked_att,
        home_score, away_score, home_third_points, away_third_points, result, completed_at,
        home_participant:season_participants!fixtures_home_participant_id_fkey(id, game_id, season_number, kind, club_id, cpu_team_id, display_name),
        away_participant:season_participants!fixtures_away_participant_id_fkey(id, game_id, season_number, kind, club_id, cpu_team_id, display_name),
        home_cpu_lineup:cpu_lineups!fixtures_home_cpu_lineup_id_fkey(id, display_name, def_stars, mid_stars, att_stars),
        away_cpu_lineup:cpu_lineups!fixtures_away_cpu_lineup_id_fkey(id, display_name, def_stars, mid_stars, att_stars)`,
      )
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("matchday", { ascending: true })
      .returns<SeasonFixtureSnapshot[]>(),
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
  const managerStandings = await getManagerStandings(game, standings ?? []);

  return {
    current_matchday: currentMatchday,
    fixtures: normalizedFixtures,
    manager_standings: managerStandings,
    standings: standings ?? [],
  };
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

  const [{ data: clubs, error: clubsError }, { data: squadRows, error: squadError }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, club_name, points, season_rank, status")
      .in("id", humanClubIds)
      .returns<Array<{ club_name: string; id: string; points: number | string; season_rank: number | null; status: string | null }>>(),
    supabase
      .from("club_players")
      .select("club_id, current_stars")
      .in("club_id", humanClubIds)
      .returns<Array<{ club_id: string; current_stars: number | string }>>(),
  ]);

  if (clubsError) {
    throw clubsError;
  }

  if (squadError) {
    throw squadError;
  }

  const starsByClubId = new Map<string, number>();
  for (const row of squadRows ?? []) {
    starsByClubId.set(row.club_id, (starsByClubId.get(row.club_id) ?? 0) + Number(row.current_stars ?? 0));
  }

  const clubsById = new Map((clubs ?? []).map((club) => [club.id, club]));
  const rows = standings
    .filter((standing) => standing.participant.kind === "human" && standing.participant.club_id)
    .map((standing) => {
      const clubId = standing.participant.club_id as string;
      const club = clubsById.get(clubId);
      const squadStars = starsByClubId.get(clubId) ?? 0;
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

async function getDeadlineSnapshot(game: LobbyGame, clubs: LobbyClub[]): Promise<DeadlineSnapshot | null> {
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

  const auctions = (data ?? []).map((auction): DeadlineAuctionSnapshot => ({
    ...auction,
    bids: auction.bids ?? [],
    current_amount: Number(auction.current_amount ?? 0),
    minimum_bid: Number(auction.minimum_bid ?? 0),
    passed_club_ids: auction.passed_club_ids ?? [],
    bid_order_club_ids: auction.bid_order_club_ids ?? [],
  }));
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
): Promise<ClubOverviewSnapshot> {
  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    throw new Error("Supabase service client is not configured.");
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [
    { data: clubPlayers, error: clubPlayersError },
    { data: staffRows, error: staffError },
    { data: gameChangerRows, error: gameChangerError },
    { data: investments, error: investmentsError },
    { data: trainingTransactions, error: trainingTransactionsError },
    { data: saleTransactions, error: saleTransactionsError },
    { data: openOfferRows, error: openOfferError },
  ] = await Promise.all([
    supabase
      .from("club_players")
      .select(
        `id, club_id, player_id, current_stars, current_zone, injured, lineup_slot, acquired_at,
        player:players(${DRAFT_PLAYER_SELECT})`,
      )
      .eq("club_id", club.id)
      .order("acquired_at", { ascending: true })
      .returns<ClubPlayerSnapshot[]>(),
    supabase
      .from("club_staff")
      .select("id, staff_card_id, hired_at, card:staff_cards(id, content_key, display_name, price, effects, visibility)")
      .eq("club_id", club.id)
      .order("hired_at", { ascending: true })
      .returns<ClubStaffSnapshot[]>(),
    supabase
      .from("club_game_changers")
      .select("id, game_changer_card_id, used_at, card:game_changer_cards(id, content_key, display_name, timing, effects, visibility)")
      .eq("club_id", club.id)
      .order("id", { ascending: true })
      .returns<ClubGameChangerSnapshot[]>(),
    supabase
      .from("investments")
      .select("id, game_id, club_id, season_number, action, cost, created_at")
      .eq("club_id", club.id)
      .eq("season_number", seasonNumber)
      .order("created_at", { ascending: false })
      .returns<InvestmentSnapshot[]>(),
    supabase
      .from("transactions")
      .select("id, created_at, metadata")
      .eq("game_id", game.id)
      .eq("club_id", club.id)
      .eq("reason", "training")
      .order("created_at", { ascending: false })
      .returns<Array<{ id: string; created_at: string; metadata: unknown }>>(),
    supabase
      .from("transactions")
      .select("id, metadata")
      .eq("game_id", game.id)
      .eq("club_id", club.id)
      .eq("reason", "player_sale")
      .contains("metadata", { season_number: seasonNumber })
      .returns<Array<{ id: string; metadata: unknown }>>(),
    supabase
      .from("staff_offers")
      .select("id, season_number, status, offered_card_ids, chosen_card_id")
      .eq("club_id", club.id)
      .eq("season_number", seasonNumber)
      .eq("status", "open")
      .limit(1)
      .returns<Array<{ id: string; season_number: number; status: string; offered_card_ids: string[]; chosen_card_id: string | null }>>(),
  ]);

  if (clubPlayersError) {
    throw clubPlayersError;
  }

  if (staffError) {
    throw staffError;
  }

  if (gameChangerError) {
    throw gameChangerError;
  }

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
  const squadStars = (clubPlayers ?? []).reduce((total, owned) => total + Number(owned.current_stars), 0);
  const status = normalizeClubStatus(club.status);
  const stadiumIncome = getStadiumIncome(club.stadium_level ?? 1, status);
  const placementReward = getPlacementReward(club.season_rank ?? 1, clubCount);
  const wages = squadStars * 1_000_000;

  return {
    season_number: seasonNumber,
    sales_count: saleTransactions?.length ?? 0,
    squad: clubPlayers ?? [],
    staff: staffRows ?? [],
    game_changers: gameChangerRows ?? [],
    investments: investments ?? [],
    open_staff_offer: openStaffOffer,
    training: {
      events: trainingEvents,
      status: getTrainingStatus({
        events: trainingEvents,
        trainingLevel: club.training_level ?? 1,
      }),
    },
    finance: {
      money: Number(club.money),
      squad_stars: squadStars,
      wages,
      stadium_income: stadiumIncome,
      placement_reward: placementReward,
      projected_income: stadiumIncome + placementReward,
      projected_net: stadiumIncome + placementReward - wages,
    },
  };
}

function normalizeClubStatus(status: string | undefined): ClubStatus {
  if (status === "established" || status === "mid_table" || status === "title_contender") {
    return status;
  }

  return "newly_promoted";
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
    supabase
      .from("games")
      .select(GAME_SELECT)
      .in("id", gameIds)
      .order("last_saved_at", { ascending: false })
      .returns<LobbyGame[]>(),
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
  const clubIds = clubs.map((club) => club.id);

  if (!supabase || clubIds.length === 0) {
    return clubs;
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

  for (const row of data ?? []) {
    starsByClubId.set(row.club_id, (starsByClubId.get(row.club_id) ?? 0) + Number(row.current_stars));
  }

  return clubs.map((club) => ({
    ...club,
    squad_stars: starsByClubId.get(club.id) ?? 0,
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
