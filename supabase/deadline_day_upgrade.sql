alter table public.auctions
  add column if not exists season_number int not null default 1,
  add column if not exists auction_index int not null default 0,
  add column if not exists current_bid_club_id uuid references public.clubs(id) on delete set null,
  add column if not exists current_amount bigint not null default 0,
  add column if not exists turn_started_at timestamptz,
  add column if not exists passed_club_ids uuid[] not null default '{}',
  add column if not exists bid_order_club_ids uuid[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'auctions_auction_index_check'
  ) then
    alter table public.auctions
      add constraint auctions_auction_index_check check (auction_index >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'auctions_current_amount_check'
  ) then
    alter table public.auctions
      add constraint auctions_current_amount_check check (current_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'auctions_game_season_index_key'
  ) then
    alter table public.auctions
      add constraint auctions_game_season_index_key unique (game_id, season_number, auction_index);
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
end;
$$;
