-- Entfernt das synthetische Benchmark-Spiel wieder.
-- Loescht das Spiel anhand des room_code; alle abhaengigen Zeilen (clubs,
-- club_players, transactions, fixtures, game_events, match_news, ...) werden
-- per ON DELETE CASCADE mitentfernt. Der echte Spielstand bleibt unberuehrt.

delete from public.games where room_code = 'PERF-01';

-- Kontrolle (sollte 0 liefern):
select count(*) as remaining_benchmark_games
from public.games
where room_code = 'PERF-01';
