-- Performance diagnostics for a long-running savegame.
-- Replace the room code in the first CTE and run from the Supabase SQL editor.

with target_game as (
  select id, room_code, phase, settings, live_seq, updated_at
  from public.games
  where room_code = 'ABC-12'
  limit 1
)
select 'games' as table_name, count(*)::bigint as rows
from target_game
union all
select 'clubs', count(*) from public.clubs c join target_game g on g.id = c.game_id
union all
select 'club_players', count(*) from public.club_players cp join public.clubs c on c.id = cp.club_id join target_game g on g.id = c.game_id
union all
select 'game_events', count(*) from public.game_events ge join target_game g on g.id = ge.game_id
union all
select 'transactions', count(*) from public.transactions t join target_game g on g.id = t.game_id
union all
select 'match_news', count(*) from public.match_news mn join target_game g on g.id = mn.game_id
union all
select 'fixtures', count(*) from public.fixtures f join target_game g on g.id = f.game_id
union all
select 'transfer_offers', count(*) from public.transfer_offers tf join target_game g on g.id = tf.game_id
order by rows desc;

with target_game as (
  select id
  from public.games
  where room_code = 'ABC-12'
  limit 1
)
select reason, count(*) as rows, min(created_at) as oldest, max(created_at) as newest
from public.transactions t
join target_game g on g.id = t.game_id
group by reason
order by rows desc;

with target_game as (
  select id
  from public.games
  where room_code = 'ABC-12'
  limit 1
)
select type, count(*) as rows, min(seq) as first_seq, max(seq) as last_seq
from public.game_events ge
join target_game g on g.id = ge.game_id
group by type
order by rows desc;

with target_game as (
  select id
  from public.games
  where room_code = 'ABC-12'
  limit 1
)
select c.club_name, c.squad_size, c.squad_stars, count(cp.id)::integer as actual_size, coalesce(sum(cp.current_stars), 0)::integer as actual_stars
from public.clubs c
join target_game g on g.id = c.game_id
left join public.club_players cp on cp.club_id = c.id
group by c.id, c.club_name, c.squad_size, c.squad_stars
order by c.club_name;
