-- Poaching unhappy players: separate request flow + season-long bench lock.

alter table public.club_players
  add column if not exists unavailable_until_season int;

comment on column public.club_players.unavailable_until_season is
  'When set, player is unavailable for lineup until this season number (inclusive).';

create table if not exists public.poach_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  from_club_id uuid not null references public.clubs(id) on delete cascade,
  to_club_id uuid not null references public.clubs(id) on delete cascade,
  target_club_player_id uuid not null references public.club_players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete restrict,
  cash_amount bigint not null default 0 check (cash_amount >= 0),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_club_id <> to_club_id)
);

create unique index if not exists poach_requests_open_buyer_target_unique
  on public.poach_requests (from_club_id, target_club_player_id)
  where status = 'open';

create unique index if not exists poach_requests_season_pair_unique
  on public.poach_requests (game_id, season_number, from_club_id, to_club_id)
  where status in ('open', 'accepted', 'declined');

create index if not exists poach_requests_game_season_idx
  on public.poach_requests (game_id, season_number, created_at desc);

create index if not exists poach_requests_to_club_season_idx
  on public.poach_requests (to_club_id, season_number, created_at desc);

alter table public.poach_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'poach_requests'
      and policyname = 'members can read poach requests'
  ) then
    create policy "members can read poach requests"
    on public.poach_requests for select
    to authenticated
    using (public.is_game_member(game_id));
  end if;
end $$;

grant select on public.poach_requests to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'poach_requests'
  ) then
    alter publication supabase_realtime add table public.poach_requests;
  end if;
end $$;
