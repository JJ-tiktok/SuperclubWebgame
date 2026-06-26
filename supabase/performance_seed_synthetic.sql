-- Performance-Seed: erzeugt ein EIGENSTAENDIGES, synthetisches Benchmark-Spiel.
--
-- Zweck: Den Zustand "viele Saisons gespielt + mehrere Manager" kuenstlich
-- nachbilden, um die Performance der Snapshot-Loader und Hot-Queries zu testen,
-- OHNE den echten Spielstand anzufassen.
--
-- Sicherheit:
--   * Es wird ein separates Spiel mit eigenem room_code (Default 'PERF-01') angelegt.
--   * Ein erneuter Lauf loescht das vorherige Benchmark-Spiel zuerst (idempotent).
--   * Entfernen: supabase/performance_seed_teardown.sql ausfuehren
--     (oder: delete from public.games where room_code = 'PERF-01'; -> cascade).
--
-- Anwendung: Werte im DECLARE-Block anpassen und im Supabase SQL-Editor ausfuehren.

do $$
declare
  -- ===== Konfiguration (hier anpassen) =====
  v_room_code      text := 'PERF-01';  -- Room-Code des Benchmark-Spiels
  v_managers       int  := 6;          -- Anzahl menschlicher Manager (Clubs)
  v_squad          int  := 22;         -- Spieler pro Club
  v_seasons        int  := 8;          -- Simulierte Saisons (-> aktuelle Saison = v_seasons)
  v_train_per_club int  := 1500;       -- Trainings-Transaktionen pro Club (ueber alle Saisons verteilt)
  v_sales_per_club int  := 150;        -- Verkaufs-Transaktionen pro Club
  v_events         int  := 5000;       -- game_events insgesamt
  v_news           int  := 2000;       -- match_news insgesamt
  -- =========================================

  v_game_id uuid;
  v_now     timestamptz := now();
  v_player_pool int;
  i int;
  v_club_id uuid;
begin
  select count(*) into v_player_pool from public.players;
  if v_player_pool = 0 then
    raise exception 'Keine Spieler in public.players gefunden - Basisdaten erst seeden.';
  end if;
  if v_player_pool < v_squad then
    raise notice 'Nur % Spieler im Pool, Kadergroesse wird darauf begrenzt.', v_player_pool;
  end if;

  -- Vorherigen Benchmark-Lauf entfernen (cascade loescht alle abhaengigen Zeilen).
  delete from public.games where room_code = v_room_code;

  insert into public.games (room_code, phase, settings, host_clerk_user_id, save_name, last_saved_by_clerk_user_id)
  values (
    v_room_code,
    'off_season',
    jsonb_build_object(
      'season_number', v_seasons,
      'starting_money', 120000000,
      'squad_max_size', 23,
      'sponsoring_enabled', true,
      'archetypes_enabled', true
    ),
    'perf-host',
    'PERF Benchmark (' || v_room_code || ')',
    'perf-host'
  )
  returning id into v_game_id;

  -- ---- Manager: Clubs + Mitgliedschaften + Kader ----
  for i in 1..v_managers loop
    insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_color, manager_name, money, season_rank)
    values (v_game_id, 'perf-bot-' || i, null, 'Perf Bot ' || i, '#3366cc', 'Manager ' || i, 120000000, i)
    returning id into v_club_id;

    insert into public.game_members (game_id, clerk_user_id, display_name, is_host)
    values (v_game_id, 'perf-bot-' || i, 'Manager ' || i, i = 1);

    insert into public.club_players (club_id, player_id, current_stars, current_zone, stars_at_acquisition, seasons_at_club)
    select v_club_id, p.id, p.base_stars, 'bench', p.base_stars, 1
    from (select id, base_stars from public.players order by random() limit v_squad) p
    on conflict (club_id, player_id) do nothing;
  end loop;

  -- ---- transactions: Training (ueber alle Saisons verteilt) ----
  insert into public.transactions (game_id, club_id, amount, reason, metadata, created_at)
  select
    v_game_id,
    c.id,
    0,
    'training',
    jsonb_build_object(
      '_perf_seed', true,
      'season_number', 1 + (gs % v_seasons),
      'club_player_id', gen_random_uuid(),
      'player_id', gen_random_uuid(),
      'before_stars', 2,
      'after_stars', 3,
      'dice_roll', 4,
      'success', true,
      'training_level', 2,
      'game_phase', 'offseason_training'
    ),
    v_now - ((gs) || ' minutes')::interval
  from public.clubs c
  cross join generate_series(1, v_train_per_club) gs
  where c.game_id = v_game_id;

  -- ---- transactions: Verkaeufe ----
  insert into public.transactions (game_id, club_id, amount, reason, metadata, created_at)
  select
    v_game_id,
    c.id,
    5000000,
    'player_sale',
    jsonb_build_object('_perf_seed', true, 'season_number', 1 + (gs % v_seasons), 'player_id', gen_random_uuid()),
    v_now - ((gs) || ' minutes')::interval
  from public.clubs c
  cross join generate_series(1, v_sales_per_club) gs
  where c.game_id = v_game_id;

  -- ---- game_events ----
  insert into public.game_events (game_id, seq, type, payload, created_at)
  select v_game_id, gs, 'PERF_EVENT', jsonb_build_object('_perf_seed', true), v_now - ((gs) || ' seconds')::interval
  from generate_series(1, v_events) gs;
  update public.games set live_seq = v_events where id = v_game_id;

  -- ---- match_news ----
  insert into public.match_news (game_id, category, headline, detail, created_at)
  select v_game_id, 'good_news', 'Perf News ' || gs, 'Synthetische Benchmark-Meldung', v_now - ((gs) || ' seconds')::interval
  from generate_series(1, v_news) gs;

  -- ---- season_participants (Mensch + CPU) je Saison ----
  insert into public.season_participants (game_id, season_number, kind, club_id, cpu_team_id, display_name)
  select v_game_id, s.season_number, 'human', c.id, null, c.club_name
  from public.clubs c
  cross join generate_series(1, v_seasons) s(season_number)
  where c.game_id = v_game_id;

  insert into public.season_participants (game_id, season_number, kind, club_id, cpu_team_id, display_name)
  select v_game_id, s.season_number, 'cpu', null, t.id, t.display_name
  from public.cpu_teams t
  cross join generate_series(1, v_seasons) s(season_number)
  where t.active;

  -- ---- fixtures: einfache Hin-Runde je Saison, historisch abgeschlossen ----
  insert into public.fixtures (
    game_id, season_number, matchday, home_participant_id, away_participant_id,
    status, match_state, home_score, away_score, completed_at
  )
  select v_game_id, h.season_number, h.rnk, h.id, a.id, 'completed', 'completed', 2, 1, v_now
  from (
    select id, season_number, row_number() over (partition by season_number order by id) as rnk
    from public.season_participants where game_id = v_game_id
  ) h
  join (
    select id, season_number, row_number() over (partition by season_number order by id) as rnk
    from public.season_participants where game_id = v_game_id
  ) a on a.season_number = h.season_number and a.rnk > h.rnk;

  -- ---- season_standings: eine Zeile je Teilnehmer/Saison ----
  insert into public.season_standings (
    game_id, season_number, participant_id, played, wins, draws, losses, match_points, rank
  )
  select
    v_game_id,
    sp.season_number,
    sp.id,
    10, 5, 2, 3, 17,
    row_number() over (partition by sp.season_number order by sp.id)
  from public.season_participants sp
  where sp.game_id = v_game_id;

  -- ---- Kader-Cache (squad_stars/size) aktualisieren ----
  update public.clubs c
  set squad_stars = coalesce(s.stars, 0),
      squad_size  = coalesce(s.cnt, 0)
  from (
    select cp.club_id, sum(cp.current_stars)::int as stars, count(*)::int as cnt
    from public.club_players cp
    join public.clubs cc on cc.id = cp.club_id
    where cc.game_id = v_game_id
    group by cp.club_id
  ) s
  where c.id = s.club_id;

  raise notice 'Benchmark-Spiel % erstellt (game_id=%): % Manager, % Saisons.', v_room_code, v_game_id, v_managers, v_seasons;
end;
$$;

-- Kontrolle: Zeilenzahlen des Benchmark-Spiels
select 'transactions' as t, count(*) from public.transactions x join public.games g on g.id = x.game_id where g.room_code = 'PERF-01'
union all select 'game_events', count(*) from public.game_events x join public.games g on g.id = x.game_id where g.room_code = 'PERF-01'
union all select 'match_news', count(*) from public.match_news x join public.games g on g.id = x.game_id where g.room_code = 'PERF-01'
union all select 'fixtures', count(*) from public.fixtures x join public.games g on g.id = x.game_id where g.room_code = 'PERF-01'
union all select 'club_players', count(*) from public.club_players x join public.clubs c on c.id = x.club_id join public.games g on g.id = c.game_id where g.room_code = 'PERF-01'
union all select 'clubs', count(*) from public.clubs x join public.games g on g.id = x.game_id where g.room_code = 'PERF-01'
order by 2 desc;
