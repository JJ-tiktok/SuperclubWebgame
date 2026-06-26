import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTrainingStarsToState,
  capTrainingStarsForPhilosophy,
  checkTraditionsverein,
  getPhilosophyProgress,
  isPhilosophyFulfilled,
  isQualifiedTransferProfit,
  normalizePrestigeState,
  PRESTIGE_POINTS,
  resolvePrestigeWinner,
  shouldTriggerFinalSeason,
  sponsorPointsForTier,
  sumTrainingStarsForSeason,
} from "@/lib/lobby/prestige";
import { getNextLobbyPhase, isFinalSeason, shouldAdvanceSeason } from "@/lib/lobby/phases";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

function player(partial: Partial<ClubPlayerSnapshot> & Pick<ClubPlayerSnapshot, "id" | "current_stars">): ClubPlayerSnapshot {
  return {
    club_id: "club-1",
    current_zone: "MID",
    custom_name: null,
    lineup_slot: 0,
    player: {
      id: `player-${partial.id}`,
      display_name: partial.id,
      position: "MID",
      metadata: null,
      skill_max: 6,
      potential_stars: 5,
      base_stars: 1,
    },
    seasons_at_club: 1,
    ...partial,
  };
}

describe("prestige point catalog", () => {
  it("maps sponsor tiers to prestige points", () => {
    assert.equal(sponsorPointsForTier("newly_promoted"), 3);
    assert.equal(sponsorPointsForTier("established"), 4);
    assert.equal(sponsorPointsForTier("mid_table"), 5);
    assert.equal(sponsorPointsForTier("title_contender"), 6);
  });

  it("exposes core seasonal prestige values", () => {
    assert.equal(PRESTIGE_POINTS.league_champion, 10);
    assert.equal(PRESTIGE_POINTS.continental_win, 20);
    assert.equal(PRESTIGE_POINTS.continental_finalist, 10);
    assert.equal(PRESTIGE_POINTS.facility_max, 5);
    assert.equal(PRESTIGE_POINTS.youth_max, 4);
  });
});

describe("training stars", () => {
  it("sums training gains per season", () => {
    const total = sumTrainingStarsForSeason(
      [
        { metadata: { season_number: 2, before_stars: 3, after_stars: 4 } },
        { metadata: { season_number: 2, before_stars: 4, after_stars: 6 } },
        { metadata: { season_number: 1, before_stars: 2, after_stars: 3 } },
      ],
      2,
    );
    assert.equal(total, 3);
  });

  it("caps training stars for philosophy progress at 12 per season", () => {
    assert.equal(capTrainingStarsForPhilosophy(20), 12);
    assert.equal(
      addTrainingStarsToState(normalizePrestigeState({}), 20).training_stars_total,
      12,
    );
  });
});

describe("transfer profit qualification", () => {
  it("requires at least 10m profit and ignores free acquisitions", () => {
    assert.equal(isQualifiedTransferProfit(15_000_000, 4_000_000), true);
    assert.equal(isQualifiedTransferProfit(15_000_000, 6_000_000), false);
    assert.equal(isQualifiedTransferProfit(5_000_000, 0), false);
  });
});

describe("philosophy fulfillment", () => {
  it("fulfills serienmeister after three consecutive titles", () => {
    const state = normalizePrestigeState({ consecutive_league_titles: 3 });
    assert.equal(isPhilosophyFulfilled("serienmeister", state), true);
  });

  it("fulfills transfergenie after five qualified sales", () => {
    const state = normalizePrestigeState({ qualified_transfer_sales: 5 });
    assert.equal(isPhilosophyFulfilled("transfergenie", state), true);
  });

  it("fulfills underdog only with league win and underdog flag", () => {
    const state = normalizePrestigeState({});
    assert.equal(
      isPhilosophyFulfilled("underdog", state, { wonLeagueThisSeason: true, wasUnderdogAtSeasonStart: true }),
      true,
    );
    assert.equal(
      isPhilosophyFulfilled("underdog", state, { wonLeagueThisSeason: true, wasUnderdogAtSeasonStart: false }),
      false,
    );
  });

  it("fulfills traditionsverein with tenure and strongest eleven context", () => {
    const state = normalizePrestigeState({});
    assert.equal(
      isPhilosophyFulfilled("traditionsverein", state, {
        wonLeagueThisSeason: true,
        traditionsvereinMet: true,
      }),
      true,
    );
  });

  it("reports philosophy progress", () => {
    const progress = getPhilosophyProgress("vereinsbauer", normalizePrestigeState({ facilities_at_max: ["training", "stadium"] }));
    assert.deepEqual(progress, { current: 2, target: 3, label: "Max-Einrichtungen" });
  });
});

describe("traditionsverein squad check", () => {
  it("requires eight tenure players with five in strongest eleven", () => {
    const squad = Array.from({ length: 8 }, (_, index) =>
      player({
        id: `tenure-${index}`,
        current_stars: index < 5 ? 6 : 3,
        seasons_at_club: 4,
      }),
    );
    const strongest = new Set(squad.slice(0, 5).map((entry) => entry.id));
    assert.equal(checkTraditionsverein(squad, strongest), true);
  });
});

describe("endgame", () => {
  it("triggers final season at 100 prestige or second continental win", () => {
    assert.equal(shouldTriggerFinalSeason([{ prestige_points: 100, continental_wins: 0 }], 100), true);
    assert.equal(shouldTriggerFinalSeason([{ prestige_points: 20, continental_wins: 2 }], 100), true);
    assert.equal(shouldTriggerFinalSeason([{ prestige_points: 50, continental_wins: 1 }], 100), false);
  });

  it("routes final season to completed after season end", () => {
    const settings = { seasonNumber: 4, final_season_number: 4, continental_cup_enabled: false };
    assert.equal(isFinalSeason(settings), true);
    assert.equal(getNextLobbyPhase("season_end", settings), "completed");
    assert.equal(getNextLobbyPhase("champions_league", settings), "completed");
    assert.equal(shouldAdvanceSeason("season_end", "completed"), false);
  });

  it("resolves winner by prestige, continental wins, then manager rank", () => {
    const winner = resolvePrestigeWinner([
      { club_id: "a", club_name: "A", manager_name: "A", prestige_points: 90, continental_wins: 2, season_rank: 2 },
      { club_id: "b", club_name: "B", manager_name: "B", prestige_points: 90, continental_wins: 1, season_rank: 1 },
      { club_id: "c", club_name: "C", manager_name: "C", prestige_points: 70, continental_wins: 0, season_rank: 3 },
    ]);
    assert.equal(winner?.club_id, "a");
  });
});
