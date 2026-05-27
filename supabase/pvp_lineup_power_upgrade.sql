-- PvP Lineup Power Upgrade
-- Fügt 6 nullable Spalten zur fixtures-Tabelle hinzu, die beim Lineup-Lock gespeichert werden.
-- Nach dem Lock beider Seiten können beide Manager die gegnerische Stärke sehen.
-- Im Supabase SQL-Editor ausführen.

alter table public.fixtures
  add column if not exists home_locked_def int,
  add column if not exists home_locked_mid int,
  add column if not exists home_locked_att int,
  add column if not exists away_locked_def int,
  add column if not exists away_locked_mid int,
  add column if not exists away_locked_att int;
