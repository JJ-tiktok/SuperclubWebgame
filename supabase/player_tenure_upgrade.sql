-- Tracks how many completed seasons a player has spent at their current club.
alter table public.club_players
  add column if not exists seasons_at_club int not null default 1;

comment on column public.club_players.seasons_at_club is
  'Number of seasons the player has been at this club (starts at 1 on acquisition).';

create or replace function public.increment_club_player_tenure_for_game(p_game_id uuid)
returns void
language sql
as $$
  update public.club_players cp
  set seasons_at_club = seasons_at_club + 1
  from public.clubs c
  where cp.club_id = c.id
    and c.game_id = p_game_id;
$$;
