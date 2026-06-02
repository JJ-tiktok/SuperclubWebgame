export type LobbyPhase =
  | "lobby"
  | "draft"
  | "offseason_finance"
  | "offseason_training"
  | "offseason_scouting"
  | "offseason_investments"
  | "off_season"
  | "deadline_day"
  | "prematch"
  | "match"
  | "season"
  | "season_end"
  | "completed";

export type LobbySettings = {
  starting_money: number;
  max_draft_stars: number;
  match_points_mode?: "classic_6_2_0" | "football_3_1_0";
  season_mode?: "double_round_robin" | "five_match";
  target_league_size?: number;
  seasonNumber?: number;
  turn_timeout_seconds: number;
};

export type ClubTemplate = {
  id: string;
  name: string;
  slogan: string;
  color: string;
  tailwind: string;
  vibe: string;
};

export type LobbyGame = {
  id: string;
  room_code: string;
  phase: LobbyPhase;
  host_clerk_user_id: string;
  current_turn_club_id?: string | null;
  settings: LobbySettings;
  save_name?: string | null;
  save_status?: "active" | "paused" | "completed";
  save_version?: number;
  last_saved_at?: string | null;
  last_saved_by_clerk_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LobbyClub = {
  id: string;
  game_id: string;
  clerk_user_id: string;
  club_template_id?: string | null;
  club_name: string;
  club_slogan?: string | null;
  club_color?: string | null;
  manager_name: string;
  money: number;
  points: number;
  season_rank?: number;
  status?: string;
  attractiveness_stars?: number;
  stadium_level?: number;
  scouting_level?: number;
  training_level?: number;
  offseason_scouting_capacity?: number | null;
  offseason_training_capacity?: number | null;
  status_override?: string | null;
  status_override_until_season?: number | null;
  stadium_level_cap?: number | null;
  stadium_level_cap_until_season?: number | null;
  supercup_cards?: number;
  captain_boost_rank?: number | null;
  captain_club_player_id?: string | null;
  squad_stars?: number;
  is_ready: boolean;
  image_url?: string | null;
  created_at?: string;
};

export type LobbyMember = {
  id: string;
  game_id: string;
  clerk_user_id: string;
  display_name: string;
  image_url?: string | null;
  is_host: boolean;
  phase_done?: boolean;
  phase_done_at?: string | null;
  joined_at?: string;
};

export type DraftPickSnapshot = {
  pickIndex: number;
  clubId: string;
  playerId: string;
  pickedAt?: string;
};

export type DraftPlayerRow = {
  id: string;
  content_key?: string | null;
  display_name: string;
  position: string;
  eligible_positions?: string[] | null;
  role?: string | null;
  nationality?: string | null;
  age?: number | null;
  age_group?: string | null;
  base_stars: number;
  potential_stars: number;
  skill_max?: number | null;
  veteran_fallback?: number | null;
  chemistry_left?: boolean | null;
  chemistry_right?: boolean | null;
  chemistry_symbol?: string | null;
  scouting_price?: number | null;
  minimum_bid?: number | null;
  region?: string | null;
  metadata?: Record<string, unknown> | null;
  visibility?: string | null;
};

export type DraftRoundSnapshot = {
  id: string;
  game_id: string;
  round_index: number;
  board_player_ids: string[];
  pick_order_club_ids: string[];
  picks: DraftPickSnapshot[];
  completed: boolean;
  created_at: string;
  board_players: DraftPlayerRow[];
  current_pick_index: number;
  current_club_id: string | null;
  squad_counts: Record<string, number>;
};

export type DeadlineAuctionStatus = "scheduled" | "open" | "resolving" | "resolved" | "passed";

export type DeadlineBidSnapshot = {
  id: string;
  auction_id: string;
  club_id: string;
  amount: number;
  locked: boolean;
  created_at: string;
};

export type DeadlineAuctionSnapshot = {
  id: string;
  game_id: string;
  player_id: string;
  status: DeadlineAuctionStatus;
  minimum_bid: number;
  winning_club_id?: string | null;
  opened_by_club_id?: string | null;
  season_number: number;
  auction_index: number;
  current_bid_club_id?: string | null;
  current_amount: number;
  turn_started_at?: string | null;
  passed_club_ids: string[];
  bid_order_club_ids: string[];
  created_at: string;
  resolved_at?: string | null;
  player: DraftPlayerRow;
  bids: DeadlineBidSnapshot[];
};

export type DeadlineSnapshot = {
  active_auction: DeadlineAuctionSnapshot | null;
  auction_count: number;
  auctions: DeadlineAuctionSnapshot[];
  completed_count: number;
  setup_error?: string;
};

export type ScoutingDrawStatus = "drawn" | "bought" | "passed";

export type ScoutingDrawSnapshot = {
  id: string;
  game_id: string;
  club_id: string;
  season_number: number;
  pile_key: string;
  draw_index: number;
  player_id: string;
  status: ScoutingDrawStatus;
  created_at: string;
  resolved_at?: string | null;
  player: DraftPlayerRow;
};

export type ScoutingClubStatusSnapshot = {
  bought_count: number;
  capacity: number;
  club_id: string;
  draw_count: number;
  finished: boolean;
  open_count: number;
  passed_count: number;
  sales_count: number;
};

export type ScoutingSnapshot = {
  all_finished: boolean;
  current_club_id: string | null;
  draws: ScoutingDrawSnapshot[];
  next_pending_club_id: string | null;
  sales_by_club_id: Record<string, number>;
  status_by_club_id: Record<string, ScoutingClubStatusSnapshot>;
};

export type ClubPlayerSnapshot = {
  id: string;
  club_id: string;
  player_id: string;
  current_stars: number;
  current_zone: string;
  injured: boolean;
  lineup_slot?: number | null;
  acquired_at?: string;
  player: DraftPlayerRow;
};

export type StaffCardRow = {
  id: string;
  content_key?: string | null;
  display_name: string;
  price: number;
  effects: unknown[];
  visibility?: string | null;
};

export type ClubStaffSnapshot = {
  id: string;
  staff_card_id: string;
  hired_at?: string;
  card: StaffCardRow;
};

export type StaffOfferSnapshot = {
  id: string;
  season_number: number;
  status: "open" | "resolved" | "declined";
  offered_card_ids: string[];
  chosen_card_id?: string | null;
  offered_cards: StaffCardRow[];
};

export type GameChangerCategory = "good_news" | "bad_news" | "secret_weapon";

export type ClubGameChangerSnapshot = {
  id: string;
  game_changer_card_id: string;
  season_number?: number | null;
  used_at?: string | null;
  fixture_id?: string | null;
  applied_third?: number | null;
  applied_window?: string | null;
  status?: "pending" | "resolved" | "consumed" | "expired" | null;
  choice_payload?: Record<string, unknown> | null;
  resolved_payload?: Record<string, unknown> | null;
  created_at?: string | null;
  card: {
    id: string;
    content_key?: string | null;
    display_name: string;
    description: string;
    category: GameChangerCategory;
    timing: string;
    play_window?: string | null;
    draw_weight?: number | null;
    effects: unknown[];
    visibility?: string | null;
  };
};

export type ClubPendingEffectSnapshot = {
  id: string;
  club_id: string;
  season_number: number;
  effect_type: string;
  payload: Record<string, unknown>;
  scope: "next_match" | "next_transfer" | "next_offseason" | "current_offseason" | "this_season";
  consumed_at: string | null;
  fixture_id: string | null;
  source_club_game_changer_id: string | null;
  created_at: string;
};

export type InvestmentSnapshot = {
  id: string;
  game_id: string;
  club_id: string;
  season_number: number;
  action: "training" | "scouting" | "stadium" | "staff";
  cost: number;
  created_at: string;
};

export type ClubFinanceSnapshot = {
  money: number;
  squad_stars: number;
  wages: number;
  stadium_income: number;
  placement_reward: number;
  projected_income: number;
  projected_net: number;
};

export type TrainingEventSnapshot = {
  after_stars: number;
  before_stars: number;
  club_player_id: string;
  created_at: string;
  dice_roll: number;
  game_phase: string;
  guaranteed_bonus_used: boolean;
  id: string;
  player_id: string;
  season_number: number;
  success: boolean;
  training_level: number;
};

export type TrainingStatusSnapshot = {
  attempts_used: number;
  capacity_players: number;
  guaranteed_bonus_available: boolean;
  guaranteed_bonus_used: boolean;
  max_gain_per_player: number;
  training_level: number;
};

export type ClubOverviewSnapshot = {
  season_number: number;
  sales_count: number;
  squad: ClubPlayerSnapshot[];
  staff: ClubStaffSnapshot[];
  game_changers: ClubGameChangerSnapshot[];
  pending_game_changer_choices: ClubGameChangerSnapshot[];
  pending_effects: ClubPendingEffectSnapshot[];
  investments: InvestmentSnapshot[];
  open_staff_offer: StaffOfferSnapshot | null;
  training: {
    events: TrainingEventSnapshot[];
    status: TrainingStatusSnapshot;
  };
  finance: ClubFinanceSnapshot;
};

export type SeasonParticipantSnapshot = {
  club_id?: string | null;
  cpu_team_id?: string | null;
  display_name: string;
  game_id: string;
  id: string;
  kind: "cpu" | "human";
  season_number: number;
};

export type SeasonStandingSnapshot = {
  draws: number;
  fixture_points_against: number;
  fixture_points_for: number;
  losses: number;
  match_points: number;
  participant: SeasonParticipantSnapshot;
  participant_id: string;
  played: number;
  rank: number;
  season_number: number;
  third_points_against: number;
  third_points_for: number;
  wins: number;
};

export type ManagerStandingSnapshot = {
  attractiveness_stars: number;
  club_id: string;
  club_name: string;
  rank: number;
  season_match_points: number;
  season_score: number;
  squad_stars: number;
  status: string;
};

export type MatchNewsSnapshot = {
  id: string;
  game_id: string;
  fixture_id?: string | null;
  club_id?: string | null;
  club_game_changer_id?: string | null;
  category: GameChangerCategory | "injury";
  headline: string;
  detail?: string | null;
  created_at: string;
};

export type SeasonFixtureSnapshot = {
  away_cpu_lineup?: {
    att_stars: number;
    def_stars: number;
    display_name: string;
    id: string;
    mid_stars: number;
  } | null;
  away_lineup_locked: boolean;
  away_locked_att?: number | null;
  away_locked_def?: number | null;
  away_locked_mid?: number | null;
  away_participant: SeasonParticipantSnapshot;
  away_participant_id: string;
  away_score?: number | null;
  away_third_points?: number | null;
  completed_at?: string | null;
  game_id: string;
  home_cpu_lineup?: {
    att_stars: number;
    def_stars: number;
    display_name: string;
    id: string;
    mid_stars: number;
  } | null;
  home_lineup_locked: boolean;
  home_locked_att?: number | null;
  home_locked_def?: number | null;
  home_locked_mid?: number | null;
  home_participant: SeasonParticipantSnapshot;
  home_participant_id: string;
  home_score?: number | null;
  home_third_points?: number | null;
  id: string;
  matchday: number;
  match_state: "scheduled" | "in_progress" | "completed";
  current_third: number;
  home_ready_for_next_third: boolean;
  away_ready_for_next_third: boolean;
  partial_result?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  derby_day?: boolean | null;
  retro_win_used?: boolean | null;
  retro_win_result?: Record<string, unknown> | null;
  season_number: number;
  status: "completed" | "scheduled";
};

export type SeasonSnapshot = {
  current_matchday: number;
  fixtures: SeasonFixtureSnapshot[];
  manager_standings: ManagerStandingSnapshot[];
  setup_error?: string;
  standings: SeasonStandingSnapshot[];
};

export type LobbySnapshot = {
  game: LobbyGame;
  clubs: LobbyClub[];
  members: LobbyMember[];
  draft: DraftRoundSnapshot | null;
  deadline: DeadlineSnapshot | null;
  season: SeasonSnapshot | null;
  scouting: ScoutingSnapshot | null;
  club_overview: ClubOverviewSnapshot | null;
  match_news: MatchNewsSnapshot[];
};

export type SavedGameSummary = {
  id: string;
  room_code: string;
  phase: LobbyPhase;
  host_clerk_user_id: string;
  save_name: string;
  save_status: "active" | "paused" | "completed";
  save_version: number;
  last_saved_at: string;
  created_at: string;
  updated_at: string;
  is_host: boolean;
  club_count: number;
  ready_count: number;
  own_club_name?: string;
};

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };
