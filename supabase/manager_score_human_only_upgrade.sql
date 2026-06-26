-- Manager score: match points only from human-vs-human fixtures.
alter table public.season_standings
  add column if not exists manager_match_points int not null default 0;

comment on column public.season_standings.manager_match_points is
  'Match points earned only in fixtures where both participants are human managers.';
