-- Sponsoring system: catalog + club contracts
-- Safe to run multiple times.

create table if not exists public.sponsor_deals (
  id text primary key,
  prestige_tier text not null check (prestige_tier in ('newly_promoted', 'established', 'mid_table', 'title_contender')),
  display_name text not null,
  task_description text not null,
  flavor_text text not null default '',
  objective_type text not null,
  objective_config jsonb not null default '{}'::jsonb,
  duration_seasons int not null check (duration_seasons between 1 and 3),
  reward_type text not null,
  reward_config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table if not exists public.club_sponsor_contracts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  deal_id text not null references public.sponsor_deals(id),
  prestige_tier text not null check (prestige_tier in ('newly_promoted', 'established', 'mid_table', 'title_contender')),
  status text not null default 'active' check (status in ('active', 'completed', 'failed', 'awaiting_reward_pick')),
  signed_season int not null,
  ends_season int not null,
  seasons_elapsed int not null default 0,
  progress jsonb not null default '{}'::jsonb,
  reward_payload jsonb,
  resolved_season int,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, prestige_tier)
);

create unique index if not exists club_sponsor_contracts_one_active_idx
  on public.club_sponsor_contracts (club_id)
  where status = 'active';

create index if not exists club_sponsor_contracts_club_status_idx
  on public.club_sponsor_contracts (club_id, status);

alter table public.club_sponsor_contracts enable row level security;

drop policy if exists "members can read club sponsor contracts" on public.club_sponsor_contracts;
create policy "members can read club sponsor contracts"
  on public.club_sponsor_contracts for select
  to authenticated
  using (
    exists (
      select 1 from public.clubs c
      where c.id = club_sponsor_contracts.club_id
        and public.is_game_member(c.game_id)
    )
  );

grant select on public.sponsor_deals to authenticated;
grant select on public.club_sponsor_contracts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_sponsor_contracts'
  ) then
    alter publication supabase_realtime add table public.club_sponsor_contracts;
  end if;
end $$;
