import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canPlaceDeadlineBid,
  DEADLINE_BID_STEP,
  getDeadlineAuctionCount,
  getFirstDeadlineBidClubId,
  getMinimumNextBid,
  getNextDeadlineBidClubId,
  normalizeDeadlineBid,
} from "@/lib/lobby/deadline";

describe("Deadline Day rules", () => {
  it("creates manager count plus one auctions", () => {
    assert.equal(getDeadlineAuctionCount(1), 2);
    assert.equal(getDeadlineAuctionCount(4), 5);
  });

  it("normalizes bids to full millions and calculates next bid", () => {
    assert.equal(normalizeDeadlineBid(4_900_000), 4_000_000);
    assert.equal(getMinimumNextBid(0, 30_000_000), 30_000_000);
    assert.equal(getMinimumNextBid(30_000_000, 30_000_000), 31_000_000);
    assert.equal(DEADLINE_BID_STEP, 1_000_000);
  });

  it("blocks invalid bid states", () => {
    assert.deepEqual(
      canPlaceDeadlineBid({
        amount: 29_000_000,
        currentAmount: 0,
        currentBidClubId: "club-a",
        minimumBid: 30_000_000,
        ownClubId: "club-a",
        ownMoney: 100_000_000,
        squadSize: 12,
      }),
      { ok: false, reason: "bid_too_low" },
    );
    assert.equal(
      canPlaceDeadlineBid({
        amount: 35_000_000,
        currentAmount: 30_000_000,
        currentBidClubId: "club-a",
        minimumBid: 30_000_000,
        ownClubId: "club-a",
        ownMoney: 34_000_000,
        squadSize: 12,
      }).ok,
      false,
    );
    assert.equal(
      canPlaceDeadlineBid({
        amount: 35_000_000,
        currentAmount: 30_000_000,
        currentBidClubId: "club-a",
        minimumBid: 30_000_000,
        ownClubId: "club-a",
        ownMoney: 100_000_000,
        squadSize: 23,
      }).ok,
      false,
    );
  });

  it("rotates to the next eligible bidder", () => {
    const order = ["club-a", "club-b", "club-c"];

    assert.equal(getFirstDeadlineBidClubId(order.map((id) => ({ id }))), "club-a");
    assert.equal(
      getNextDeadlineBidClubId({
        bidOrderClubIds: order,
        currentClubId: "club-a",
        highestBidClubId: "club-a",
        passedClubIds: [],
      }),
      "club-b",
    );
    assert.equal(
      getNextDeadlineBidClubId({
        bidOrderClubIds: order,
        currentClubId: "club-b",
        highestBidClubId: "club-a",
        passedClubIds: ["club-c"],
      }),
      null,
    );
  });
});

describe("Deadline Day schema blueprint", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");

  it("stores turn state on auctions", () => {
    assert.match(schema, /season_number int not null default 1/);
    assert.match(schema, /auction_index int not null default 0/);
    assert.match(schema, /current_bid_club_id uuid references public\.clubs\(id\)/);
    assert.match(schema, /current_amount bigint not null default 0/);
    assert.match(schema, /passed_club_ids uuid\[\] not null default '\{\}'/);
    assert.match(schema, /bid_order_club_ids uuid\[\] not null default '\{\}'/);
  });
});
