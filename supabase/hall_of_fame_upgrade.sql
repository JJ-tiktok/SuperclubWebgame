-- Tracks star rating when the player joined their current club (draft, scouting, transfer).
alter table public.club_players
  add column if not exists stars_at_acquisition numeric(3,1);

-- Backfill: catalog base stars as approximation for existing saves.
update public.club_players cp
set stars_at_acquisition = p.base_stars
from public.players p
where cp.player_id = p.id
  and cp.stars_at_acquisition is null;

alter table public.club_players
  alter column stars_at_acquisition set not null;

comment on column public.club_players.stars_at_acquisition is
  'Star rating when the player joined the current club (reset on transfer).';
