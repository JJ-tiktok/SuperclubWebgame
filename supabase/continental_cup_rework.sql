-- Continental Cup rework: CPU strength tiers on participants, formation index on fixtures.

alter table public.continental_participants
  add column if not exists cpu_strength_tier text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'continental_participants_cpu_strength_tier_check'
  ) then
    alter table public.continental_participants
      add constraint continental_participants_cpu_strength_tier_check
      check (
        cpu_strength_tier is null
        or cpu_strength_tier in ('underdog', 'schwer', 'sehr_schwer', 'elite')
      );
  end if;
end $$;

alter table public.continental_fixtures
  add column if not exists home_cpu_formation_index smallint,
  add column if not exists away_cpu_formation_index smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'continental_fixtures_home_cpu_formation_index_check'
  ) then
    alter table public.continental_fixtures
      add constraint continental_fixtures_home_cpu_formation_index_check
      check (home_cpu_formation_index is null or home_cpu_formation_index between 0 and 2);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'continental_fixtures_away_cpu_formation_index_check'
  ) then
    alter table public.continental_fixtures
      add constraint continental_fixtures_away_cpu_formation_index_check
      check (away_cpu_formation_index is null or away_cpu_formation_index between 0 and 2);
  end if;
end $$;
