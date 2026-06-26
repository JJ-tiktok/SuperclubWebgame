import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHallOfFameSnapshot,
  getTrainingGainsForClubPlayer,
  sumTrainingGainsByClubPlayerId,
} from "@/lib/lobby/hall-of-fame";
import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

function makePlayer(partial: {
  id: string;
  club_id?: string;
  current_stars: number;
  stars_at_acquisition?: number;
  base_stars?: number;
  skill_max?: number;
  seasons_at_club?: number;
  acquired_at?: string;
  custom_name?: string | null;
  display_name?: string;
}): ClubPlayerSnapshot {
  const baseStars = partial.base_stars ?? partial.current_stars;
  return {
    acquired_at: partial.acquired_at,
    club_id: partial.club_id ?? "club-1",
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
      potential_stars: 0,
      skill_max: partial.skill_max ?? 6,
    },
    player_id: partial.id,
    seasons_at_club: partial.seasons_at_club,
    stars_at_acquisition: partial.stars_at_acquisition ?? baseStars,
  };
}

function trainingTransaction(params: {
  club_id: string;
  club_player_id: string;
  before_stars: number;
  after_stars: number;
  player_id?: string;
}) {
  return {
    club_id: params.club_id,
    created_at: "2026-01-01T00:00:00.000Z",
    id: `${params.club_player_id}-${params.before_stars}-${params.after_stars}`,
    metadata: {
      after_stars: params.after_stars,
      before_stars: params.before_stars,
      club_player_id: params.club_player_id,
      player_id: params.player_id ?? params.club_player_id,
      season_number: 1,
      success: params.after_stars > params.before_stars,
    },
  };
}

describe("sumTrainingGainsByClubPlayerId", () => {
  it("sums gains per club and player", () => {
    const gains = sumTrainingGainsByClubPlayerId([
      trainingTransaction({ after_stars: 3, before_stars: 2, club_id: "club-1", club_player_id: "p1" }),
      trainingTransaction({ after_stars: 4, before_stars: 3, club_id: "club-1", club_player_id: "p1" }),
      trainingTransaction({ after_stars: 2, before_stars: 1, club_id: "club-2", club_player_id: "p1" }),
    ]);

    assert.equal(getTrainingGainsForClubPlayer(gains, "club-1", "p1"), 2);
    assert.equal(getTrainingGainsForClubPlayer(gains, "club-2", "p1"), 1);
    assert.equal(getTrainingGainsForClubPlayer(gains, "club-1", "missing"), 0);
  });
});

describe("buildHallOfFameSnapshot", () => {
  const clubA = { club_color: "#ff0000", club_name: "Club A", id: "club-a" };
  const clubB = { club_color: "#0000ff", club_name: "Club B", id: "club-b" };

  it("ranks tenure, training, and development for own club", () => {
    const snapshot = buildHallOfFameSnapshot({
      clubSquads: [
        {
          club: clubA,
          squad: [
            makePlayer({ acquired_at: "2024-01-01", current_stars: 4, display_name: "Veteran", id: "veteran", seasons_at_club: 4, stars_at_acquisition: 2 }),
            makePlayer({ acquired_at: "2025-01-01", current_stars: 5, display_name: "Rookie", id: "rookie", seasons_at_club: 1, stars_at_acquisition: 4 }),
          ],
        },
      ],
      ownClubId: "club-a",
      trainingTransactions: [
        trainingTransaction({ after_stars: 4, before_stars: 2, club_id: "club-a", club_player_id: "veteran" }),
        trainingTransaction({ after_stars: 5, before_stars: 4, club_id: "club-a", club_player_id: "rookie" }),
      ],
    });

    const tenure = snapshot.own_club.find((category) => category.id === "tenure");
    const training = snapshot.own_club.find((category) => category.id === "training");
    const development = snapshot.own_club.find((category) => category.id === "development");

    assert.equal(tenure?.entries[0]?.display_name, "Veteran");
    assert.equal(tenure?.entries[0]?.metric_value, 4);

    assert.equal(training?.entries[0]?.display_name, "Veteran");
    assert.equal(training?.entries[0]?.metric_value, 2);

    assert.equal(development?.entries[0]?.display_name, "Veteran");
    assert.equal(development?.entries[0]?.metric_value, 2);
  });

  it("aggregates league rankings across clubs", () => {
    const snapshot = buildHallOfFameSnapshot({
      clubSquads: [
        {
          club: clubA,
          squad: [makePlayer({ club_id: "club-a", current_stars: 3, display_name: "Alpha", id: "alpha", seasons_at_club: 2 })],
        },
        {
          club: clubB,
          squad: [makePlayer({ club_id: "club-b", current_stars: 4, display_name: "Bravo", id: "bravo", seasons_at_club: 5 })],
        },
      ],
      ownClubId: "club-a",
      trainingTransactions: [],
    });

    const leagueTenure = snapshot.league.find((category) => category.id === "tenure");
    assert.equal(leagueTenure?.entries[0]?.display_name, "Bravo");
    assert.equal(leagueTenure?.entries[0]?.club_name, "Club B");
    assert.equal(leagueTenure?.entries[1]?.display_name, "Alpha");
  });

  it("lists players who reached skill max", () => {
    const snapshot = buildHallOfFameSnapshot({
      clubSquads: [
        {
          club: clubA,
          squad: [
            makePlayer({ current_stars: 6, display_name: "Maxed", id: "maxed", skill_max: 6, stars_at_acquisition: 4 }),
            makePlayer({ current_stars: 4, display_name: "Growing", id: "growing", skill_max: 6, stars_at_acquisition: 3 }),
          ],
        },
      ],
      ownClubId: "club-a",
      trainingTransactions: [],
    });

    const skillMax = snapshot.own_club.find((category) => category.id === "skill_max");
    assert.equal(skillMax?.entries.length, 1);
    assert.equal(skillMax?.entries[0]?.display_name, "Maxed");
  });
});
