-- Last-place manager comeback: allow negative prestige awards (e.g. -3 for worst manager rank).
-- Safe to run multiple times.

alter table public.prestige_awards
  drop constraint if exists prestige_awards_points_check;

alter table public.prestige_awards
  add constraint prestige_awards_points_check check (points <> 0);

comment on column public.prestige_awards.points is
  'Prestige delta for this award; negative values are deductions (e.g. last manager rank).';
