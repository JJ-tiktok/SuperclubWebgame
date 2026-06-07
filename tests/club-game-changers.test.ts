import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnusedSecretWeapon, mergeCarriedSecretWeapons } from "@/lib/lobby/club-game-changers";
import type { ClubGameChangerSnapshot } from "@/lib/lobby/types";

function row(partial: Partial<ClubGameChangerSnapshot> & Pick<ClubGameChangerSnapshot, "id">): ClubGameChangerSnapshot {
  return {
    applied_third: null,
    applied_window: null,
    choice_payload: null,
    created_at: "2026-01-01T00:00:00.000Z",
    fixture_id: null,
    game_changer_card_id: "card-1",
    resolved_payload: null,
    season_number: 1,
    status: "resolved",
    used_at: null,
    card: {
      category: "secret_weapon",
      content_key: "sw-1",
      description: "Test",
      display_name: "Test SW",
      effects: [],
      timing: "before_match",
      visibility: "owner",
    },
    ...partial,
  };
}

describe("club game changer inventory", () => {
  it("detects unused secret weapons", () => {
    assert.equal(isUnusedSecretWeapon(row({ id: "a" })), true);
    assert.equal(
      isUnusedSecretWeapon(
        row({
          id: "b",
          card: { ...row({ id: "b" }).card, category: "good_news" },
        }),
      ),
      false,
    );
    assert.equal(isUnusedSecretWeapon(row({ id: "c", used_at: "2026-01-02T00:00:00.000Z" })), false);
  });

  it("merges carried secret weapons from prior seasons into the current snapshot", () => {
    const carried = row({
      id: "old-sw",
      season_number: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      card: { ...row({ id: "old-sw" }).card, display_name: "Old Weapon" },
    });
    const current = row({
      id: "news-1",
      season_number: 2,
      created_at: "2026-06-01T00:00:00.000Z",
      card: { ...row({ id: "news-1" }).card, category: "good_news", display_name: "Good News" },
    });

    const merged = mergeCarriedSecretWeapons([current], [carried, current]);

    assert.equal(merged.length, 2);
    assert.ok(merged.some((item) => item.id === "old-sw"));
    assert.ok(merged.some((item) => item.id === "news-1"));
  });

  it("prefers the current-season row when ids overlap", () => {
    const carried = row({ id: "shared", season_number: 1, created_at: "2026-01-01T00:00:00.000Z" });
    const current = row({
      id: "shared",
      season_number: 2,
      created_at: "2026-06-01T00:00:00.000Z",
      card: { ...row({ id: "shared" }).card, display_name: "Updated" },
    });

    const merged = mergeCarriedSecretWeapons([current], [carried]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.card.display_name, "Updated");
  });
});
