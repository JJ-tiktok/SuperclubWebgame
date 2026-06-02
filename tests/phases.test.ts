import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNextLobbyPhase,
  getSettingsForNextPhase,
  isInvestmentPhase,
  isOffseasonManagementPhase,
  shouldAdvanceSeason,
} from "@/lib/lobby/phases";

describe("Lobby phase flow", () => {
  it("runs the first game through draft and the consolidated off_season", () => {
    assert.equal(getNextLobbyPhase("lobby"), "draft");
    assert.equal(getNextLobbyPhase("draft"), "off_season");
    assert.equal(getNextLobbyPhase("off_season"), "deadline_day");
  });

  it("loops later seasons from season end back into off_season", () => {
    assert.equal(getNextLobbyPhase("deadline_day"), "season");
    assert.equal(getNextLobbyPhase("season"), "season_end");
    assert.equal(getNextLobbyPhase("season_end"), "off_season");
    assert.equal(shouldAdvanceSeason("season_end", "off_season"), true);
  });

  it("routes odd season end directly to off_season", () => {
    const settings = {
      max_draft_stars: 3,
      seasonNumber: 1,
      starting_money: 100_000_000,
      turn_timeout_seconds: 60,
    };
    assert.equal(getNextLobbyPhase("season_end", settings), "off_season");
  });

  it("increments the season only after season end", () => {
    const settings = {
      max_draft_stars: 3,
      seasonNumber: 1,
      starting_money: 100_000_000,
      turn_timeout_seconds: 60,
    };

    assert.equal(getSettingsForNextPhase(settings, "season", "season_end").seasonNumber, 1);
    assert.equal(getSettingsForNextPhase(settings, "season_end", "off_season").seasonNumber, 2);
  });

  it("treats off_season and deadline_day as management phases and off_season as investment phase", () => {
    assert.equal(isOffseasonManagementPhase("off_season"), true);
    assert.equal(isOffseasonManagementPhase("deadline_day"), true);
    assert.equal(isOffseasonManagementPhase("season"), false);
    assert.equal(isInvestmentPhase("off_season"), true);
    assert.equal(isInvestmentPhase("season"), false);
  });
});
