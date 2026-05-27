alter table public.clubs
  add column if not exists attractiveness_stars int not null default 3 check (attractiveness_stars between 1 and 6);
