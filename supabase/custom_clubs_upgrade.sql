-- Custom clubs in lobby selection.
-- App-side Server Actions are the primary path, but these legacy RPCs now accept
-- custom club data as well.

drop function if exists public.create_game(text, jsonb, text, text, text);
drop function if exists public.create_game(text, jsonb, text, text, text, text, text);
drop function if exists public.join_game(text, text, text, text);
drop function if exists public.join_game(text, text, text, text, text, text);

create or replace function public.create_game(
  room_code text,
  settings jsonb,
  display_name text,
  image_url text,
  club_template_id text,
  custom_club_name text default null,
  custom_club_color text default null
)
returns uuid
language plpgsql
security invoker
as $custom_clubs_create_game$
declare
  new_game_id uuid;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint := coalesce((settings ->> 'starting_money')::bigint, 100000000);
  selected_template public.club_templates%rowtype;
  resolved_template_id text;
  resolved_club_name text;
  resolved_club_slogan text;
  resolved_club_color text;
begin
  if clerk_id is null then
    raise exception 'unauthorized';
  end if;

  if create_game.club_template_id is null or create_game.club_template_id = 'custom' then
    resolved_template_id := null;
    resolved_club_name := nullif(btrim(coalesce(custom_club_name, '')), '');
    resolved_club_slogan := null;
    resolved_club_color := upper(btrim(coalesce(custom_club_color, '')));

    if resolved_club_name is null or char_length(resolved_club_name) < 2 then
      raise exception 'invalid_club_name';
    end if;

    if resolved_club_color !~ '^#[0-9A-F]{6}$' then
      raise exception 'invalid_club_color';
    end if;
  else
    select * into selected_template
    from public.club_templates
    where id = create_game.club_template_id
      and is_active
    limit 1;

    if selected_template.id is null then
      raise exception 'invalid_club_template';
    end if;

    resolved_template_id := selected_template.id;
    resolved_club_name := selected_template.name;
    resolved_club_slogan := selected_template.slogan;
    resolved_club_color := selected_template.color;
  end if;

  insert into public.games (room_code, settings, host_clerk_user_id, save_name, last_saved_by_clerk_user_id)
  values (upper(room_code), settings, clerk_id, 'Room ' || upper(room_code), clerk_id)
  returning id into new_game_id;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (new_game_id, clerk_id, display_name, image_url, true);

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (new_game_id, clerk_id, resolved_template_id, resolved_club_name, resolved_club_slogan, resolved_club_color, display_name, image_url, starting_money);

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
$custom_clubs_create_game$;

create or replace function public.join_game(
  room_code text,
  display_name text,
  image_url text,
  club_template_id text,
  custom_club_name text default null,
  custom_club_color text default null
)
returns uuid
language plpgsql
security invoker
as $custom_clubs_join_game$
declare
  target_game_id uuid;
  target_game public.games%rowtype;
  clerk_id text := public.requesting_clerk_user_id();
  starting_money bigint;
  selected_template public.club_templates%rowtype;
  resolved_template_id text;
  resolved_club_name text;
  resolved_club_slogan text;
  resolved_club_color text;
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

  if join_game.club_template_id is null or join_game.club_template_id = 'custom' then
    resolved_template_id := null;
    resolved_club_name := nullif(btrim(coalesce(custom_club_name, '')), '');
    resolved_club_slogan := null;
    resolved_club_color := upper(btrim(coalesce(custom_club_color, '')));

    if resolved_club_name is null or char_length(resolved_club_name) < 2 then
      raise exception 'invalid_club_name';
    end if;

    if resolved_club_color !~ '^#[0-9A-F]{6}$' then
      raise exception 'invalid_club_color';
    end if;
  else
    select * into selected_template
    from public.club_templates
    where id = join_game.club_template_id
      and is_active
    limit 1;

    if selected_template.id is null then
      raise exception 'invalid_club_template';
    end if;

    resolved_template_id := selected_template.id;
    resolved_club_name := selected_template.name;
    resolved_club_slogan := selected_template.slogan;
    resolved_club_color := selected_template.color;
  end if;

  if resolved_template_id is not null and exists (
    select 1
    from public.clubs c
    where c.game_id = target_game_id
      and c.club_template_id = resolved_template_id
      and c.clerk_user_id <> clerk_id
  ) then
    raise exception 'club_template_taken';
  end if;

  if exists (
    select 1
    from public.clubs c
    where c.game_id = target_game_id
      and lower(c.club_name) = lower(resolved_club_name)
      and c.clerk_user_id <> clerk_id
  ) then
    raise exception 'club_name_taken';
  end if;

  insert into public.game_members (game_id, clerk_user_id, display_name, image_url, is_host)
  values (target_game_id, clerk_id, display_name, image_url, target_game.host_clerk_user_id = clerk_id)
  on conflict (game_id, clerk_user_id) do update
    set display_name = excluded.display_name;

  insert into public.clubs (game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, image_url, money)
  values (target_game_id, clerk_id, resolved_template_id, resolved_club_name, resolved_club_slogan, resolved_club_color, display_name, image_url, starting_money)
  on conflict (game_id, clerk_user_id) do update
    set club_template_id = excluded.club_template_id,
        club_name = excluded.club_name,
        club_slogan = excluded.club_slogan,
        club_color = excluded.club_color,
        manager_name = excluded.manager_name,
        image_url = excluded.image_url;

  return target_game_id;
end;
$custom_clubs_join_game$;
