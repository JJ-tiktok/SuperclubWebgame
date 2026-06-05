import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePlayerMarketValues, getClubPlayerMarketValues } from "@/lib/lobby/player-market";

describe("player market values", () => {
  it("scales transfer and scouting values with current stars", () => {
    assert.deepEqual(computePlayerMarketValues({ stars: 5 }), {
      minimumBid: 50_000_000,
      scoutingPrice: 25_000_000,
    });
  });

  it("includes potential stars in the market formula", () => {
    assert.deepEqual(computePlayerMarketValues({ potentialStars: 2, stars: 3 }), {
      minimumBid: 34_000_000,
      scoutingPrice: 17_000_000,
    });
  });

  it("uses owned current stars instead of static player prices", () => {
    const market = getClubPlayerMarketValues({
      current_stars: 5,
      player: {
        potential_stars: 0,
      },
    });

    assert.equal(market.minimumBid, 50_000_000);
    assert.equal(market.scoutingPrice, 25_000_000);
  });
});
