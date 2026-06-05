import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRevealDeadlineAuctionPlayers,
  canUpgradeEndgameFacility,
  getEndgameUpgradeCost,
  getInvestmentActionLimit,
  getMedicalHealLimit,
  getMedicalHealsRemaining,
  getNlzTalentCountPerOffseason,
  hasMidTableStatus,
  hasTitleContenderStatus,
} from "@/lib/lobby/endgame-facilities";
import { buildYouthPlayerSeed, isNlzOriginPlayer } from "@/lib/lobby/youth-generator";

describe("endgame facilities", () => {
  it("enforces manager status gates", () => {
    assert.equal(hasMidTableStatus("established"), false);
    assert.equal(hasMidTableStatus("mid_table"), true);
    assert.equal(hasTitleContenderStatus("mid_table"), false);
    assert.equal(hasTitleContenderStatus("title_contender"), true);
  });

  it("returns expected upgrade costs", () => {
    assert.equal(getEndgameUpgradeCost("medical", 0), 30_000_000);
    assert.equal(getEndgameUpgradeCost("analytics", 1), 70_000_000);
    assert.equal(getEndgameUpgradeCost("construction_yard", 0), 100_000_000);
  });

  it("blocks endgame upgrades without status or money", () => {
    assert.deepEqual(
      canUpgradeEndgameFacility({
        action: "medical",
        actionsThisSeason: [],
        clubStatus: "established",
        currentLevel: 0,
        money: 200_000_000,
        actionLimit: 2,
      }),
      { ok: false, reason: "requires_mid_table" },
    );

    assert.deepEqual(
      canUpgradeEndgameFacility({
        action: "medical",
        actionsThisSeason: [],
        clubStatus: "mid_table",
        currentLevel: 1,
        money: 200_000_000,
        actionLimit: 2,
      }),
      { ok: false, reason: "requires_title_contender" },
    );
  });

  it("adds construction yard bonus to investment limit", () => {
    assert.equal(getInvestmentActionLimit(0, false), 2);
    assert.equal(getInvestmentActionLimit(1, true), 5);
  });

  it("tracks medical heal limits", () => {
    assert.equal(getMedicalHealLimit(0), 0);
    assert.equal(getMedicalHealLimit(2), 2);
    assert.equal(getMedicalHealsRemaining(2, 1), 1);
    assert.equal(getMedicalHealsRemaining(3, 99), Number.POSITIVE_INFINITY);
  });

  it("scales NLZ talent generation", () => {
    assert.equal(getNlzTalentCountPerOffseason(0), 0);
    assert.equal(getNlzTalentCountPerOffseason(1), 1);
    assert.equal(getNlzTalentCountPerOffseason(3), 2);
  });

  it("builds NLZ youth player seeds", () => {
    const seed = buildYouthPlayerSeed(() => 0);
    assert.equal(seed.base_stars, 1);
    assert.equal(seed.potential_stars, 5);
    assert.equal(seed.age_group, "talent");
    assert.equal(isNlzOriginPlayer(seed.metadata), true);
  });

  it("reveals deadline players only at analytics level 3", () => {
    assert.equal(canRevealDeadlineAuctionPlayers(2), false);
    assert.equal(canRevealDeadlineAuctionPlayers(3), true);
  });
});
