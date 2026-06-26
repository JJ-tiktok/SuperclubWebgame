import type { ClubStatus } from "@/lib/game/types";
import { SPONSOR_PRESTIGE_LABELS } from "@/lib/lobby/sponsor-deals";
import { getPrestigeTierRank } from "@/lib/lobby/sponsoring";
import { isNlzOriginPlayer } from "@/lib/lobby/youth-generator";
import type { ClubPlayerSnapshot, LobbyClub } from "@/lib/lobby/types";

export const DEFAULT_PRESTIGE_TARGET = 100;
export const TRAINING_STARS_SEASON_CAP = 12;
export const YOUTH_PRESTIGE_SEASON_CAP = 2;
export const CONTINENTAL_WINS_ENDGAME_TRIGGER = 2;

export const PHILOSOPHY_IDS = [
  "talentschmiede",
  "transfergenie",
  "serienmeister",
  "sponsoren_liebling",
  "trainings_weltmeister",
  "underdog",
  "traditionsverein",
  "vereinsbauer",
] as const;

export type PhilosophyId = (typeof PHILOSOPHY_IDS)[number];

export type PhilosophyDefinition = {
  id: PhilosophyId;
  label: string;
  description: string;
  goal: string;
  reward: number;
};

export const PHILOSOPHIES: PhilosophyDefinition[] = [
  {
    id: "talentschmiede",
    label: "Talentschmiede",
    description: "Entwickle Jugendspieler aus der Akademie zu Vollendung.",
    goal: "4 Jugendspieler auf Max-Wert entwickeln",
    reward: 15,
  },
  {
    id: "transfergenie",
    label: "Transfergenie",
    description: "Verkaufe gekaufte Spieler mit hohem Gewinn.",
    goal: "5 Verkäufe mit mind. 10 Mio. Gewinn (ohne Jugendspieler)",
    reward: 15,
  },
  {
    id: "serienmeister",
    label: "Serienmeister",
    description: "Dominiere die Liga über mehrere Saisons.",
    goal: "3 Gesamtliga-Titel in Folge gewinnen",
    reward: 20,
  },
  {
    id: "sponsoren_liebling",
    label: "Sponsoren-Liebling",
    description: "Erfülle Sponsorenziele und sammle Prestige.",
    goal: "20 Prestige durch erfüllte Sponsorenziele",
    reward: 15,
  },
  {
    id: "trainings_weltmeister",
    label: "Trainings-Weltmeister",
    description: "Maximiere Trainingsfortschritt über den Spielverlauf.",
    goal: "50 Trainingssterne (max. 12 pro Saison)",
    reward: 15,
  },
  {
    id: "underdog",
    label: "Der Underdog",
    description: "Gewinne die Liga mit dem schwächsten Kader.",
    goal: "Liga-Sieg mit niedrigstem Kaderwert zu Saisonbeginn",
    reward: 15,
  },
  {
    id: "traditionsverein",
    label: "Traditionsverein",
    description: "Baue auf langjährige Vereinslegenden.",
    goal: "Liga-Sieg mit 8 Spielern (4+ Saisons), davon 5 in stärkster Elf",
    reward: 15,
  },
  {
    id: "vereinsbauer",
    label: "Vereinsbauer",
    description: "Investiere in Infrastruktur auf höchstem Niveau.",
    goal: "3 verschiedene Einrichtungen auf Max-Level",
    reward: 10,
  },
];

export const PRESTIGE_CATEGORY = {
  league_champion: "league_champion",
  league_runner_up: "league_runner_up",
  manager_rank_1: "manager_rank_1",
  continental_win: "continental_win",
  continental_finalist: "continental_finalist",
  sponsor_tier: "sponsor_tier",
  facility_max: "facility_max",
  youth_max: "youth_max",
  philosophy: "philosophy",
} as const;

export type PrestigeCategory = (typeof PRESTIGE_CATEGORY)[keyof typeof PRESTIGE_CATEGORY];

export const PRESTIGE_POINTS = {
  league_champion: 10,
  league_runner_up: 4,
  manager_rank_1: 3,
  continental_win: 20,
  continental_finalist: 10,
  facility_max: 5,
  youth_max: 4,
} as const;

export const SPONSOR_PRESTIGE_POINTS: Record<ClubStatus, number> = {
  newly_promoted: 3,
  established: 4,
  mid_table: 5,
  title_contender: 6,
};

export type PrestigeEarningRule = {
  label: string;
  points: string;
  frequency: string;
  note?: string;
};

export const PRESTIGE_EARNING_RULES: PrestigeEarningRule[] = [
  {
    label: "Liga-Meister",
    points: `+${PRESTIGE_POINTS.league_champion}`,
    frequency: "pro Saison",
    note: "Hoechster Tabellenplatz",
  },
  {
    label: "Vizemeister",
    points: `+${PRESTIGE_POINTS.league_runner_up}`,
    frequency: "pro Saison",
  },
  {
    label: "Bester Manager",
    points: `+${PRESTIGE_POINTS.manager_rank_1}`,
    frequency: "pro Saison",
    note: "Hoechster Manager-Score",
  },
  {
    label: "Continental Cup Sieg",
    points: `+${PRESTIGE_POINTS.continental_win}`,
    frequency: "pro Turnier",
    note: "Zaehlt auch zum Endgame (2 Siege = finale Saison)",
  },
  {
    label: "Continental Cup Finalist",
    points: `+${PRESTIGE_POINTS.continental_finalist}`,
    frequency: "pro Turnier",
    note: "Nur wenn kein eigener Sieg im selben Turnier",
  },
  {
    label: "Sponsorenziel erfuellt",
    points: `+${SPONSOR_PRESTIGE_POINTS.newly_promoted} bis +${SPONSOR_PRESTIGE_POINTS.title_contender}`,
    frequency: "pro verbrauchter Prestige-Stufe",
    note: `${SPONSOR_PRESTIGE_LABELS.newly_promoted} +3, ${SPONSOR_PRESTIGE_LABELS.established} +4, ${SPONSOR_PRESTIGE_LABELS.mid_table} +5, ${SPONSOR_PRESTIGE_LABELS.title_contender} +6`,
  },
  {
    label: "Einrichtung auf Max-Level",
    points: `+${PRESTIGE_POINTS.facility_max}`,
    frequency: "einmalig pro Einrichtung",
    note: "Training, Scouting, Stadion, Medizin, Analyse, NLZ, Bauhof",
  },
  {
    label: "Jugendtalent auf Max-Wert",
    points: `+${PRESTIGE_POINTS.youth_max}`,
    frequency: "max. 2 pro Saison",
    note: "Nur NLZ-Spieler",
  },
  {
    label: "Vereinsphilosophie erfuellt",
    points: "+10 bis +20",
    frequency: "einmalig",
    note: "Bonus je nach gewaehlter Philosophie in der Lobby",
  },
];

const PRESTIGE_AWARD_CATEGORY_LABELS: Record<string, string> = {
  [PRESTIGE_CATEGORY.league_champion]: "Liga-Meister",
  [PRESTIGE_CATEGORY.league_runner_up]: "Vizemeister",
  [PRESTIGE_CATEGORY.manager_rank_1]: "Bester Manager",
  [PRESTIGE_CATEGORY.continental_win]: "Continental Cup Sieg",
  [PRESTIGE_CATEGORY.continental_finalist]: "Continental Cup Finale",
  [PRESTIGE_CATEGORY.sponsor_tier]: "Sponsorenziel",
  [PRESTIGE_CATEGORY.facility_max]: "Einrichtung Max-Level",
  [PRESTIGE_CATEGORY.youth_max]: "Jugendtalent Max",
  [PRESTIGE_CATEGORY.philosophy]: "Vereinsphilosophie",
};

export function formatPrestigeAwardLabel(category: string, metadata: Record<string, unknown> = {}): string {
  const base = PRESTIGE_AWARD_CATEGORY_LABELS[category] ?? category;

  if (category === PRESTIGE_CATEGORY.facility_max && typeof metadata.label === "string") {
    return `${base}: ${metadata.label}`;
  }

  if (category === PRESTIGE_CATEGORY.sponsor_tier && typeof metadata.prestige_tier === "string") {
    const tier = metadata.prestige_tier as ClubStatus;
    const tierLabel = SPONSOR_PRESTIGE_LABELS[tier] ?? metadata.prestige_tier;
    return `${base} (${tierLabel})`;
  }

  if (category === PRESTIGE_CATEGORY.philosophy && typeof metadata.philosophy_id === "string") {
    const philosophy = getPhilosophyById(metadata.philosophy_id as PhilosophyId);
    return philosophy ? `${base}: ${philosophy.label}` : base;
  }

  return base;
}

export type PrestigeState = {
  consecutive_league_titles?: number;
  youth_max_developed?: number;
  qualified_transfer_sales?: number;
  sponsor_prestige_earned?: number;
  training_stars_total?: number;
  facilities_at_max?: string[];
  talentschmiede_count?: number;
  season_start_squad_stars?: Record<string, number>;
  talentschmiede_player_ids?: string[];
};

export type FacilityKey =
  | "training"
  | "scouting"
  | "stadium"
  | "medical"
  | "analytics"
  | "youth_academy"
  | "construction_yard";

export const FACILITY_MAX_LEVELS: Record<FacilityKey, number> = {
  training: 4,
  scouting: 4,
  stadium: 4,
  medical: 3,
  analytics: 3,
  youth_academy: 3,
  construction_yard: 1,
};

export const FACILITY_LABELS: Record<FacilityKey, string> = {
  training: "Training",
  scouting: "Scouting",
  stadium: "Stadion",
  medical: "Medizin-Zentrum",
  analytics: "Analyse-Zentrum",
  youth_academy: "Nachwuchsleistungszentrum",
  construction_yard: "Bauhof",
};

export function isPrestigeEnabled(settings?: { prestige_enabled?: boolean } | null) {
  return settings?.prestige_enabled !== false;
}

export function getPrestigeTarget(settings?: { prestige_target?: number } | null) {
  const target = Number(settings?.prestige_target ?? DEFAULT_PRESTIGE_TARGET);
  return Number.isFinite(target) && target > 0 ? Math.trunc(target) : DEFAULT_PRESTIGE_TARGET;
}

export function getPhilosophyById(id: string | null | undefined): PhilosophyDefinition | undefined {
  return PHILOSOPHIES.find((entry) => entry.id === id);
}

export function isValidPhilosophyId(id: string): id is PhilosophyId {
  return (PHILOSOPHY_IDS as readonly string[]).includes(id);
}

export function stageForTier(tier: ClubStatus): number {
  return getPrestigeTierRank(tier) + 1;
}

export function sponsorPointsForTier(tier: ClubStatus): number {
  return SPONSOR_PRESTIGE_POINTS[tier] ?? 0;
}

export function normalizePrestigeState(value: unknown): PrestigeState {
  if (!value || typeof value !== "object") {
    return {};
  }
  const raw = value as Record<string, unknown>;
  return {
    consecutive_league_titles: Number(raw.consecutive_league_titles ?? 0) || 0,
    youth_max_developed: Number(raw.youth_max_developed ?? 0) || 0,
    qualified_transfer_sales: Number(raw.qualified_transfer_sales ?? 0) || 0,
    sponsor_prestige_earned: Number(raw.sponsor_prestige_earned ?? 0) || 0,
    training_stars_total: Number(raw.training_stars_total ?? 0) || 0,
    facilities_at_max: Array.isArray(raw.facilities_at_max)
      ? raw.facilities_at_max.filter((entry): entry is string => typeof entry === "string")
      : [],
    talentschmiede_count: Number(raw.talentschmiede_count ?? 0) || 0,
    season_start_squad_stars:
      raw.season_start_squad_stars && typeof raw.season_start_squad_stars === "object"
        ? Object.fromEntries(
            Object.entries(raw.season_start_squad_stars as Record<string, unknown>).map(([key, value]) => [
              key,
              Number(value ?? 0) || 0,
            ]),
          )
        : {},
  };
}

export function getFacilityLevel(
  club: Pick<
    LobbyClub,
    | "training_level"
    | "scouting_level"
    | "stadium_level"
    | "medical_center_level"
    | "analytics_hub_level"
    | "youth_academy_level"
    | "construction_yard_built"
  >,
  key: FacilityKey,
): number {
  switch (key) {
    case "training":
      return club.training_level ?? 1;
    case "scouting":
      return club.scouting_level ?? 1;
    case "stadium":
      return club.stadium_level ?? 1;
    case "medical":
      return club.medical_center_level ?? 0;
    case "analytics":
      return club.analytics_hub_level ?? 0;
    case "youth_academy":
      return club.youth_academy_level ?? 0;
    case "construction_yard":
      return club.construction_yard_built ? 1 : 0;
    default:
      return 0;
  }
}

export function isFacilityAtMax(
  club: Pick<
    LobbyClub,
    | "training_level"
    | "scouting_level"
    | "stadium_level"
    | "medical_center_level"
    | "analytics_hub_level"
    | "youth_academy_level"
    | "construction_yard_built"
  >,
  key: FacilityKey,
): boolean {
  return getFacilityLevel(club, key) >= FACILITY_MAX_LEVELS[key];
}

export function getFacilitiesAtMax(
  club: Pick<
    LobbyClub,
    | "training_level"
    | "scouting_level"
    | "stadium_level"
    | "medical_center_level"
    | "analytics_hub_level"
    | "youth_academy_level"
    | "construction_yard_built"
  >,
): FacilityKey[] {
  return (Object.keys(FACILITY_MAX_LEVELS) as FacilityKey[]).filter((key) => isFacilityAtMax(club, key));
}

export function hasReachedPlayerSkillMax(player: ClubPlayerSnapshot): boolean {
  const skillMax = Number(player.player.skill_max ?? player.player.potential_stars ?? player.current_stars);
  return Math.trunc(Number(player.current_stars)) >= Math.trunc(skillMax);
}

export function isNlzPlayerAtMax(player: ClubPlayerSnapshot): boolean {
  return isNlzOriginPlayer(player.player.metadata) && hasReachedPlayerSkillMax(player);
}

export function sumTrainingStarsForSeason(
  transactions: Array<{ metadata: unknown }>,
  seasonNumber: number,
): number {
  let total = 0;
  for (const transaction of transactions) {
    const metadata = transaction.metadata as Record<string, unknown> | null;
    if (!metadata || Number(metadata.season_number) !== seasonNumber) {
      continue;
    }
    const before = Number(metadata.before_stars ?? 0);
    const after = Number(metadata.after_stars ?? 0);
    if (after > before) {
      total += after - before;
    }
  }
  return total;
}

export function capTrainingStarsForPhilosophy(seasonStars: number): number {
  return Math.min(seasonStars, TRAINING_STARS_SEASON_CAP);
}

export type PhilosophyProgress = {
  current: number;
  target: number;
  label: string;
};

export function getPhilosophyProgress(
  philosophyId: PhilosophyId | null | undefined,
  state: PrestigeState,
): PhilosophyProgress | null {
  if (!philosophyId) {
    return null;
  }

  switch (philosophyId) {
    case "talentschmiede":
      return { current: state.talentschmiede_count ?? 0, target: 4, label: "Jugendspieler auf Max" };
    case "transfergenie":
      return { current: state.qualified_transfer_sales ?? 0, target: 5, label: "Qualifizierte Verkäufe" };
    case "serienmeister":
      return { current: state.consecutive_league_titles ?? 0, target: 3, label: "Ligatitel in Folge" };
    case "sponsoren_liebling":
      return { current: state.sponsor_prestige_earned ?? 0, target: 20, label: "Sponsor-Prestige" };
    case "trainings_weltmeister":
      return { current: state.training_stars_total ?? 0, target: 50, label: "Trainingssterne" };
    case "vereinsbauer":
      return { current: state.facilities_at_max?.length ?? 0, target: 3, label: "Max-Einrichtungen" };
    case "underdog":
    case "traditionsverein":
      return { current: 0, target: 1, label: "Einmaliges Saisonziel" };
    default:
      return null;
  }
}

export function isPhilosophyFulfilled(
  philosophyId: PhilosophyId,
  state: PrestigeState,
  context: {
    wonLeagueThisSeason?: boolean;
    wasUnderdogAtSeasonStart?: boolean;
    traditionsvereinMet?: boolean;
  } = {},
): boolean {
  switch (philosophyId) {
    case "talentschmiede":
      return (state.talentschmiede_count ?? 0) >= 4;
    case "transfergenie":
      return (state.qualified_transfer_sales ?? 0) >= 5;
    case "serienmeister":
      return (state.consecutive_league_titles ?? 0) >= 3;
    case "sponsoren_liebling":
      return (state.sponsor_prestige_earned ?? 0) >= 20;
    case "trainings_weltmeister":
      return (state.training_stars_total ?? 0) >= 50;
    case "vereinsbauer":
      return (state.facilities_at_max?.length ?? 0) >= 3;
    case "underdog":
      return Boolean(context.wonLeagueThisSeason && context.wasUnderdogAtSeasonStart);
    case "traditionsverein":
      return Boolean(context.wonLeagueThisSeason && context.traditionsvereinMet);
    default:
      return false;
  }
}

export function updateConsecutiveLeagueTitles(state: PrestigeState, wonLeague: boolean): PrestigeState {
  return {
    ...state,
    consecutive_league_titles: wonLeague ? (state.consecutive_league_titles ?? 0) + 1 : 0,
  };
}

export function updateFacilitiesAtMaxState(
  state: PrestigeState,
  club: Pick<
    LobbyClub,
    | "training_level"
    | "scouting_level"
    | "stadium_level"
    | "medical_center_level"
    | "analytics_hub_level"
    | "youth_academy_level"
    | "construction_yard_built"
  >,
): PrestigeState {
  return {
    ...state,
    facilities_at_max: getFacilitiesAtMax(club),
  };
}

export function addTrainingStarsToState(state: PrestigeState, seasonStars: number): PrestigeState {
  const capped = capTrainingStarsForPhilosophy(seasonStars);
  return {
    ...state,
    training_stars_total: (state.training_stars_total ?? 0) + capped,
  };
}

export function addSponsorPrestigeToState(state: PrestigeState, points: number): PrestigeState {
  return {
    ...state,
    sponsor_prestige_earned: (state.sponsor_prestige_earned ?? 0) + points,
  };
}

export function incrementTalentschmiedeForPlayer(state: PrestigeState, clubPlayerId: string): PrestigeState {
  const tracked = new Set(state.talentschmiede_player_ids ?? []);
  if (tracked.has(clubPlayerId)) {
    return state;
  }
  tracked.add(clubPlayerId);
  return {
    ...state,
    talentschmiede_player_ids: Array.from(tracked),
    talentschmiede_count: (state.talentschmiede_count ?? 0) + 1,
  };
}

export function incrementQualifiedTransferSales(state: PrestigeState): PrestigeState {
  return {
    ...state,
    qualified_transfer_sales: (state.qualified_transfer_sales ?? 0) + 1,
  };
}

export type PrestigeClubRow = {
  club_id: string;
  club_name: string;
  club_color?: string | null;
  manager_name: string;
  prestige_points: number;
  continental_wins: number;
  philosophy_id?: string | null;
  philosophy_fulfilled?: boolean;
  season_rank?: number | null;
};

export function shouldTriggerFinalSeason(
  clubs: Array<Pick<PrestigeClubRow, "prestige_points" | "continental_wins">>,
  target: number,
): boolean {
  return clubs.some(
    (club) => club.prestige_points >= target || club.continental_wins >= CONTINENTAL_WINS_ENDGAME_TRIGGER,
  );
}

export function resolvePrestigeWinner(clubs: PrestigeClubRow[]): PrestigeClubRow | null {
  if (clubs.length === 0) {
    return null;
  }

  return [...clubs].sort((left, right) => {
    if (right.prestige_points !== left.prestige_points) {
      return right.prestige_points - left.prestige_points;
    }
    if (right.continental_wins !== left.continental_wins) {
      return right.continental_wins - left.continental_wins;
    }
    const leftRank = left.season_rank ?? 999;
    const rightRank = right.season_rank ?? 999;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.club_name.localeCompare(right.club_name, "de");
  })[0];
}

export function checkTraditionsverein(
  squad: ClubPlayerSnapshot[],
  lineupPlayerIds: Set<string>,
): boolean {
  const tenurePlayers = squad.filter((player) => Number(player.seasons_at_club ?? 1) >= 4);
  if (tenurePlayers.length < 8) {
    return false;
  }
  const inStrongestEleven = tenurePlayers.filter((player) => lineupPlayerIds.has(player.id));
  return inStrongestEleven.length >= 5;
}

export function getStrongestElevenPlayerIds(squad: ClubPlayerSnapshot[]): Set<string> {
  return new Set(
    [...squad]
      .sort((left, right) => {
        const starsDiff = Number(right.current_stars) - Number(left.current_stars);
        if (starsDiff !== 0) {
          return starsDiff;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, 11)
      .map((player) => player.id),
  );
}

export const MIN_TRANSFER_PROFIT = 10_000_000;

export function isQualifiedTransferProfit(salePrice: number, purchasePrice: number | null | undefined): boolean {
  const purchase = Number(purchasePrice ?? 0);
  return salePrice - purchase >= MIN_TRANSFER_PROFIT;
}
