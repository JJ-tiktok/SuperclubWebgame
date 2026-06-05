import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePlayerMarketValues,
  getClubPlayerMarketValues,
  getRemainingPotentialPoints,
  resolvePlayerPotentialCeiling,
} from "@/lib/lobby/player-market";

describe("player market values", () => {
  it("scales transfer and scouting values with current stars only", () => {
    assert.deepEqual(computePlayerMarketValues({ stars: 5 }), {
      minimumBid: 50_000_000,
      scoutingPrice: 25_000_000,
    });
  });

  it("adds value for remaining potential above current stars", () => {
    assert.deepEqual(
      computePlayerMarketValues({
        baseStars: 3,
        potentialStars: 2,
        skillMax: 5,
        stars: 3,
      }),
      {
        minimumBid: 34_000_000,
        scoutingPrice: 17_000_000,
      },
    );
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

  it("resolves absolute potential ceilings stored on owned players", () => {
    assert.equal(
      resolvePlayerPotentialCeiling({
        baseStars: 3,
        currentStars: 3,
        potentialStars: 6,
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
        potential_stars: 6,
        skill_max: 6,
      },
    });

    assert.equal(market.minimumBid, 52_000_000);
    assert.equal(market.scoutingPrice, 26_000_000);
  });
});
