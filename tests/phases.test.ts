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
  it("runs the first game through draft and the full offseason", () => {
    assert.equal(getNextLobbyPhase("lobby"), "draft");
    assert.equal(getNextLobbyPhase("draft"), "offseason_finance");
    assert.equal(getNextLobbyPhase("offseason_finance"), "offseason_training");
    assert.equal(getNextLobbyPhase("offseason_training"), "offseason_scouting");
    assert.equal(getNextLobbyPhase("offseason_scouting"), "offseason_investments");
    assert.equal(getNextLobbyPhase("offseason_investments"), "deadline_day");
  });

  it("loops later seasons from season end to finance without another draft", () => {
    assert.equal(getNextLobbyPhase("deadline_day"), "prematch");
    assert.equal(getNextLobbyPhase("prematch"), "match");
    assert.equal(getNextLobbyPhase("match"), "season_end");
    assert.equal(getNextLobbyPhase("season_end"), "offseason_finance");
    assert.equal(shouldAdvanceSeason("season_end", "offseason_finance"), true);
  });

  it("increments the season only after season end", () => {
    const settings = {
      max_draft_stars: 3,
      seasonNumber: 1,
      starting_money: 100_000_000,
      turn_timeout_seconds: 60,
    };

    assert.equal(getSettingsForNextPhase(settings, "match", "season_end").seasonNumber, 1);
    assert.equal(getSettingsForNextPhase(settings, "season_end", "offseason_finance").seasonNumber, 2);
  });

  it("keeps transfers offseason-wide but investments phase-only", () => {
    assert.equal(isOffseasonManagementPhase("offseason_finance"), true);
    assert.equal(isOffseasonManagementPhase("deadline_day"), true);
    assert.equal(isOffseasonManagementPhase("match"), false);
    assert.equal(isInvestmentPhase("offseason_investments"), true);
    assert.equal(isInvestmentPhase("offseason_training"), false);
  });
});
