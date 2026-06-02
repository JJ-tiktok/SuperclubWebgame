-- Game Changer Cards v4 seed (aktiv spielbare Match-Karten aus public/gamechanger3.csv)
-- Run nach game_changer_cards_v4_upgrade.sql. Safe to run multiple times.
-- Kategorie 'secret_weapon' mit play_window (before/during/after) + draw_weight (CSV-Mehrfachnennungen).

insert into public.game_changer_cards (content_key, display_name, description, category, timing, play_window, draw_weight, effects, visibility) values
  ('sw_captain_wechsel', 'Captain-Wechsel',
   'Der eigentliche Kapitaen hat die Seitenwahl verloren und direkt die Autoritaet mit abgegeben. Neuer Spielfuehrer, neues Chaos. Aendere deinen Captain Boost nach dem Aufstellungs-Lock.',
   'secret_weapon', 'before_match', 'before_match', 2,
   '[{"type":"captain_reassign","choice":"captain_player"}]'::jsonb, 'private'),

  ('sw_taktischer_vorteil', 'Taktischer Vorteil',
   'Der Praktikant wurde mit Sonnenbrille und Notizblock beim gegnerischen Training gesehen. Komplett unauffaellig. Ein beliebiges Drittel erhaelt +2.',
   'secret_weapon', 'before_match', 'before_match', 3,
   '[{"type":"match_zone_boost","stars":2,"choice":"zone"}]'::jsonb, 'private'),

  ('sw_derby_day', 'Derby Day',
   'Derby ist Derby. Taktik, Datenanalyse und Matchplan bleiben draussen. Alle Zusatzeffekte fallen fuer beide Teams weg: Key Staff, Captain Boost, Secret Weapons.',
   'secret_weapon', 'before_match', 'before_match', 2,
   '[{"type":"derby_day"}]'::jsonb, 'private'),

  ('sw_plan_b', 'Plan B',
   'Der Trainer zieht einen zerknitterten Zettel aus der Tasche. Ploetzlich spielt der Linksverteidiger auf der Zehn. Du darfst deine Aufstellung nach dem Lock nochmal aendern und neu einlocken.',
   'secret_weapon', 'before_match', 'before_match', 3,
   '[{"type":"lineup_reopen"}]'::jsonb, 'private'),

  ('sw_manndeckung_spezial', 'Manndeckung Spezial',
   'Dein Verteidiger klebt am Stuermer wie Kaugummi unter der Auswechselbank. Waehle einen Verteidiger: pro Stern verliert der Gegner 2 Sterne im Angriff.',
   'secret_weapon', 'before_match', 'before_match', 1,
   '[{"type":"man_marking","per_star_attack_penalty":2,"choice":"defender"}]'::jsonb, 'private'),

  ('sw_dirty_tackle', 'Dirty Tackle',
   'Der Co-Trainer nennt es robuste Zweikampffuehrung. Der Schiedsrichter nennt es bitte verlassen Sie das Vereinsgelaende. Verletze einen beliebigen gegnerischen Spieler fuer den Rest der Saison.',
   'secret_weapon', 'before_match', 'before_match', 1,
   '[{"type":"injure_opponent","duration":"season","choice":"opponent_player"}]'::jsonb, 'private'),

  ('sw_sieg_oder_spielabbruch', 'Sieg oder Spielabbruch',
   'Die Vereinsfuehrung legt Protest ein. Begruendung: Der Ball war komisch, der Wind war unfair und ueberhaupt. Zwei Versuche mit einem W6 - eine 6 dreht die Niederlage nachtraeglich in einen Sieg.',
   'secret_weapon', 'after_match', 'after_match', 1,
   '[{"type":"retroactive_win_attempt","attempts":2,"faces":6,"success":6}]'::jsonb, 'private'),

  ('sw_var', 'VAR',
   'Drei Minuten Linienpruefung, acht Kameraeinstellungen und am Ende weiss keiner mehr, worum es ging. Beide Spieler muessen das zuletzt gespielte Drittel neu wuerfeln.',
   'secret_weapon', 'during_match', 'during_match', 1,
   '[{"type":"var_reroll"}]'::jsonb, 'private'),

  ('sw_magic_ice_spray', 'Magic Ice Spray',
   'Der Physio sprueht einmal drauf und murmelt: Das ist jetzt wieder gut. Medizinisch fragwuerdig, sportlich wertvoll. Ein verletzter Spieler wird geheilt.',
   'secret_weapon', 'during_match', 'during_match', 1,
   '[{"type":"heal_injury_choice"}]'::jsonb, 'private'),

  ('sw_topstuermer', 'Topstuermer',
   'Der Stuermer hat heute diesen Blick. Entweder Hattrick oder rote Karte. Erstmal gibt es +2 Angriff.',
   'secret_weapon', 'during_match', 'during_match', 1,
   '[{"type":"match_zone_boost","zone":"ATT","stars":2}]'::jsonb, 'private'),

  ('sw_mittelfeld_star', 'Mittelfeld-Star',
   'Ploetzlich spielt einer Paesse, die sogar der eigene Trainer versteht. Das Mittelfeld bekommt +2.',
   'secret_weapon', 'during_match', 'during_match', 1,
   '[{"type":"match_zone_boost","zone":"MID","stars":2}]'::jsonb, 'private'),

  ('sw_beast_mode', 'Beast Mode',
   'Der Innenverteidiger gewinnt Kopfballduelle, Einwuerfe und wahrscheinlich auch Steuerpruefungen. Abwehr +2.',
   'secret_weapon', 'during_match', 'during_match', 1,
   '[{"type":"match_zone_boost","zone":"DEF","stars":2}]'::jsonb, 'private')
on conflict (content_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  category     = excluded.category,
  timing       = excluded.timing,
  play_window  = excluded.play_window,
  draw_weight  = excluded.draw_weight,
  effects      = excluded.effects,
  visibility   = excluded.visibility;
