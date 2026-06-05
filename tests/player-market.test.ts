import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePlayerMarketValues,
  getClubPlayerMarketValues,
  getRemainingPotentialPoints,
  resolvePlayerPotentialCeiling,
} from "@/lib/lobby/player-market";

describe("player market values", () => {
  it("5 stars with no remaining potential", () => {
    assert.deepEqual(computePlayerMarketValues({ potentialCeiling: 5, stars: 5 }), {
      minimumBid: 50_000_000,
      scoutingPrice: 25_000_000,
    });
  });

  it("3 current stars with 2 remaining potential", () => {
    assert.deepEqual(computePlayerMarketValues({ potentialCeiling: 5, stars: 3 }), {
      minimumBid: 34_000_000,
      scoutingPrice: 17_000_000,
    });
  });

  it("5 current stars with ceiling 6 after partial training", () => {
    assert.deepEqual(computePlayerMarketValues({ potentialCeiling: 6, stars: 5 }), {
      minimumBid: 52_000_000,
      scoutingPrice: 26_000_000,
    });
  });

  it("uses the gap between current stars and potential ceiling", () => {
    assert.equal(
      getRemainingPotentialPoints({
        baseStars: 3,
        potentialStars: 3,
        skillMax: 6,
        stars: 3,
      }),
      3,
    );

    assert.deepEqual(
      computePlayerMarketValues({
        baseStars: 3,
        potentialStars: 3,
        skillMax: 6,
        stars: 3,
      }),
      {
        minimumBid: 36_000_000,
        scoutingPrice: 18_000_000,
      },
    );
  });

  it("adds one remaining point when potential bonus allows growth", () => {
    assert.deepEqual(
      getClubPlayerMarketValues({
        current_stars: 4,
        player: {
          base_stars: 4,
          potential_stars: 1,
          skill_max: 5,
        },
      }),
      {
        minimumBid: 42_000_000,
        scoutingPrice: 21_000_000,
      },
    );
  });

  it("values trained players by current stars, not draft base stars", () => {
    assert.deepEqual(
      getClubPlayerMarketValues({
        current_stars: 3,
        player: {
          base_stars: 4,
          potential_stars: 0,
          skill_max: 5,
        },
      }),
      {
        minimumBid: 32_000_000,
        scoutingPrice: 16_000_000,
      },
    );
  });

  it("reduces potential contribution after training", () => {
    assert.deepEqual(
      computePlayerMarketValues({
        baseStars: 3,
        potentialStars: 3,
        skillMax: 6,
        stars: 5,
      }),
      {
        minimumBid: 52_000_000,
        scoutingPrice: 26_000_000,
      },
    );
  });

  it("resolves potential ceilings from base stars plus bonus", () => {
    assert.equal(
      resolvePlayerPotentialCeiling({
        baseStars: 3,
        currentStars: 3,
        potentialStars: 3,
        skillMax: 6,
      }),
      6,
    );
  });

  it("uses owned current stars instead of static player prices", () => {
    const market = getClubPlayerMarketValues({
      current_stars: 5,
      player: {
        base_stars: 3,
        potential_stars: 3,
        skill_max: 6,
      },
    });

    assert.equal(market.minimumBid, 52_000_000);
    assert.equal(market.scoutingPrice, 26_000_000);
  });
});
