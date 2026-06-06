-- Superclub Webgame schema blueprint.
-- Apply through Supabase SQL editor or convert into migrations once a project is linked.

create extension if not exists pgcrypto;

create type public.game_phase as enum (
  'lobby',
  'draft',
  'offseason_finance',
  'offseason_training',
  'offseason_scouting',
  'offseason_investments',
  'off_season',
  'deadline_day',
  'prematch',
  'match',
  'season',
  'season_end',
  'champions_league',
  'completed'
);

create type public.player_position as enum ('GK', 'DEF', 'MID', 'ATT');
create type public.player_archetype as enum ('alpha', 'beta', 'gamma');
create type public.lineup_zone as enum ('bench', 'GK', 'DEF', 'MID', 'ATT');
create type public.formation as enum ('3-3-4', '3-4-3', '3-5-2', '4-3-3', '4-4-2', '5-3-2');
create type public.auction_status as enum ('scheduled', 'open', 'resolving', 'resolved', 'passed');
create type public.match_status as enum ('scheduled', 'lineup_lock', 'resolving', 'completed');
create type public.card_visibility as enum ('private', 'room', 'public');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  phase public.game_phase not null default 'lobby',
  settings jsonb not null default jsonb_build_object(
    'max_draft_stars', 3,
    'starting_money', 120000000,
    'squad_draft_size', 16,
    'squad_max_size', 23,
    'season_number', 1,
    'sponsoring_enabled', true,
    'archetypes_enabled', true
  ),
  host_clerk_user_id text not null,
  current_turn_club_id uuid,
  save_name text not null default 'Superclub Spielstand',
  save_status text not null default 'active' check (save_status in ('active', 'paused', 'completed')),
  save_version int not null default 1 check (save_version > 0),
  live_seq bigint not null default 0,
  last_saved_at timestamptz not null default now(),
  last_saved_by_clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_members (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  clerk_user_id text not null,
  display_name text not null,
  image_url text,
  is_host boolean not null default false,
  phase_done boolean not null default false,
  phase_done_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (game_id, clerk_user_id)
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seq bigint not null,
  type text not null,
  actor_clerk_user_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

create index game_events_game_seq_idx
on public.game_events (game_id, seq);

create index game_events_game_seq_desc_idx
on public.game_events (game_id, seq desc);

create index game_events_game_created_at_idx
on public.game_events (game_id, created_at desc);

create table public.club_templates (
  id text primary key,
  name text not null unique,
  slogan text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  tailwind text not null,
  vibe text not null,
  sort_order int not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.club_templates (id, name, slogan, color, tailwind, vibe, sort_order)
values
  ('vanguard', 'Vanguard FC', 'From Assets to Icons.', '#0f172a', 'slate-900', 'Cleaner, korporativer Look fuer kuehle Strategie, Struktur und Professionalitaet.', 1),
  ('golden_meadow', 'Golden Meadow United', 'Where Talents Turn into Stars.', '#047857', 'emerald-700', 'Sattes Akademie-Gruen fuer Ausbildung, Entwicklung und junge Toptalente.', 2),
  ('apex_river', 'Apex River United', 'The Perfect Chemistry.', '#0f766e', 'teal-700', 'Moderne, fliessende Synergie-Farbe fuer perfekte Kaderchemie.', 3),
  ('dynamo_draft', 'FC Dynamo Draft', 'Calculated Chaos, Maximum Yield.', '#d97706', 'amber-600', 'Aggressiver Markt- und Auktionsclub mit lautem, dynamischem Auftritt.', 4),
  ('blackwood', 'Blackwood Athletic', 'Built on Solid Ground.', '#27272a', 'zinc-800', 'Dunkel, edel und unnachgiebig mit Stadion- und Traditionsfokus.', 5),
  ('crimson_cape', 'Crimson Cape FC', 'Fortune Favors the Bold.', '#be123c', 'rose-700', 'Leidenschaft, Risiko und Wuerfelmagie in tiefem Karmesinrot.', 6)
on conflict (id) do update
set name = excluded.name,
    slogan = excluded.slogan,
    color = excluded.color,
    tailwind = excluded.tailwind,
    vibe = excluded.vibe,
    sort_order = excluded.sort_order,
    is_active = true;

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  clerk_user_id text not null,
  club_template_id text references public.club_templates(id),
  club_name text not null,
  club_slogan text,
  club_color text check (club_color is null or club_color ~ '^#[0-9a-fA-F]{6}$'),
  manager_name text not null,
  image_url text,
  is_ready boolean not null default false,
  money bigint not null default 120000000,
  points int not null default 0,
  season_rank int not null default 1,
  status text not null default 'newly_promoted',
  attractiveness_stars int not null default 3 check (attractiveness_stars between 1 and 6),
  stadium_level int not null default 1 check (stadium_level between 1 and 4),
  scouting_level int not null default 1 check (scouting_level between 1 and 4),
  training_level int not null default 1 check (training_level between 1 and 4),
  offseason_scouting_capacity int,
  offseason_training_capacity int,
  supercup_cards int not null default 0,
  captain_boost_rank int,
  captain_club_player_id uuid,
  squad_stars int not null default 0,
  squad_size int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, clerk_user_id)
);

create unique index clubs_game_template_unique
on public.clubs (game_id, club_template_id)
where club_template_id is not null;

alter table public.games
  add constraint games_current_turn_club_id_fkey
  foreign key (current_turn_club_id) references public.clubs(id) on delete set null;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  position public.player_position not null,
  attacker_archetype public.player_archetype,
  defender_archetype public.player_archetype,
  role text,
  nationality text,
  age integer check (age is null or age > 0),
  age_group text not null default 'prime' check (age_group in ('talent', 'prime', 'veteran')),
  eligible_positions public.player_position[] not null default '{}',
  base_stars numeric(3,1) not null check (base_stars >= 0),
  potential_stars numeric(3,1) not null default 0 check (potential_stars >= 0),
  skill_max numeric(3,1) not null default 5 check (skill_max > 0),
  veteran_fallback numeric(3,1) check (veteran_fallback is null or veteran_fallback >= 0),
  chemistry text not null default 'none' check (chemistry in ('none', 'left', 'right', 'both')),
  chemistry_left boolean not null default false,
  chemistry_right boolean not null default false,
  chemistry_symbol text not null default 'star' check (chemistry_symbol in ('star', 'dot', 'link')),
  scouting_price bigint not null default 0,
  minimum_bid bigint not null default 0,
  region text not null default 'generic',
  metadata jsonb not null default '{}'::jsonb,
  visibility public.card_visibility not null default 'private',
  created_at timestamptz not null default now()
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  deck_type text not null,
  region text,
  player_ids uuid[] not null default '{}',
  discard_player_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.club_players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  current_stars numeric(3,1) not null,
  current_zone public.lineup_zone not null default 'bench',
  injured boolean not null default false,
  lineup_slot int,
  acquired_at timestamptz not null default now(),
  unique (club_id, player_id)
);

-- Captain assignment (added after club_players exists to avoid a forward reference).
alter table public.clubs
  add constraint clubs_captain_club_player_id_fkey
  foreign key (captain_club_player_id) references public.club_players(id) on delete set null;

create table public.draft_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_index int not null,
  board_player_ids uuid[] not null,
  pick_order_club_ids uuid[] not null,
  picks jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, round_index)
);

create table public.scouting_draws (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null,
  pile_key text not null check (pile_key in ('europe', 'africa', 'asia', 'north_america', 'south_america', 'oceania')),
  draw_index int not null check (draw_index >= 0),
  player_id uuid not null references public.players(id) on delete restrict,
  status text not null default 'drawn' check (status in ('drawn', 'bought', 'passed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (game_id, club_id, season_number, draw_index)
);

create unique index scouting_draws_open_player_unique
  on public.scouting_draws (game_id, season_number, player_id)
  where status = 'drawn';

create table public.staff_cards (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  price bigint not null,
  effects jsonb not null default '[]'::jsonb,
  visibility public.card_visibility not null default 'private'
);

create table public.club_staff (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  staff_card_id uuid not null references public.staff_cards(id) on delete restrict,
  hired_at timestamptz not null default now(),
  unique (club_id, staff_card_id)
);

create table public.staff_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null,
  offered_card_ids uuid[] not null,
  chosen_card_id uuid references public.staff_cards(id),
  status text not null default 'open' check (status in ('open', 'resolved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index staff_offers_open_per_club
  on public.staff_offers (club_id, season_number)
  where status = 'open';

create table public.transfer_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  from_club_id uuid not null references public.clubs(id) on delete cascade,
  to_club_id uuid not null references public.clubs(id) on delete cascade,
  target_club_player_id uuid not null references public.club_players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete restrict,
  offered_club_player_id uuid references public.club_players(id) on delete set null,
  offered_player_id uuid references public.players(id) on delete restrict,
  cash_amount bigint not null default 0 check (cash_amount >= 0),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_club_id <> to_club_id),
  check (
    (offered_club_player_id is null and offered_player_id is null)
    or
    (offered_club_player_id is not null and offered_player_id is not null)
  )
);

create unique index transfer_offers_open_buyer_target_unique
  on public.transfer_offers (from_club_id, target_club_player_id)
  where status = 'open';

create unique index transfer_offers_open_offered_player_unique
  on public.transfer_offers (offered_club_player_id)
  where offered_club_player_id is not null and status = 'open';

create or replace function public.normalize_transfer_offer_offered_player()
returns trigger
language plpgsql
as $$
begin
  if new.offered_club_player_id is null then
    new.offered_player_id := null;
  end if;
  return new;
end;
$$;

create trigger transfer_offers_normalize_offered_player
before insert or update on public.transfer_offers
for each row
execute function public.normalize_transfer_offer_offered_player();

create table public.game_changer_cards (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  description text not null default '',
  category text not null default 'secret_weapon'
    check (category in ('good_news', 'bad_news', 'secret_weapon')),
  timing text not null default 'after_match',
  draw_weight int not null default 1,
  play_window text
    check (play_window in ('before_match', 'during_match', 'after_match')),
  effects jsonb not null default '[]'::jsonb,
  visibility public.card_visibility not null default 'private'
);

create table public.club_game_changers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  game_changer_card_id uuid not null references public.game_changer_cards(id) on delete restrict,
  season_number int not null default 1,
  used_at timestamptz,
  fixture_id uuid references public.fixtures(id) on delete set null,
  applied_third int,
  applied_window text
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null,
  action text not null check (action in ('training', 'scouting', 'stadium', 'staff')),
  cost bigint not null default 0,
  created_at timestamptz not null default now()
);

create unique index investments_one_department_per_offseason
  on public.investments (club_id, season_number, action);

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  status public.auction_status not null default 'scheduled',
  minimum_bid bigint not null default 0,
  winning_club_id uuid references public.clubs(id) on delete set null,
  opened_by_club_id uuid references public.clubs(id) on delete set null,
  season_number int not null default 1,
  auction_index int not null default 0 check (auction_index >= 0),
  current_bid_club_id uuid references public.clubs(id) on delete set null,
  current_amount bigint not null default 0 check (current_amount >= 0),
  turn_started_at timestamptz,
  passed_club_ids uuid[] not null default '{}',
  bid_order_club_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (game_id, season_number, auction_index)
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (auction_id, club_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  home_club_id uuid not null references public.clubs(id) on delete cascade,
  away_club_id uuid not null references public.clubs(id) on delete cascade,
  status public.match_status not null default 'scheduled',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  formation public.formation not null,
  captain_boost_zone text check (captain_boost_zone in ('DEF', 'MID', 'ATT')),
  starters jsonb not null default '{}'::jsonb,
  bench uuid[] not null default '{}',
  locked boolean not null default false,
  locked_at timestamptz,
  unique (match_id, club_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.cpu_teams (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  color text not null default '#52525b',
  active boolean not null default true,
  strength_tier text not null default 'schwach' check (strength_tier in ('stark', 'mittel', 'schwach')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.cpu_lineups (
  id uuid primary key default gen_random_uuid(),
  cpu_team_id uuid not null references public.cpu_teams(id) on delete cascade,
  display_name text not null,
  def_stars numeric(4,1) not null check (def_stars >= 0),
  mid_stars numeric(4,1) not null check (mid_stars >= 0),
  att_stars numeric(4,1) not null check (att_stars >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (cpu_team_id, sort_order)
);

create table public.continental_cpu_teams (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  color text not null default '#52525b',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.continental_cpu_lineups (
  id uuid primary key default gen_random_uuid(),
  continental_cpu_team_id uuid not null references public.continental_cpu_teams(id) on delete cascade,
  display_name text not null,
  def_stars numeric(4,1) not null check (def_stars >= 0),
  mid_stars numeric(4,1) not null check (mid_stars >= 0),
  att_stars numeric(4,1) not null check (att_stars >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (continental_cpu_team_id, sort_order)
);

create table public.continental_tournaments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  status text not null default 'setup' check (status in ('setup', 'in_progress', 'completed')),
  bracket_size int not null default 32,
  prize_amount bigint not null default 100000000,
  winner_club_id uuid references public.clubs(id) on delete set null,
  current_round int not null default 32,
  created_at timestamptz not null default now(),
  unique (game_id, season_number)
);

create table public.continental_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.continental_tournaments(id) on delete cascade,
  kind text not null check (kind in ('human', 'cpu')),
  club_id uuid references public.clubs(id) on delete cascade,
  continental_cpu_team_id uuid references public.continental_cpu_teams(id) on delete restrict,
  display_name text not null,
  bracket_seed int not null,
  eliminated_round int,
  created_at timestamptz not null default now(),
  unique (tournament_id, club_id),
  unique (tournament_id, continental_cpu_team_id),
  check (
    (kind = 'human' and club_id is not null and continental_cpu_team_id is null)
    or
    (kind = 'cpu' and continental_cpu_team_id is not null and club_id is null)
  )
);

create table public.continental_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.continental_tournaments(id) on delete cascade,
  round int not null check (round in (32, 16, 8, 4, 2, 1)),
  match_index int not null check (match_index >= 0),
  home_participant_id uuid not null references public.continental_participants(id) on delete cascade,
  away_participant_id uuid not null references public.continental_participants(id) on delete cascade,
  home_continental_cpu_lineup_id uuid references public.continental_cpu_lineups(id) on delete set null,
  away_continental_cpu_lineup_id uuid references public.continental_cpu_lineups(id) on delete set null,
  home_lineup_locked boolean not null default false,
  away_lineup_locked boolean not null default false,
  home_locked_def int,
  home_locked_mid int,
  home_locked_att int,
  away_locked_def int,
  away_locked_mid int,
  away_locked_att int,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  match_state text not null default 'scheduled' check (match_state in ('scheduled', 'in_progress', 'completed')),
  current_third int not null default 0,
  home_ready_for_next_third boolean not null default false,
  away_ready_for_next_third boolean not null default false,
  partial_result jsonb,
  home_score int,
  away_score int,
  home_third_points numeric(3,1),
  away_third_points numeric(3,1),
  result jsonb,
  winner_participant_id uuid references public.continental_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tournament_id, round, match_index),
  check (home_participant_id <> away_participant_id)
);

create table public.season_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  kind text not null check (kind in ('human', 'cpu')),
  club_id uuid references public.clubs(id) on delete cascade,
  cpu_team_id uuid references public.cpu_teams(id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (game_id, season_number, club_id),
  unique (game_id, season_number, cpu_team_id),
  check (
    (kind = 'human' and club_id is not null and cpu_team_id is null)
    or
    (kind = 'cpu' and cpu_team_id is not null and club_id is null)
  )
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  matchday int not null check (matchday > 0),
  home_participant_id uuid not null references public.season_participants(id) on delete cascade,
  away_participant_id uuid not null references public.season_participants(id) on delete cascade,
  home_cpu_lineup_id uuid references public.cpu_lineups(id) on delete set null,
  away_cpu_lineup_id uuid references public.cpu_lineups(id) on delete set null,
  home_lineup_locked boolean not null default false,
  away_lineup_locked boolean not null default false,
  home_locked_def int,
  home_locked_mid int,
  home_locked_att int,
  away_locked_def int,
  away_locked_mid int,
  away_locked_att int,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  match_state text not null default 'scheduled' check (match_state in ('scheduled', 'in_progress', 'completed')),
  current_third int not null default 0,
  home_ready_for_next_third boolean not null default false,
  away_ready_for_next_third boolean not null default false,
  partial_result jsonb,
  home_score int,
  away_score int,
  home_third_points numeric(3,1),
  away_third_points numeric(3,1),
  result jsonb,
  derby_day boolean not null default false,
  retro_win_used boolean not null default false,
  retro_win_result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (game_id, season_number, matchday, home_participant_id, away_participant_id),
  check (home_participant_id <> away_participant_id)
);

create table public.season_standings (
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  participant_id uuid not null references public.season_participants(id) on delete cascade,
  played int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  match_points int not null default 0,
  third_points_for numeric(5,1) not null default 0,
  third_points_against numeric(5,1) not null default 0,
  fixture_points_for int not null default 0,
  fixture_points_against int not null default 0,
  rank int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (game_id, season_number, participant_id)
);

create table public.match_news (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  fixture_id uuid references public.fixtures(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  club_game_changer_id uuid references public.club_game_changers(id) on delete set null,
  category text not null check (category in ('good_news', 'bad_news', 'secret_weapon', 'injury')),
  headline text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.match_news enable row level security;

create policy "Authenticated users can read match_news"
  on public.match_news for select
  to authenticated
  using (true);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  amount bigint not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_saves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  saved_by_clerk_user_id text not null,
  save_name text not null,
  save_version int not null check (save_version > 0),
  phase public.game_phase not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, save_version)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_touch_updated_at
before update on public.games
for each row execute function public.touch_updated_at();

create or replace function public.requesting_clerk_user_id()
returns text
language sql
stable
security invoker
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1
    from public.game_members gm
    where gm.game_id = target_game_id
      and gm.clerk_user_id = public.requesting_clerk_user_id()
  );
$$;

create or replace function public.append_game_event(
  p_game_id uuid,
  p_type text,
  p_actor_clerk_user_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.game_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_event public.game_events;
begin
  update public.games
  set live_seq = live_seq + 1
  where id = p_game_id
  returning live_seq into v_seq;

  if v_seq is null then
    raise exception 'Game % not found', p_game_id;
  end if;

  insert into public.game_events (game_id, seq, type, actor_clerk_user_id, payload)
  values (p_game_id, v_seq, p_type, p_actor_clerk_user_id, coalesce(p_payload, '{}'::jsonb))
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.append_game_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_game_event(uuid, text, text, jsonb) to service_role;

alter table public.games enable row level security;
alter table public.game_members enable row level security;
alter table public.game_events enable row level security;
alter table public.club_templates enable row level security;
alter table public.clubs enable row level security;
alter table public.players enable row level security;
alter table public.decks enable row level security;
alter table public.club_players enable row level security;
alter table public.draft_rounds enable row level security;
alter table public.scouting_draws enable row level security;
alter table public.staff_cards enable row level security;
alter table public.club_staff enable row level security;
alter table public.staff_offers enable row level security;
alter table public.transfer_offers enable row level security;
alter table public.game_changer_cards enable row level security;
alter table public.club_game_changers enable row level security;
alter table public.investments enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.matches enable row level security;
alter table public.lineups enable row level security;
alter table public.match_events enable row level security;
alter table public.cpu_teams enable row level security;
alter table public.cpu_lineups enable row level security;
alter table public.season_participants enable row level security;
alter table public.fixtures enable row level security;
alter table public.season_standings enable row level security;
alter table public.transactions enable row level security;
alter table public.game_saves enable row level security;

create policy "members can read their games"
on public.games for select
to authenticated
using (public.is_game_member(id) or host_clerk_user_id = public.requesting_clerk_user_id());

create policy "authenticated users can create games"
on public.games for insert
to authenticated
with check (host_clerk_user_id = public.requesting_clerk_user_id());

create policy "hosts can update games"
on public.games for update
to authenticated
using (host_clerk_user_id = public.requesting_clerk_user_id())
with check (host_clerk_user_id = public.requesting_clerk_user_id());

create policy "members can read memberships"
on public.game_members for select
to authenticated
using (
  clerk_user_id = public.requesting_clerk_user_id()
  or exists (
    select 1
    from public.games g
    where g.id = game_members.game_id
      and g.host_clerk_user_id = public.requesting_clerk_user_id()
  )
);

create policy "users can join as themselves"
on public.game_members for insert
to authenticated
with check (
  clerk_user_id = public.requesting_clerk_user_id()
  and exists (
    select 1
    from public.games g
    where g.id = game_members.game_id
      and (g.phase = 'lobby' or g.host_clerk_user_id = public.requesting_clerk_user_id())
  )
);

create policy "users can update their membership"
on public.game_members for update
to authenticated
using (clerk_user_id = public.requesting_clerk_user_id())
with check (clerk_user_id = public.requesting_clerk_user_id());

create policy "members can read game events"
on public.game_events for select
to authenticated
using (public.is_game_member(game_id));

create policy "authenticated users can read club templates"
on public.club_templates for select
to authenticated
using (is_active);

create policy "members can read clubs"
on public.clubs for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can create their club"
on public.clubs for insert
to authenticated
with check (
  clerk_user_id = public.requesting_clerk_user_id()
  and public.is_game_member(game_id)
);

create policy "club managers can update their lobby club"
on public.clubs for update
to authenticated
using (
  clerk_user_id = public.requesting_clerk_user_id()
  and exists (
    select 1
    from public.games g
    where g.id = clubs.game_id
      and g.phase = 'lobby'
  )
)
with check (clerk_user_id = public.requesting_clerk_user_id());

create policy "members can read room players"
on public.players for select
to authenticated
using (visibility in ('room', 'public'));

create policy "members can read decks"
on public.decks for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read club players"
on public.club_players for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.id = club_players.club_id
      and public.is_game_member(c.game_id)
  )
);

create policy "members can read draft rounds"
on public.draft_rounds for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read scouting draws"
on public.scouting_draws for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read staff market"
on public.staff_cards for select
to authenticated
using (visibility in ('room', 'public'));

create policy "members can read club staff"
on public.club_staff for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.id = club_staff.club_id
      and public.is_game_member(c.game_id)
  )
);

create policy "members can read own staff offers"
on public.staff_offers for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.id = staff_offers.club_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
  )
);

create policy "members can insert own staff offers"
on public.staff_offers for insert
to authenticated
with check (
  exists (
    select 1
    from public.clubs c
    where c.id = staff_offers.club_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
  )
);

create policy "members can update own staff offers"
on public.staff_offers for update
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.id = staff_offers.club_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
  )
)
with check (
  exists (
    select 1
    from public.clubs c
    where c.id = staff_offers.club_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
  )
);

create policy "involved managers can read transfer offers"
on public.transfer_offers for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.game_id = transfer_offers.game_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and (c.id = transfer_offers.from_club_id or c.id = transfer_offers.to_club_id)
  )
);

create policy "members can read game changer cards"
on public.game_changer_cards for select
to authenticated
using (visibility in ('room', 'public'));

create policy "members can read club game changers"
on public.club_game_changers for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    where c.id = club_game_changers.club_id
      and public.is_game_member(c.game_id)
  )
);

create policy "members can read investments"
on public.investments for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read auctions"
on public.auctions for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read locked bid presence"
on public.bids for select
to authenticated
using (
  exists (
    select 1
    from public.auctions a
    left join public.clubs c on c.id = bids.club_id
    where a.id = bids.auction_id
      and public.is_game_member(a.game_id)
      and (a.status in ('resolved', 'passed') or c.clerk_user_id = public.requesting_clerk_user_id())
  )
);

create policy "club managers can write their bid"
on public.bids for insert
to authenticated
with check (
  exists (
    select 1
    from public.auctions a
    join public.clubs c on c.id = bids.club_id
    where a.id = bids.auction_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(a.game_id)
  )
);

create policy "club managers can update their bid"
on public.bids for update
to authenticated
using (
  exists (
    select 1
    from public.auctions a
    join public.clubs c on c.id = bids.club_id
    where a.id = bids.auction_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(a.game_id)
  )
)
with check (
  exists (
    select 1
    from public.auctions a
    join public.clubs c on c.id = bids.club_id
    where a.id = bids.auction_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(a.game_id)
  )
);

create policy "members can read matches"
on public.matches for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read lineups after lock"
on public.lineups for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.clubs c on c.id = lineups.club_id
    where m.id = lineups.match_id
      and public.is_game_member(m.game_id)
      and (lineups.locked or c.clerk_user_id = public.requesting_clerk_user_id())
  )
);

create policy "club managers can lock lineups"
on public.lineups for insert
to authenticated
with check (
  exists (
    select 1
    from public.matches m
    join public.clubs c on c.id = lineups.club_id
    where m.id = lineups.match_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(m.game_id)
  )
);

create policy "club managers can update own lineups"
on public.lineups for update
to authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.clubs c on c.id = lineups.club_id
    where m.id = lineups.match_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(m.game_id)
  )
)
with check (
  exists (
    select 1
    from public.matches m
    join public.clubs c on c.id = lineups.club_id
    where m.id = lineups.match_id
      and c.clerk_user_id = public.requesting_clerk_user_id()
      and public.is_game_member(m.game_id)
  )
);

create policy "members can read match events"
on public.match_events for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_events.match_id
      and public.is_game_member(m.game_id)
  )
);

create policy "members can read cpu teams"
on public.cpu_teams for select
to authenticated
using (true);

create policy "members can read cpu lineups"
on public.cpu_lineups for select
to authenticated
using (true);

create policy "members can read season participants"
on public.season_participants for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read fixtures"
on public.fixtures for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read season standings"
on public.season_standings for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read transactions"
on public.transactions for select
to authenticated
using (public.is_game_member(game_id));

create policy "members can read game saves"
on public.game_saves for select
to authenticated
using (public.is_game_member(game_id));

create policy "hosts can create game saves"
on public.game_saves for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_saves.game_id
      and g.host_clerk_user_id = public.requesting_clerk_user_id()
      and game_saves.saved_by_clerk_user_id = public.requesting_clerk_user_id()
  )
);

-- RPC contracts. Implement the full rule mutations in private schema or Edge Functions
-- and expose these stable signatures to the client.

create or replace function public.create_game(room_code text, settings jsonb, display_name text, image_url text, club_template_id text)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_game_id uuid;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint := coalesce((settings ->> 'starting_money')::bigint, 100000000);
  selected_template public.club_templates%rowtype;
begin
  if clerk_id is null then
    raise exception 'unauthorized';
  end if;

  select * into selected_template
  from public.club_templates
  where id = create_game.club_template_id
    and is_active
  limit 1;

  if selected_template.id is null then
    raise exception 'invalid_club_template';
  end if;

  insert into public.games (room_code, settings, host_clerk_user_id, save_name, last_saved_by_clerk_user_id)
  values (upper(room_code), settings, clerk_id, 'Room ' || upper(room_code), clerk_id)
  returning id into new_game_id;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (new_game_id, clerk_id, display_name, image_url, true);

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (new_game_id, clerk_id, selected_template.id, selected_template.name, selected_template.slogan, selected_template.color, display_name, image_url, starting_money);

  insert into public.game_saves (game_id, saved_by_clerk_user_id, save_name, save_version, phase, snapshot)
  values (
    new_game_id,
    clerk_id,
    'Lobby erstellt',
    1,
    'lobby',
    jsonb_build_object(
      'game', (select to_jsonb(g) from public.games g where g.id = new_game_id),
      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.clubs c where c.game_id = new_game_id),
      'members', (select coalesce(jsonb_agg(to_jsonb(gm) order by gm.joined_at), '[]'::jsonb) from public.game_members gm where gm.game_id = new_game_id)
    )
  );

  return new_game_id;
end;
$$;

create or replace function public.join_game(room_code text, display_name text, image_url text, club_template_id text)
returns uuid
language plpgsql
security invoker
as $$
declare
  target_game_id uuid;
  target_game public.games%rowtype;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint;
  selected_template public.club_templates%rowtype;
begin
  if clerk_id is null then
    raise exception 'unauthorized';
  end if;

  select * into target_game
  from public.games
  where games.room_code = upper(join_game.room_code)
  limit 1;

  if target_game.id is null then
    raise exception 'room_not_found';
  end if;

  if target_game.phase <> 'lobby' then
    raise exception 'game_not_in_lobby';
  end if;

  target_game_id := target_game.id;
  starting_money := coalesce((target_game.settings ->> 'starting_money')::bigint, 100000000);

  select * into selected_template
  from public.club_templates
  where id = join_game.club_template_id
    and is_active
  limit 1;

  if selected_template.id is null then
    raise exception 'invalid_club_template';
  end if;

  if exists (
    select 1
    from public.clubs c
    where c.game_id = target_game_id
      and c.club_template_id = selected_template.id
      and c.clerk_user_id <> clerk_id
  ) then
    raise exception 'club_template_taken';
  end if;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (target_game_id, clerk_id, display_name, image_url, target_game.host_clerk_user_id = clerk_id)
  on conflict (game_id, clerk_user_id) do update
    set display_name = excluded.display_name;

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (target_game_id, clerk_id, selected_template.id, selected_template.name, selected_template.slogan, selected_template.color, display_name, image_url, starting_money)
  on conflict (game_id, clerk_user_id) do update
    set club_template_id = excluded.club_template_id,
        club_name = excluded.club_name,
        club_slogan = excluded.club_slogan,
        club_color = excluded.club_color,
        manager_name = excluded.manager_name,
        image_url = excluded.image_url;

  return target_game_id;
end;
$$;

create or replace function public.start_draft(game_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  next_version int;
begin
  update public.games
  set phase = 'draft',
      save_version = save_version + 1,
      last_saved_at = now(),
      last_saved_by_clerk_user_id = public.requesting_clerk_user_id()
  where id = start_draft.game_id
    and host_clerk_user_id = public.requesting_clerk_user_id()
  returning save_version into next_version;

  if next_version is null then
    raise exception 'unauthorized_or_game_not_found';
  end if;

  insert into public.game_saves (game_id, saved_by_clerk_user_id, save_name, save_version, phase, snapshot)
  values (
    start_draft.game_id,
    public.requesting_clerk_user_id(),
    'Spiel gestartet',
    next_version,
    'draft',
    jsonb_build_object(
      'game', (select to_jsonb(g) from public.games g where g.id = start_draft.game_id),
      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.clubs c where c.game_id = start_draft.game_id),
      'members', (select coalesce(jsonb_agg(to_jsonb(gm) order by gm.joined_at), '[]'::jsonb) from public.game_members gm where gm.game_id = start_draft.game_id)
    )
  );
end;
$$;

create or replace function public.save_game_checkpoint(game_id uuid, save_name text default 'Manueller Speicherpunkt')
returns int
language plpgsql
security invoker
as $$
declare
  next_version int;
  target_phase public.game_phase;
begin
  update public.games
  set save_version = save_version + 1,
      last_saved_at = now(),
      last_saved_by_clerk_user_id = public.requesting_clerk_user_id(),
      save_status = 'active'
  where id = save_game_checkpoint.game_id
    and host_clerk_user_id = public.requesting_clerk_user_id()
  returning save_version, phase into next_version, target_phase;

  if next_version is null then
    raise exception 'unauthorized_or_game_not_found';
  end if;

  insert into public.game_saves (game_id, saved_by_clerk_user_id, save_name, save_version, phase, snapshot)
  values (
    save_game_checkpoint.game_id,
    public.requesting_clerk_user_id(),
    coalesce(nullif(save_game_checkpoint.save_name, ''), 'Manueller Speicherpunkt'),
    next_version,
    target_phase,
    jsonb_build_object(
      'game', (select to_jsonb(g) from public.games g where g.id = save_game_checkpoint.game_id),
      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.clubs c where c.game_id = save_game_checkpoint.game_id),
      'members', (select coalesce(jsonb_agg(to_jsonb(gm) order by gm.joined_at), '[]'::jsonb) from public.game_members gm where gm.game_id = save_game_checkpoint.game_id)
    )
  );

  return next_version;
end;
$$;

create or replace function public.make_draft_pick(game_id uuid, club_id uuid, player_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: enforce current turn, 16-player board, and squad limit in a transaction';
end;
$$;

create or replace function public.resolve_training(game_id uuid, club_id uuid, payload jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: enforce training capacity and potential caps';
end;
$$;

create or replace function public.scout_players(game_id uuid, club_id uuid, region text)
returns jsonb
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: draw cards from selected region by scouting level';
end;
$$;

create or replace function public.buy_scouted_player(game_id uuid, club_id uuid, player_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: deduct scouting price and assign player';
end;
$$;

create or replace function public.upgrade_investment(game_id uuid, club_id uuid, action text)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: enforce two actions and no duplicate department';
end;
$$;

create or replace function public.open_auction(game_id uuid, player_id uuid)
returns uuid
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: open next deadline day auction';
end;
$$;

create or replace function public.submit_bid(auction_id uuid, club_id uuid, amount bigint)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.bids (auction_id, club_id, amount, locked)
  values (submit_bid.auction_id, submit_bid.club_id, submit_bid.amount, true)
  on conflict (auction_id, club_id) do update
    set amount = excluded.amount,
        locked = true;
end;
$$;

create or replace function public.resolve_auction(auction_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: resolve highest locked bid and squad-strength tiebreak';
end;
$$;

create or replace function public.lock_lineup(match_id uuid, club_id uuid, formation public.formation, starters jsonb, bench uuid[], captain_boost_zone text)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.lineups (match_id, club_id, formation, starters, bench, captain_boost_zone, locked, locked_at)
  values (lock_lineup.match_id, lock_lineup.club_id, lock_lineup.formation, lock_lineup.starters, lock_lineup.bench, lock_lineup.captain_boost_zone, true, now())
  on conflict (match_id, club_id) do update
    set formation = excluded.formation,
        starters = excluded.starters,
        bench = excluded.bench,
        captain_boost_zone = excluded.captain_boost_zone,
        locked = true,
        locked_at = now();
end;
$$;

create or replace function public.resolve_match(match_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  raise exception 'not_implemented: invoke rules engine equivalent and write result/events atomically';
end;
$$;

insert into public.cpu_teams (content_key, display_name, color, strength_tier)
values
  ('cpu_northbridge', 'Northbridge City', '#2563eb', 'stark'),
  ('cpu_ironvale', 'Ironvale Athletic', '#dc2626', 'stark'),
  ('cpu_lakeside', 'Lakeside Rovers', '#0891b2', 'mittel'),
  ('cpu_mountain', 'Mountain United', '#16a34a', 'schwach'),
  ('cpu_harbor', 'Harbor Town', '#9333ea', 'mittel'),
  ('cpu_desert', 'Desert Falcons', '#d97706', 'schwach')
on conflict (content_key) do update set
  strength_tier = excluded.strength_tier;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 19::numeric, 19::numeric, 19::numeric, 1),
    ('Defensiv',     23::numeric, 19::numeric, 17::numeric, 2),
    ('Offensiv',     17::numeric, 19::numeric, 23::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'stark'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 15::numeric, 15::numeric, 15::numeric, 1),
    ('Defensiv',     19::numeric, 15::numeric, 13::numeric, 2),
    ('Offensiv',     13::numeric, 15::numeric, 19::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'mittel'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 12::numeric, 12::numeric, 12::numeric, 1),
    ('Defensiv',     15::numeric, 12::numeric,  9::numeric, 2),
    ('Offensiv',      9::numeric, 12::numeric, 15::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'schwach'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;

insert into public.staff_cards (content_key, display_name, price, effects, visibility) values
  ('mark_de_man',    'Mark De Man',    10000000, '[{"type":"zone_bonus","zone":"MID","stars":1}]'::jsonb, 'room'),
  ('lastic_tackle',  'Lastic Tackle',  20000000, '[{"type":"zone_bonus","zone":"DEF","stars":2}]'::jsonb, 'room'),
  ('chuck_long',     'Chuck Long',     10000000, '[{"type":"zone_bonus","zone":"ATT","stars":1}]'::jsonb, 'room'),
  ('agil_itty',      'Agil Itty',      10000000, '[{"type":"zone_bonus","zone":"DEF","stars":1}]'::jsonb, 'room'),
  ('tobanks_ofour',  'Tobanks O''Four',40000000, '[{"type":"zone_bonus","zone":"DEF","stars":3}]'::jsonb, 'room'),
  ('line_upread',    'Line Upread',    40000000, '[{"type":"captain_boost_extra","stars":3}]'::jsonb, 'room'),
  ('will_lowbawl',   'Will Lowbawl',   10000000, '[{"type":"auction_discount","amount":5000000}]'::jsonb, 'room'),
  ('hugh_gloves',    'Hugh Gloves',    10000000, '[{"type":"zone_bonus","zone":"DEF","stars":1}]'::jsonb, 'room'),
  ('goldi_gerr',     'Goldi Gerr',     20000000, '[{"type":"attractiveness_bonus","stars":1}]'::jsonb, 'room'),
  ('jet_zetter',     'Jet Zetter',     30000000, '[{"type":"scouting_extra_cards","cards":1}]'::jsonb, 'room'),
  ('sally_recut',    'Sally Recut',    40000000, '[{"type":"wage_multiplier","factor":0.5}]'::jsonb, 'room'),
  ('lev_ellip',      'Lev Ellip',      50000000, '[{"type":"new_signing_star_bonus","stars":1}]'::jsonb, 'room'),
  ('mae_khit',       'Mae Khit',       30000000, '[{"type":"training_player_bonus","players":1}]'::jsonb, 'room'),
  ('roi_surge',      'Roi Surge',      20000000, '[{"type":"season_income_bonus","amount":15000000}]'::jsonb, 'room'),
  ('dwight_price',   'Dwight Price',   30000000, '[{"type":"season_income_bonus","amount":20000000}]'::jsonb, 'room'),
  ('n_ginear',       'N. Ginear',      25000000, '[{"type":"investment_action_bonus","extra":1}]'::jsonb, 'room'),
  ('mira_cleure',    'Mira Cleure',    20000000, '[{"type":"injury_heal_manual","perMatchday":1}]'::jsonb, 'room'),
  ('mimic_shearer',  'Mimic Shearer',  50000000, '[{"type":"status_tier_up","tiers":1}]'::jsonb, 'room'),
  ('tara_p_sessions','Tara P. Sessions',20000000,'[{"type":"zone_bonus","zone":"MID","stars":2}]'::jsonb, 'room'),
  ('tippy_tawway',   'Tippy Tawway',   40000000, '[{"type":"draw_reroll","threshold":8}]'::jsonb, 'room'),
  ('upon_a_wel',     'Upon A. Wel',    30000000, '[{"type":"training_player_bonus","players":1}]'::jsonb, 'room'),
  ('bill_bendjmin',  'Bill Bendjmin',  100000000,'[{"type":"season_income_bonus","amount":50000000}]'::jsonb, 'room'),
  ('alfie_ness',     'Alfie Ness',     40000000, '[{"type":"zone_bonus","zone":"MID","stars":3}]'::jsonb, 'room'),
  ('colly_flowers',  'Colly Flowers',  40000000, '[{"type":"dice_zone_bonus","stars":1}]'::jsonb, 'room'),
  ('chris_crossower','Chris Crossower',10000000, '[{"type":"zone_bonus","zone":"MID","stars":1}]'::jsonb, 'room'),
  ('ellie_captian',  'Ellie Captian',  20000000, '[{"type":"captain_boost_extra","stars":1}]'::jsonb, 'room'),
  ('kip_das_veres',  'Kip Das Veres',  80000000, '[{"type":"scouting_extra_cards","cards":2}]'::jsonb, 'room'),
  ('lacy_strike',    'Lacy Strike',    20000000, '[{"type":"zone_bonus","zone":"ATT","stars":2}]'::jsonb, 'room'),
  ('b_friend',       'B. Friend',      60000000, '[{"type":"chemistry_multiplier","factor":2}]'::jsonb, 'room'),
  ('t_kitaka',       'T. Kitaka',      40000000, '[{"type":"zone_bonus","zone":"ATT","stars":3}]'::jsonb, 'room'),
  ('finn_isher',     'Finn Isher',     10000000, '[{"type":"zone_bonus","zone":"ATT","stars":1}]'::jsonb, 'room')
on conflict (content_key) do update
  set display_name = excluded.display_name,
      price        = excluded.price,
      effects      = excluded.effects,
      visibility   = excluded.visibility;

grant usage on schema public to authenticated;
grant select, insert, update on public.games to authenticated;
grant select, insert, update on public.game_members to authenticated;
grant select on public.game_events to authenticated;
grant select on public.club_templates to authenticated;
grant select, insert, update on public.clubs to authenticated;
grant select on public.players, public.decks, public.club_players, public.draft_rounds, public.scouting_draws to authenticated;
grant select on public.staff_cards, public.club_staff, public.game_changer_cards, public.club_game_changers to authenticated;
grant select, insert, update on public.staff_offers to authenticated;
grant select on public.transfer_offers to authenticated;
grant select on public.investments, public.auctions, public.bids, public.matches, public.lineups, public.match_events, public.transactions to authenticated;
grant select on public.cpu_teams, public.cpu_lineups, public.season_participants, public.fixtures, public.season_standings to authenticated;
grant select on public.continental_cpu_teams, public.continental_cpu_lineups, public.continental_tournaments, public.continental_participants, public.continental_fixtures to authenticated;
grant select, insert on public.game_saves to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clubs'
  ) then
    alter publication supabase_realtime add table public.clubs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_members'
  ) then
    alter publication supabase_realtime add table public.game_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'draft_rounds'
  ) then
    alter publication supabase_realtime add table public.draft_rounds;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scouting_draws'
  ) then
    alter publication supabase_realtime add table public.scouting_draws;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'auctions'
  ) then
    alter publication supabase_realtime add table public.auctions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bids'
  ) then
    alter publication supabase_realtime add table public.bids;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fixtures'
  ) then
    alter publication supabase_realtime add table public.fixtures;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'season_standings'
  ) then
    alter publication supabase_realtime add table public.season_standings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_players'
  ) then
    alter publication supabase_realtime add table public.club_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'investments'
  ) then
    alter publication supabase_realtime add table public.investments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_staff'
  ) then
    alter publication supabase_realtime add table public.club_staff;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_offers'
  ) then
    alter publication supabase_realtime add table public.staff_offers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transfer_offers'
  ) then
    alter publication supabase_realtime add table public.transfer_offers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_news'
  ) then
    alter publication supabase_realtime add table public.match_news;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_game_changers'
  ) then
    alter publication supabase_realtime add table public.club_game_changers;
  end if;
end;
$$;
