create table if not exists public.transfer_offers (
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

create unique index if not exists transfer_offers_open_buyer_target_unique
  on public.transfer_offers (from_club_id, target_club_player_id)
  where status = 'open';

create unique index if not exists transfer_offers_open_offered_player_unique
  on public.transfer_offers (offered_club_player_id)
  where offered_club_player_id is not null and status = 'open';

alter table public.transfer_offers enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'transfer_offers'
      and policyname = 'involved managers can read transfer offers'
  ) then
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
  end if;
end;
$$;

grant select on public.transfer_offers to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transfer_offers'
  ) then
    alter publication supabase_realtime add table public.transfer_offers;
  end if;
end;
$$;
