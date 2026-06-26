-- Realtime Publication Reduce
-- Senkt die WAL/RLS-Last des Realtime-Servers, indem Tabellen aus der
-- supabase_realtime-Publication entfernt werden, die KEIN Client per
-- postgres_changes abonniert. Jede Aenderung in einer publizierten Tabelle wird
-- vom Realtime-Server verarbeitet (inkl. RLS-Pruefung) - auch wenn niemand
-- zuhoert. Das summiert sich in langen Sessions.
--
-- Reihenfolge:
--   1) Abschnitt A jederzeit ausfuehrbar (niemand abonniert diese Tabellen).
--   2) Abschnitt B ERST ausfuehren, nachdem realtime_broadcast_upgrade.sql
--      angewandt UND NEXT_PUBLIC_REALTIME_BROADCAST=1 deployed wurde. Sonst
--      verlieren Clients ohne Broadcast ihre Live-Updates.
--
-- Idempotent: entfernt nur, was vorhanden ist.

-- Abschnitt A: ungenutzte Tabellen (kein Client-Subscriber) ----------------
do $$
declare
  t text;
  unused_tables text[] := array[
    'club_players',
    'transactions',
    'investments',
    'club_staff',
    'staff_offers'
  ];
begin
  foreach t in array unused_tables loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Abschnitt B: game_events (NUR nach Broadcast-Rollout aktivieren) ----------
-- Auskommentiert lassen, bis Broadcast live ist. Dann entkommentieren und
-- ausfuehren, damit game_events nicht mehr doppelt (postgres_changes) repliziert.
--
-- do $$
-- begin
--   if exists (
--     select 1 from pg_publication_tables
--     where pubname = 'supabase_realtime'
--       and schemaname = 'public'
--       and tablename = 'game_events'
--   ) then
--     alter publication supabase_realtime drop table public.game_events;
--   end if;
-- end;
-- $$;

-- Ergebnis pruefen: verbleibende publizierte Tabellen anzeigen
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
