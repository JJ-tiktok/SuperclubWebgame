import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCardScoutingMoney,
  getCardTransferMoney,
  getCatalogMinimumBidFromPlayer,
  getOwnedCardTransferMillions,
  mapCatalogPlayerToCardData,
  mapOwnedPlayerToCardData,
} from "@/lib/lobby/player-card-mapper";
import { getClubPlayerMarketValues } from "@/lib/lobby/player-market";
import type { ClubPlayerSnapshot, DraftPlayerRow } from "@/lib/lobby/types";

function catalogPlayer(overrides: Partial<DraftPlayerRow> = {}): DraftPlayerRow {
  return {
    id: "player-1",
    display_name: "Test Spieler",
    position: "MID",
    base_stars: 1,
    potential_stars: 0,
    skill_max: 5,
    ...overrides,
  };
}

function ownedPlayer(
  player: DraftPlayerRow,
  overrides: Partial<ClubPlayerSnapshot> = {},
): ClubPlayerSnapshot {
  return {
    id: "club-player-1",
    club_id: "club-1",
    player_id: player.id,
    current_stars: player.base_stars,
    current_zone: "bench",
    injured: false,
    player,
    ...overrides,
  };
}

describe("player card mapper", () => {
  it("ignores stale catalog DB prices on cards", () => {
    const card = mapCatalogPlayerToCardData(
      catalogPlayer({
        base_stars: 1,
        minimum_bid: 30_000_000,
        scouting_price: 15_000_000,
      }),
    );

    assert.equal(card.market.transferFee, 10);
    assert.equal(card.market.scoutingFee, 5);
    assert.equal(getCatalogMinimumBidFromPlayer(catalogPlayer({ base_stars: 1, minimum_bid: 30_000_000 })), 10_000_000);
  });

  it("values owned players by current stars after training", () => {
    const player = catalogPlayer({ base_stars: 4, potential_stars: 0, skill_max: 5 });
    const owned = ownedPlayer(player, { current_stars: 3 });
    const card = mapOwnedPlayerToCardData(owned);

    assert.equal(card.skill.current, 3);
    assert.equal(card.market.transferFee, 32);
    assert.equal(card.market.scoutingFee, 16);
  });

  it("applies remaining potential for low-star talents", () => {
    const player = catalogPlayer({ base_stars: 1, potential_stars: 5, skill_max: 6 });
    const card = mapOwnedPlayerToCardData(ownedPlayer(player, { current_stars: 1 }));

    assert.equal(card.skill.potential, 6);
    assert.equal(card.market.transferFee, 20);
    assert.equal(card.market.scoutingFee, 10);
  });

  it("keeps card.market aligned with getClubPlayerMarketValues", () => {
    const player = catalogPlayer({ base_stars: 3, potential_stars: 3, skill_max: 6 });
    const owned = ownedPlayer(player, { current_stars: 5 });
    const card = mapOwnedPlayerToCardData(owned);
    const market = getClubPlayerMarketValues(owned);

    assert.equal(getCardTransferMoney(card.market), market.minimumBid);
    assert.equal(getCardScoutingMoney(card.market), market.scoutingPrice);
    assert.equal(getOwnedCardTransferMillions(card), 52);
  });

  it("uses potential ceiling for skill.max on owned cards", () => {
    const player = catalogPlayer({ base_stars: 3, potential_stars: 3, skill_max: 6 });
    const card = mapOwnedPlayerToCardData(ownedPlayer(player, { current_stars: 3 }));

    assert.equal(card.skill.current, 3);
    assert.equal(card.skill.potential, 6);
    assert.equal(card.skill.max, 6);
  });

  it("matches card market to visible skill_max headroom at base rating", () => {
    const player = catalogPlayer({ base_stars: 1, potential_stars: 0, skill_max: 3 });
    const card = mapOwnedPlayerToCardData(ownedPlayer(player, { current_stars: 1 }));

    assert.equal(card.skill.max, 3);
    assert.equal(card.market.transferFee, 14);
    assert.equal(card.market.scoutingFee, 7);
  });
});
