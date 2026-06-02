import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNextRoundFixtures,
  buildRound32Fixtures,
  CONTINENTAL_BRACKET_SIZE,
  requiredContinentalCpuCount,
  shouldRunContinentalCup,
  shuffleParticipants,
} from "@/lib/lobby/continental-cup";
import { getNextLobbyPhase, getSettingsForNextPhase, shouldAdvanceSeason } from "@/lib/lobby/phases";

describe("Continental Cup", () => {
  it("runs only on even seasons from season 2", () => {
    assert.equal(shouldRunContinentalCup(1), false);
    assert.equal(shouldRunContinentalCup(2), true);
    assert.equal(shouldRunContinentalCup(3), false);
    assert.equal(shouldRunContinentalCup(4), true);
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
});

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
});
