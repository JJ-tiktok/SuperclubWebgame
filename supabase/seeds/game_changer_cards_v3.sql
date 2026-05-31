-- Game Changer Cards v3 seed (vollstaendiger Katalog aus public/gamechanger2.csv)
-- Run nach game_changer_cards_v3_upgrade.sql. Safe to run multiple times.

-- =========================================================================
-- GOOD NEWS (19 Karten)
-- =========================================================================

insert into public.game_changer_cards (content_key, display_name, description, category, timing, effects, visibility) values
  ('good_news_farmers_club', 'Farmers Club',
   'Ein oertlicher Landwirt hat beim Pfluegen mehr Talente entdeckt als eure komplette Scoutingabteilung. Das Scouting steigt um 1 Level.',
   'good_news', 'after_match',
   '[{"type":"free_facility_upgrade","facility":"scouting","levels":1}]'::jsonb, 'public'),

  ('good_news_auslaendisches_investment', 'Auslaendisches Investment',
   'Ein internationaler Investor hat den Vereinsnamen zwar falsch ausgesprochen, aber die Ueberweisung war korrekt. +50 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":50000000}]'::jsonb, 'public'),

  ('good_news_talent_durchbruch', 'Talent-Durchbruch',
   'Ein Spieler hat im Training ploetzlich verstanden, dass der Ball rund ist. Fuege einem beliebigen Spieler +1 Talentstern hinzu.',
   'good_news', 'after_match',
   '[{"type":"player_potential_bonus","stars":1,"choice":"any_owned"}]'::jsonb, 'public'),

  ('good_news_neuer_trikotsponsor', 'Neuer Trikotsponsor',
   'Ein Sponsor moechte unbedingt auf eure Brust. Hauptsache sichtbar, Hauptsache gross. +30 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":30000000}]'::jsonb, 'public'),

  ('good_news_zusaetzliches_investment', 'Zusaetzliches Investment',
   'Der Vorstand hat irgendwo noch ein Sparbuch gefunden. Niemand fragt nach, alle freuen sich. +40 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":40000000}]'::jsonb, 'public'),

  ('good_news_olympische_spiele', 'Olympische Spiele',
   'Die Stadt traeumt von Olympia und ihr profitiert vom Groessenwahn. Das Stadion steigt kostenlos um 1 Level.',
   'good_news', 'after_match',
   '[{"type":"free_facility_upgrade","facility":"stadium","levels":1}]'::jsonb, 'public'),

  ('good_news_vip_lounge', 'Neue VIP-Lounge',
   'Die Logen sind jetzt so bequem, dass Sponsoren freiwillig laenger bleiben. +20 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":20000000}]'::jsonb, 'public'),

  ('good_news_player_walk_in', 'Player Walk-In',
   'Ein Spieler laeuft einfach ins Vereinsheim und fragt, ob hier zufaellig noch jemand gebraucht wird. Ziehe kostenlos einen Spieler und verpflichte ihn optional gratis.',
   'good_news', 'after_match',
   '[{"type":"free_scouting_draw","count":1},{"type":"free_scouting_buy_next","count":1}]'::jsonb, 'public'),

  ('good_news_jugendakademie', 'Neue Jugendakademie',
   'Die Jugendabteilung bekommt endlich mehr als zwei Huetchen und einen platten Ball. Training steigt kostenlos um 1 Level.',
   'good_news', 'after_match',
   '[{"type":"free_facility_upgrade","facility":"training","levels":1}]'::jsonb, 'public'),

  ('good_news_namensrechte_tribuene', 'Namensrechte der Tribuene',
   'Die Gegengerade heisst jetzt offiziell Autohaus-Mueller-Erlebniswall. Klingt wild, bringt aber Geld. +10 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":10000000}]'::jsonb, 'public'),

  ('good_news_manager_of_the_year', 'Manager of the Year',
   'Die Presse nennt dich ein Genie. Niemand weiss warum, aber ein Mitarbeiter unterschreibt kostenlos.',
   'good_news', 'after_match',
   '[{"type":"free_staff_offer"},{"type":"free_staff_signing"}]'::jsonb, 'public'),

  ('good_news_pokalpraemie', 'Pokalpraemie',
   'Ihr seid im Pokal weitergekommen, weil der Gegner die Trikots vergessen hat. Egal. Praemie ist Praemie. +25 Mio.',
   'good_news', 'after_match',
   '[{"type":"money_change","amount":25000000}]'::jsonb, 'public'),

  ('good_news_trainingslager_wunder', 'Trainingslager Wunder',
   'Im Trainingslager wurde tatsaechlich trainiert und nicht nur Tischtennis gespielt. Erhalte eine zusaetzliche Trainingseinheit.',
   'good_news', 'after_match',
   '[{"type":"training_capacity_delta","delta":1,"scope":"next_offseason"}]'::jsonb, 'public'),

  ('good_news_fanmarsch', 'Fanmarsch eskaliert positiv',
   'Die Fans haben einen Marsch organisiert, der so gut aussah, dass sogar die Lokalzeitung aus Versehen begeistert war. +1 Statuslevel.',
   'good_news', 'after_match',
   '[{"type":"status_tier_change","delta":1,"until":"season_end"}]'::jsonb, 'public'),

  ('good_news_gluecksgriff', 'Gluecksgriff auf dem Transfermarkt',
   'Der Berater hat sich verrechnet, der Spieler merkt es nicht. Der naechste Transfer kostet 10 Mio. weniger.',
   'good_news', 'after_match',
   '[{"type":"next_transfer_price_delta","amount":-10000000}]'::jsonb, 'public'),

  ('good_news_taktiktafel', 'Taktiktafel-Moment',
   'Der Co-Trainer malt drei Pfeile auf die Tafel und ploetzlich ergibt alles Sinn. +2 auf Defence, Midfield oder Attack im naechsten Spiel.',
   'good_news', 'after_match',
   '[{"type":"next_match_zone_delta","delta":2,"choice":"zone"}]'::jsonb, 'public'),

  ('good_news_kabinenansprache', 'Kabinenansprache sitzt',
   'Die Ansprache war so emotional, dass selbst der Zeugwart kurz eingewechselt werden wollte. Bei einem Unentschieden im naechsten Spiel erhaeltst du +1 auf den entscheidenden Wuerfelwurf.',
   'good_news', 'after_match',
   '[{"type":"next_match_draw_dice_bonus","bonus":1}]'::jsonb, 'public'),

  ('good_news_jahrhunderttalent', 'Jahrhunderttalent entdeckt',
   'Ein Jugendspieler schiesst beim Aufwaermen den Ball durch ein offenes Fenster direkt in die Vertragsmappe. Ziehe ein Talent kostenlos.',
   'good_news', 'after_match',
   '[{"type":"free_scouting_draw","count":1}]'::jsonb, 'public')
on conflict (content_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  category     = excluded.category,
  timing       = excluded.timing,
  effects      = excluded.effects,
  visibility   = excluded.visibility;

-- =========================================================================
-- BAD NEWS (25 Karten)
-- =========================================================================

insert into public.game_changer_cards (content_key, display_name, description, category, timing, effects, visibility) values
  ('bad_news_gambling_problems', 'Gambling Problems',
   'Ein Mittelfeldspieler wurde haeufiger in der Spielo gesehen als im Kraftraum. Er faellt fuer den Rest der Saison aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"MID","duration":"season"}]'::jsonb, 'public'),

  ('bad_news_zu_lang_im_club', 'Zu lang im Club',
   'Der beste Mittelfeldspieler hat die Mannschaftskasse verwaltet und ist noch immer verkatert. Er faellt fuer das naechste Spiel aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"best_zone","zone":"MID","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_platzsturm', 'Platzsturm beim Heimspiel',
   'Die Fans wollten Naehe zur Mannschaft zeigen. Leider direkt auf dem Spielfeld. Sicherheitskosten: -10 Mio.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-10000000}]'::jsonb, 'public'),

  ('bad_news_lebensmittelvergiftung', 'Lebensmittelvergiftung',
   'Der rechte Stuermer hat am Imbissstand mutig den letzten Mettigel genommen. Er faellt fuer das naechste Spiel aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"ATT","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_rote_karte_trainer', 'Rote Karte fuer Trainer',
   'Der Trainer hat dem Schiedsrichter konstruktives Feedback gegeben. Fuer das naechste Spiel darf die Aufstellung nicht geaendert werden.',
   'bad_news', 'after_match',
   '[{"type":"next_match_lineup_locked"}]'::jsonb, 'public'),

  ('bad_news_gemeinde_rueckzahlung', 'Gemeinde-Rueckzahlung',
   'Die Gemeinde findet, dass es dem Club offensichtlich sehr gut geht. Bitte einmal solidarisch zahlen: -15 Mio.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-15000000}]'::jsonb, 'public'),

  ('bad_news_magen_darm', 'Magen-Darm',
   'Der rechte Mittelfeldspieler hat das falsche Wasser getrunken. Oder den falschen Doener. Jedenfalls faellt er aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"MID","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_duschunfall', 'Duschunfall',
   'Der rechte Verteidiger ist in der Dusche ausgerutscht. Klassischer Kreisliga-Endgegner: nasse Fliesen.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"DEF","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_illegaler_jugendtransfer', 'Illegaler Jugendtransfer',
   'Der Scout hat Geburtsurkunde pruefen als optional verstanden. -20 Mio. Strafe, keine Transfers und kein Scouting in dieser Offseason. Dafuer doppelte Trainingseinheiten.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-20000000},{"type":"offseason_lock","blocks":["scouting","transfers"]},{"type":"training_capacity_delta","delta":"double","scope":"next_offseason"}]'::jsonb, 'public'),

  ('bad_news_taktikfehler', 'Taktikfehler',
   'Der Trainer wollte modern spielen lassen. Am Ende stand der Innenverteidiger auf der Zehn. -2 Defence im naechsten Spiel.',
   'bad_news', 'after_match',
   '[{"type":"next_match_zone_delta","delta":-2,"zone":"DEF"}]'::jsonb, 'public'),

  ('bad_news_laenderspielpause', 'Laenderspielpause',
   'Der linke Stuermer wurde ueberraschend nominiert. Nationalstolz schoen und gut, aber euch fehlt er im naechsten Spiel.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"ATT","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_big_head', 'Big Head',
   'Der zuletzt trainierte Spieler hat sein eigenes Highlight-Video gesehen. Seitdem geht nichts mehr. Er verliert 1 Stern.',
   'bad_news', 'after_match',
   '[{"type":"last_trained_star_loss","stars":1}]'::jsonb, 'public'),

  ('bad_news_zuschauer_weg', 'Zuschauer kommen nicht mehr',
   'Die Kalkulation war optimistischer als der Spielstil. Weniger Zuschauer, weniger Einnahmen: -30 Mio.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-30000000}]'::jsonb, 'public'),

  ('bad_news_sicherheitsluecke', 'Sicherheitsluecke im Konzept',
   'Die Sicherheitsstandards im Stadion bestehen aus Absperrband und Hoffnung. Stadion-Einkommen zaehlt diese Saison nur als Level 1.',
   'bad_news', 'after_match',
   '[{"type":"stadium_income_cap","level":1,"until":"season_end"}]'::jsonb, 'public'),

  ('bad_news_gehirnerschuetterung', 'Gehirnerschuetterung',
   'Ein Mittelfeldspieler hat im Kopfballduell gewonnen, aber gegen die Physik verloren. Er faellt fuer das naechste Spiel aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"MID","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_schlaegerei', 'Schlaegerei am Spielfeldrand',
   'Der Staff wollte schlichten und war ploetzlich mittendrin. Im naechsten Spiel zaehlen keine Key-Staff-Boni.',
   'bad_news', 'after_match',
   '[{"type":"next_match_staff_disabled"}]'::jsonb, 'public'),

  ('bad_news_financial_foul_play', 'Financial Foul Play',
   'Die Buchhaltung hatte kreative Momente. Der Verband leider auch. Strafe: -30 Mio.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-30000000}]'::jsonb, 'public'),

  ('bad_news_duenger', 'Neuer Duenger fuer das Stadion',
   'Der Rasen sieht aus wie ein Parkplatz nach Rock am Ring. Neuer Duenger muss her: -10 Mio.',
   'bad_news', 'after_match',
   '[{"type":"money_change","amount":-10000000}]'::jsonb, 'public'),

  ('bad_news_steuerhinterziehung', 'Steuerhinterziehung',
   'Der Finanzpruefer hat gefragt, warum der Busfahrer als Linksverteidiger gefuehrt wird. Entlasse Spieler im Wert von 4 Staerkepunkten ohne Ausgleichszahlung.',
   'bad_news', 'after_match',
   '[{"type":"force_release_stars","stars":4}]'::jsonb, 'public'),

  ('bad_news_mario_kart', 'Mario-Kart-Unfall',
   'Der linke Verteidiger ist auf einer Bananenschale ausgerutscht. Niemand weiss, warum die im Kabinengang lag.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_zone","zone":"DEF","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_platzwunde_keeper', 'Platzwunde - Sprung gegen Pfosten',
   'Der Keeper wollte beim Training besonders motiviert wirken und ist gegen den Pfosten gesprungen. Platzwunde. Faellt ein Spiel aus.',
   'bad_news', 'after_match',
   '[{"type":"targeted_injury","selector":"random_position","position":"GK","duration":"next_match"}]'::jsonb, 'public'),

  ('bad_news_pressekonferenz', 'Pressekonferenz des Grauens',
   'Der Trainer sagt auf die Frage zur Taktik nur: Das muessen Sie die Mannschaft fragen. Die Presse liebt es. Ihr nicht. -1 Statuslevel.',
   'bad_news', 'after_match',
   '[{"type":"status_tier_change","delta":-1,"until":"season_end"}]'::jsonb, 'public'),

  ('bad_news_trainingsplatz_gesperrt', 'Trainingsplatz gesperrt',
   'Die Stadt sperrt den Trainingsplatz wegen unbekannter Bodenbewegungen. Wahrscheinlich war es nur euer Sechser. Eine Trainingseinheit weniger.',
   'bad_news', 'after_match',
   '[{"type":"training_capacity_delta","delta":-1,"scope":"next_offseason"}]'::jsonb, 'public'),

  ('bad_news_kabinenmusik', 'Kabinenmusik-Krise',
   'Die Mannschaft zerstreitet sich ueber die Playlist. Deutschrap gegen Ballermann endet taktisch unsauber. -1 auf Defence, Midfield oder Attack im naechsten Spiel.',
   'bad_news', 'after_match',
   '[{"type":"next_match_zone_delta","delta":-1,"choice":"zone"}]'::jsonb, 'public'),

  ('bad_news_berater', 'Berater dreht durch',
   'Ein Berater hat gelernt, dass man marktgerecht sagen kann, wenn man viel zu teuer meint. Naechste Vertragsverlaengerung kostet +10 Mio.',
   'bad_news', 'after_match',
   '[{"type":"next_transfer_price_delta","amount":10000000}]'::jsonb, 'public')
on conflict (content_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  category     = excluded.category,
  timing       = excluded.timing,
  effects      = excluded.effects,
  visibility   = excluded.visibility;

-- =========================================================================
-- SECRET WEAPON Beispielkarten bleiben aus game_changer_cards.sql bestehen.
-- =========================================================================
