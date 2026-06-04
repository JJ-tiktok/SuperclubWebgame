import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMatchResultToProgress,
  applySeasonEndToProgress,
  buildSponsorContractSnapshot,
  createInitialProgress,
  isObjectiveFailed,
  isObjectiveMetAtSeasonEnd,
  type SponsorContractRow,
} from "@/lib/lobby/sponsoring";

function contractRow(dealId: string, progress = createInitialProgress()): SponsorContractRow {
  return {
    id: "c1",
    game_id: "g1",
    club_id: "club1",
    deal_id: dealId,
    prestige_tier: "newly_promoted",
    status: "active",
    signed_season: 1,
    ends_season: 1,
    seasons_elapsed: 0,
    progress,
  };
}

describe("Sponsoring objective evaluation", () => {
  it("tracks min_wins and succeeds at season end", () => {
    let progress = createInitialProgress();
    progress = applyMatchResultToProgress(progress, {
      isWin: true,
      isLoss: false,
      isDraw: false,
      thirdsWon: 2,
      isHumanOpponent: false,
    });
    const snapshot = buildSponsorContractSnapshot(contractRow("bockwurst_behrens", progress));
    assert.equal(isObjectiveFailed(snapshot), false);
    assert.equal(isObjectiveMetAtSeasonEnd(snapshot), true);
  });

  it("fails no_draws immediately on draw", () => {
    const progress = applyMatchResultToProgress(createInitialProgress(), {
      isWin: false,
      isLoss: false,
      isDraw: true,
      thirdsWon: 0,
      isHumanOpponent: false,
    });
    const snapshot = buildSponsorContractSnapshot(contractRow("kinoy_to", progress));
    assert.equal(isObjectiveFailed(snapshot), true);
  });

  it("tracks consecutive win balance across seasons", () => {
    let progress = createInitialProgress();
    progress = applySeasonEndToProgress(progress, {
      wins: 5,
      losses: 2,
      rank: 3,
      totalParticipants: 8,
      endBudget: 50_000_000,
      stadiumLevel: 2,
    });
    progress = applySeasonEndToProgress(progress, {
      wins: 4,
      losses: 3,
      rank: 2,
      totalParticipants: 8,
      endBudget: 60_000_000,
      stadiumLevel: 2,
    });
    const snapshot = buildSponsorContractSnapshot(contractRow("nadidos_elite", progress));
    assert.equal(isObjectiveMetAtSeasonEnd(snapshot), true);
  });

  it("fails seasons_without_win on first win", () => {
    const progress = applyMatchResultToProgress(createInitialProgress(), {
      isWin: true,
      isLoss: false,
      isDraw: false,
      thirdsWon: 1,
      isHumanOpponent: false,
    });
    const snapshot = buildSponsorContractSnapshot(contractRow("tipicolo", progress));
    assert.equal(isObjectiveFailed(snapshot), true);
  });

  it("evaluates not_last_overall from season standings snapshot", () => {
    const progress = applySeasonEndToProgress(createInitialProgress(), {
      wins: 1,
      losses: 10,
      rank: 7,
      totalParticipants: 8,
      endBudget: 10_000_000,
      stadiumLevel: 1,
    });
    const snapshot = buildSponsorContractSnapshot(contractRow("autohaus_rumpel", progress));
    assert.equal(isObjectiveMetAtSeasonEnd(snapshot), true);
  });
});
