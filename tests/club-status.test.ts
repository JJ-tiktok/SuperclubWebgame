import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyClubStatusDelta, resolveEffectiveClubStatus } from "@/lib/lobby/club-status";

describe("club status overrides", () => {
  it("applies fanmarsch +1 from established to mid_table", () => {
    assert.equal(applyClubStatusDelta("established", 1), "mid_table");
  });

  it("reads active status_override for the current season", () => {
    const effective = resolveEffectiveClubStatus(
      {
        status: "established",
        status_override: "mid_table",
        status_override_until_season: 2,
      },
      2,
    );
    assert.equal(effective, "mid_table");
  });

  it("ignores expired status_override", () => {
    const effective = resolveEffectiveClubStatus(
      {
        status: "established",
        status_override: "title_contender",
        status_override_until_season: 1,
      },
      2,
    );
    assert.equal(effective, "established");
  });
});
