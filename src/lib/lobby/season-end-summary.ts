import { getNextLobbyPhase } from "@/lib/lobby/phases";
import type {
  ClubFinanceSnapshot,
  LobbyClub,
  LobbySettings,
  MatchNewsSnapshot,
  ManagerStandingSnapshot,
  SeasonSnapshot,
  SeasonStandingSnapshot,
} from "@/lib/lobby/types";

type BuildSeasonEndSummaryInput = {
  finance?: ClubFinanceSnapshot | null;
  matchNews: MatchNewsSnapshot[];
  ownClub?: Pick<LobbyClub, "id"> | null;
  season: SeasonSnapshot | null;
  settings: LobbySettings;
};

export type SeasonEndSummaryModel = {
  completedFixtureCount: number;
  finance: ClubFinanceSnapshot | null;
  goesToContinentalCup: boolean;
  hasSeasonData: boolean;
  highlightNews: MatchNewsSnapshot[];
  leagueWinner: SeasonStandingSnapshot | null;
  nextPhase: ReturnType<typeof getNextLobbyPhase>;
  ownStanding: ManagerStandingSnapshot | null;
  setupError?: string;
  topManagers: ManagerStandingSnapshot[];
  totalFixtureCount: number;
};

export function buildSeasonEndSummaryModel({
  finance,
  matchNews,
  ownClub,
  season,
  settings,
}: BuildSeasonEndSummaryInput): SeasonEndSummaryModel {
  const nextPhase = getNextLobbyPhase("season_end", settings);

  if (!season || season.manager_standings.length === 0) {
    return {
      completedFixtureCount: 0,
      finance: finance ?? null,
      goesToContinentalCup: nextPhase === "champions_league",
      hasSeasonData: false,
      highlightNews: [],
      leagueWinner: null,
      nextPhase,
      ownStanding: null,
      setupError: season?.setup_error,
      topManagers: [],
      totalFixtureCount: season?.fixtures.length ?? 0,
    };
  }

  const topManagers = [...season.manager_standings].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const ownStanding = ownClub
    ? (season.manager_standings.find((standing) => standing.club_id === ownClub.id) ?? null)
    : null;
  const leagueWinner = [...season.standings].sort((a, b) => a.rank - b.rank)[0] ?? null;
  const completedFixtureCount = season.fixtures.filter((fixture) => fixture.status === "completed").length;

  return {
    completedFixtureCount,
    finance: finance ?? null,
    goesToContinentalCup: nextPhase === "champions_league",
    hasSeasonData: true,
    highlightNews: getSeasonHighlightNews(matchNews, season, ownClub?.id),
    leagueWinner,
    nextPhase,
    ownStanding,
    setupError: season.setup_error,
    topManagers,
    totalFixtureCount: season.fixtures.length,
  };
}

function getSeasonHighlightNews(matchNews: MatchNewsSnapshot[], season: SeasonSnapshot, ownClubId?: string) {
  const fixtureIds = new Set(season.fixtures.map((fixture) => fixture.id));
  const seasonNews = matchNews.filter((news) => !news.fixture_id || fixtureIds.has(news.fixture_id));
  const sortByNewest = (a: MatchNewsSnapshot, b: MatchNewsSnapshot) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  if (!ownClubId) {
    return [...seasonNews].sort(sortByNewest).slice(0, 5);
  }

  const ownNews = seasonNews.filter((news) => news.club_id === ownClubId).sort(sortByNewest);
  const otherNews = seasonNews.filter((news) => news.club_id !== ownClubId).sort(sortByNewest);
  return [...ownNews, ...otherNews].slice(0, 5);
}
