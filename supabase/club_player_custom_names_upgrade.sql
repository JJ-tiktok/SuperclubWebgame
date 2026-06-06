alter table public.club_players
  add column if not exists custom_name text;

alter table public.club_players
  drop constraint if exists club_players_custom_name_length_check;

alter table public.club_players
  add constraint club_players_custom_name_length_check
  check (custom_name is null or char_length(custom_name) <= 32);
