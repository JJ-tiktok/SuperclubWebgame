-- Game Changer Cards v4 upgrade
-- Adds active "match cards" (secret-weapon family) with timing windows + draw weighting.
-- Safe to run multiple times.

-- 1. game_changer_cards: draw weighting + play window for active match cards
alter table public.game_changer_cards
  add column if not exists draw_weight int not null default 1,
  add column if not exists play_window text
    check (play_window in ('before_match', 'during_match', 'after_match'));

-- 2. club_game_changers: track in which window a card was played (1 per window/match)
alter table public.club_game_changers
  add column if not exists applied_window text;

-- 3. fixtures: derby day suppression + retroactive win bookkeeping
alter table public.fixtures
  add column if not exists derby_day boolean not null default false,
  add column if not exists retro_win_used boolean not null default false,
  add column if not exists retro_win_result jsonb;
