-- Seed sponsor deals catalog (19 deals from public/Sponsoring.csv)
insert into public.sponsor_deals (
  id, prestige_tier, display_name, task_description, flavor_text,
  objective_type, objective_config, duration_seasons, reward_type, reward_config, sort_order
) values
  ('bockwurst_behrens', 'newly_promoted', 'Bockwurt Behrens', 'Gewinne mindestens ein Spiel in der Saison', 'Der lokale Imbiss glaubt an euch. Oder zumindest daran, dass nach Niederlagen mehr gegessen wird.', 'min_wins', '{"min":1}'::jsonb, 1, 'money', '{"amount":10000000}'::jsonb, 1),
  ('autohaus_rumpel', 'newly_promoted', 'Autohaus Rumpel', 'Beende die Saison nicht als Letzter (Gesamttabelle mit CPU)', 'Das Autohaus stellt euch einen Mannschaftsbus — leider riecht er nach Kupplung und die Rücksitze sind ausgebeult, aber er fährt. Meistens.', 'not_last_overall', '{}'::jsonb, 1, 'money', '{"amount":15000000}'::jsonb, 2),
  ('nadidos_basic_deal', 'newly_promoted', 'Nadidos Basic Deal', 'Verpflichte nicht mehr als einen neuen Spieler (Scouting + Deadline Day)', 'Nadidos liefert neue Trikots (Rückläufer aus der Vorsaison). Die Anzahl ist jedoch begrenzt.', 'max_new_signings', '{"max":1}'::jsonb, 1, 'extra_training_unit', '{"count":1}'::jsonb, 3),
  ('dorfsparkasse_kreditprogramm', 'newly_promoted', 'Dorfsparkasse Kreditprogramm', 'Spare nach Ablauf der Off-Season mindestens 40 Mio Budget', 'Die lokale Sparkasse ist beeindruckt von eurem Finanzwesen.', 'min_budget_after_offseason', '{"min":40000000}'::jsonb, 1, 'money', '{"amount":30000000}'::jsonb, 4),
  ('fupa_tv', 'newly_promoted', 'FuPa TV', 'Gewinne mindestens 6 Drittel in einer Saison', 'Ein Fan hat eure schönsten Tore mit seinem Handy gefilmt.', 'min_thirds_won', '{"min":6}'::jsonb, 1, 'status_boost', '{"delta":1,"seasons":1}'::jsonb, 5),
  ('amt_denkmalschutz', 'newly_promoted', 'Amt für Denkmalschutz', 'Baue das Stadion für 3 Saisons nicht aus', 'Das städtische Amt für Denkmalschutz möchte die Kriegsüberreste erhalten.', 'no_stadium_upgrade', '{}'::jsonb, 3, 'stadium_rebuild', '{"stadium_level":3,"status_delta":1,"status_seasons":1}'::jsonb, 6),
  ('nadidos_performance_programm', 'established', 'Nadidos Performance Programm', 'Entwickle in 2 aufeinanderfolgenden Jahren mindestens einen Spieler um +2 Sterne', 'Nadidos will junge, talentierte Spieler fördern.', 'consecutive_player_growth', '{"min_stars":2,"seasons":2}'::jsonb, 2, 'player_potential_boost', '{"stars":1,"pick_count":1}'::jsonb, 1),
  ('global_energy_drink', 'established', 'Global Energy Drink', 'Erziele in der Saison mindestens 3 Siege', 'Der Sponsor verspricht Flügel.', 'min_wins', '{"min":3}'::jsonb, 1, 'money', '{"amount":30000000}'::jsonb, 2),
  ('transfermarkt_de', 'established', 'Transfermarkt.de', 'Verkaufe 2 Saisons lang keinen Spieler', 'Der Sponsor liebt Kontinuität.', 'no_player_sold', '{}'::jsonb, 2, 'extra_scouting_draws', '{"count":2,"scope":"next_offseason"}'::jsonb, 3),
  ('kinoy_to', 'established', 'Kinoy.To', 'Keine Simulation endet unentschieden', 'Deine Spiele werden live verfilmt.', 'no_draws', '{}'::jsonb, 1, 'money', '{"amount":30000000}'::jsonb, 4),
  ('tipicolo', 'established', 'Tipicolo', 'Beende 2 Saisons ohne Sieg', 'Die Buchmacher verdienen sich eine goldene Nase mit eurem Team.', 'seasons_without_win', '{"seasons":2}'::jsonb, 2, 'free_staff', '{}'::jsonb, 5),
  ('nadidos_elite', 'mid_table', 'Nadidos Elite', 'Hol in 2 Saisons in Folge mehr Siege als Niederlagen', 'Nadidos möchte keine Versager im Team.', 'consecutive_win_balance', '{"seasons":2}'::jsonb, 2, 'money_and_scouting', '{"amount":50000000,"scouting_draws":1}'::jsonb, 1),
  ('academy_first', 'mid_table', 'Academy First', 'Verpflichte in 2 Saisons keinen Spieler mit einem Wert über 40 Mio', 'Der neue Sponsor glaubt an die Jugend.', 'max_signing_market_value', '{"max_value":40000000}'::jsonb, 2, 'player_potential_boost', '{"stars":1,"pick_count":2}'::jsonb, 2),
  ('ironwall_insurance', 'mid_table', 'IronWall Insurance', 'Verliere nicht mehr als 2 Spiele', 'Die Versicherung liebt stabile Abwehrreihen.', 'max_losses', '{"max":2}'::jsonb, 1, 'defense_bonus', '{"delta":1,"seasons":1}'::jsonb, 3),
  ('vereinsheim24', 'mid_table', 'Vereinsheim24', 'Halte dein Budget am Saisonende über 50 Mio', 'Der Sponsor liebt solide Finanzen.', 'min_end_budget', '{"min":50000000}'::jsonb, 1, 'money', '{"amount":40000000}'::jsonb, 4),
  ('nadidos_world_class', 'title_contender', 'Nadidos World Class', 'Gewinne 2 Saisons in Folge die Liga (Erster Platz)', 'Nadidos plant bereits die Meisterkollektion.', 'consecutive_league_first', '{"seasons":2}'::jsonb, 2, 'money_and_player_star', '{"amount":100000000,"stars":1}'::jsonb, 1),
  ('megastream_global', 'title_contender', 'MegaStream Global', 'Gegen echte Manager: keine Niederlage in dieser Saison', 'Der Sponsor will internationale Reichweite.', 'no_loss_vs_human', '{}'::jsonb, 1, 'money', '{"amount":50000000}'::jsonb, 2),
  ('future_stars_foundation', 'title_contender', 'Future Stars Foundation', 'Nutze 2 Saisons lang keine eigenen Trainingsanlagen', 'Du stellst deine Trainingsanlagen zur Verfügung.', 'training_facility_locked', '{}'::jsonb, 2, 'player_max_level', '{"potential_stars":1,"max_level_count":1}'::jsonb, 3),
  ('royal_arena_group', 'title_contender', 'Royal Arena Group', 'Baue das Stadion auf das Max-Level aus', 'Die VIPs wollen Ledersitze, Sushi und einen neuen Haarschnitt.', 'reach_max_stadium', '{"level":4}'::jsonb, 1, 'stadium_income_multiplier', '{"factor":2,"seasons":1}'::jsonb, 4)
on conflict (id) do update set
  prestige_tier = excluded.prestige_tier,
  display_name = excluded.display_name,
  task_description = excluded.task_description,
  flavor_text = excluded.flavor_text,
  objective_type = excluded.objective_type,
  objective_config = excluded.objective_config,
  duration_seasons = excluded.duration_seasons,
  reward_type = excluded.reward_type,
  reward_config = excluded.reward_config,
  sort_order = excluded.sort_order;
