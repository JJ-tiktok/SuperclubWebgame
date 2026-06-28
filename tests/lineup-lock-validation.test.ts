import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLineupLockValidation } from "@/lib/lobby/lineup-lock-validation";

function player(zone: string, injured = false) {
  return { current_zone: zone, injured };
}

function lineup442() {
  return [
    player("GK"),
    player("DEF"),
    player("DEF"),
    player("DEF"),
    player("DEF"),
    player("MID"),
    player("MID"),
    player("MID"),
    player("MID"),
    player("ATT"),
    player("ATT"),
  ];
}

describe("getLineupLockValidation", () => {
  it("accepts 11 healthy players in a valid 4-4-2", () => {
    const result = getLineupLockValidation(lineup442());

    assert.equal(result.isComplete, true);
    assert.equal(result.hasIncompleteLineup, false);
    assert.equal(result.hasInjuredInLineup, false);
    assert.equal(result.starterCount, 11);
    assert.deepEqual(result.zoneCounts, { ATT: 2, DEF: 4, GK: 1, MID: 4 });
  });

  it("rejects lineups with only 10 healthy starters", () => {
    const result = getLineupLockValidation(lineup442().slice(0, 10));

    assert.equal(result.isComplete, false);
    assert.equal(result.hasIncompleteLineup, true);
    assert.equal(result.starterCount, 10);
  });

  it("rejects 11 healthy players with invalid zone distribution", () => {
    const result = getLineupLockValidation([
      player("GK"),
      player("DEF"),
      player("DEF"),
      player("MID"),
      player("MID"),
      player("MID"),
      player("MID"),
      player("ATT"),
      player("ATT"),
      player("ATT"),
      player("ATT"),
    ]);

    assert.equal(result.isComplete, false);
    assert.equal(result.hasIncompleteLineup, true);
    assert.equal(result.starterCount, 11);
  });

  it("flags injured players still assigned to the lineup", () => {
    const players = lineup442();
    players[5] = player("MID", true);

    const result = getLineupLockValidation(players);

    assert.equal(result.hasInjuredInLineup, true);
    assert.equal(result.isComplete, false);
    assert.equal(result.starterCount, 10);
  });
});
