-- Adds runtime feature flags for optional game systems.
-- Safe for existing savegames: only missing keys are filled with the default "enabled" value.

update public.games
set settings = coalesce(settings, '{}'::jsonb)
  || case when settings ? 'sponsoring_enabled' then '{}'::jsonb else jsonb_build_object('sponsoring_enabled', true) end
  || case when settings ? 'archetypes_enabled' then '{}'::jsonb else jsonb_build_object('archetypes_enabled', true) end;

alter table public.games
alter column settings set default jsonb_build_object(
  'max_draft_stars', 3,
  'starting_money', 120000000,
  'squad_draft_size', 16,
  'squad_max_size', 23,
  'season_number', 1,
  'sponsoring_enabled', true,
  'archetypes_enabled', true
);
