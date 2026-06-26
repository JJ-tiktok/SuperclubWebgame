-- Prestige system: club philosophy, prestige points ledger, purchase tracking.
-- Safe to run multiple times.

alter table public.clubs
  add column if not exists prestige_points int not null default 0 check (prestige_points >= 0);

alter table public.clubs
  add column if not exists continental_wins int not null default 0 check (continental_wins >= 0);

alter table public.clubs
  add column if not exists philosophy_id text;

alter table public.clubs
  add column if not exists philosophy_fulfilled boolean not null default false;

alter table public.clubs
  add column if not exists prestige_state jsonb not null default '{}'::jsonb;

alter table public.club_players
  add column if not exists purchase_price bigint;

comment on column public.clubs.prestige_points is
  'Accumulated prestige points toward the 100-point win condition.';
comment on column public.clubs.continental_wins is
  'Number of Continental Cup wins; 2 triggers final season.';
comment on column public.clubs.philosophy_id is
  'Chosen club philosophy id (set once in lobby before draft).';
comment on column public.clubs.prestige_state is
  'Progress counters for philosophy goals and prestige tracking.';

create table if not exists public.prestige_awards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null,
  category text not null,
  ref text not null,
  points int not null check (points >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (club_id, category, ref)
);

create index if not exists prestige_awards_game_club_idx
  on public.prestige_awards (game_id, club_id, season_number desc);

create index if not exists prestige_awards_club_created_idx
  on public.prestige_awards (club_id, created_at desc);

alter table public.prestige_awards enable row level security;

drop policy if exists "members can read prestige awards" on public.prestige_awards;
create policy "members can read prestige awards"
  on public.prestige_awards for select
  to authenticated
  using (
    exists (
      select 1 from public.clubs c
      where c.id = prestige_awards.club_id
        and public.is_game_member(c.game_id)
    )
  );

grant select on public.prestige_awards to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prestige_awards'
  ) then
    alter publication supabase_realtime add table public.prestige_awards;
  end if;
end $$;

-- Backfill prestige settings for existing savegames.
update public.games
set settings = coalesce(settings, '{}'::jsonb)
  || case when settings ? 'prestige_enabled' then '{}'::jsonb else jsonb_build_object('prestige_enabled', true) end
  || case when settings ? 'prestige_target' then '{}'::jsonb else jsonb_build_object('prestige_target', 100) end;
