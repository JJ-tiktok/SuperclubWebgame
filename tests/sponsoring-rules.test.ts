import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSignSponsorDeal,
  createInitialProgress,
  getActiveSponsorContract,
  getAvailableSponsorDeals,
  isStadiumUpgradeBlockedBySponsor,
  type SponsorContractRow,
} from "@/lib/lobby/sponsoring";

function contract(partial: Partial<SponsorContractRow> & Pick<SponsorContractRow, "prestige_tier" | "deal_id">): SponsorContractRow {
  return {
    id: partial.id ?? "c1",
    game_id: "g1",
    club_id: "club1",
    status: partial.status ?? "active",
    signed_season: partial.signed_season ?? 1,
    ends_season: partial.ends_season ?? 1,
    seasons_elapsed: partial.seasons_elapsed ?? 0,
    progress: partial.progress ?? createInitialProgress(),
    ...partial,
  };
}

describe("Sponsoring sign rules", () => {
  it("allows signing only in off_season", () => {
    const result = canSignSponsorDeal({
      phase: "season",
      contracts: [],
      dealId: "bockwurst_behrens",
      clubStatus: "newly_promoted",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /Off-Season/);
    }
  });

  it("blocks when an active contract exists", () => {
    const result = canSignSponsorDeal({
      phase: "off_season",
      contracts: [contract({ deal_id: "bockwurst_behrens", prestige_tier: "newly_promoted" })],
      dealId: "autohaus_rumpel",
      clubStatus: "newly_promoted",
    });
    assert.equal(result.ok, false);
  });

  it("consumes prestige tier on failed contracts", () => {
    const contracts = [
      contract({
        deal_id: "bockwurst_behrens",
        prestige_tier: "newly_promoted",
        status: "failed",
      }),
    ];
    const available = getAvailableSponsorDeals(contracts, "newly_promoted");
    assert.equal(available.some((deal) => deal.prestige_tier === "newly_promoted"), false);
  });

  it("allows signing a deal matching club status in off_season", () => {
    const result = canSignSponsorDeal({
      phase: "off_season",
      contracts: [],
      dealId: "bockwurst_behrens",
      clubStatus: "newly_promoted",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.deal.id, "bockwurst_behrens");
    }
  });

  it("blocks deals from other prestige tiers", () => {
    const result = canSignSponsorDeal({
      phase: "off_season",
      contracts: [],
      dealId: "nadidos_elite",
      clubStatus: "newly_promoted",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /aktuelle Prestige-Stufe/);
    }
  });

  it("only lists deals for the current club status", () => {
    const available = getAvailableSponsorDeals([], "mid_table");
    assert.ok(available.length > 0);
    assert.ok(available.every((deal) => deal.prestige_tier === "mid_table"));
  });

  it("blocks re-pick of consumed tier", () => {
    const result = canSignSponsorDeal({
      phase: "off_season",
      contracts: [
        contract({
          deal_id: "bockwurst_behrens",
          prestige_tier: "newly_promoted",
          status: "completed",
        }),
      ],
      dealId: "autohaus_rumpel",
      clubStatus: "newly_promoted",
    });
    assert.equal(result.ok, false);
  });
});

describe("Sponsoring active contract helpers", () => {
  it("treats awaiting_reward_pick as active", () => {
    const active = getActiveSponsorContract([
      contract({ deal_id: "bockwurst_behrens", prestige_tier: "newly_promoted", status: "awaiting_reward_pick" }),
    ]);
    assert.ok(active);
  });

  it("blocks stadium upgrade for Denkmalschutz deal", () => {
    const blocked = isStadiumUpgradeBlockedBySponsor([
      contract({ deal_id: "amt_denkmalschutz", prestige_tier: "newly_promoted", status: "active" }),
    ]);
    assert.equal(blocked, true);
  });
});
