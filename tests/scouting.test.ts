import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canBuyScoutedPlayer,
  canDrawScoutingPlayer,
  canResolveScoutedPlayer,
  canSellClubPlayer,
  getClubScoutingCapacity,
  getNextPendingScoutingClubId,
} from "@/lib/lobby/scouting";

describe("Scouting rules", () => {
  it("uses scouting level as draw capacity", () => {
    assert.equal(getClubScoutingCapacity({ scouting_level: 1 }), 1);
    assert.equal(getClubScoutingCapacity({ scouting_level: 2 }), 2);
    assert.equal(getClubScoutingCapacity({ scouting_level: 3 }), 3);
    assert.equal(getClubScoutingCapacity({ scouting_level: 4 }), 5);
  });

  it("only lets the current club draw until capacity is used", () => {
    assert.deepEqual(
      canDrawScoutingPlayer({
        currentTurnClubId: "club-a",
        drawnCount: 0,
        ownClubId: "club-a",
        scoutingCapacity: 1,
      }),
      { ok: true },
    );
    assert.equal(
      canDrawScoutingPlayer({
        currentTurnClubId: "club-a",
        drawnCount: 1,
        ownClubId: "club-a",
        scoutingCapacity: 1,
      }).ok,
      false,
    );
    assert.equal(
      canDrawScoutingPlayer({
        currentTurnClubId: "club-b",
        drawnCount: 0,
        ownClubId: "club-a",
        scoutingCapacity: 1,
      }).ok,
      false,
    );
  });

  it("blocks resolving cards before all scouting cards are drawn", () => {
    assert.equal(
      canResolveScoutedPlayer({
        currentTurnClubId: "club-a",
        drawnCount: 1,
        ownClubId: "club-a",
        scoutingCapacity: 2,
      }).ok,
      false,
    );
  });

  it("blocks buying by money and squad limit", () => {
    assert.equal(
      canBuyScoutedPlayer({
        currentTurnClubId: "club-a",
        drawnCount: 2,
        money: 4_000_000,
        ownClubId: "club-a",
        playerPrice: 5_000_000,
        scoutingCapacity: 2,
        squadSize: 10,
      }).ok,
      false,
    );
    assert.equal(
      canBuyScoutedPlayer({
        currentTurnClubId: "club-a",
        drawnCount: 2,
        money: 10_000_000,
        ownClubId: "club-a",
        playerPrice: 5_000_000,
        scoutingCapacity: 2,
        squadSize: 23,
      }).ok,
      false,
    );
  });

  it("limits offseason player sales to two", () => {
    assert.deepEqual(canSellClubPlayer({ isOffseason: true, salesCount: 1 }), { ok: true });
    assert.equal(canSellClubPlayer({ isOffseason: true, salesCount: 2 }).ok, false);
    assert.equal(canSellClubPlayer({ isOffseason: false, salesCount: 0 }).ok, false);
  });

  it("finds the next club that still has scouting work", () => {
    const clubs = [
      { id: "club-a", scouting_level: 1 },
      { id: "club-b", scouting_level: 2 },
    ] as const;

    assert.equal(
      getNextPendingScoutingClubId([...clubs], [{ club_id: "club-a", status: "passed" }]),
      "club-b",
    );
    assert.equal(
      getNextPendingScoutingClubId([...clubs], [
        { club_id: "club-a", status: "passed" },
        { club_id: "club-b", status: "bought" },
        { club_id: "club-b", status: "drawn" },
      ]),
      "club-b",
    );
    assert.equal(
      getNextPendingScoutingClubId([...clubs], [
        { club_id: "club-a", status: "passed" },
        { club_id: "club-b", status: "bought" },
        { club_id: "club-b", status: "passed" },
      ]),
      null,
    );
  });
});
