import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCatalogPlayerMarketValues,
  computePlayerMarketValues,
  getClubPlayerMarketValues,
  getRemainingPotentialPoints,
  readSyncedPlayerMarketValues,
  resolvePlayerMarketMax,
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
      minimumBid: 38_000_000,
      scoutingPrice: 19_000_000,
    });
  });

  it("5 current stars with ceiling 6 after partial training", () => {
    assert.deepEqual(computePlayerMarketValues({ potentialCeiling: 6, stars: 5 }), {
      minimumBid: 54_000_000,
      scoutingPrice: 27_000_000,
    });
  });

  it("always sets scouting to half of transfer", () => {
    const market = computePlayerMarketValues({ potentialCeiling: 6, stars: 1 });
    assert.equal(market.scoutingPrice, market.minimumBid / 2);
  });

  it("uses the gap between current stars and market max", () => {
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
        minimumBid: 42_000_000,
        scoutingPrice: 21_000_000,
      },
    );
  });

  it("adds 3m scouting profit per trained star when bought and sold at scouting value", () => {
    const buy = computePlayerMarketValues({ potentialCeiling: 4, stars: 1 });
    const sell = computePlayerMarketValues({ potentialCeiling: 4, stars: 4 });
    assert.equal(sell.scoutingPrice - buy.scoutingPrice, 9_000_000);
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
        minimumBid: 44_000_000,
        scoutingPrice: 22_000_000,
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
        minimumBid: 38_000_000,
        scoutingPrice: 19_000_000,
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
        minimumBid: 54_000_000,
        scoutingPrice: 27_000_000,
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

  it("uses market max from skill display for owned players", () => {
    assert.equal(
      resolvePlayerMarketMax({
        baseStars: 3,
        currentStars: 3,
        potentialStars: 0,
        skillMax: 4,
      }),
      4,
    );
  });

  it("ignores stale synced database prices for owned players", () => {
    const market = getClubPlayerMarketValues({
      current_stars: 3,
      player: {
        base_stars: 4,
        minimum_bid: 42_000_000,
        potential_stars: 0,
        scouting_price: 21_000_000,
        skill_max: 5,
      },
    });

    assert.deepEqual(market, {
      minimumBid: 38_000_000,
      scoutingPrice: 19_000_000,
    });
    assert.deepEqual(readSyncedPlayerMarketValues({ minimum_bid: 42_000_000, scouting_price: 21_000_000 }), {
      minimumBid: 42_000_000,
      scoutingPrice: 21_000_000,
    });
  });

  it("values NLZ academy talents from current stars and market max", () => {
    assert.deepEqual(
      getClubPlayerMarketValues({
        current_stars: 1,
        player: {
          base_stars: 1,
          minimum_bid: 60_000_000,
          potential_stars: 5,
          scouting_price: 30_000_000,
          skill_max: 6,
        },
      }),
      {
        minimumBid: 30_000_000,
        scoutingPrice: 15_000_000,
      },
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

    assert.equal(market.minimumBid, 54_000_000);
    assert.equal(market.scoutingPrice, 27_000_000);
  });

  it("computes catalog market values from base stars, not stored prices", () => {
    assert.deepEqual(
      computeCatalogPlayerMarketValues({
        base_stars: 1,
        minimum_bid: 30_000_000,
        potential_stars: 0,
        scouting_price: 15_000_000,
        skill_max: 5,
      }),
      {
        minimumBid: 26_000_000,
        scoutingPrice: 13_000_000,
      },
    );

    assert.deepEqual(
      computeCatalogPlayerMarketValues({
        base_stars: 2,
        potential_stars: 1,
        skill_max: 5,
      }),
      {
        minimumBid: 32_000_000,
        scoutingPrice: 16_000_000,
      },
    );

    assert.deepEqual(
      computeCatalogPlayerMarketValues({
        base_stars: 1,
        potential_stars: 3,
        skill_max: 4,
      }),
      {
        minimumBid: 22_000_000,
        scoutingPrice: 11_000_000,
      },
    );
  });

  it("values skill_max training headroom when base potential is exhausted", () => {
    assert.deepEqual(
      getClubPlayerMarketValues({
        current_stars: 1,
        player: {
          base_stars: 1,
          potential_stars: 0,
          skill_max: 3,
        },
      }),
      {
        minimumBid: 18_000_000,
        scoutingPrice: 9_000_000,
      },
    );
  });

  it("extends owned market values toward skill_max below the training cap", () => {
    assert.deepEqual(
      getClubPlayerMarketValues({
        current_stars: 3,
        player: {
          base_stars: 3,
          potential_stars: 0,
          skill_max: 4,
        },
      }),
      {
        minimumBid: 34_000_000,
        scoutingPrice: 17_000_000,
      },
    );
  });
});
