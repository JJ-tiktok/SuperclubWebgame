-- Champions League / Continental Cup upgrade
-- Safe to run multiple times.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'game_phase' and e.enumlabel = 'champions_league'
  ) then
    alter type public.game_phase add value 'champions_league';
  end if;
end $$;

create table if not exists public.continental_cpu_teams (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  color text not null default '#52525b',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.continental_cpu_lineups (
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

create table if not exists public.continental_tournaments (
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

create table if not exists public.continental_participants (
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

create table if not exists public.continental_fixtures (
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

insert into public.continental_cpu_teams (content_key, display_name, color) values
  ('cl_metro_lisbon', 'Metro Lisbon', '#1d4ed8'),
  ('cl_alpine_vienna', 'Alpine Vienna', '#dc2626'),
  ('cl_nordic_star', 'Nordic Star Oslo', '#0891b2'),
  ('cl_prague_united', 'Prague United', '#7c3aed'),
  ('cl_benelux_city', 'Benelux City', '#ea580c'),
  ('cl_rhine_royals', 'Rhine Royals', '#16a34a'),
  ('cl_atlas_casablanca', 'Atlas Casablanca', '#ca8a04'),
  ('cl_balkan_lions', 'Balkan Lions', '#be123c'),
  ('cl_channel_fc', 'Channel FC', '#2563eb'),
  ('cl_iberia_elite', 'Iberia Elite', '#b91c1c'),
  ('cl_danube_fc', 'Danube FC', '#0d9488'),
  ('cl_celtic_crown', 'Celtic Crown', '#15803d'),
  ('cl_mediterraneo', 'Mediterraneo SC', '#0284c7'),
  ('cl_black_sea', 'Black Sea Athletic', '#4b5563'),
  ('cl_alpine_zurich', 'Alpine Zurich', '#1e40af'),
  ('cl_lowlands_ajax', 'Lowlands Ajax', '#dc2626'),
  ('cl_eastern_gate', 'Eastern Gate', '#9333ea'),
  ('cl_atlantic_porto', 'Atlantic Porto', '#0369a1'),
  ('cl_central_belgrade', 'Central Belgrade', '#ef4444'),
  ('cl_scandinavia_red', 'Scandinavia Red', '#991b1b'),
  ('cl_roman_legion', 'Roman Legion', '#b45309'),
  ('cl_germania_berlin', 'Germania Berlin', '#ffffff'),
  ('cl_french_capital', 'French Capital', '#1e3a8a'),
  ('cl_london_elite', 'London Elite', '#052e16'),
  ('cl_milan_royal', 'Milan Royal', '#f59e0b'),
  ('cl_munich_titans', 'Munich Titans', '#dc2626'),
  ('cl_warsaw_union', 'Warsaw Union', '#dc2626'),
  ('cl_helsinki_ice', 'Helsinki Ice', '#0ea5e9'),
  ('cl_glasgow_hoops', 'Glasgow Hoops', '#166534'),
  ('cl_sevilla_sun', 'Sevilla Sun', '#f97316'),
  ('cl_budapest_heroes', 'Budapest Heroes', '#7f1d1d'),
  ('cl_copenhagen_north', 'Copenhagen North', '#1d4ed8')
on conflict (content_key) do nothing;

insert into public.continental_cpu_lineups (continental_cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.continental_cpu_teams t
cross join (
  values
    ('Ausgeglichen', 24::numeric, 24::numeric, 24::numeric, 1),
    ('Defensiv',     28::numeric, 24::numeric, 22::numeric, 2),
    ('Offensiv',     22::numeric, 24::numeric, 28::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
on conflict (continental_cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;
