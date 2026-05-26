import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateChemistryBonus,
  checkSeasonResult,
  getDraftPickOrder,
  getFinanceSummary,
  resolveAuction,
  resolveMatch,
  validateFormation,
} from "@/lib/game/rules";
import {
  playerCatalog,
  sampleClubPlayers,
  sampleClubs,
  sampleLineups,
  samplePlayers,
} from "@/lib/game/sample-data";

describe("Superclub rules", () => {
  it("rotates the draft starter by round instead of using a snake draft", () => {
    const clubs = ["a", "b", "c", "d"];

    assert.deepEqual(getDraftPickOrder(clubs, 0, 8), ["a", "b", "c", "d", "a", "b", "c", "d"]);
    assert.deepEqual(getDraftPickOrder(clubs, 1, 8), ["b", "c", "d", "a", "b", "c", "d", "a"]);
  });

  it("validates legal 10 outfield player formations plus one goalkeeper", () => {
    assert.deepEqual(validateFormation(sampleLineups["club-red"]), { ok: true });
    assert.equal(
      validateFormation({
        ...sampleLineups["club-red"],
        starters: { ...sampleLineups["club-red"].starters, ATT: [] },
      }).ok,
      false,
    );
  });

  it("pairs left and right chemistry sides into zone bonuses", () => {
    const ids = ["player-01", "player-02", "player-03", "player-04"];
    assert.equal(calculateChemistryBonus(ids, playerCatalog), 2);
  });

  it("resolves deadline day ties by squad strength", () => {
    const auction = {
      id: "auction-test",
      gameId: "game-demo",
      playerId: samplePlayers[70].id,
      status: "open" as const,
      minimumBid: 20_000_000,
      bids: [
        { clubId: "club-red", amount: 42_000_000, locked: true },
        { clubId: "club-blue", amount: 42_000_000, locked: true },
      ],
    };

    assert.equal(resolveAuction(auction, sampleClubs, sampleClubPlayers, playerCatalog).winningClubId, "club-blue");
  });

  it("calculates finance from placement reward, stadium income, and wages", () => {
    const summary = getFinanceSummary({
      club: sampleClubs[0],
      clubCount: sampleClubs.length,
      clubPlayers: sampleClubPlayers,
      playerCatalog,
    });

    assert.equal(summary.placementReward, 100_000_000);
    assert.equal(summary.stadiumIncome, 75_000_000);
    assert.ok(summary.wages > 0);
    assert.equal(summary.net, summary.placementReward + summary.stadiumIncome - summary.wages);
  });

  it("resolves a match with thirds, points, and double-dice events", () => {
    const result = resolveMatch({
      homeClub: sampleClubs[0],
      awayClub: sampleClubs[1],
      homeLineup: sampleLineups["club-red"],
      awayLineup: sampleLineups["club-blue"],
      clubPlayers: sampleClubPlayers,
      playerCatalog,
      diceRolls: [
        [3, 4],
        [2, 2],
        [5, 1],
        [6, 3],
        [4, 4],
        [1, 5],
      ],
    });

    assert.ok(result.thirds.length >= 2);
    assert.equal(result.points["club-red"] + result.points["club-blue"], result.winnerClubId ? 6 : 4);
    assert.ok(result.events.some((event) => event.type === "injury"));
  });

  it("requires a final when multiple clubs cross 100 points", () => {
    const result = checkSeasonResult([
      { ...sampleClubs[0], points: 104 },
      { ...sampleClubs[1], points: 101 },
    ]);

    assert.equal(result.completed, false);
    assert.equal(result.needsCupFinal, true);
  });
});
