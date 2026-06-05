-- Performance hotfix indexes for long-running multiplayer sessions.
-- Run this from the Supabase SQL editor when the database is responsive again.
-- These indexes target the snapshot loader and realtime recovery paths.

create index if not exists clubs_game_created_at_idx
  on public.clubs (game_id, created_at);

create index if not exists game_members_game_joined_at_idx
  on public.game_members (game_id, joined_at);

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

create index if not exists club_sponsor_contracts_club_created_at_idx
  on public.club_sponsor_contracts (club_id, created_at);

create index if not exists transfer_offers_game_season_status_idx
  on public.transfer_offers (game_id, season_number, status);

create index if not exists transfer_offers_from_club_season_idx
  on public.transfer_offers (from_club_id, season_number, created_at desc);

create index if not exists transfer_offers_to_club_season_idx
  on public.transfer_offers (to_club_id, season_number, created_at desc);
