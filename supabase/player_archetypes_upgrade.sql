do $$
begin
  create type public.player_archetype as enum ('alpha', 'beta', 'gamma');
exception
  when duplicate_object then null;
end $$;

alter table public.players
  add column if not exists attacker_archetype public.player_archetype,
  add column if not exists defender_archetype public.player_archetype;

with attacker_candidates as (
  select
    id,
    abs(hashtext(coalesce(content_key, id::text) || ':attacker')) as assign_hash,
    abs(hashtext(coalesce(content_key, id::text) || ':attacker_type')) as type_hash
  from public.players
  where
    attacker_archetype is null
    and (
      position = 'ATT'::public.player_position
      or 'ATT'::public.player_position = any(eligible_positions)
    )
)
update public.players p
set attacker_archetype = case (c.type_hash % 3)
  when 0 then 'alpha'::public.player_archetype
  when 1 then 'beta'::public.player_archetype
  else 'gamma'::public.player_archetype
end
from attacker_candidates c
where p.id = c.id
  and (c.assign_hash % 10) < 7;

with defender_candidates as (
  select
    id,
    abs(hashtext(coalesce(content_key, id::text) || ':defender')) as assign_hash,
    abs(hashtext(coalesce(content_key, id::text) || ':defender_type')) as type_hash
  from public.players
  where
    defender_archetype is null
    and (
      position = 'DEF'::public.player_position
      or 'DEF'::public.player_position = any(eligible_positions)
    )
)
update public.players p
set defender_archetype = case (c.type_hash % 3)
  when 0 then 'alpha'::public.player_archetype
  when 1 then 'beta'::public.player_archetype
  else 'gamma'::public.player_archetype
end
from defender_candidates c
where p.id = c.id
  and (c.assign_hash % 10) < 7;
