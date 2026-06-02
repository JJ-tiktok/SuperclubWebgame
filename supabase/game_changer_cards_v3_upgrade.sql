-- Game Changer Cards v3 upgrade
-- Adds pending choice + persistent effect infrastructure for the full 44-card catalog.
-- Safe to run multiple times.

-- 1. club_game_changers: pending/choice/resolved metadata
alter table public.club_game_changers
  add column if not exists status text not null default 'resolved'
    check (status in ('pending', 'resolved', 'consumed', 'expired')),
  add column if not exists choice_payload jsonb,
  add column if not exists resolved_payload jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists season_number int not null default 1;

-- Existing rows (auto-applied or secret weapons) are treated as resolved
update public.club_game_changers
  set status = 'resolved'
  where status is null;

-- 2. club_pending_effects: tickende Effekte mit Scope
create table if not exists public.club_pending_effects (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null default 1,
  effect_type text not null,
  payload jsonb not null default '{}'::jsonb,
  scope text not null check (scope in ('next_match', 'next_transfer', 'next_offseason', 'current_offseason', 'this_season')),
  consumed_at timestamptz,
  fixture_id uuid references public.fixtures(id) on delete set null,
  source_club_game_changer_id uuid references public.club_game_changers(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists club_pending_effects_club_scope_idx
  on public.club_pending_effects (club_id, scope)
  where consumed_at is null;

alter table public.club_pending_effects enable row level security;

drop policy if exists "members can read club pending effects" on public.club_pending_effects;
create policy "members can read club pending effects"
  on public.club_pending_effects for select
  to authenticated
  using (
    exists (
      select 1
      from public.clubs c
      where c.id = club_pending_effects.club_id
        and public.is_game_member(c.game_id)
    )
  );

-- 3. club_players: erweiterter Verletzungsstatus (matchday- oder season-long)
-- injured_until_matchday: NULL = nicht verletzt, > 0 = bis einschliesslich dieser Matchday, -1 = season-long
alter table public.club_players
  add column if not exists injured_until_matchday int;

-- Backfill: bestehende "injured" Spieler werden als one-match-injury markiert
update public.club_players
  set injured_until_matchday = 0
  where injured = true and injured_until_matchday is null;

-- 4. clubs: temporaere Status-Overrides und Stadium-Caps
alter table public.clubs
  add column if not exists status_override text,
  add column if not exists status_override_until_season int,
  add column if not exists stadium_level_cap int,
  add column if not exists stadium_level_cap_until_season int;

-- 5. Realtime publication for new table
do $$
begin
  begin
    alter publication supabase_realtime add table public.club_pending_effects;
  exception when duplicate_object then null;
  end;
end $$;

-- 6. grant SELECT to authenticated
grant select on public.club_pending_effects to authenticated;

-- 7. match_news: link to club_game_changers for UI effect correlation
alter table public.match_news
  add column if not exists club_game_changer_id uuid references public.club_game_changers(id) on delete set null;
