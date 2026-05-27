-- Game Changer Cards seed data
-- This file is a placeholder. Replace with concrete cards once the full card list is finalized.
-- Run AFTER game_changer_v2_upgrade.sql so that category + description columns exist.

-- Example Good News card
insert into public.game_changer_cards (content_key, display_name, description, category, timing, effects, visibility)
values
  ('good_news_bonus_income', 'Bonuseinnahmen', 'Dein Verein erhält 10.000.000 € Zusatzeinnahmen.', 'good_news', 'after_match',
   '[{"type":"money_change","amount":10000000}]', 'public')
on conflict (content_key) do update
  set description = excluded.description,
      category    = excluded.category,
      effects     = excluded.effects;

-- Example Bad News card
insert into public.game_changer_cards (content_key, display_name, description, category, timing, effects, visibility)
values
  ('bad_news_fine', 'Strafzahlung', 'Dein Verein muss 5.000.000 € Strafe zahlen.', 'bad_news', 'after_match',
   '[{"type":"money_change","amount":-5000000}]', 'public')
on conflict (content_key) do update
  set description = excluded.description,
      category    = excluded.category,
      effects     = excluded.effects;

-- Example Secret Weapon card
insert into public.game_changer_cards (content_key, display_name, description, category, timing, effects, visibility)
values
  ('secret_weapon_attack_boost', 'Angriffsverstärkung', '+2 Sterne im Angriff für das nächste Drittel.', 'secret_weapon', 'before_match',
   '[{"type":"third_boost","zone":"ATT","stars":2,"for":"self"}]', 'private')
on conflict (content_key) do update
  set description = excluded.description,
      category    = excluded.category,
      effects     = excluded.effects;
