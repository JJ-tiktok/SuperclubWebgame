import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateLineupPower, type LineupPowerPlayer } from "@/lib/lobby/lineup-power";

function player(
  current_zone: LineupPowerPlayer["current_zone"],
  lineup_slot: number,
  current_stars: number,
  chemistry: Partial<Pick<LineupPowerPlayer, "chemistry_left" | "chemistry_right">> = {},
): LineupPowerPlayer {
  return {
    chemistry_left: false,
    chemistry_right: false,
    current_stars,
    current_zone,
    injured: false,
    lineup_slot,
    ...chemistry,
  };
}

describe("lineup power", () => {
  it("adds adjacent chemistry and goalkeeper links to zone totals", () => {
    const summary = calculateLineupPower([
      player("ATT", 1, 3, { chemistry_right: true }),
      player("ATT", 2, 3, { chemistry_left: true }),
      player("MID", 3, 2, { chemistry_right: true }),
      player("MID", 4, 2, { chemistry_left: true, chemistry_right: true }),
      player("MID", 5, 1, { chemistry_left: true, chemistry_right: true }),
      player("MID", 6, 1, { chemistry_left: true, chemistry_right: true }),
      player("MID", 7, 2, { chemistry_left: true }),
      player("DEF", 8, 3, { chemistry_right: true }),
      player("DEF", 9, 3, { chemistry_left: true, chemistry_right: true }),
      player("DEF", 10, 3, { chemistry_left: true }),
      player("GK", 11, 3, { chemistry_right: true }),
    ]);

    assert.deepEqual(
      {
        ATT: summary.ATT.total,
        DEF: summary.DEF.total,
        MID: summary.MID.total,
      },
      { ATT: 7, DEF: 15, MID: 12 },
    );
  });

  it("ignores injured players when calculating lineup power", () => {
    const summary = calculateLineupPower([
      player("MID", 1, 3, { chemistry_right: true }),
      { ...player("MID", 2, 3, { chemistry_left: true }), injured: true },
      player("MID", 3, 2),
    ]);

    assert.deepEqual(summary.MID, { base: 5, chemistry: 0, staffBonus: 0, total: 5 });
  });
});

describe("captain boost", () => {
  it("adds the boost to the captain's zone when the captain is in the lineup", () => {
    const summary = calculateLineupPower(
      [
        { ...player("ATT", 1, 3), id: "cap" },
        { ...player("MID", 2, 2), id: "p2" },
        { ...player("DEF", 3, 3), id: "p3" },
      ],
      [],
      { clubPlayerId: "cap", boost: 2 },
    );

    assert.equal(summary.ATT.base, 5);
    assert.equal(summary.ATT.total, 5);
    assert.equal(summary.MID.base, 2);
    assert.equal(summary.DEF.base, 3);
  });

  it("adds a GK captain's boost to the DEF zone", () => {
    const summary = calculateLineupPower(
      [
        { ...player("GK", 1, 3), id: "cap" },
        { ...player("DEF", 2, 3), id: "p2" },
      ],
      [],
      { clubPlayerId: "cap", boost: 3 },
    );

    assert.equal(summary.DEF.base, 9);
  });

  it("does not apply the boost when the captain is benched or injured", () => {
    const benched = calculateLineupPower(
      [
        { ...player("bench", 1, 3), id: "cap" },
        { ...player("ATT", 2, 3), id: "p2" },
      ],
      [],
      { clubPlayerId: "cap", boost: 2 },
    );
    assert.equal(benched.ATT.base, 3);

    const injured = calculateLineupPower(
      [
        { ...player("ATT", 1, 3), id: "cap", injured: true },
        { ...player("ATT", 2, 3), id: "p2" },
      ],
      [],
      { clubPlayerId: "cap", boost: 2 },
    );
    assert.equal(injured.ATT.base, 3);
  });

  it("ignores a zero or missing boost rank", () => {
    const summary = calculateLineupPower(
      [{ ...player("ATT", 1, 3), id: "cap" }],
      [],
      { clubPlayerId: "cap", boost: 0 },
    );
    assert.equal(summary.ATT.base, 3);

    const noCaptain = calculateLineupPower([{ ...player("ATT", 1, 3), id: "cap" }]);
    assert.equal(noCaptain.ATT.base, 3);
  });
});
