-- ──────────────────────────────────────────────────────────────────────────────
-- Staff System Upgrade
-- Fuehre dieses Script einmalig im Supabase SQL-Editor aus.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. staff_offers Tabelle erstellen
create table if not exists public.staff_offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_number int not null,
  offered_card_ids uuid[] not null,
  chosen_card_id uuid references public.staff_cards(id),
  status text not null default 'open' check (status in ('open', 'resolved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 2. Unique-Index: nur ein offenes Angebot pro Club pro Saison
create unique index if not exists staff_offers_open_per_club
  on public.staff_offers (club_id, season_number)
  where status = 'open';

-- 3. RLS aktivieren
alter table public.staff_offers enable row level security;

-- 4. RLS-Policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_offers' and policyname = 'members can read own staff offers'
  ) then
    create policy "members can read own staff offers"
    on public.staff_offers for select
    to authenticated
    using (
      exists (
        select 1 from public.clubs c
        where c.id = staff_offers.club_id
          and c.clerk_user_id = public.requesting_clerk_user_id()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_offers' and policyname = 'members can insert own staff offers'
  ) then
    create policy "members can insert own staff offers"
    on public.staff_offers for insert
    to authenticated
    with check (
      exists (
        select 1 from public.clubs c
        where c.id = staff_offers.club_id
          and c.clerk_user_id = public.requesting_clerk_user_id()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'staff_offers' and policyname = 'members can update own staff offers'
  ) then
    create policy "members can update own staff offers"
    on public.staff_offers for update
    to authenticated
    using (
      exists (
        select 1 from public.clubs c
        where c.id = staff_offers.club_id
          and c.clerk_user_id = public.requesting_clerk_user_id()
      )
    )
    with check (
      exists (
        select 1 from public.clubs c
        where c.id = staff_offers.club_id
          and c.clerk_user_id = public.requesting_clerk_user_id()
      )
    );
  end if;
end;
$$;

-- 5. Grants
grant select, insert, update on public.staff_offers to authenticated;

-- 6. Seed: alle 31 Mitarbeiterkarten
insert into public.staff_cards (content_key, display_name, price, effects, visibility) values
  ('mark_de_man',    'Mark De Man',     10000000, '[{"type":"zone_bonus","zone":"MID","stars":1}]'::jsonb, 'room'),
  ('lastic_tackle',  'Lastic Tackle',   20000000, '[{"type":"zone_bonus","zone":"DEF","stars":2}]'::jsonb, 'room'),
  ('chuck_long',     'Chuck Long',      10000000, '[{"type":"zone_bonus","zone":"ATT","stars":1}]'::jsonb, 'room'),
  ('agil_itty',      'Agil Itty',       10000000, '[{"type":"zone_bonus","zone":"DEF","stars":1}]'::jsonb, 'room'),
  ('tobanks_ofour',  'Tobanks O''Four', 40000000, '[{"type":"zone_bonus","zone":"DEF","stars":3}]'::jsonb, 'room'),
  ('line_upread',    'Line Upread',     40000000, '[{"type":"captain_boost_extra","stars":3}]'::jsonb, 'room'),
  ('will_lowbawl',   'Will Lowbawl',    10000000, '[{"type":"auction_discount","amount":5000000}]'::jsonb, 'room'),
  ('hugh_gloves',    'Hugh Gloves',     10000000, '[{"type":"zone_bonus","zone":"DEF","stars":1}]'::jsonb, 'room'),
  ('goldi_gerr',     'Goldi Gerr',      20000000, '[{"type":"attractiveness_bonus","stars":1}]'::jsonb, 'room'),
  ('jet_zetter',     'Jet Zetter',      30000000, '[{"type":"scouting_extra_cards","cards":1}]'::jsonb, 'room'),
  ('sally_recut',    'Sally Recut',     40000000, '[{"type":"wage_multiplier","factor":0.5}]'::jsonb, 'room'),
  ('lev_ellip',      'Lev Ellip',       50000000, '[{"type":"new_signing_star_bonus","stars":1}]'::jsonb, 'room'),
  ('mae_khit',       'Mae Khit',        30000000, '[{"type":"training_player_bonus","players":1}]'::jsonb, 'room'),
  ('roi_surge',      'Roi Surge',       20000000, '[{"type":"season_income_bonus","amount":15000000}]'::jsonb, 'room'),
  ('dwight_price',   'Dwight Price',    30000000, '[{"type":"season_income_bonus","amount":20000000}]'::jsonb, 'room'),
  ('n_ginear',       'N. Ginear',       25000000, '[{"type":"investment_action_bonus","extra":1}]'::jsonb, 'room'),
  ('mira_cleure',    'Mira Cleure',     20000000, '[{"type":"injury_heal_manual","perMatchday":1}]'::jsonb, 'room'),
  ('mimic_shearer',  'Mimic Shearer',   50000000, '[{"type":"status_tier_up","tiers":1}]'::jsonb, 'room'),
  ('tara_p_sessions','Tara P. Sessions',20000000, '[{"type":"zone_bonus","zone":"MID","stars":2}]'::jsonb, 'room'),
  ('tippy_tawway',   'Tippy Tawway',    40000000, '[{"type":"draw_reroll","threshold":8}]'::jsonb, 'room'),
  ('upon_a_wel',     'Upon A. Wel',     30000000, '[{"type":"training_player_bonus","players":1}]'::jsonb, 'room'),
  ('bill_bendjmin',  'Bill Bendjmin',  100000000, '[{"type":"season_income_bonus","amount":50000000}]'::jsonb, 'room'),
  ('alfie_ness',     'Alfie Ness',      40000000, '[{"type":"zone_bonus","zone":"MID","stars":3}]'::jsonb, 'room'),
  ('colly_flowers',  'Colly Flowers',   40000000, '[{"type":"dice_zone_bonus","stars":1}]'::jsonb, 'room'),
  ('chris_crossower','Chris Crossower', 10000000, '[{"type":"zone_bonus","zone":"MID","stars":1}]'::jsonb, 'room'),
  ('ellie_captian',  'Ellie Captian',   20000000, '[{"type":"captain_boost_extra","stars":1}]'::jsonb, 'room'),
  ('kip_das_veres',  'Kip Das Veres',   80000000, '[{"type":"scouting_extra_cards","cards":2}]'::jsonb, 'room'),
  ('lacy_strike',    'Lacy Strike',     20000000, '[{"type":"zone_bonus","zone":"ATT","stars":2}]'::jsonb, 'room'),
  ('b_friend',       'B. Friend',       60000000, '[{"type":"chemistry_multiplier","factor":2}]'::jsonb, 'room'),
  ('t_kitaka',       'T. Kitaka',       40000000, '[{"type":"zone_bonus","zone":"ATT","stars":3}]'::jsonb, 'room'),
  ('finn_isher',     'Finn Isher',      10000000, '[{"type":"zone_bonus","zone":"ATT","stars":1}]'::jsonb, 'room')
on conflict (content_key) do update
  set display_name = excluded.display_name,
      price        = excluded.price,
      effects      = excluded.effects,
      visibility   = excluded.visibility;
