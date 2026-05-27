-- Game Changer v2 upgrade
-- Run this in the Supabase SQL editor against your live project.

-- 1. game_changer_cards: add category + description
alter table public.game_changer_cards
  add column if not exists category text not null default 'secret_weapon'
    check (category in ('good_news', 'bad_news', 'secret_weapon')),
  add column if not exists description text not null default '';

-- Backfill: map existing timing values to categories as a best-guess
update public.game_changer_cards
  set category = case
    when timing = 'before_match' then 'secret_weapon'
    when timing = 'during_match' then 'secret_weapon'
    when timing = 'after_match'  then 'good_news'
    else 'secret_weapon'
  end
where category = 'secret_weapon'; -- only update rows that are still at default

update public.game_changer_cards
  set description = display_name
where description = '';

-- 2. club_game_changers: add fixture tracking columns
alter table public.club_game_changers
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists applied_third int;

-- 3. fixtures: add match-state / step-by-step columns
alter table public.fixtures
  add column if not exists match_state text not null default 'scheduled'
    check (match_state in ('scheduled', 'in_progress', 'completed')),
  add column if not exists current_third int not null default 0,
  add column if not exists home_ready_for_next_third boolean not null default false,
  add column if not exists away_ready_for_next_third boolean not null default false,
  add column if not exists partial_result jsonb;

-- Backfill: existing completed fixtures
update public.fixtures
  set match_state = 'completed'
where status = 'completed';

-- 4. match_news table
create table if not exists public.match_news (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  fixture_id uuid references public.fixtures(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  category text not null check (category in ('good_news', 'bad_news', 'secret_weapon', 'injury')),
  headline text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- RLS for match_news
alter table public.match_news enable row level security;

create policy "Authenticated users can read match_news"
  on public.match_news for select
  to authenticated
  using (true);

-- 5. Realtime publications
do $$
begin
  begin
    alter publication supabase_realtime add table public.match_news;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.club_game_changers;
  exception when duplicate_object then null;
  end;
end $$;
