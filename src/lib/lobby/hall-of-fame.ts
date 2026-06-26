import { resolvePlayerSkillDisplayMax } from "@/lib/lobby/player-market";
import { getClubPlayerDisplayName } from "@/lib/lobby/player-names";
import { normalizeSeasonsAtClub } from "@/lib/lobby/player-tenure";
import type {
  ClubPlayerSnapshot,
  HallOfFameCategoryId,
  HallOfFameCategorySnapshot,
  HallOfFameEntry,
  HallOfFameSnapshot,
  LobbyClub,
} from "@/lib/lobby/types";
import { parseTrainingEvent } from "@/lib/lobby/training";

export const HALL_OF_FAME_TOP_N = 5;

const CATEGORY_LABELS: Record<HallOfFameCategoryId, string> = {
  tenure: "Vereinslegenden",
  training: "Trainingshelden",
  development: "Groesste Entwicklung",
  skill_max: "Vollendete Karriere",
};

export type HallOfFameTrainingTransaction = {
  club_id: string;
  created_at: string;
  id: string;
  metadata: unknown;
};

export type HallOfFameClubSquad = {
  club: Pick<LobbyClub, "club_color" | "club_name" | "id">;
  squad: ClubPlayerSnapshot[];
};

type RankedCandidate = Omit<HallOfFameEntry, "rank">;

function formatStars(value: number): string {
  return `${Math.trunc(value)} Sterne`;
}

function normalizeStarsAtAcquisition(player: ClubPlayerSnapshot): number {
  const parsed = Number(player.stars_at_acquisition);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }

  const fallback = Number(player.player.base_stars ?? player.current_stars);
  return Number.isFinite(fallback) && fallback >= 0 ? Math.trunc(fallback) : 0;
}

function getPlayerSkillMax(player: ClubPlayerSnapshot): number {
  return resolvePlayerSkillDisplayMax({
    baseStars: player.player.base_stars,
    currentStars: player.current_stars,
    potentialStars: player.player.potential_stars,
    skillMax: player.player.skill_max,
  });
}

function hasReachedSkillMax(player: ClubPlayerSnapshot): boolean {
  return Math.trunc(Number(player.current_stars)) >= getPlayerSkillMax(player);
}

export function sumTrainingGainsByClubPlayerId(transactions: HallOfFameTrainingTransaction[]): Map<string, number> {
  const gains = new Map<string, number>();

  for (const transaction of transactions) {
    const event = parseTrainingEvent(transaction);
    if (!event || event.after_stars <= event.before_stars) {
      continue;
    }

    const delta = event.after_stars - event.before_stars;
    const key = `${transaction.club_id}:${event.club_player_id}`;
    gains.set(key, (gains.get(key) ?? 0) + delta);
  }

  return gains;
}

export function getTrainingGainsForClubPlayer(
  gainsByClubPlayerId: Map<string, number>,
  clubId: string,
  clubPlayerId: string,
): number {
  return gainsByClubPlayerId.get(`${clubId}:${clubPlayerId}`) ?? 0;
}

function buildEntry(
  player: ClubPlayerSnapshot,
  club: Pick<LobbyClub, "club_color" | "club_name" | "id">,
  metricValue: number,
  metricLabel: string,
): RankedCandidate {
  return {
    club_color: club.club_color ?? undefined,
    club_id: club.id,
    club_name: club.club_name,
    club_player_id: player.id,
    current_stars: Math.trunc(Number(player.current_stars)),
    custom_name: player.custom_name,
    display_name: getClubPlayerDisplayName(player),
    metric_label: metricLabel,
    metric_value: metricValue,
    position: player.player.position,
  };
}

function compareByMetricDesc(left: RankedCandidate, right: RankedCandidate) {
  const metricDiff = right.metric_value - left.metric_value;
  if (metricDiff !== 0) {
    return metricDiff;
  }

  const starsDiff = right.current_stars - left.current_stars;
  if (starsDiff !== 0) {
    return starsDiff;
  }

  return left.display_name.localeCompare(right.display_name, "de");
}

function compareTenure(left: RankedCandidate, right: RankedCandidate, playersById: Map<string, ClubPlayerSnapshot>) {
  const metricDiff = right.metric_value - left.metric_value;
  if (metricDiff !== 0) {
    return metricDiff;
  }

  const leftPlayer = playersById.get(left.club_player_id);
  const rightPlayer = playersById.get(right.club_player_id);
  const acquiredDiff = String(leftPlayer?.acquired_at ?? "").localeCompare(String(rightPlayer?.acquired_at ?? ""));
  if (acquiredDiff !== 0) {
    return acquiredDiff;
  }

  return compareByMetricDesc(left, right);
}

function rankCandidates(
  candidates: RankedCandidate[],
  compare: (left: RankedCandidate, right: RankedCandidate) => number,
  limit = HALL_OF_FAME_TOP_N,
): HallOfFameEntry[] {
  return [...candidates]
    .sort(compare)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function buildTenureCandidates(clubSquads: HallOfFameClubSquad[]): RankedCandidate[] {
  return clubSquads.flatMap(({ club, squad }) =>
    squad.map((player) => {
      const seasons = normalizeSeasonsAtClub(player.seasons_at_club);
      return buildEntry(
        player,
        club,
        seasons,
        `${seasons} Saison${seasons === 1 ? "" : "en"}`,
      );
    }),
  );
}

function buildTrainingCandidates(
  clubSquads: HallOfFameClubSquad[],
  trainingGainsByClubPlayerId: Map<string, number>,
): RankedCandidate[] {
  return clubSquads.flatMap(({ club, squad }) =>
    squad
      .map((player) => {
        const gains = getTrainingGainsForClubPlayer(trainingGainsByClubPlayerId, club.id, player.id);
        return gains > 0
          ? buildEntry(player, club, gains, `+${formatStars(gains)} durch Training`)
          : null;
      })
      .filter((entry): entry is RankedCandidate => entry != null),
  );
}

function buildDevelopmentCandidates(clubSquads: HallOfFameClubSquad[]): RankedCandidate[] {
  return clubSquads.flatMap(({ club, squad }) =>
    squad
      .map((player) => {
        const currentStars = Math.trunc(Number(player.current_stars));
        const startStars = normalizeStarsAtAcquisition(player);
        const development = currentStars - startStars;
        return development > 0
          ? buildEntry(
              player,
              club,
              development,
              `+${formatStars(development)} seit Beitritt (${formatStars(startStars)} -> ${formatStars(currentStars)})`,
            )
          : null;
      })
      .filter((entry): entry is RankedCandidate => entry != null),
  );
}

function buildSkillMaxCandidates(clubSquads: HallOfFameClubSquad[]): RankedCandidate[] {
  return clubSquads.flatMap(({ club, squad }) =>
    squad
      .filter(hasReachedSkillMax)
      .map((player) => {
        const skillMax = getPlayerSkillMax(player);
        return buildEntry(player, club, skillMax, `${formatStars(skillMax)} erreicht`);
      }),
  );
}

function buildCategorySnapshots(
  clubSquads: HallOfFameClubSquad[],
  trainingGainsByClubPlayerId: Map<string, number>,
): HallOfFameCategorySnapshot[] {
  const playersById = new Map(
    clubSquads.flatMap(({ squad }) => squad.map((player) => [player.id, player] as const)),
  );

  const tenureCandidates = buildTenureCandidates(clubSquads);
  const trainingCandidates = buildTrainingCandidates(clubSquads, trainingGainsByClubPlayerId);
  const developmentCandidates = buildDevelopmentCandidates(clubSquads);
  const skillMaxCandidates = buildSkillMaxCandidates(clubSquads);

  return [
    {
      id: "tenure",
      label: CATEGORY_LABELS.tenure,
      entries: rankCandidates(tenureCandidates, (left, right) => compareTenure(left, right, playersById)),
    },
    {
      id: "training",
      label: CATEGORY_LABELS.training,
      entries: rankCandidates(trainingCandidates, compareByMetricDesc),
    },
    {
      id: "development",
      label: CATEGORY_LABELS.development,
      entries: rankCandidates(developmentCandidates, compareByMetricDesc),
    },
    {
      id: "skill_max",
      label: CATEGORY_LABELS.skill_max,
      entries: rankCandidates(skillMaxCandidates, compareByMetricDesc),
    },
  ];
}

export function buildHallOfFameSnapshot(params: {
  ownClubId: string;
  clubSquads: HallOfFameClubSquad[];
  trainingTransactions: HallOfFameTrainingTransaction[];
}): HallOfFameSnapshot {
  const trainingGainsByClubPlayerId = sumTrainingGainsByClubPlayerId(params.trainingTransactions);
  const ownClubSquads = params.clubSquads.filter((entry) => entry.club.id === params.ownClubId);

  return {
    league: buildCategorySnapshots(params.clubSquads, trainingGainsByClubPlayerId),
    own_club: buildCategorySnapshots(ownClubSquads, trainingGainsByClubPlayerId),
  };
}
