import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePlayerMarketValues, getClubPlayerMarketValues } from "@/lib/lobby/player-market";

describe("player market values", () => {
  it("scales transfer and scouting values with current stars", () => {
    assert.deepEqual(computePlayerMarketValues({ stars: 4 }), {
      minimumBid: 42_000_000,
      scoutingPrice: 28_000_000,
    });
    assert.deepEqual(computePlayerMarketValues({ stars: 5 }), {
      minimumBid: 48_000_000,
      scoutingPrice: 32_000_000,
    });
  });

  it("includes potential stars in the market formula", () => {
    assert.equal(computePlayerMarketValues({ potentialStars: 1, stars: 5 }).minimumBid, 52_000_000);
    assert.equal(computePlayerMarketValues({ potentialStars: 1, stars: 5 }).scoutingPrice, 35_000_000);
  });

  it("uses owned current stars instead of static player prices", () => {
    const market = getClubPlayerMarketValues({
      current_stars: 5,
      player: {
        potential_stars: 0,
      },
    });

    assert.equal(market.minimumBid, 48_000_000);
    assert.equal(market.scoutingPrice, 32_000_000);
  });
});
