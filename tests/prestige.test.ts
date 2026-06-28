import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTrainingStarsToState,
  applyPrestigeDeductionFloor,
  capTrainingStarsForPhilosophy,
  checkTraditionsverein,
  formatPrestigeAwardPoints,
  prestigePointsClassName,
  prestigePointsClassNameFromLabel,
  getPhilosophyProgress,
  getTalentschmiedePhilosophyProgress,
  isAcademyPlayerAtMax,
  isPhilosophyFulfilled,
  isQualifiedTransferProfit,
  normalizePrestigeState,
  normalizePrestigeTotalFromAwards,
  PRESTIGE_POINTS,
  resolvePrestigeWinner,
  sumPrestigeAwardPoints,
  shouldTriggerFinalSeason,
  sponsorPointsForTier,
  sumTrainingStarsForSeason,
  syncTalentschmiedeState,
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
    assert.equal(PRESTIGE_POINTS.manager_rank_last, -3);
    assert.equal(PRESTIGE_POINTS.continental_win, 20);
    assert.equal(PRESTIGE_POINTS.continental_finalist, 10);
    assert.equal(PRESTIGE_POINTS.facility_max, 5);
    assert.equal(PRESTIGE_POINTS.youth_max, 4);
  });
});

describe("prestige deduction floor", () => {
  it("applies manager rank last penalty without a zero floor", () => {
    assert.equal(applyPrestigeDeductionFloor(1, PRESTIGE_POINTS.manager_rank_last), -2);
    assert.equal(applyPrestigeDeductionFloor(100, PRESTIGE_POINTS.manager_rank_last), 97);
    assert.equal(applyPrestigeDeductionFloor(0, PRESTIGE_POINTS.manager_rank_last), -3);
  });
});

describe("prestige award totals", () => {
  it("sums positive and negative awards", () => {
    assert.equal(
      sumPrestigeAwardPoints([
        { points: 3 },
        { points: -3 },
      ]),
      0,
    );
    assert.equal(
      normalizePrestigeTotalFromAwards(
        sumPrestigeAwardPoints([
          { points: 3 },
          { points: -3 },
          { points: -3 },
        ]),
      ),
      -3,
    );
  });

  it("formats award points with explicit sign", () => {
    assert.equal(formatPrestigeAwardPoints(3), "+3");
    assert.equal(formatPrestigeAwardPoints(-3), "-3");
    assert.equal(formatPrestigeAwardPoints(0), "0");
  });

  it("maps prestige point values to display tone classes", () => {
    assert.equal(prestigePointsClassName(-3), "text-rose-300");
    assert.equal(prestigePointsClassName(3), "text-lime-300");
    assert.equal(prestigePointsClassName(0), "text-zinc-400");
    assert.equal(prestigePointsClassNameFromLabel("-3"), "text-rose-300");
    assert.equal(prestigePointsClassNameFromLabel("+10"), "text-lime-300");
  });

  it("normalizes award sum to integer total", () => {
    assert.equal(normalizePrestigeTotalFromAwards(0), 0);
    assert.equal(normalizePrestigeTotalFromAwards(-2), -2);
    assert.equal(normalizePrestigeTotalFromAwards(5), 5);
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
  it("requires at least 9m profit and rejects free acquisitions", () => {
    assert.equal(isQualifiedTransferProfit(15_000_000, 4_000_000), true);
    assert.equal(isQualifiedTransferProfit(12_000_000, 4_000_000), false);
    assert.equal(isQualifiedTransferProfit(13_000_000, 4_000_000), true);
    assert.equal(isQualifiedTransferProfit(5_000_000, 0), false);
    assert.equal(isQualifiedTransferProfit(20_000_000, null), false);
  });

  it("qualifies a full 1-star to 4-star development path at scouting prices", () => {
    assert.equal(isQualifiedTransferProfit(20_000_000, 11_000_000), true);
    assert.equal(isQualifiedTransferProfit(17_000_000, 11_000_000), false);
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

describe("talentschmiede philosophy", () => {
  function academyPlayer(
    id: string,
    currentStars: number,
    overrides: Partial<ClubPlayerSnapshot["player"]> = {},
  ): ClubPlayerSnapshot {
    return player({
      id,
      current_stars: currentStars,
      player: {
        id: `player-${id}`,
        display_name: id,
        position: "MID",
        metadata: { nlz_origin: true },
        region: "academy",
        skill_max: 6,
        potential_stars: 5,
        base_stars: 1,
        ...overrides,
      },
    });
  }

  it("only counts academy origin players at true skill max", () => {
    const squad = [
      academyPlayer("academy-max", 6),
      academyPlayer("academy-growing", 4),
      player({
        id: "draft-max",
        current_stars: 6,
        player: {
          id: "player-draft-max",
          display_name: "Draft Max",
          position: "MID",
          metadata: null,
          region: "europe",
          skill_max: 6,
          potential_stars: 6,
          base_stars: 6,
        },
      }),
    ];

    const synced = syncTalentschmiedeState(normalizePrestigeState({}), squad);
    assert.equal(synced.talentschmiede_count, 1);
    assert.equal(synced.talentschmiede_players?.[0]?.display_name, "academy-max");
  });

  it("preserves tracked academy players across syncs", () => {
    const squad = [academyPlayer("academy-max", 6)];
    const first = syncTalentschmiedeState(normalizePrestigeState({}), squad);
    const second = syncTalentschmiedeState(first, squad);

    assert.equal(second.talentschmiede_count, 1);
    assert.deepEqual(second.talentschmiede_player_ids, ["academy-max"]);
  });

  it("normalizes inflated legacy counts without tracked players", () => {
    const progress = getTalentschmiedePhilosophyProgress(
      normalizePrestigeState({ talentschmiede_count: 3 }),
      [],
    );

    assert.equal(progress.current, 0);
    assert.equal(progress.slots?.filter(Boolean).length, 0);
  });

  it("exposes four academy slots with player names", () => {
    const squad = [academyPlayer("talent-a", 6), academyPlayer("talent-b", 6)];
    const progress = getTalentschmiedePhilosophyProgress(normalizePrestigeState({}), squad);

    assert.equal(progress.current, 2);
    assert.equal(progress.slots?.length, 4);
    assert.equal(progress.slots?.[0]?.display_name, "talent-a");
    assert.equal(progress.slots?.[2], null);
    assert.equal(isAcademyPlayerAtMax(academyPlayer("talent-a", 6)), true);
    assert.equal(isPhilosophyFulfilled("talentschmiede", syncTalentschmiedeState(normalizePrestigeState({}), squad)), false);
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
