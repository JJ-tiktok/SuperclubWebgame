-- Incremental upgrade for existing Supabase projects that already applied schema.sql.
-- Run this once in the Supabase SQL editor before testing saved games.

alter table public.game_members
  add column if not exists phase_done boolean not null default false,
  add column if not exists phase_done_at timestamptz;

alter table public.players
  add column if not exists role text,
  add column if not exists nationality text,
  add column if not exists age integer,
  add column if not exists age_group text not null default 'prime',
  add column if not exists eligible_positions public.player_position[] not null default '{}',
  add column if not exists skill_max numeric(3,1) not null default 5,
  add column if not exists veteran_fallback numeric(3,1),
  add column if not exists chemistry_left boolean not null default false,
  add column if not exists chemistry_right boolean not null default false,
  add column if not exists chemistry_symbol text not null default 'star',
  add column if not exists card_tier text not null default 'standard',
  add column if not exists card_theme text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_age_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_age_check check (age is null or age > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_age_group_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_age_group_check check (age_group in ('talent', 'prime', 'veteran'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_skill_max_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_skill_max_check check (skill_max > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_veteran_fallback_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_veteran_fallback_check check (veteran_fallback is null or veteran_fallback >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_chemistry_left_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_chemistry_left_check check (chemistry_left in (true, false));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_chemistry_right_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_chemistry_right_check check (chemistry_right in (true, false));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_chemistry_symbol_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_chemistry_symbol_check check (chemistry_symbol in ('star', 'dot', 'link'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_card_tier_check' and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_card_tier_check check (card_tier in ('standard', 'rare', 'epic', 'legend', 'veteran'));
  end if;
end;
$$;

create table if not exists public.club_templates (
  id text primary key,
  name text not null unique,
  slogan text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  tailwind text not null,
  vibe text not null,
  sort_order int not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.club_templates (id, name, slogan, color, tailwind, vibe, sort_order)
values
  ('vanguard', 'Vanguard FC', 'From Assets to Icons.', '#0f172a', 'slate-900', 'Cleaner, korporativer Look fuer kuehle Strategie, Struktur und Professionalitaet.', 1),
  ('golden_meadow', 'Golden Meadow United', 'Where Talents Turn into Stars.', '#047857', 'emerald-700', 'Sattes Akademie-Gruen fuer Ausbildung, Entwicklung und junge Toptalente.', 2),
  ('apex_river', 'Apex River United', 'The Perfect Chemistry.', '#0f766e', 'teal-700', 'Moderne, fliessende Synergie-Farbe fuer perfekte Kaderchemie.', 3),
  ('dynamo_draft', 'FC Dynamo Draft', 'Calculated Chaos, Maximum Yield.', '#d97706', 'amber-600', 'Aggressiver Markt- und Auktionsclub mit lautem, dynamischem Auftritt.', 4),
  ('blackwood', 'Blackwood Athletic', 'Built on Solid Ground.', '#27272a', 'zinc-800', 'Dunkel, edel und unnachgiebig mit Stadion- und Traditionsfokus.', 5),
  ('crimson_cape', 'Crimson Cape FC', 'Fortune Favors the Bold.', '#be123c', 'rose-700', 'Leidenschaft, Risiko und Wuerfelmagie in tiefem Karmesinrot.', 6)
on conflict (id) do update
set name = excluded.name,
    slogan = excluded.slogan,
    color = excluded.color,
    tailwind = excluded.tailwind,
    vibe = excluded.vibe,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.club_templates enable row level security;

drop policy if exists "authenticated users can read club templates" on public.club_templates;
create policy "authenticated users can read club templates"
on public.club_templates for select
to authenticated
using (is_active);

grant select on public.club_templates to authenticated;

alter table public.clubs
  add column if not exists club_template_id text references public.club_templates(id),
  add column if not exists club_slogan text,
  add column if not exists club_color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clubs_club_color_check'
      and conrelid = 'public.clubs'::regclass
  ) then
    alter table public.clubs
      add constraint clubs_club_color_check check (club_color is null or club_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end;
$$;

create unique index if not exists clubs_game_template_unique
on public.clubs (game_id, club_template_id)
where club_template_id is not null;

alter table public.games
  add column if not exists save_name text not null default 'Superclub Spielstand',
  add column if not exists save_status text not null default 'active',
  add column if not exists save_version int not null default 1,
  add column if not exists last_saved_at timestamptz not null default now(),
  add column if not exists last_saved_by_clerk_user_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_save_status_check'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_save_status_check check (save_status in ('active', 'paused', 'completed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_save_version_check'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_save_version_check check (save_version > 0);
  end if;
end;
$$;

create table if not exists public.game_saves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  saved_by_clerk_user_id text not null,
  save_name text not null,
  save_version int not null check (save_version > 0),
  phase public.game_phase not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, save_version)
);

alter table public.game_saves enable row level security;

drop policy if exists "members can read game saves" on public.game_saves;
create policy "members can read game saves"
on public.game_saves for select
to authenticated
using (public.is_game_member(game_id));

drop policy if exists "hosts can create game saves" on public.game_saves;
create policy "hosts can create game saves"
on public.game_saves for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_saves.game_id
      and g.host_clerk_user_id = public.requesting_clerk_user_id()
      and game_saves.saved_by_clerk_user_id = public.requesting_clerk_user_id()
  )
);

create or replace function public.save_game_checkpoint(game_id uuid, save_name text default 'Manueller Speicherpunkt')
returns int
language plpgsql
security invoker
as $$
declare
  next_version int;
  target_phase public.game_phase;
begin
  update public.games
  set save_version = save_version + 1,
      last_saved_at = now(),
      last_saved_by_clerk_user_id = public.requesting_clerk_user_id(),
      save_status = 'active'
  where id = save_game_checkpoint.game_id
    and host_clerk_user_id = public.requesting_clerk_user_id()
  returning save_version, phase into next_version, target_phase;

  if next_version is null then
    raise exception 'unauthorized_or_game_not_found';
  end if;

  insert into public.game_saves (game_id, saved_by_clerk_user_id, save_name, save_version, phase, snapshot)
  values (
    save_game_checkpoint.game_id,
    public.requesting_clerk_user_id(),
    coalesce(nullif(save_game_checkpoint.save_name, ''), 'Manueller Speicherpunkt'),
    next_version,
    target_phase,
    jsonb_build_object(
      'game', (select to_jsonb(g) from public.games g where g.id = save_game_checkpoint.game_id),
      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.clubs c where c.game_id = save_game_checkpoint.game_id),
      'members', (select coalesce(jsonb_agg(to_jsonb(gm) order by gm.joined_at), '[]'::jsonb) from public.game_members gm where gm.game_id = save_game_checkpoint.game_id)
    )
  );

  return next_version;
end;
$$;

grant select, insert on public.game_saves to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_members'
  ) then
    alter publication supabase_realtime add table public.game_members;
  end if;
end;
$$;

drop function if exists public.create_game(text, jsonb, text, text, text);
drop function if exists public.join_game(text, text, text, text);

create or replace function public.create_game(room_code text, settings jsonb, display_name text, image_url text, club_template_id text)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_game_id uuid;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint := coalesce((settings ->> 'starting_money')::bigint, 100000000);
  selected_template public.club_templates%rowtype;
begin
  if clerk_id is null then
    raise exception 'unauthorized';
  end if;

  select * into selected_template
  from public.club_templates
  where id = create_game.club_template_id
    and is_active
  limit 1;

  if selected_template.id is null then
    raise exception 'invalid_club_template';
  end if;

  insert into public.games (room_code, settings, host_clerk_user_id, save_name, last_saved_by_clerk_user_id)
  values (upper(room_code), settings, clerk_id, 'Room ' || upper(room_code), clerk_id)
  returning id into new_game_id;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (new_game_id, clerk_id, display_name, image_url, true);

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (new_game_id, clerk_id, selected_template.id, selected_template.name, selected_template.slogan, selected_template.color, display_name, image_url, starting_money);

  insert into public.game_saves (game_id, saved_by_clerk_user_id, save_name, save_version, phase, snapshot)
  values (
    new_game_id,
    clerk_id,
    'Lobby erstellt',
    1,
    'lobby',
    jsonb_build_object(
      'game', (select to_jsonb(g) from public.games g where g.id = new_game_id),
      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.clubs c where c.game_id = new_game_id),
      'members', (select coalesce(jsonb_agg(to_jsonb(gm) order by gm.joined_at), '[]'::jsonb) from public.game_members gm where gm.game_id = new_game_id)
    )
  );

  return new_game_id;
end;
$$;

create or replace function public.join_game(room_code text, display_name text, image_url text, club_template_id text)
returns uuid
language plpgsql
security invoker
as $$
declare
  target_game_id uuid;
  target_game public.games%rowtype;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint;
  selected_template public.club_templates%rowtype;
begin
  if clerk_id is null then
    raise exception 'unauthorized';
  end if;

  select * into target_game
  from public.games
  where games.room_code = upper(join_game.room_code)
  limit 1;

  if target_game.id is null then
    raise exception 'room_not_found';
  end if;

  if target_game.phase <> 'lobby' then
    raise exception 'game_not_in_lobby';
  end if;

  target_game_id := target_game.id;
  starting_money := coalesce((target_game.settings ->> 'starting_money')::bigint, 100000000);

  select * into selected_template
  from public.club_templates
  where id = join_game.club_template_id
    and is_active
  limit 1;

  if selected_template.id is null then
    raise exception 'invalid_club_template';
  end if;

  if exists (
    select 1
    from public.clubs c
    where c.game_id = target_game_id
      and c.club_template_id = selected_template.id
      and c.clerk_user_id <> clerk_id
  ) then
    raise exception 'club_template_taken';
  end if;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (target_game_id, clerk_id, display_name, image_url, target_game.host_clerk_user_id = clerk_id)
  on conflict (game_id, clerk_user_id) do update
    set display_name = excluded.display_name;

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (target_game_id, clerk_id, selected_template.id, selected_template.name, selected_template.slogan, selected_template.color, display_name, image_url, starting_money)
  on conflict (game_id, clerk_user_id) do update
    set club_template_id = excluded.club_template_id,
        club_name = excluded.club_name,
        club_slogan = excluded.club_slogan,
        club_color = excluded.club_color,
        manager_name = excluded.manager_name,
        image_url = excluded.image_url;

  return target_game_id;
end;
$$;
