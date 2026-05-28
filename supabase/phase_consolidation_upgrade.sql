-- Phase consolidation upgrade
-- Run this in the Supabase SQL editor against your live project.
-- It is safe to run multiple times.

-- 1. Extend enum game_phase with new values
do $$
begin
  alter type public.game_phase add value if not exists 'off_season';
exception when others then null;
end $$;

do $$
begin
  alter type public.game_phase add value if not exists 'season';
exception when others then null;
end $$;

-- 2. Migrate existing games to the consolidated phases.
-- Note: enum value additions must be committed before they can be used in DML.
-- If this fails, run the alter type statements above in their own transaction first.
update public.games
  set phase = 'off_season'
  where phase in ('offseason_finance', 'offseason_training', 'offseason_scouting', 'offseason_investments');

update public.games
  set phase = 'season'
  where phase in ('prematch', 'match');
