-- Performance hotfix indexes for long-running multiplayer sessions.
-- Run this from the Supabase SQL editor when the database is responsive again.
-- These indexes target the snapshot loader and realtime recovery paths.

alter table public.clubs
  add column if not exists squad_stars int not null default 0;

alter table public.clubs
  add column if not exists squad_size int not null default 0;

alter table public.transfer_offers
  add column if not exists parent_offer_id uuid references public.transfer_offers(id) on delete set null,
  add column if not exists created_by_club_id uuid references public.clubs(id) on delete set null,
  add column if not exists responder_club_id uuid references public.clubs(id) on delete set null;

create index if not exists clubs_game_created_at_idx
  on public.clubs (game_id, created_at);

create index if not exists game_members_game_joined_at_idx
  on public.game_members (game_id, joined_at);

create index if not exists game_events_game_seq_desc_idx
  on public.game_events (game_id, seq desc);

create index if not exists game_events_game_created_at_idx
  on public.game_events (game_id, created_at desc);

create index if not exists club_players_club_acquired_at_idx
  on public.club_players (club_id, acquired_at);

create index if not exists club_players_club_zone_slot_idx
  on public.club_players (club_id, current_zone, lineup_slot);

create index if not exists draft_rounds_game_completed_round_idx
  on public.draft_rounds (game_id, completed, round_index desc);

create index if not exists scouting_draws_game_season_club_draw_idx
  on public.scouting_draws (game_id, season_number, club_id, draw_index);

create index if not exists auctions_game_season_index_idx
  on public.auctions (game_id, season_number, auction_index);

create index if not exists bids_auction_created_at_idx
  on public.bids (auction_id, created_at);

create index if not exists fixtures_game_season_matchday_idx
  on public.fixtures (game_id, season_number, matchday);

create index if not exists season_standings_game_season_rank_idx
  on public.season_standings (game_id, season_number, rank);

create index if not exists match_news_game_created_at_idx
  on public.match_news (game_id, created_at desc);

create index if not exists match_news_game_fixture_created_at_idx
  on public.match_news (game_id, fixture_id, created_at desc);

create index if not exists transactions_game_club_reason_created_at_idx
  on public.transactions (game_id, club_id, reason, created_at desc);

create index if not exists transactions_metadata_gin_idx
  on public.transactions using gin (metadata jsonb_path_ops);

create index if not exists club_pending_effects_club_season_open_idx
  on public.club_pending_effects (club_id, season_number, created_at)
  where consumed_at is null;

create index if not exists investments_club_season_created_at_idx
  on public.investments (club_id, season_number, created_at desc);

create index if not exists staff_offers_club_season_status_idx
  on public.staff_offers (club_id, season_number, status);

create index if not exists club_game_changers_club_created_at_idx
  on public.club_game_changers (club_id, created_at);

create index if not exists club_game_changers_club_season_created_at_idx
  on public.club_game_changers (club_id, season_number, created_at);

create index if not exists club_sponsor_contracts_club_created_at_idx
  on public.club_sponsor_contracts (club_id, created_at);

create index if not exists transfer_offers_game_season_status_idx
  on public.transfer_offers (game_id, season_number, status);

create index if not exists transfer_offers_game_season_open_created_at_idx
  on public.transfer_offers (game_id, season_number, created_at desc)
  where status = 'open';

create index if not exists transfer_offers_from_club_season_idx
  on public.transfer_offers (from_club_id, season_number, created_at desc);

create index if not exists transfer_offers_to_club_season_idx
  on public.transfer_offers (to_club_id, season_number, created_at desc);

create index if not exists transfer_offers_created_by_club_season_idx
  on public.transfer_offers (created_by_club_id, season_number, created_at desc);

create index if not exists transfer_offers_responder_club_season_idx
  on public.transfer_offers (responder_club_id, season_number, created_at desc);

-- Backfill the cached squad strength used by the lightweight lobby snapshot.
-- This keeps normal dashboard/lobby reads from recalculating every club from club_players.
update public.clubs c
set
  squad_stars = coalesce(s.stars, 0),
  squad_size = coalesce(s.players, 0)
from (
  select club_id, count(*)::integer as players, sum(current_stars)::integer as stars
  from public.club_players
  group by club_id
) s
where c.id = s.club_id
  and (
    coalesce(c.squad_stars, -1) <> coalesce(s.stars, 0)
    or coalesce(c.squad_size, -1) <> coalesce(s.players, 0)
  );

update public.clubs c
set squad_stars = 0,
    squad_size = 0
where c.squad_stars is null
   or c.squad_size is null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.cleanup_game_performance_history(
  p_game_id uuid,
  p_keep_events integer default 1000,
  p_keep_match_news integer default 50
)
returns table(deleted_game_events integer, deleted_match_news integer)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deleted_events integer := 0;
  v_deleted_news integer := 0;
  v_event_floor bigint;
begin
  select max(seq) - greatest(p_keep_events, 100)
  into v_event_floor
  from public.game_events
  where game_id = p_game_id;

  if v_event_floor is not null then
    delete from public.game_events
    where game_id = p_game_id
      and seq < v_event_floor;
    get diagnostics v_deleted_events = row_count;
  end if;

  delete from public.match_news
  where id in (
    select id
    from (
      select id, row_number() over (order by created_at desc, id desc) as rn
      from public.match_news
      where game_id = p_game_id
    ) ranked
    where rn > greatest(p_keep_match_news, 10)
  );
  get diagnostics v_deleted_news = row_count;

  deleted_game_events := v_deleted_events;
  deleted_match_news := v_deleted_news;
  return next;
end;
$$;

comment on function private.cleanup_game_performance_history(uuid, integer, integer)
is 'Deletes non-rule-critical live/UI history for one savegame. Persistent game state, finance transactions, fixtures and rosters are untouched.';

analyze public.games;
analyze public.clubs;
analyze public.club_players;
analyze public.game_events;
analyze public.transactions;
analyze public.match_news;
