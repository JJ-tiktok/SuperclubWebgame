import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSeasonEndSummaryModel } from "@/lib/lobby/season-end-summary";
import type {
  ClubFinanceSnapshot,
  LobbySettings,
  MatchNewsSnapshot,
  ManagerStandingSnapshot,
  SeasonFixtureSnapshot,
  SeasonSnapshot,
  SeasonStandingSnapshot,
} from "@/lib/lobby/types";

const baseSettings: LobbySettings = {
  max_draft_stars: 3,
  seasonNumber: 1,
  starting_money: 100_000_000,
  turn_timeout_seconds: 60,
};

const finance: ClubFinanceSnapshot = {
  money: 60_000_000,
  placement_reward: 15_000_000,
  projected_income: 35_000_000,
  projected_net: 12_000_000,
  squad_stars: 42,
  stadium_income: 20_000_000,
  wages: 23_000_000,
};

function managerStanding(
  clubId: string,
  rank: number,
  seasonScore: number,
  squadStars = 30,
  seasonMatchPoints = 12,
  status: ManagerStandingSnapshot["status"] = rank === 1 ? "title_contender" : "established",
): ManagerStandingSnapshot {
  return {
    attractiveness_stars: rank === 1 ? 6 : 4,
    club_id: clubId,
    club_name: `Club ${clubId}`,
    rank,
    season_match_points: seasonMatchPoints,
    season_score: seasonScore,
    squad_stars: squadStars,
    status,
  };
}

function fixture(id: string, status: "completed" | "scheduled" = "completed"): SeasonFixtureSnapshot {
  return {
    away_lineup_locked: false,
    away_participant: participant(`${id}-away`, "Away"),
    away_participant_id: `${id}-away`,
    current_third: 0,
    game_id: "game-1",
    home_lineup_locked: false,
    home_participant: participant(`${id}-home`, "Home"),
    home_participant_id: `${id}-home`,
    home_ready_for_next_third: false,
    away_ready_for_next_third: false,
    id,
    match_state: status === "completed" ? "completed" : "scheduled",
    matchday: 1,
    season_number: 1,
    status,
  };
}

function participant(id: string, displayName: string) {
  return {
    display_name: displayName,
    game_id: "game-1",
    id,
    kind: "human" as const,
    season_number: 1,
  };
}

function leagueStanding(rank: number, displayName: string): SeasonStandingSnapshot {
  return {
    draws: 0,
    fixture_points_against: 0,
    fixture_points_for: 0,
    losses: 0,
    match_points: rank === 1 ? 12 : 6,
    participant: participant(`league-${rank}`, displayName),
    participant_id: `league-${rank}`,
    played: 5,
    rank,
    season_number: 1,
    third_points_against: 0,
    third_points_for: 0,
    wins: rank === 1 ? 4 : 2,
  };
}

function news(id: string, clubId: string | null, fixtureId: string | null, createdAt: string): MatchNewsSnapshot {
  return {
    category: "injury",
    club_id: clubId,
    created_at: createdAt,
    detail: `Detail ${id}`,
    fixture_id: fixtureId,
    game_id: "game-1",
    headline: `News ${id}`,
    id,
  };
}

function season(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    current_matchday: 5,
    fixtures: [fixture("fixture-1"), fixture("fixture-2", "scheduled")],
    manager_standings: [
      managerStanding("club-c", 3, 43),
      managerStanding("club-a", 1, 67),
      managerStanding("club-b", 2, 52),
      managerStanding("club-d", 4, 30),
    ],
    standings: [leagueStanding(2, "Runner FC"), leagueStanding(1, "Winner FC")],
    ...overrides,
  };
}

describe("season end summary model", () => {
  it("sorts the manager top 3 by rank and includes completed fixture counts", () => {
    const summary = buildSeasonEndSummaryModel({
      finance,
      matchNews: [],
      ownClub: { id: "club-b" },
      season: season(),
      settings: baseSettings,
    });

    assert.equal(summary.hasSeasonData, true);
    assert.deepEqual(summary.topManagers.map((standing) => standing.club_id), ["club-a", "club-b", "club-c"]);
    assert.equal(summary.ownStanding?.club_id, "club-b");
    assert.equal(summary.leagueWinner?.participant.display_name, "Winner FC");
    assert.equal(summary.completedFixtureCount, 1);
    assert.equal(summary.totalFixtureCount, 2);
    assert.equal(summary.finance?.projected_net, 12_000_000);
  });

  it("detects the Continental Cup as next step when enabled and due", () => {
    const summary = buildSeasonEndSummaryModel({
      matchNews: [],
      season: season({
        manager_standings: [
          managerStanding("club-a", 1, 67, 30, 12, "title_contender"),
          managerStanding("club-b", 2, 52, 28, 10, "mid_table"),
        ],
      }),
      settings: { ...baseSettings, continental_cup_enabled: true, seasonNumber: 2 },
    });

    assert.equal(summary.nextPhase, "champions_league");
    assert.equal(summary.goesToContinentalCup, true);
    assert.equal(summary.continentalCupSkipped, false);
  });

  it("skips the Continental Cup when no club reaches mid_table", () => {
    const summary = buildSeasonEndSummaryModel({
      matchNews: [],
      season: season({
        manager_standings: [
          managerStanding("club-a", 1, 67, 30, 12, "established"),
          managerStanding("club-b", 2, 52, 28, 10, "newly_promoted"),
        ],
      }),
      settings: { ...baseSettings, continental_cup_enabled: true, seasonNumber: 2 },
    });

    assert.equal(summary.nextPhase, "off_season");
    assert.equal(summary.goesToContinentalCup, false);
    assert.equal(summary.continentalCupSkipped, true);
  });

  it("detects off-season as next step when Continental Cup is disabled", () => {
    const summary = buildSeasonEndSummaryModel({
      matchNews: [],
      season: season(),
      settings: { ...baseSettings, continental_cup_enabled: false, seasonNumber: 2 },
    });

    assert.equal(summary.nextPhase, "off_season");
    assert.equal(summary.goesToContinentalCup, false);
  });

  it("returns a fallback model when season data is missing", () => {
    const summary = buildSeasonEndSummaryModel({
      finance,
      matchNews: [],
      ownClub: { id: "club-a" },
      season: null,
      settings: baseSettings,
    });

    assert.equal(summary.hasSeasonData, false);
    assert.equal(summary.topManagers.length, 0);
    assert.equal(summary.ownStanding, null);
    assert.equal(summary.finance?.money, 60_000_000);
  });

  it("prefers own current-season news and filters old fixture news", () => {
    const summary = buildSeasonEndSummaryModel({
      matchNews: [
        news("old", "club-a", "old-fixture", "2026-01-03T10:00:00.000Z"),
        news("other", "club-b", "fixture-1", "2026-01-05T10:00:00.000Z"),
        news("own-new", "club-a", "fixture-2", "2026-01-04T10:00:00.000Z"),
        news("own-old", "club-a", "fixture-1", "2026-01-02T10:00:00.000Z"),
      ],
      ownClub: { id: "club-a" },
      season: season(),
      settings: baseSettings,
    });

    assert.deepEqual(summary.highlightNews.map((item) => item.id), ["own-new", "own-old", "other"]);
  });
});
