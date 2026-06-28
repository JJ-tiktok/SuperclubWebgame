import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyClubStatusDelta, resolveEffectiveClubStatus, resolvePoachAttractivenessStars } from "@/lib/lobby/club-status";

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

describe("resolvePoachAttractivenessStars", () => {
  it("uses persisted attractiveness_stars from season end", () => {
    assert.equal(
      resolvePoachAttractivenessStars(
        { attractiveness_stars: 5, status: "mid_table", status_override: null, status_override_until_season: null },
        2,
      ),
      5,
    );
  });

  it("keeps staff-boosted attractiveness above status band", () => {
    assert.equal(
      resolvePoachAttractivenessStars(
        { attractiveness_stars: 6, status: "mid_table", status_override: null, status_override_until_season: null },
        2,
      ),
      6,
    );
  });

  it("falls back to status band when attractiveness_stars is missing", () => {
    assert.equal(
      resolvePoachAttractivenessStars(
        { attractiveness_stars: undefined, status: "mid_table", status_override: null, status_override_until_season: null },
        2,
      ),
      5,
    );
    assert.equal(
      resolvePoachAttractivenessStars(
        { attractiveness_stars: undefined, status: "established", status_override: null, status_override_until_season: null },
        2,
      ),
      4,
    );
  });

  it("does not recompute from a larger live squad during offseason", () => {
    const offseasonSnapshot = {
      attractiveness_stars: 5,
      status: "mid_table" as const,
      status_override: null,
      status_override_until_season: null,
    };

    assert.equal(resolvePoachAttractivenessStars(offseasonSnapshot, 2), 5);
    assert.equal(
      resolvePoachAttractivenessStars(
        { ...offseasonSnapshot, attractiveness_stars: undefined, status: "title_contender" },
        2,
      ),
      6,
    );
  });
});
