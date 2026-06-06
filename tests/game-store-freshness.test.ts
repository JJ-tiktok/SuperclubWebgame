import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getGameStoreStateForTests,
  hydrateGameStore,
  resetGameStoreForTests,
} from "@/components/game/game-store";
import {
  compareSnapshotFreshness,
  pickFresherSnapshot,
} from "@/components/game/snapshot-freshness";
import { applyGameEventToSnapshot } from "@/lib/lobby/game-events";
import type { GameEventSnapshot, LobbySnapshot } from "@/lib/lobby/types";

function baseSnapshot(overrides: Partial<LobbySnapshot> = {}): LobbySnapshot {
  return {
    club_overview: null,
    club_squads: null,
    clubs: [
      {
        clerk_user_id: "user-a",
        club_name: "Alpha",
        game_id: "game-a",
        id: "club-a",
        is_ready: false,
        manager_name: "A",
        money: 0,
        points: 0,
      },
    ],
    continental: null,
    cpu_setup: null,
    deadline: null,
    draft: {
      board_player_ids: ["player-a", "player-b"],
      board_players: [],
      completed: false,
      created_at: "2026-01-01T00:00:00.000Z",
      current_club_id: "club-b",
      current_pick_index: 1,
      game_id: "game-a",
      id: "round-a",
      pick_order_club_ids: ["club-a", "club-b"],
      picks: [
        {
          clubId: "club-a",
          pickIndex: 0,
          playerId: "player-a",
        },
      ],
      round_index: 0,
      squad_counts: { "club-a": 1, "club-b": 0 },
    },
    game: {
      host_clerk_user_id: "user-a",
      id: "game-a",
      live_seq: 2,
      phase: "draft",
      room_code: "ROOM01",
      settings: {
        max_draft_stars: 5,
        starting_money: 100,
        turn_timeout_seconds: 60,
      },
      current_turn_club_id: "club-b",
      updated_at: "2026-01-02T00:00:00.000Z",
    },
    match_news: [],
    members: [],
    scouting: null,
    season: null,
    transfer_market: null,
    ...overrides,
  } as LobbySnapshot;
}

function event(type: GameEventSnapshot["type"], seq: number, payload: Record<string, unknown>): GameEventSnapshot {
  return {
    actor_clerk_user_id: "user-a",
    created_at: "2026-01-02T00:00:00.000Z",
    game_id: "game-a",
    id: `event-${seq}`,
    payload,
    seq,
    type,
  };
}

describe("snapshot freshness", () => {
  it("prefers the server snapshot when it has a higher live_seq", () => {
    const server = baseSnapshot();
    const client = baseSnapshot({
      game: {
        ...baseSnapshot().game,
        live_seq: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    });

    assert.equal(compareSnapshotFreshness(server, client), 1);
    assert.equal(pickFresherSnapshot(server, client).game.live_seq, 2);
  });

  it("prefers the client snapshot when live events advanced it beyond SSR props", () => {
    const server = baseSnapshot({
      game: {
        ...baseSnapshot().game,
        live_seq: 2,
      },
      draft: {
        ...baseSnapshot().draft!,
        picks: [],
        current_pick_index: 0,
        current_club_id: "club-a",
      },
    });
    const client = baseSnapshot({
      game: {
        ...baseSnapshot().game,
        live_seq: 3,
      },
    });

    assert.equal(compareSnapshotFreshness(server, client), -1);
    assert.equal(pickFresherSnapshot(server, client).game.live_seq, 3);
  });

  it("falls back to draft pick count when live_seq is unchanged", () => {
    const server = baseSnapshot();
    const client = baseSnapshot({
      draft: {
        ...baseSnapshot().draft!,
        picks: [],
        current_pick_index: 0,
        current_club_id: "club-a",
      },
    });

    assert.equal(compareSnapshotFreshness(server, client), 1);
    assert.equal(pickFresherSnapshot(server, client).draft?.picks.length, 1);
  });
});

describe("game store hydration", () => {
  it("does not downgrade the store when an older snapshot is hydrated", () => {
    resetGameStoreForTests();
    hydrateGameStore(baseSnapshot({ game: { ...baseSnapshot().game, live_seq: 3 } }), { force: true });

    hydrateGameStore(baseSnapshot({ game: { ...baseSnapshot().game, live_seq: 2 } }));

    assert.equal(getGameStoreStateForTests().seq, 3);
    assert.equal(getGameStoreStateForTests().snapshot?.game.live_seq, 3);
  });
});

describe("draft round completion events", () => {
  it("requests a refetch when a draft round completes", () => {
    const snapshot = baseSnapshot({
      draft: {
        ...baseSnapshot().draft!,
        picks: [],
        current_pick_index: 0,
        current_club_id: "club-a",
      },
      game: {
        ...baseSnapshot().game,
        live_seq: 1,
        current_turn_club_id: "club-a",
      },
    });

    const result = applyGameEventToSnapshot(
      snapshot,
      event("DRAFT_PICK_MADE", 2, {
        clubId: "club-a",
        pickIndex: 15,
        playerId: "player-z",
        roundComplete: true,
        squadCount: 16,
      }),
    );

    assert.equal(result.needsRefetch, true);
    assert.equal(result.applied, true);
  });
});
