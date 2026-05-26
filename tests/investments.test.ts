import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUpgradeFacility, getUpgradeCost } from "@/lib/lobby/investments";
import { getPlacementReward, getStadiumIncome } from "@/lib/game/rules";

describe("Club overview investment rules", () => {
  it("blocks upgrades at max level", () => {
    assert.deepEqual(
      canUpgradeFacility({ action: "training", actionsThisSeason: [], currentLevel: 4, money: 200_000_000 }),
      { ok: false, reason: "max_level" },
    );
  });

  it("blocks upgrades with insufficient money", () => {
    assert.deepEqual(
      canUpgradeFacility({ action: "stadium", actionsThisSeason: [], currentLevel: 3, money: 10_000_000 }),
      { ok: false, reason: "insufficient_money" },
    );
  });

  it("blocks more than two investment actions per season", () => {
    assert.deepEqual(
      canUpgradeFacility({
        action: "stadium",
        actionsThisSeason: ["training", "scouting"],
        currentLevel: 1,
        money: 200_000_000,
      }),
      { ok: false, reason: "investment_action_limit" },
    );
  });

  it("blocks duplicate investment departments", () => {
    assert.deepEqual(
      canUpgradeFacility({
        action: "training",
        actionsThisSeason: ["training"],
        currentLevel: 1,
        money: 200_000_000,
      }),
      { ok: false, reason: "same_department_twice" },
    );
  });

  it("returns the next upgrade cost when allowed", () => {
    assert.deepEqual(
      canUpgradeFacility({ action: "scouting", actionsThisSeason: [], currentLevel: 2, money: 40_000_000 }),
      { ok: true, cost: getUpgradeCost("scouting", 2) },
    );
  });

  it("calculates the finance preview parts", () => {
    const squadStars = 42;
    const wages = squadStars * 1_000_000;
    const stadiumIncome = getStadiumIncome(2, "title_contender");
    const placementReward = getPlacementReward(1, 4);

    assert.equal(wages, 42_000_000);
    assert.equal(stadiumIncome, 75_000_000);
    assert.equal(placementReward, 100_000_000);
    assert.equal(stadiumIncome + placementReward - wages, 133_000_000);
  });
});
