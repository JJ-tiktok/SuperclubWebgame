import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOwnedPlayerGrowthHeadroom,
  getPlayerHighlights,
  hasUnreachedSkillMax,
} from "@/components/game/lib/player-highlights";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

function makePlayer(partial: {
  id: string;
  current_stars: number;
  base_stars?: number;
  potential_stars?: number;
  skill_max?: number;
  seasons_at_club?: number;
  acquired_at?: string;
  custom_name?: string | null;
  display_name?: string;
}): ClubPlayerSnapshot {
  const baseStars = partial.base_stars ?? partial.current_stars;
  return {
    club_id: "club-1",
    current_stars: partial.current_stars,
    current_zone: "MID",
    custom_name: partial.custom_name ?? null,
    id: partial.id,
    injured: false,
    player: {
      base_stars: baseStars,
      content_key: partial.id,
      display_name: partial.display_name ?? partial.id,
      id: partial.id,
      position: "MID",
      potential_stars: partial.potential_stars ?? 0,
      skill_max: partial.skill_max ?? 5,
    },
    player_id: partial.id,
    seasons_at_club: partial.seasons_at_club,
    acquired_at: partial.acquired_at,
  };
}

describe("getPlayerHighlights", () => {
  it("returns empty array for empty squad", () => {
    assert.deepEqual(getPlayerHighlights([]), []);
  });

  it("picks all four highlight categories", () => {
    const squad = [
      makePlayer({ id: "a", current_stars: 4, base_stars: 4, potential_stars: 1, seasons_at_club: 1, display_name: "Alpha" }),
      makePlayer({ id: "b", current_stars: 5, base_stars: 5, potential_stars: 0, seasons_at_club: 2, custom_name: "Garibaldi" }),
      makePlayer({
        id: "c",
        current_stars: 3,
        base_stars: 4,
        potential_stars: 2,
        skill_max: 6,
        seasons_at_club: 4,
        acquired_at: "2024-01-01T00:00:00.000Z",
        display_name: "Charlie",
      }),
    ];

    const highlights = getPlayerHighlights(squad);
    assert.equal(highlights.length, 4);
    assert.equal(highlights.find((entry) => entry.category === "top_rated")?.displayName, "Garibaldi");
    assert.equal(highlights.find((entry) => entry.category === "highest_potential")?.displayName, "Charlie");
    assert.equal(highlights.find((entry) => entry.category === "highest_growth_potential")?.displayName, "Charlie");
    assert.equal(highlights.find((entry) => entry.category === "longest_tenure")?.displayName, "Charlie");
  });

  it("picks highest unreached skill_max for potential (Luca Jansen case)", () => {
    const squad = [
      makePlayer({
        id: "vet",
        current_stars: 5,
        base_stars: 5,
        potential_stars: 0,
        skill_max: 5,
        display_name: "Veteran",
      }),
      makePlayer({
        id: "luca",
        current_stars: 3,
        base_stars: 2,
        potential_stars: 0,
        skill_max: 6,
        display_name: "Luca Jansen",
      }),
    ];

    assert.equal(hasUnreachedSkillMax(squad[0]), false);
    assert.equal(getOwnedPlayerGrowthHeadroom(squad[1]), 3);

    const highlight = getPlayerHighlights(squad).find((entry) => entry.category === "highest_potential");
    assert.equal(highlight?.displayName, "Luca Jansen");
    assert.match(highlight?.detail ?? "", /6 max\. Sterne \(aktuell 3\)/);
  });

  it("picks highest growth headroom separately from highest skill_max", () => {
    const squad = [
      makePlayer({
        id: "luca",
        current_stars: 3,
        base_stars: 2,
        potential_stars: 0,
        skill_max: 6,
        display_name: "Luca Jansen",
      }),
      makePlayer({
        id: "rookie",
        current_stars: 1,
        base_stars: 1,
        potential_stars: 0,
        skill_max: 5,
        display_name: "Rookie",
      }),
    ];

    const highlights = getPlayerHighlights(squad);
    assert.equal(highlights.find((entry) => entry.category === "highest_potential")?.displayName, "Luca Jansen");
    assert.equal(highlights.find((entry) => entry.category === "highest_growth_potential")?.displayName, "Rookie");
    assert.match(
      highlights.find((entry) => entry.category === "highest_growth_potential")?.detail ?? "",
      /\+4 bis 5 Sterne/,
    );
  });

  it("omits potential highlights when every player reached skill_max", () => {
    const squad = [
      makePlayer({ id: "a", current_stars: 5, base_stars: 5, skill_max: 5, display_name: "A" }),
      makePlayer({ id: "b", current_stars: 4, base_stars: 4, skill_max: 4, display_name: "B" }),
    ];

    const highlights = getPlayerHighlights(squad);
    assert.equal(highlights.length, 2);
    assert.equal(highlights.some((entry) => entry.category === "highest_potential"), false);
    assert.equal(highlights.some((entry) => entry.category === "highest_growth_potential"), false);
  });

  it("uses acquired_at as tenure tiebreak", () => {
    const squad = [
      makePlayer({
        id: "old",
        current_stars: 3,
        seasons_at_club: 2,
        acquired_at: "2023-01-01T00:00:00.000Z",
        display_name: "Oldtimer",
      }),
      makePlayer({
        id: "new",
        current_stars: 3,
        seasons_at_club: 2,
        acquired_at: "2024-01-01T00:00:00.000Z",
        display_name: "Newbie",
      }),
    ];

    const highlight = getPlayerHighlights(squad).find((entry) => entry.category === "longest_tenure");
    assert.equal(highlight?.displayName, "Oldtimer");
  });

  it("defaults missing seasons_at_club to one season", () => {
    const squad = [makePlayer({ id: "solo", current_stars: 4, display_name: "Solo" })];
    const highlight = getPlayerHighlights(squad).find((entry) => entry.category === "longest_tenure");
    assert.match(highlight?.detail ?? "", /1 Saison/);
  });
});
