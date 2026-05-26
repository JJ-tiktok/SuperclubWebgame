alter type public.formation add value if not exists '5-3-2';

create table if not exists public.cpu_teams (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  display_name text not null,
  color text not null default '#52525b',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cpu_lineups (
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

create table if not exists public.season_participants (
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

create table if not exists public.fixtures (
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
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),
  home_score int,
  away_score int,
  home_third_points numeric(3,1),
  away_third_points numeric(3,1),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (game_id, season_number, matchday, home_participant_id, away_participant_id),
  check (home_participant_id <> away_participant_id)
);

create table if not exists public.season_standings (
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

alter table public.cpu_teams enable row level security;
alter table public.cpu_lineups enable row level security;
alter table public.season_participants enable row level security;
alter table public.fixtures enable row level security;
alter table public.season_standings enable row level security;

drop policy if exists "members can read cpu teams" on public.cpu_teams;
create policy "members can read cpu teams"
on public.cpu_teams for select
to authenticated
using (true);

drop policy if exists "members can read cpu lineups" on public.cpu_lineups;
create policy "members can read cpu lineups"
on public.cpu_lineups for select
to authenticated
using (true);

drop policy if exists "members can read season participants" on public.season_participants;
create policy "members can read season participants"
on public.season_participants for select
to authenticated
using (public.is_game_member(game_id));

drop policy if exists "members can read fixtures" on public.fixtures;
create policy "members can read fixtures"
on public.fixtures for select
to authenticated
using (public.is_game_member(game_id));

drop policy if exists "members can read season standings" on public.season_standings;
create policy "members can read season standings"
on public.season_standings for select
to authenticated
using (public.is_game_member(game_id));

grant select on public.cpu_teams, public.cpu_lineups, public.season_participants, public.fixtures, public.season_standings to authenticated;

insert into public.cpu_teams (content_key, display_name, color)
values
  ('cpu_northbridge', 'Northbridge City', '#2563eb'),
  ('cpu_ironvale', 'Ironvale Athletic', '#dc2626'),
  ('cpu_lakeside', 'Lakeside Rovers', '#0891b2'),
  ('cpu_mountain', 'Mountain United', '#16a34a'),
  ('cpu_harbor', 'Harbor Town', '#9333ea'),
  ('cpu_desert', 'Desert Falcons', '#d97706')
on conflict (content_key) do nothing;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, lineup.display_name, lineup.def_stars, lineup.mid_stars, lineup.att_stars, lineup.sort_order
from public.cpu_teams t
cross join (
  values
    ('Balanced', 8, 8, 8, 1),
    ('Low Block', 11, 7, 6, 2),
    ('Midfield Press', 7, 11, 6, 3),
    ('Front Foot', 6, 8, 10, 4),
    ('Wild Card', 9, 6, 9, 5)
) as lineup(display_name, def_stars, mid_stars, att_stars, sort_order)
on conflict (cpu_team_id, sort_order) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fixtures'
  ) then
    alter publication supabase_realtime add table public.fixtures;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'season_standings'
  ) then
    alter publication supabase_realtime add table public.season_standings;
  end if;
end $$;
