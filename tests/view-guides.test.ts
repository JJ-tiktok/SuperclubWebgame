import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GAME_VIEWS } from "@/components/game/lib/dashboard-helpers";
import { VIEW_GUIDES } from "@/components/game/lib/view-guides";

describe("view guides config", () => {
  it("defines a guide for every GameView", () => {
    for (const view of GAME_VIEWS) {
      assert.ok(VIEW_GUIDES[view], `missing guide for view: ${view}`);
    }
  });

  it("has non-empty summaries for all views", () => {
    for (const view of GAME_VIEWS) {
      const summary = VIEW_GUIDES[view].summary.trim();
      assert.ok(summary.length > 0, `empty summary for view: ${view}`);
    }
  });

  it("uses unique section ids within each view", () => {
    for (const view of GAME_VIEWS) {
      const sections = VIEW_GUIDES[view].sections ?? [];
      const ids = sections.map((section) => section.id);
      const unique = new Set(ids);
      assert.equal(
        unique.size,
        ids.length,
        `duplicate section ids in view ${view}: ${ids.join(", ")}`,
      );
    }
  });
});
