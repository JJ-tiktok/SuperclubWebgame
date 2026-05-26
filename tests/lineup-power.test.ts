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
});
