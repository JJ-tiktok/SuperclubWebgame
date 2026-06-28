import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getFixtureParticipantClubIds,
  isInjuryExpiredAfterMatchday,
} from "@/lib/lobby/injury";

describe("getFixtureParticipantClubIds", () => {
  it("returns human club ids and omits null cpu sides", () => {
    assert.deepEqual(
      getFixtureParticipantClubIds({
        home: { club_id: "club-home" },
        away: { club_id: null },
      }),
      ["club-home"],
    );
    assert.deepEqual(
      getFixtureParticipantClubIds({
        home: { club_id: "club-a" },
        away: { club_id: "club-b" },
      }),
      ["club-a", "club-b"],
    );
  });
});

describe("isInjuryExpiredAfterMatchday", () => {
  it("heals when the completed matchday reaches the injury marker", () => {
    assert.equal(isInjuryExpiredAfterMatchday(3, 3), true);
    assert.equal(isInjuryExpiredAfterMatchday(3, 4), true);
    assert.equal(isInjuryExpiredAfterMatchday(4, 3), false);
  });

  it("ignores season-long and unset markers", () => {
    assert.equal(isInjuryExpiredAfterMatchday(-1, 5), false);
    assert.equal(isInjuryExpiredAfterMatchday(null, 5), false);
    assert.equal(isInjuryExpiredAfterMatchday(undefined, 5), false);
  });
});

describe("injury heal club scope policy", () => {
  it("does not heal club B when only club A finished matchday 3", () => {
    const clubA = "club-a";
    const clubB = "club-b";
    const completedMatchday = 3;
    const injuredUntil = 3;

    const healedClubIds = getFixtureParticipantClubIds({
      home: { club_id: clubA },
      away: { club_id: null },
    }).filter((clubId) => isInjuryExpiredAfterMatchday(injuredUntil, completedMatchday));

    assert.ok(healedClubIds.includes(clubA));
    assert.equal(healedClubIds.includes(clubB), false);
  });

  it("heals club B only after club B completes its own fixture", () => {
    const clubB = "club-b";
    const completedMatchday = 3;
    const injuredUntil = 3;

    const healedClubIds = getFixtureParticipantClubIds({
      home: { club_id: clubB },
      away: { club_id: "club-cpu-opponent" },
    }).filter((clubId) => isInjuryExpiredAfterMatchday(injuredUntil, completedMatchday));

    assert.deepEqual(healedClubIds, [clubB, "club-cpu-opponent"]);
  });
});
