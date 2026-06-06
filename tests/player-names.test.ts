import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH,
  getClubPlayerDisplayNameFromRow,
  normalizeClubPlayerCustomName,
} from "@/lib/lobby/player-names";

describe("club player custom names", () => {
  it("uses the custom name before the catalog name", () => {
    assert.equal(
      getClubPlayerDisplayNameFromRow({
        custom_name: "Der Libero",
        player: { display_name: "Original Name" },
      }),
      "Der Libero",
    );
  });

  it("falls back to the catalog name when no custom name is set", () => {
    assert.equal(
      getClubPlayerDisplayNameFromRow({
        custom_name: null,
        player: { display_name: "Original Name" },
      }),
      "Original Name",
    );
  });

  it("normalizes whitespace and resets empty names to null", () => {
    assert.deepEqual(normalizeClubPlayerCustomName("  New   Name  "), { ok: true, value: "New Name" });
    assert.deepEqual(normalizeClubPlayerCustomName("   "), { ok: true, value: null });
  });

  it("rejects too long names and pure punctuation", () => {
    assert.deepEqual(normalizeClubPlayerCustomName("x".repeat(CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH + 1)), {
      ok: false,
      reason: "too_long",
    });
    assert.deepEqual(normalizeClubPlayerCustomName("!!!"), {
      ok: false,
      reason: "invalid_characters",
    });
  });
});
