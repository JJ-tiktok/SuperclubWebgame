-- Realtime Publication Upgrade
-- Dieses Skript im Supabase SQL-Editor ausführen, um die fehlenden Tabellen
-- zur supabase_realtime-Publication hinzuzufügen.
-- Idempotent: jede Tabelle wird nur hinzugefügt, wenn noch nicht vorhanden.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_players'
  ) then
    alter publication supabase_realtime add table public.club_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'investments'
  ) then
    alter publication supabase_realtime add table public.investments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'club_staff'
  ) then
    alter publication supabase_realtime add table public.club_staff;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_offers'
  ) then
    alter publication supabase_realtime add table public.staff_offers;
  end if;
end;
$$;

-- Ergebnis prüfen: alle publizierten Tabellen anzeigen
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
