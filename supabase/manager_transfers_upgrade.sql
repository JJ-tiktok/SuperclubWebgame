create table if not exists public.transfer_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  season_number int not null,
  from_club_id uuid not null references public.clubs(id) on delete cascade,
  to_club_id uuid not null references public.clubs(id) on delete cascade,
  parent_offer_id uuid references public.transfer_offers(id) on delete set null,
  created_by_club_id uuid references public.clubs(id) on delete set null,
  responder_club_id uuid references public.clubs(id) on delete set null,
  target_club_player_id uuid not null references public.club_players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete restrict,
  offered_club_player_id uuid references public.club_players(id) on delete set null,
  offered_player_id uuid references public.players(id) on delete restrict,
  cash_amount bigint not null default 0 check (cash_amount >= 0),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled', 'countered', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_club_id <> to_club_id),
  check (
    (offered_club_player_id is null and offered_player_id is null)
    or
    (offered_club_player_id is not null and offered_player_id is not null)
  )
);

alter table public.transfer_offers
  add column if not exists parent_offer_id uuid references public.transfer_offers(id) on delete set null,
  add column if not exists created_by_club_id uuid references public.clubs(id) on delete set null,
  add column if not exists responder_club_id uuid references public.clubs(id) on delete set null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'transfer_offers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%status%'
      and pg_get_constraintdef(con.oid) not like '%countered%'
  loop
    execute format('alter table public.transfer_offers drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'transfer_offers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%countered%'
      and pg_get_constraintdef(con.oid) like '%status%'
  ) then
    alter table public.transfer_offers
      add constraint transfer_offers_status_check
      check (status in ('open', 'accepted', 'declined', 'cancelled', 'countered', 'expired'));
  end if;
end;
$$;

update public.transfer_offers
set
  created_by_club_id = coalesce(created_by_club_id, from_club_id),
  responder_club_id = coalesce(responder_club_id, to_club_id)
where created_by_club_id is null
   or responder_club_id is null;

create unique index if not exists transfer_offers_open_buyer_target_unique
  on public.transfer_offers (from_club_id, target_club_player_id)
  where status = 'open';

create unique index if not exists transfer_offers_open_offered_player_unique
  on public.transfer_offers (offered_club_player_id)
  where offered_club_player_id is not null and status = 'open';

create index if not exists transfer_offers_parent_offer_id_idx
  on public.transfer_offers (parent_offer_id);

create index if not exists transfer_offers_created_by_club_season_idx
  on public.transfer_offers (created_by_club_id, season_number, created_at desc);

create index if not exists transfer_offers_responder_club_season_idx
  on public.transfer_offers (responder_club_id, season_number, created_at desc);

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

-- Keep offered_player_id in sync when offered_club_player_id is cleared (e.g. ON DELETE SET NULL).
update public.transfer_offers
set offered_player_id = null
where offered_club_player_id is null
  and offered_player_id is not null;

create or replace function public.normalize_transfer_offer_offered_player()
returns trigger
language plpgsql
as $$
begin
  new.created_by_club_id := coalesce(new.created_by_club_id, new.from_club_id);
  new.responder_club_id := coalesce(new.responder_club_id, new.to_club_id);
  if new.offered_club_player_id is null then
    new.offered_player_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists transfer_offers_normalize_offered_player on public.transfer_offers;

create trigger transfer_offers_normalize_offered_player
before insert or update on public.transfer_offers
for each row
execute function public.normalize_transfer_offer_offered_player();
