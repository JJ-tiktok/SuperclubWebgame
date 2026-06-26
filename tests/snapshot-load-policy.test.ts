import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getClubOverviewLoadProfileForView,
  shouldLoadClubOverviewForView,
  shouldLoadHallOfFameSnapshot,
  shouldLoadScoutingForView,
} from "@/lib/lobby/snapshot-load-policy";

describe("off-season snapshot loading", () => {
  it("loads scouting on every view during consolidated off_season", () => {
    assert.equal(shouldLoadScoutingForView("off_season", "training"), true);
    assert.equal(shouldLoadScoutingForView("off_season", "grounds"), true);
    assert.equal(shouldLoadScoutingForView("off_season", "table"), true);
    assert.equal(shouldLoadScoutingForView("season", "training"), false);
  });

  it("loads club overview on every view during consolidated off_season", () => {
    assert.equal(shouldLoadClubOverviewForView("off_season", "table"), true);
    assert.equal(shouldLoadClubOverviewForView("off_season", "settings"), true);
    assert.equal(shouldLoadClubOverviewForView("season", "table"), false);
  });

  it("loads club overview and squad on dashboard across phases", () => {
    assert.equal(shouldLoadClubOverviewForView("season", "dashboard"), true);
    assert.equal(shouldLoadClubOverviewForView("draft", "dashboard"), true);
    const profile = getClubOverviewLoadProfileForView("season", "dashboard");
    assert.equal(profile.loadSquad, true);
  });

  it("loads checklist-related club overview slices on every off_season view", () => {
    for (const view of ["training", "scouting", "grounds", "squad", "table", "settings"] as const) {
      const profile = getClubOverviewLoadProfileForView("off_season", view);
      assert.equal(profile.loadTrainingTransactions, true, `${view}: training transactions`);
      assert.equal(profile.loadInvestments, true, `${view}: investments`);
      assert.equal(profile.loadSponsorContracts, true, `${view}: sponsor contracts`);
      assert.equal(profile.loadStaff, true, `${view}: staff`);
      assert.equal(profile.loadPendingEffects, true, `${view}: pending effects`);
    }
  });

  it("loads squad on grounds for sponsor reward player picks", () => {
    const profile = getClubOverviewLoadProfileForView("off_season", "grounds");
    assert.equal(profile.loadSquad, true);
    assert.equal(profile.loadSponsorContracts, true);
  });

  it("loads squad for hall_of_fame view", () => {
    assert.equal(shouldLoadHallOfFameSnapshot("hall_of_fame"), true);
    assert.equal(shouldLoadHallOfFameSnapshot("dashboard"), false);
    assert.equal(shouldLoadClubOverviewForView("season", "hall_of_fame"), true);
    const profile = getClubOverviewLoadProfileForView("season", "hall_of_fame");
    assert.equal(profile.loadSquad, true);
  });
});
