-- Auto-Cleanup Upgrade
-- Exponiert einen public RPC-Wrapper, damit die App die (private)
-- History-Bereinigung aufrufen kann. Die eigentliche Loeschlogik bleibt in
-- private.cleanup_game_performance_history (siehe performance_hotfix_indexes.sql)
-- und entfernt nur nicht-regelkritische Live-/UI-Historie (alte game_events,
-- ueberzaehlige match_news). Persistenter Spielzustand bleibt unangetastet.
--
-- Voraussetzung: performance_hotfix_indexes.sql wurde bereits ausgefuehrt, damit
-- private.cleanup_game_performance_history existiert.

create schema if not exists private;

create or replace function public.run_game_history_cleanup(
  p_game_id uuid,
  p_keep_events integer default 1000,
  p_keep_match_news integer default 50
)
returns table(deleted_game_events integer, deleted_match_news integer)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  select *
  from private.cleanup_game_performance_history(p_game_id, p_keep_events, p_keep_match_news);
end;
$$;

revoke all on function public.run_game_history_cleanup(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.run_game_history_cleanup(uuid, integer, integer) to service_role;

comment on function public.run_game_history_cleanup(uuid, integer, integer)
is 'Service-role wrapper around private.cleanup_game_performance_history for app-triggered history pruning.';
