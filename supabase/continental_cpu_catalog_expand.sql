-- Expands continental CPU catalog to 32 teams (needed when 2 human clubs play → 30 CPU slots).
-- Safe to run multiple times.

insert into public.continental_cpu_teams (content_key, display_name, color) values
  ('cl_warsaw_union', 'Warsaw Union', '#dc2626'),
  ('cl_helsinki_ice', 'Helsinki Ice', '#0ea5e9'),
  ('cl_glasgow_hoops', 'Glasgow Hoops', '#166534'),
  ('cl_sevilla_sun', 'Sevilla Sun', '#f97316'),
  ('cl_budapest_heroes', 'Budapest Heroes', '#7f1d1d'),
  ('cl_copenhagen_north', 'Copenhagen North', '#1d4ed8')
on conflict (content_key) do nothing;

insert into public.continental_cpu_lineups (continental_cpu_team_id, display_name, def_stars, mid_stars, att_stars, sort_order)
select t.id, l.display_name, l.def_stars, l.mid_stars, l.att_stars, l.sort_order
from public.continental_cpu_teams t
cross join (
  values
    ('Ausgeglichen', 24::numeric, 24::numeric, 24::numeric, 1),
    ('Defensiv',     28::numeric, 24::numeric, 22::numeric, 2),
    ('Offensiv',     22::numeric, 24::numeric, 28::numeric, 3)
) as l(display_name, def_stars, mid_stars, att_stars, sort_order)
where t.content_key in (
  'cl_warsaw_union',
  'cl_helsinki_ice',
  'cl_glasgow_hoops',
  'cl_sevilla_sun',
  'cl_budapest_heroes',
  'cl_copenhagen_north'
)
on conflict (continental_cpu_team_id, sort_order) do update set
  display_name = excluded.display_name,
  def_stars = excluded.def_stars,
  mid_stars = excluded.mid_stars,
  att_stars = excluded.att_stars;
