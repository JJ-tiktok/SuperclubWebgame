import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildYouthPlayerSeed, rollYouthPlayerChemistry } from "@/lib/lobby/youth-generator";

describe("youth generator", () => {
  it("can roll both chemistry sides for academy talents", () => {
    assert.deepEqual(rollYouthPlayerChemistry(() => 0.75), {
      chemistry_left: true,
      chemistry_right: true,
    });
  });

  it("rolls single-sided chemistry links", () => {
    assert.deepEqual(rollYouthPlayerChemistry(() => 0.25), {
      chemistry_left: true,
      chemistry_right: false,
    });
    assert.deepEqual(rollYouthPlayerChemistry(() => 0.5), {
      chemistry_left: false,
      chemistry_right: true,
    });
    assert.deepEqual(rollYouthPlayerChemistry(() => 0), {
      chemistry_left: false,
      chemistry_right: false,
    });
  });

  it("includes chemistry flags in generated youth seeds", () => {
    const seed = buildYouthPlayerSeed(() => 0.75);

    assert.equal(seed.chemistry_left, true);
    assert.equal(seed.chemistry_right, true);
  });
});
