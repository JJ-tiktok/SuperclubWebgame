-- Realtime Broadcast Upgrade
-- Stellt Live-Updates von `postgres_changes` (teuer: WAL/RLS-Replikation pro Tabelle)
-- auf Supabase Realtime "Broadcast from Database" um.
--
-- Idee: `append_game_event` sendet das frisch geschriebene Event zusaetzlich per
-- `realtime.send(...)` an das Topic `game:<game_id>`. Clients abonnieren einen
-- privaten Broadcast-Channel statt auf `game_events`-INSERTs zu lauschen.
--
-- Der Broadcast ist best-effort: schlaegt er fehl (z. B. alte Realtime-Version),
-- bleibt der Kern-Write (Event-Insert + live_seq) trotzdem erfolgreich.
--
-- Aktivierung im Frontend: NEXT_PUBLIC_REALTIME_BROADCAST=1 setzen, nachdem dieses
-- Skript im Supabase SQL-Editor ausgefuehrt wurde.

create or replace function public.append_game_event(
  p_game_id uuid,
  p_type text,
  p_actor_clerk_user_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.game_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_event public.game_events;
begin
  update public.games
  set live_seq = live_seq + 1
  where id = p_game_id
  returning live_seq into v_seq;

  if v_seq is null then
    raise exception 'Game % not found', p_game_id;
  end if;

  insert into public.game_events (game_id, seq, type, actor_clerk_user_id, payload)
  values (p_game_id, v_seq, p_type, p_actor_clerk_user_id, coalesce(p_payload, '{}'::jsonb))
  returning * into v_event;

  -- Best-effort low-latency broadcast. Niemals den Kern-Write blockieren.
  begin
    perform realtime.send(
      jsonb_build_object(
        'id', v_event.id,
        'game_id', v_event.game_id,
        'seq', v_event.seq,
        'type', v_event.type,
        'actor_clerk_user_id', v_event.actor_clerk_user_id,
        'payload', v_event.payload,
        'created_at', v_event.created_at
      ),
      'game_event',
      'game:' || v_event.game_id::text,
      true
    );
  exception
    when others then
      -- Broadcast nicht verfuegbar/fehlgeschlagen: ignorieren, Clients fallen auf
      -- postgres_changes / Snapshot-Polling zurueck.
      null;
  end;

  return v_event;
end;
$$;

revoke all on function public.append_game_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_game_event(uuid, text, text, jsonb) to service_role;

-- RLS fuer den privaten Channel `game:<game_id>`: nur Mitglieder eines Spiels
-- duerfen das Topic abonnieren (Broadcast UND Presence laufen ueber denselben
-- Channel, daher wird nicht nach extension gefiltert).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'realtime' and table_name = 'messages'
  ) then
    drop policy if exists "game members receive broadcasts" on realtime.messages;
    create policy "game members receive broadcasts"
      on realtime.messages
      for select
      to authenticated
      using (
        public.is_game_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
      );

    drop policy if exists "game members send presence" on realtime.messages;
    create policy "game members send presence"
      on realtime.messages
      for insert
      to authenticated
      with check (
        public.is_game_member(nullif(split_part(realtime.topic(), ':', 2), '')::uuid)
      );
  end if;
end;
$$;
