import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignContinentalCpuSlots,
  buildCpuOnlyTierPool,
  buildNextRoundFixtures,
  buildRound32Fixtures,
  buildSeededRound32Fixtures,
  classifyQualifiedHumans,
  CONTINENTAL_BRACKET_SIZE,
  CONTINENTAL_LINEUPS_BY_TIER,
  CONTINENTAL_PRIZE_FINALIST,
  CONTINENTAL_PRIZE_SEMIFINAL,
  CONTINENTAL_PRIZE_WINNER,
  getContinentalLineupStars,
  getHumanLeagueRank,
  getNextContinentalRound,
  getPrizeForEliminationRound,
  isContinentalFinalRound,
  isContinentalQualified,
  requiredContinentalCpuCount,
  shouldRunContinentalCup,
  shuffleParticipants,
} from "@/lib/lobby/continental-cup";
import type { SeasonStandingSnapshot } from "@/lib/lobby/types";
import { getNextLobbyPhase, getSettingsForNextPhase, shouldAdvanceSeason } from "@/lib/lobby/phases";

describe("Continental Cup", () => {
  it("runs only on even seasons from season 2", () => {
    assert.equal(shouldRunContinentalCup(1), false);
    assert.equal(shouldRunContinentalCup(2), true);
    assert.equal(shouldRunContinentalCup(3), false);
    assert.equal(shouldRunContinentalCup(4), true);
  });

  it("respects continental_cup_enabled in lobby settings", () => {
    assert.equal(shouldRunContinentalCup(2, { continental_cup_enabled: false }), false);
    assert.equal(shouldRunContinentalCup(2, { continental_cup_enabled: true }), true);
    assert.equal(shouldRunContinentalCup(2, {}), true);
  });

  it("fills CPU slots to reach 32 teams", () => {
    assert.equal(requiredContinentalCpuCount(4), 28);
    assert.equal(requiredContinentalCpuCount(32), 0);
    assert.equal(requiredContinentalCpuCount(4) + 4, CONTINENTAL_BRACKET_SIZE);
  });

  it("builds 16 round-of-32 pairings", () => {
    const ids = Array.from({ length: 32 }, (_, index) => `p-${index}`);
    const shuffled = shuffleParticipants(ids, () => 0.5);
    const fixtures = buildRound32Fixtures(shuffled);
    assert.equal(fixtures.length, 16);
    assert.equal(fixtures[0]?.round, 32);
    assert.equal(fixtures[0]?.home_participant_id, shuffled[0]);
    assert.equal(fixtures[0]?.away_participant_id, shuffled[1]);
  });

  it("advances winners into the next round", () => {
    const winners = Array.from({ length: 16 }, (_, index) => `w-${index}`);
    const next = buildNextRoundFixtures(32, winners);
    assert.equal(next.length, 8);
    assert.equal(next[0]?.round, 16);
    assert.equal(next[0]?.home_participant_id, "w-0");
    assert.equal(next[0]?.away_participant_id, "w-1");
  });

  it("ends the bracket after the round-2 final (no phantom round 1)", () => {
    assert.equal(getNextContinentalRound(2), null);
    assert.equal(isContinentalFinalRound(2), true);
    assert.deepEqual(buildNextRoundFixtures(2, ["winner-only"]), []);
  });

  it("builds a single final from two semifinal winners", () => {
    const next = buildNextRoundFixtures(4, ["w-a", "w-b"]);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.round, 2);
  });

  it("checks continental qualification by club status", () => {
    assert.equal(isContinentalQualified("mid_table"), true);
    assert.equal(isContinentalQualified("title_contender"), true);
    assert.equal(isContinentalQualified("established"), false);
    assert.equal(isContinentalQualified("newly_promoted"), false);
  });

  it("ranks human clubs only in the league table", () => {
    const standings: SeasonStandingSnapshot[] = [
      {
        draws: 0,
        fixture_points_against: 0,
        fixture_points_for: 0,
        losses: 0,
        match_points: 12,
        participant: {
          display_name: "CPU 1",
          game_id: "g1",
          id: "cpu-1",
          kind: "cpu",
          season_number: 2,
        },
        participant_id: "cpu-1",
        played: 5,
        rank: 1,
        season_number: 2,
        third_points_against: 0,
        third_points_for: 0,
        wins: 4,
      },
      {
        draws: 0,
        fixture_points_against: 0,
        fixture_points_for: 0,
        losses: 1,
        match_points: 9,
        participant: {
          club_id: "human-a",
          display_name: "Human A",
          game_id: "g1",
          id: "human-a",
          kind: "human",
          season_number: 2,
        },
        participant_id: "human-a",
        played: 5,
        rank: 2,
        season_number: 2,
        third_points_against: 0,
        third_points_for: 0,
        wins: 3,
      },
      {
        draws: 0,
        fixture_points_against: 0,
        fixture_points_for: 0,
        losses: 2,
        match_points: 6,
        participant: {
          club_id: "human-b",
          display_name: "Human B",
          game_id: "g1",
          id: "human-b",
          kind: "human",
          season_number: 2,
        },
        participant_id: "human-b",
        played: 5,
        rank: 3,
        season_number: 2,
        third_points_against: 0,
        third_points_for: 0,
        wins: 2,
      },
    ];

    assert.equal(getHumanLeagueRank(standings, "human-a"), 1);
    assert.equal(getHumanLeagueRank(standings, "human-b"), 2);
  });

  it("assigns underdog opponents to top-2 human league ranks", () => {
    const standings: SeasonStandingSnapshot[] = [
      leagueStanding(1, "human-top", "human-top"),
      leagueStanding(2, "human-second", "human-second"),
      leagueStanding(3, "human-third", "human-third"),
    ];

    const qualified = classifyQualifiedHumans(
      [
        { club_id: "human-top", display_name: "Top" },
        { club_id: "human-second", display_name: "Second" },
        { club_id: "human-third", display_name: "Third" },
      ],
      standings,
    );

    assert.deepEqual(
      qualified.map((entry) => [entry.club_id, entry.opponent_tier]),
      [
        ["human-top", "underdog"],
        ["human-second", "underdog"],
        ["human-third", "schwer"],
      ],
    );
  });

  it("builds CPU-only pool with 1-2 underdogs and hard tiers", () => {
    const tiers = buildCpuOnlyTierPool(28, () => 0.1);
    assert.equal(tiers.length, 28);
    const underdogs = tiers.filter((tier) => tier === "underdog").length;
    assert.ok(underdogs === 1 || underdogs === 2);
    assert.equal(
      tiers.filter((tier) => tier !== "underdog").length,
      28 - underdogs,
    );
  });

  it("seeds round 32 with human tier opponents and cpu-only matches", () => {
    const qualifiedHumans = classifyQualifiedHumans(
      [
        { club_id: "human-top", display_name: "Top" },
        { club_id: "human-second", display_name: "Second" },
      ],
      [leagueStanding(1, "human-top", "human-top"), leagueStanding(2, "human-second", "human-second")],
    );
    const cpuCatalog = Array.from({ length: 30 }, (_, index) => ({
      id: `cpu-${index}`,
      display_name: `CPU ${index}`,
    }));
    const cpuSlots = assignContinentalCpuSlots(qualifiedHumans, cpuCatalog, () => 0.25);

    const humanParticipantIds = new Map([
      ["human-top", "p-human-top"],
      ["human-second", "p-human-second"],
    ]);
    const cpuParticipants = cpuSlots.map((slot, index) => ({
      participant_id: `p-cpu-${index}`,
      tier: slot.tier,
    }));

    const fixtures = buildSeededRound32Fixtures({
      humanParticipantIds,
      cpuParticipants,
      qualifiedHumans,
      random: () => 0.5,
    });

    assert.equal(fixtures.length, 16);
    const humanFixture = fixtures.find(
      (fixture) => fixture.home_participant_id === "p-human-top" || fixture.away_participant_id === "p-human-top",
    );
    assert.ok(humanFixture);
    const opponentId =
      humanFixture!.home_participant_id === "p-human-top"
        ? humanFixture!.away_participant_id
        : humanFixture!.home_participant_id;
    const opponent = cpuParticipants.find((cpu) => cpu.participant_id === opponentId);
    assert.equal(opponent?.tier, "underdog");
  });

  it("exposes tier lineup stars", () => {
    const eliteOffensive = getContinentalLineupStars("elite", 2);
    assert.deepEqual(eliteOffensive, { def: 26, mid: 28, att: 30, display_name: "Offensiv" });
    assert.equal(CONTINENTAL_LINEUPS_BY_TIER.underdog[0]?.def, 15);
  });

  it("maps elimination prizes", () => {
    assert.equal(getPrizeForEliminationRound(8), 0);
    assert.equal(getPrizeForEliminationRound(4), CONTINENTAL_PRIZE_SEMIFINAL);
    assert.equal(getPrizeForEliminationRound(2), CONTINENTAL_PRIZE_FINALIST);
    assert.equal(CONTINENTAL_PRIZE_WINNER, 100_000_000);
  });
});

function leagueStanding(rank: number, clubId: string, displayName: string): SeasonStandingSnapshot {
  return {
    draws: 0,
    fixture_points_against: 0,
    fixture_points_for: 0,
    losses: 0,
    match_points: 12,
    participant: {
      club_id: clubId,
      display_name: displayName,
      game_id: "g1",
      id: clubId,
      kind: "human",
      season_number: 2,
    },
    participant_id: clubId,
    played: 5,
    rank,
    season_number: 2,
    third_points_against: 0,
    third_points_for: 0,
    wins: 4,
  };
}

describe("Continental Cup phase flow", () => {
  const baseSettings = {
    max_draft_stars: 3,
    seasonNumber: 2,
    starting_money: 100_000_000,
    turn_timeout_seconds: 60,
  };

  it("routes even season end into champions_league", () => {
    assert.equal(getNextLobbyPhase("season_end", baseSettings), "champions_league");
    assert.equal(getNextLobbyPhase("champions_league", baseSettings), "off_season");
  });

  it("increments season only when entering off_season from CL", () => {
    assert.equal(shouldAdvanceSeason("champions_league", "off_season"), true);
    assert.equal(getSettingsForNextPhase(baseSettings, "champions_league", "off_season").seasonNumber, 3);
    assert.equal(getSettingsForNextPhase(baseSettings, "season_end", "champions_league").seasonNumber, 2);
  });

  it("skips champions_league when continental cup is disabled", () => {
    const disabled = { ...baseSettings, continental_cup_enabled: false };
    assert.equal(getNextLobbyPhase("season_end", disabled), "off_season");
    assert.equal(getSettingsForNextPhase(disabled, "season_end", "off_season").seasonNumber, 3);
  });
});
