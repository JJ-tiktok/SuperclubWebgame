create table if not exists public.scouting_draws (
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

create unique index if not exists scouting_draws_open_player_unique
  on public.scouting_draws (game_id, season_number, player_id)
  where status = 'drawn';

alter table public.scouting_draws enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scouting_draws'
      and policyname = 'members can read scouting draws'
  ) then
    create policy "members can read scouting draws"
    on public.scouting_draws for select
    to authenticated
    using (public.is_game_member(game_id));
  end if;
end;
$$;

grant select on public.scouting_draws to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scouting_draws'
  ) then
    alter publication supabase_realtime add table public.scouting_draws;
  end if;
end;
$$;
