import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGameEvent,
  getGameStoreStateForTests,
  hydrateGameStore,
  resetGameStoreForTests,
} from "@/components/game/game-store";
import type { GameEventSnapshot, LobbySnapshot } from "@/lib/lobby/types";

function snapshot(): LobbySnapshot {
  return {
    club_overview: {
      finance: {
        money: 0,
        placement_reward: 0,
        projected_income: 0,
        projected_net: 0,
        squad_stars: 0,
        stadium_income: 0,
        wages: 0,
      },
      game_changers: [],
      investments: [],
      pending_effects: [],
      pending_game_changer_choices: [],
      sales_count: 0,
      season_number: 1,
      squad: [
        {
          club_id: "club-a",
          current_stars: 3,
          current_zone: "bench",
          id: "cp-1",
          injured: false,
          lineup_slot: null,
          player_id: "player-a",
          player: {
            base_stars: 3,
            display_name: "Player A",
            id: "player-a",
            position: "MID",
            potential_stars: 0,
          },
        },
      ],
      staff: [],
      training: {
        events: [],
        status: {
          attempts_used: 0,
          capacity_players: 1,
          guaranteed_bonus_available: false,
          guaranteed_bonus_used: false,
          max_gain_per_player: 1,
          training_level: 1,
        },
      },
    },
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
    deadline: {
      active_auction: {
        auction_index: 0,
        bid_order_club_ids: ["club-a", "club-b"],
        bids: [],
        club_id: "club-a",
        completed_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        current_amount: 0,
        game_id: "game-a",
        id: "auction-a",
        minimum_bid: 10,
        passed_club_ids: [],
        player: {
          base_stars: 3,
          display_name: "Auction Player",
          id: "player-b",
          position: "ATT",
          potential_stars: 0,
        },
        player_id: "player-b",
        season_number: 1,
        status: "open",
      },
      auction_count: 1,
      auctions: [],
      completed_count: 0,
    },
    draft: {
      board_player_ids: ["player-a"],
      board_players: [],
      completed: false,
      created_at: "2026-01-01T00:00:00.000Z",
      current_club_id: "club-a",
      current_pick_index: 0,
      game_id: "game-a",
      id: "draft-a",
      pick_order_club_ids: ["club-a", "club-b"],
      picks: [],
      round_index: 0,
      squad_counts: { "club-a": 0 },
    },
    game: {
      host_clerk_user_id: "user-a",
      id: "game-a",
      live_seq: 0,
      phase: "draft",
      room_code: "ABC-12",
      settings: {
        max_draft_stars: 3,
        starting_money: 0,
        turn_timeout_seconds: 30,
      },
    },
    match_news: [],
    members: [
      {
        clerk_user_id: "user-a",
        display_name: "A",
        game_id: "game-a",
        id: "member-a",
        is_host: true,
      },
    ],
    scouting: null,
    season: {
      current_matchday: 1,
      fixtures: [
        {
          away_lineup_locked: false,
          away_participant: {
            display_name: "Beta",
            game_id: "game-a",
            id: "participant-b",
            kind: "human",
            season_number: 1,
          },
          away_participant_id: "participant-b",
          game_id: "game-a",
          home_lineup_locked: false,
          home_participant: {
            club_id: "club-a",
            display_name: "Alpha",
            game_id: "game-a",
            id: "participant-a",
            kind: "human",
            season_number: 1,
          },
          home_participant_id: "participant-a",
          id: "fixture-a",
          matchday: 1,
          season_number: 1,
          status: "scheduled",
        },
      ],
      manager_standings: [],
      standings: [],
    },
    transfer_market: null,
  } as LobbySnapshot;
}

function event(type: GameEventSnapshot["type"], seq: number, payload: Record<string, unknown>): GameEventSnapshot {
  return {
    actor_clerk_user_id: "user-a",
    created_at: "2026-01-01T00:00:00.000Z",
    game_id: "game-a",
    id: `event-${seq}`,
    payload,
    seq,
    type,
  };
}

describe("game live event store", () => {
  it("patches ready, draft pick, bid, and lineup lock events", () => {
    resetGameStoreForTests();
    hydrateGameStore(snapshot());

    assert.equal(applyGameEvent(event("MEMBER_READY_CHANGED", 1, { clerkUserId: "user-a", ready: true })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().snapshot?.clubs[0].is_ready, true);

    assert.equal(applyGameEvent(event("DRAFT_PICK_MADE", 2, { clubId: "club-a", pickIndex: 0, playerId: "player-a", squadCount: 1 })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().snapshot?.draft?.picks.length, 1);

    assert.equal(applyGameEvent(event("AUCTION_BID_PLACED", 3, { amount: 25, auctionId: "auction-a", clubId: "club-a", nextClubId: "club-b" })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().snapshot?.deadline?.active_auction?.current_amount, 25);

    assert.equal(applyGameEvent(event("LINEUP_LOCKED", 4, { fixtureId: "fixture-a", side: "home" })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().snapshot?.season?.fixtures[0].home_lineup_locked, true);
  });

  it("requests recovery for event gaps and ignores stale events", () => {
    resetGameStoreForTests();
    hydrateGameStore(snapshot());

    assert.equal(applyGameEvent(event("MEMBER_READY_CHANGED", 2, { clerkUserId: "user-a", ready: true })).needsRefetch, true);
    assert.equal(getGameStoreStateForTests().seq, 0);

    assert.equal(applyGameEvent(event("MEMBER_READY_CHANGED", 1, { clerkUserId: "user-a", ready: true })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().seq, 1);

    assert.equal(applyGameEvent(event("MEMBER_READY_CHANGED", 1, { clerkUserId: "user-a", ready: false })).needsRefetch, false);
    assert.equal(getGameStoreStateForTests().snapshot?.clubs[0].is_ready, true);
  });
});
