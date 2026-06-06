import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getClubOverviewLoadProfileForView,
  shouldLoadClubOverviewForView,
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
});
