-- Captain Boost upgrade
-- Adds a per-club captain assignment (the player who receives the placement-based
-- captain boost). `captain_boost_rank` already exists on public.clubs.
-- Safe to run multiple times.

alter table public.clubs
  add column if not exists captain_club_player_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clubs_captain_club_player_id_fkey'
  ) then
    alter table public.clubs
      add constraint clubs_captain_club_player_id_fkey
      foreign key (captain_club_player_id) references public.club_players(id) on delete set null;
  end if;
end $$;
