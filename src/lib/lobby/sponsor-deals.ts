import type { ClubStatus } from "@/lib/game/types";

export type SponsorObjectiveType =
  | "min_wins"
  | "not_last_overall"
  | "max_new_signings"
  | "min_budget_after_offseason"
  | "min_thirds_won"
  | "no_stadium_upgrade"
  | "consecutive_player_growth"
  | "no_player_sold"
  | "no_draws"
  | "seasons_without_win"
  | "consecutive_win_balance"
  | "max_signing_market_value"
  | "max_losses"
  | "min_end_budget"
  | "consecutive_league_first"
  | "no_loss_vs_human"
  | "reach_max_stadium"
  | "training_facility_locked";

export type SponsorRewardType =
  | "money"
  | "extra_training_unit"
  | "status_boost"
  | "stadium_rebuild"
  | "extra_scouting_draws"
  | "free_staff"
  | "defense_bonus"
  | "stadium_income_multiplier"
  | "player_potential_boost"
  | "player_star_boost"
  | "player_max_level"
  | "money_and_scouting"
  | "money_and_player_star";

export type SponsorDealDefinition = {
  id: string;
  prestige_tier: ClubStatus;
  display_name: string;
  task_description: string;
  flavor_text: string;
  objective_type: SponsorObjectiveType;
  objective_config: Record<string, unknown>;
  duration_seasons: number;
  reward_type: SponsorRewardType;
  reward_config: Record<string, unknown>;
  sort_order: number;
};

export const SPONSOR_PRESTIGE_LABELS: Record<ClubStatus, string> = {
  newly_promoted: "Neu aufgestiegen",
  established: "Etabliert",
  mid_table: "Mittlerer Tabellenplatz",
  title_contender: "Titelanwärter",
};

export const SPONSOR_DEALS: SponsorDealDefinition[] = [
  {
    id: "bockwurst_behrens",
    prestige_tier: "newly_promoted",
    display_name: "Bockwurt Behrens",
    task_description: "Gewinne mindestens ein Spiel in der Saison",
    flavor_text: "Der lokale Imbiss glaubt an euch. Oder zumindest daran, dass nach Niederlagen mehr gegessen wird.",
    objective_type: "min_wins",
    objective_config: { min: 1 },
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 10_000_000 },
    sort_order: 1,
  },
  {
    id: "autohaus_rumpel",
    prestige_tier: "newly_promoted",
    display_name: "Autohaus Rumpel",
    task_description: "Beende die Saison nicht als Letzter (Gesamttabelle mit CPU)",
    flavor_text: "Das Autohaus stellt euch einen Mannschaftsbus — leider riecht er nach Kupplung und die Rücksitze sind ausgebeult, aber er fährt. Meistens.",
    objective_type: "not_last_overall",
    objective_config: {},
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 15_000_000 },
    sort_order: 2,
  },
  {
    id: "nadidos_basic_deal",
    prestige_tier: "newly_promoted",
    display_name: "Nadidos Basic Deal",
    task_description: "Verpflichte nicht mehr als einen neuen Spieler (Scouting + Deadline Day)",
    flavor_text: "Nadidos liefert neue Trikots (Rückläufer aus der Vorsaison). Die Anzahl ist jedoch begrenzt.",
    objective_type: "max_new_signings",
    objective_config: { max: 1 },
    duration_seasons: 1,
    reward_type: "extra_training_unit",
    reward_config: { count: 1 },
    sort_order: 3,
  },
  {
    id: "dorfsparkasse_kreditprogramm",
    prestige_tier: "newly_promoted",
    display_name: "Dorfsparkasse Kreditprogramm",
    task_description: "Spare nach Ablauf der Off-Season mindestens 40 Mio Budget",
    flavor_text: "Die lokale Sparkasse ist beeindruckt von eurem Finanzwesen. Konkret: Die Oma eures linken Verteidigers zählt nach dem Spiel die Einnahmen.",
    objective_type: "min_budget_after_offseason",
    objective_config: { min: 40_000_000 },
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 30_000_000 },
    sort_order: 4,
  },
  {
    id: "fupa_tv",
    prestige_tier: "newly_promoted",
    display_name: "FuPa TV",
    task_description: "Gewinne mindestens 6 Drittel in einer Saison",
    flavor_text: "Ein Fan hat eure schönsten Tore mit seinem Handy gefilmt. Das zugehörige Youtube-Video hat mehr Klicks als das letzte Entschuldigungsvideo von Rainer Winkler.",
    objective_type: "min_thirds_won",
    objective_config: { min: 6 },
    duration_seasons: 1,
    reward_type: "status_boost",
    reward_config: { delta: 1, seasons: 1 },
    sort_order: 5,
  },
  {
    id: "amt_denkmalschutz",
    prestige_tier: "newly_promoted",
    display_name: "Amt für Denkmalschutz",
    task_description: "Baue das Stadion für 3 Saisons nicht aus",
    flavor_text: "Das städtische Amt für Denkmalschutz möchte die Kriegsüberreste, die ihr Stadion nennt, erhalten. Als Dank baut die Stadt eine neue Arena.",
    objective_type: "no_stadium_upgrade",
    objective_config: {},
    duration_seasons: 3,
    reward_type: "stadium_rebuild",
    reward_config: { stadium_level: 2, status_delta: 1, status_seasons: 1 },
    sort_order: 6,
  },
  {
    id: "nadidos_performance_programm",
    prestige_tier: "established",
    display_name: "Nadidos Performance Programm",
    task_description: "Entwickle in 2 aufeinanderfolgenden Jahren mindestens einen Spieler um +2 Sterne",
    flavor_text: "Nadidos will junge, talentierte Spieler fördern. Der Zeugwart fragt, ob mit 29 Jahren noch als junges Talent zählt.",
    objective_type: "consecutive_player_growth",
    objective_config: { min_stars: 2, seasons: 2 },
    duration_seasons: 2,
    reward_type: "player_potential_boost",
    reward_config: { stars: 1, pick_count: 1 },
    sort_order: 1,
  },
  {
    id: "global_energy_drink",
    prestige_tier: "established",
    display_name: "Global Energy Drink",
    task_description: "Erziele in der Saison mindestens 3 Siege",
    flavor_text: "Der Sponsor verspricht Flügel. Der Mannschaftsarzt bittet darum, die Dosen nicht vor dem Spiel zu trinken.",
    objective_type: "min_wins",
    objective_config: { min: 3 },
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 30_000_000 },
    sort_order: 2,
  },
  {
    id: "transfermarkt_de",
    prestige_tier: "established",
    display_name: "Transfermarkt.de",
    task_description: "Verkaufe 2 Saisons lang keinen Spieler",
    flavor_text: "Der Sponsor liebt Kontinuität. Der Trainer nennt es: Ich muss mit dem arbeiten, was da ist!",
    objective_type: "no_player_sold",
    objective_config: {},
    duration_seasons: 2,
    reward_type: "extra_scouting_draws",
    reward_config: { count: 2, scope: "next_offseason" },
    sort_order: 3,
  },
  {
    id: "kinoy_to",
    prestige_tier: "established",
    display_name: "Kinoy.To",
    task_description: "Keine Simulation endet unentschieden",
    flavor_text: "Deine Spiele werden live auf einer Leinwand im Kolosseum verfilmt. Es gibt immer einen Gewinner.",
    objective_type: "no_draws",
    objective_config: {},
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 50_000_000 },
    sort_order: 4,
  },
  {
    id: "tipicolo",
    prestige_tier: "established",
    display_name: "Tipicolo",
    task_description: "Beende 2 Saisons ohne Sieg",
    flavor_text: "Die Buchmacher verdienen sich eine goldene Nase mit eurem Team. Wenn das mal zu keinem Skandal führt.",
    objective_type: "seasons_without_win",
    objective_config: { seasons: 2 },
    duration_seasons: 2,
    reward_type: "free_staff",
    reward_config: {},
    sort_order: 5,
  },
  {
    id: "nadidos_elite",
    prestige_tier: "mid_table",
    display_name: "Nadidos Elite",
    task_description: "Hol in 2 Saisons in Folge mehr Siege als Niederlagen",
    flavor_text: "Nadidos möchte keine Versager im Team. Streng dich an, dann wirst du belohnt.",
    objective_type: "consecutive_win_balance",
    objective_config: { seasons: 2 },
    duration_seasons: 2,
    reward_type: "money_and_scouting",
    reward_config: { amount: 50_000_000, scouting_draws: 1 },
    sort_order: 1,
  },
  {
    id: "academy_first",
    prestige_tier: "mid_table",
    display_name: "Academy First",
    task_description: "Verpflichte in 2 Saisons keinen Spieler mit einem Wert über 40 Mio",
    flavor_text: "Der neue Sponsor glaubt an die Jugend. Der Trainer glaubt an fertige Spieler. Einer von beiden muss nachgeben.",
    objective_type: "max_signing_market_value",
    objective_config: { max_value: 40_000_000 },
    duration_seasons: 2,
    reward_type: "player_potential_boost",
    reward_config: { stars: 1, pick_count: 2 },
    sort_order: 2,
  },
  {
    id: "ironwall_insurance",
    prestige_tier: "mid_table",
    display_name: "IronWall Insurance",
    task_description: "Verliere nicht mehr als 2 Spiele",
    flavor_text: "Die Versicherung liebt stabile Abwehrreihen. Grätschen im Strafraum sind laut Kleingedrucktem ausgeschlossen.",
    objective_type: "max_losses",
    objective_config: { max: 2 },
    duration_seasons: 1,
    reward_type: "defense_bonus",
    reward_config: { delta: 1, seasons: 1 },
    sort_order: 3,
  },
  {
    id: "vereinsheim24",
    prestige_tier: "mid_table",
    display_name: "Vereinsheim24",
    task_description: "Halte dein Budget am Saisonende über 50 Mio",
    flavor_text: "Der Sponsor liebt solide Finanzen. Der Schatzmeister nennt es endlich mal kein Herzrasen beim Kontoauszug.",
    objective_type: "min_end_budget",
    objective_config: { min: 50_000_000 },
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 40_000_000 },
    sort_order: 4,
  },
  {
    id: "nadidos_world_class",
    prestige_tier: "title_contender",
    display_name: "Nadidos World Class",
    task_description: "Gewinne 2 Saisons in Folge die Liga (Erster Platz)",
    flavor_text: "Nadidos plant bereits die Meisterkollektion. Leider steht auf den Shorts schon Champions. Kein Druck.",
    objective_type: "consecutive_league_first",
    objective_config: { seasons: 2 },
    duration_seasons: 2,
    reward_type: "money_and_player_star",
    reward_config: { amount: 100_000_000, stars: 1 },
    sort_order: 1,
  },
  {
    id: "megastream_global",
    prestige_tier: "title_contender",
    display_name: "MegaStream Global",
    task_description: "Gegen echte Manager: keine Niederlage in dieser Saison",
    flavor_text: "Der Sponsor will internationale Reichweite. Der Vorstand googelt vorsichtshalber schon mal Weltverein.",
    objective_type: "no_loss_vs_human",
    objective_config: {},
    duration_seasons: 1,
    reward_type: "money",
    reward_config: { amount: 50_000_000 },
    sort_order: 2,
  },
  {
    id: "future_stars_foundation",
    prestige_tier: "title_contender",
    display_name: "Future Stars Foundation",
    task_description: "Nutze 2 Saisons lang keine eigenen Trainingsanlagen",
    flavor_text: "Du stellst deine Trainingsanlagen zur Verfügung, kannst diese aber nicht mehr selbst nutzen. Als Ausgleich erhältst du Geheiminformationen für spezielle Trainingsmethoden.",
    objective_type: "training_facility_locked",
    objective_config: {},
    duration_seasons: 2,
    reward_type: "player_max_level",
    reward_config: { potential_stars: 1, max_level_count: 1 },
    sort_order: 3,
  },
  {
    id: "royal_arena_group",
    prestige_tier: "title_contender",
    display_name: "Royal Arena Group",
    task_description: "Baue das Stadion auf das Max-Level aus",
    flavor_text: "Die VIPs wollen Ledersitze, Sushi und einen neuen Haarschnitt. Das Spiel kann man ja auch abends in der Sportschau anschauen.",
    objective_type: "reach_max_stadium",
    objective_config: { level: 4 },
    duration_seasons: 1,
    reward_type: "stadium_income_multiplier",
    reward_config: { factor: 2, seasons: 1 },
    sort_order: 4,
  },
];

export function getSponsorDealById(dealId: string): SponsorDealDefinition | undefined {
  return SPONSOR_DEALS.find((deal) => deal.id === dealId);
}

export function getSponsorDealsForTier(tier: ClubStatus): SponsorDealDefinition[] {
  return SPONSOR_DEALS.filter((deal) => deal.prestige_tier === tier).sort((a, b) => a.sort_order - b.sort_order);
}
