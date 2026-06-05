-- Endgame infrastructure: Medical Center, Analytics Hub, Youth Academy (NLZ), Construction Yard

alter table public.clubs
  add column if not exists medical_center_level int not null default 0 check (medical_center_level between 0 and 3),
  add column if not exists analytics_hub_level int not null default 0 check (analytics_hub_level between 0 and 3),
  add column if not exists youth_academy_level int not null default 0 check (youth_academy_level between 0 and 3),
  add column if not exists construction_yard_built boolean not null default false,
  add column if not exists medical_heals_used_season int not null default 0 check (medical_heals_used_season >= 0),
  add column if not exists nlz_archetype_respecs_used_season int not null default 0 check (nlz_archetype_respecs_used_season >= 0);

alter table public.investments drop constraint if exists investments_action_check;

alter table public.investments
  add constraint investments_action_check
  check (action in (
    'training', 'scouting', 'stadium', 'staff',
    'medical', 'analytics', 'youth_academy', 'construction_yard'
  ));
