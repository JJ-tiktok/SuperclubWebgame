-- CPU teams: strength tiers + tier-specific lineups (3 styles per team).
-- Safe to run multiple times. Existing fixtures may still reference old lineup UUIDs
-- if sort_order 4–5 rows were removed — re-create season schedule for dev/test games.

alter table public.cpu_teams
  add column if not exists strength_tier text not null default 'schwach';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cpu_teams_strength_tier_check'
  ) then
    alter table public.cpu_teams
      add constraint cpu_teams_strength_tier_check
      check (strength_tier in ('stark', 'mittel', 'schwach'));
  end if;
end $$;

update public.cpu_teams set strength_tier = 'stark' where content_key in ('cpu_northbridge', 'cpu_ironvale');
update public.cpu_teams set strength_tier = 'mittel' where content_key in ('cpu_lakeside', 'cpu_harbor');
update public.cpu_teams set strength_tier = 'schwach' where content_key in ('cpu_mountain', 'cpu_desert');

-- Remove legacy 5-style lineups (sort_order 4–5) and old display names at 1–3.
delete from public.cpu_lineups
where sort_order > 3
   or display_name in ('Balanced', 'Low Block', 'Midfield Press', 'Front Foot', 'Wild Card');

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 19::numeric, 19::numeric, 19::numeric, 1),
    ('Defensiv',     23::numeric, 19::numeric, 17::numeric, 2),
    ('Offensiv',     17::numeric, 19::numeric, 23::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'stark'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 15::numeric, 15::numeric, 15::numeric, 1),
    ('Defensiv',     19::numeric, 15::numeric, 13::numeric, 2),
    ('Offensiv',     13::numeric, 15::numeric, 19::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'mittel'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;

insert into public.cpu_lineups (cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.cpu_teams t
cross join (
  values
    ('Ausgeglichen', 12::numeric, 12::numeric, 12::numeric, 1),
    ('Defensiv',     15::numeric, 12::numeric,  9::numeric, 2),
    ('Offensiv',      9::numeric, 12::numeric, 15::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.strength_tier = 'schwach'
on conflict (cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;
