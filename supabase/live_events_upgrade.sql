alter table public.games
  add column if not exists live_seq bigint not null default 0;

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seq bigint not null,
  type text not null,
  actor_clerk_user_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

create index if not exists game_events_game_seq_idx
on public.game_events (game_id, seq);

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

  return v_event;
end;
$$;

revoke all on function public.append_game_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_game_event(uuid, text, text, jsonb) to service_role;

alter table public.game_events enable row level security;

drop policy if exists "members can read game events" on public.game_events;
create policy "members can read game events"
on public.game_events for select
to authenticated
using (public.is_game_member(game_id));

grant select on public.game_events to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'draft_rounds'
  ) then
    alter publication supabase_realtime add table public.draft_rounds;
  end if;
end $$;
