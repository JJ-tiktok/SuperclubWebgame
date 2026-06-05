import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTrainingExtraPlayers,
  getOffseasonPromotionTargetSeason,
  isOffseasonPendingScopeActive,
  resolvePendingEffectSeasonNumber,
  shouldPromoteOffseasonEffectsOnPhaseAdvance,
  sumTrainingCapacityFromPendingEffects,
} from "@/lib/lobby/offseason-pending-effects";

describe("offseason pending effects", () => {
  it("promotes pending effects when entering CL or off_season from season_end", () => {
    assert.equal(shouldPromoteOffseasonEffectsOnPhaseAdvance("season_end", "champions_league"), true);
    assert.equal(shouldPromoteOffseasonEffectsOnPhaseAdvance("season_end", "off_season"), true);
    assert.equal(shouldPromoteOffseasonEffectsOnPhaseAdvance("champions_league", "off_season"), false);
    assert.equal(shouldPromoteOffseasonEffectsOnPhaseAdvance("season_end", "season"), false);
  });

  it("treats stuck next_offseason training bonus as active during off_season", () => {
    const { pendingExtra } = sumTrainingCapacityFromPendingEffects(
      [
        {
          effect_type: "training_capacity_delta",
          scope: "next_offseason",
          payload: { delta: 1 },
        },
      ],
      "off_season",
    );
    assert.equal(pendingExtra, 1);
  });

  it("does not apply next_offseason training bonus during the season", () => {
    const { pendingExtra } = sumTrainingCapacityFromPendingEffects(
      [
        {
          effect_type: "training_capacity_delta",
          scope: "next_offseason",
          payload: { delta: 1 },
        },
      ],
      "season",
    );
    assert.equal(pendingExtra, 0);
  });

  it("computes training extra players with snapshot and game changer delta", () => {
    const extra = computeTrainingExtraPlayers({
      baseCapacity: 2,
      offseasonTrainingCapacity: 3,
      staffEffects: [],
      pendingEffects: [
        {
          effect_type: "training_capacity_delta",
          scope: "current_offseason",
          payload: { delta: 1 },
        },
      ],
      phase: "off_season",
    });
    assert.equal(extra, 2);
  });

  it("isOffseasonPendingScopeActive without phase only allows current_offseason", () => {
    assert.equal(isOffseasonPendingScopeActive("current_offseason", undefined), true);
    assert.equal(isOffseasonPendingScopeActive("next_offseason", undefined), false);
  });

  it("stores next_offseason effects for the upcoming offseason season number", () => {
    assert.equal(
      resolvePendingEffectSeasonNumber({ drawSeason: 1, scope: "next_offseason" }),
      2,
    );
    assert.equal(
      resolvePendingEffectSeasonNumber({ drawSeason: 2, scope: "next_offseason", phase: "off_season" }),
      3,
    );
  });

  it("stores current_offseason effects for the active offseason when already in off_season", () => {
    assert.equal(
      resolvePendingEffectSeasonNumber({ drawSeason: 2, scope: "current_offseason", phase: "off_season" }),
      2,
    );
    assert.equal(
      resolvePendingEffectSeasonNumber({ drawSeason: 1, scope: "current_offseason", phase: "season" }),
      2,
    );
  });

  it("computes the promotion target season from the current settings season", () => {
    assert.equal(getOffseasonPromotionTargetSeason(1), 2);
    assert.equal(getOffseasonPromotionTargetSeason(4), 5);
  });
});
