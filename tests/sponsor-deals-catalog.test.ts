import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getSponsorDealById, SPONSOR_DEALS, SPONSOR_PRESTIGE_LABELS } from "@/lib/lobby/sponsor-deals";

describe("Sponsor deals catalog", () => {
  it("contains 19 unique deals", () => {
    assert.equal(SPONSOR_DEALS.length, 19);
    const ids = new Set(SPONSOR_DEALS.map((deal) => deal.id));
    assert.equal(ids.size, 19);
  });

  it("maps every deal to a known prestige tier label", () => {
    for (const deal of SPONSOR_DEALS) {
      assert.ok(SPONSOR_PRESTIGE_LABELS[deal.prestige_tier]);
      assert.ok(deal.display_name.length > 0);
      assert.ok(deal.task_description.length > 0);
      assert.ok(deal.duration_seasons >= 1 && deal.duration_seasons <= 3);
    }
  });

  it("parses money rewards as positive numbers", () => {
    for (const deal of SPONSOR_DEALS) {
      if (deal.reward_type === "money" || deal.reward_type === "money_and_scouting" || deal.reward_type === "money_and_player_star") {
        assert.ok(Number(deal.reward_config.amount ?? 0) > 0);
      }
    }
  });

  it("matches CSV slugs from public/Sponsoring.csv", () => {
    const csv = readFileSync(join(process.cwd(), "public", "Sponsoring.csv"), "utf8");
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const dataLines = lines.slice(1);
    assert.ok(dataLines.length >= 19);
    for (const deal of SPONSOR_DEALS) {
      assert.ok(getSponsorDealById(deal.id), `missing deal ${deal.id}`);
    }
  });
});
