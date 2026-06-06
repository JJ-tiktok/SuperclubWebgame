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

create index if not exists transfer_offers_parent_offer_id_idx
  on public.transfer_offers (parent_offer_id);

create index if not exists transfer_offers_created_by_club_season_idx
  on public.transfer_offers (created_by_club_id, season_number, created_at desc);

create index if not exists transfer_offers_responder_club_season_idx
  on public.transfer_offers (responder_club_id, season_number, created_at desc);

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
