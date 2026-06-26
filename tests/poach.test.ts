import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreatePoachRequest,
  filterPoachablePlayersForBuyer,
  getPoachUnavailableSeason,
  isPlayerPoachable,
  isPlayerUnavailableForSeason,
  wasPlayerBenchedLastSeason,
} from "@/lib/lobby/poach";

describe("poach requests", () => {
  it("allows poaching when buyer attractiveness covers player above seller ceiling", () => {
    assert.equal(
      isPlayerPoachable({
        buyerAttractivenessStars: 6,
        playerStars: 6,
        sellerAttractivenessStars: 4,
      }),
      true,
    );
    assert.equal(
      isPlayerPoachable({
        buyerAttractivenessStars: 5,
        playerStars: 6,
        sellerAttractivenessStars: 4,
      }),
      false,
    );
    assert.equal(
      isPlayerPoachable({
        buyerAttractivenessStars: 6,
        playerStars: 4,
        sellerAttractivenessStars: 4,
      }),
      false,
    );
  });

  it("blocks unavailable players for the current season", () => {
    assert.equal(isPlayerUnavailableForSeason(3, 3), true);
    assert.equal(isPlayerUnavailableForSeason(4, 3), false);
    assert.equal(wasPlayerBenchedLastSeason(3, 2), true);
    assert.equal(wasPlayerBenchedLastSeason(3, 1), false);
  });

  it("sets bench lock to the upcoming season number", () => {
    assert.equal(getPoachUnavailableSeason(3), 3);
  });

  it("rejects back-to-back poach attempts on the same player", () => {
    const result = canCreatePoachRequest({
      buyerAttractivenessStars: 6,
      buyerClubId: "buyer",
      buyerMoney: 5_000_000,
      buyerSquadSize: 10,
      cashAmount: 2_000_000,
      currentSeason: 3,
      hasOpenRequestForPair: false,
      hasPoachRequestLastSeason: true,
      isOffseason: true,
      playerStars: 6,
      sellerAttractivenessStars: 4,
      sellerClubId: "seller",
      targetClubId: "seller",
      transfersBlocked: false,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "back_to_back_player");
    }
  });

  it("rejects a second poach request to the same seller in one season", () => {
    const result = canCreatePoachRequest({
      buyerAttractivenessStars: 6,
      buyerClubId: "buyer",
      buyerMoney: 5_000_000,
      buyerSquadSize: 10,
      cashAmount: 2_000_000,
      currentSeason: 3,
      hasOpenRequestForPair: true,
      hasPoachRequestLastSeason: false,
      isOffseason: true,
      playerStars: 6,
      sellerAttractivenessStars: 4,
      sellerClubId: "seller",
      targetClubId: "seller",
      transfersBlocked: false,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "pair_request_exists");
    }
  });

  it("filters poachable targets for the buyer view", () => {
    const poachable = filterPoachablePlayersForBuyer({
      buyerAttractivenessStars: 6,
      currentSeason: 3,
      players: [
        { club_player_id: "a", current_stars: 6, unavailable_until_season: null },
        { club_player_id: "b", current_stars: 6, was_poached_last_season: true },
        { club_player_id: "c", current_stars: 3, unavailable_until_season: null },
      ],
      sellerAttractivenessStars: 4,
    });

    assert.deepEqual(
      poachable.map((player) => player.club_player_id),
      ["a"],
    );
  });
});
