import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPrestigeDeductionFloor,
  PRESTIGE_POINTS,
  updateConsecutiveLastManagerSeasons,
} from "@/lib/lobby/prestige";
import {
  buildLastPlaceBonusSnapshot,
  canClaimLastPlaceBonus,
  isLastPlaceBonusEligible,
  LAST_PLACE_BONUS_MONEY,
  markLastPlaceBonusClaimed,
  OFFSEASON_GAME_CHANGER_CATEGORIES,
} from "@/lib/lobby/last-place-bonus";

describe("prestige deductions", () => {
  it("applies manager rank last penalty constant", () => {
    assert.equal(PRESTIGE_POINTS.manager_rank_last, -3);
  });

  it("allows negative prestige after deduction", () => {
    assert.equal(applyPrestigeDeductionFloor(2, -3), -1);
    assert.equal(applyPrestigeDeductionFloor(10, -3), 7);
    assert.equal(applyPrestigeDeductionFloor(0, -3), -3);
  });
});

describe("consecutive last manager seasons", () => {
  it("increments when finishing last and resets otherwise", () => {
    assert.equal(updateConsecutiveLastManagerSeasons({}, true).consecutive_last_manager_seasons, 1);
    assert.equal(
      updateConsecutiveLastManagerSeasons({ consecutive_last_manager_seasons: 1 }, true)
        .consecutive_last_manager_seasons,
      2,
    );
    assert.equal(
      updateConsecutiveLastManagerSeasons({ consecutive_last_manager_seasons: 2 }, false)
        .consecutive_last_manager_seasons,
      0,
    );
  });
});

describe("last place bonus eligibility", () => {
  it("is eligible only when bonus season matches and not yet claimed", () => {
    const state = { last_place_bonus_season: 3, last_place_bonus_claimed_season: null };
    assert.equal(isLastPlaceBonusEligible(state, 3), true);
    assert.equal(canClaimLastPlaceBonus(state, 3), true);
    assert.equal(canClaimLastPlaceBonus(state, 2), false);
  });

  it("blocks claim after bonus was used this season", () => {
    const state = { last_place_bonus_season: 3, last_place_bonus_claimed_season: 3 };
    assert.equal(canClaimLastPlaceBonus(state, 3), false);
  });

  it("grants bonus snapshot only for first consecutive last season", () => {
    const eligible = buildLastPlaceBonusSnapshot(
      { last_place_bonus_season: 2, consecutive_last_manager_seasons: 1 },
      2,
      false,
    );
    assert.equal(eligible.eligible, true);
    assert.equal(eligible.blocked_reason, null);

    const blocked = buildLastPlaceBonusSnapshot({ consecutive_last_manager_seasons: 2 }, 2, false);
    assert.equal(blocked.eligible, false);
    assert.equal(blocked.blocked_reason, "consecutive_last");
  });

  it("clears bonus season when claimed", () => {
    const next = markLastPlaceBonusClaimed({ last_place_bonus_season: 2 }, 2);
    assert.equal(next.last_place_bonus_claimed_season, 2);
    assert.equal(next.last_place_bonus_season, null);
  });

  it("uses positive-only game changer categories for offseason draw", () => {
    assert.deepEqual(OFFSEASON_GAME_CHANGER_CATEGORIES, ["good_news", "secret_weapon"]);
  });

  it("exposes five million cash bonus", () => {
    assert.equal(LAST_PLACE_BONUS_MONEY, 5_000_000);
  });
});
