import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countUnreadOwnNews,
  describePendingEffect,
  findPendingEffectForNews,
  getSeenStorageKey,
  getShownNewsIds,
  isNewsShownInSession,
  markNewsIdsShown,
  parseGameChangerHeadline,
  resolveClubName,
} from "@/lib/game/game-changer-ui";
import type { ClubPendingEffectSnapshot, LobbyClub, MatchNewsSnapshot } from "@/lib/lobby/types";

const clubs: LobbyClub[] = [
  {
    id: "club-1",
    game_id: "game-1",
    clerk_user_id: "user-1",
    club_name: "FC Test",
    manager_name: "Manager",
    money: 0,
    points: 0,
    is_ready: true,
    created_at: "",
  } as LobbyClub,
];

describe("game-changer-ui", () => {
  it("builds per-game storage key", () => {
    assert.equal(getSeenStorageKey("abc"), "superclub_gc_seen_abc");
  });

  it("resolves club name", () => {
    assert.equal(resolveClubName(clubs, "club-1"), "FC Test");
    assert.equal(resolveClubName(clubs, "missing"), null);
  });

  it("parses game changer headlines", () => {
    assert.equal(parseGameChangerHeadline("Game Changer: Schnaeppchen"), "Schnaeppchen");
    assert.equal(parseGameChangerHeadline("Geheimwaffe eingesetzt: Turbo"), "Turbo");
  });

  it("describes transfer price delta", () => {
    const effect: ClubPendingEffectSnapshot = {
      id: "e1",
      club_id: "club-1",
      season_number: 1,
      effect_type: "next_transfer_price_delta",
      payload: { amount: -10_000_000 },
      scope: "next_transfer",
      consumed_at: null,
      fixture_id: null,
      source_club_game_changer_id: "gc-1",
      created_at: "",
    };
    assert.equal(describePendingEffect(effect), "Naechster Transfer -10 Mio");
  });

  it("links news to pending effect via club_game_changer_id", () => {
    const news: MatchNewsSnapshot = {
      id: "n1",
      game_id: "game-1",
      club_id: "club-1",
      club_game_changer_id: "gc-1",
      category: "good_news",
      headline: "Game Changer: Test",
      created_at: "",
    };
    const pending: ClubPendingEffectSnapshot[] = [
      {
        id: "e1",
        club_id: "club-1",
        season_number: 1,
        effect_type: "next_transfer_price_delta",
        payload: { amount: -10_000_000 },
        scope: "next_transfer",
        consumed_at: null,
        fixture_id: null,
        source_club_game_changer_id: "gc-1",
        created_at: "",
      },
    ];
    assert.equal(findPendingEffectForNews(news, pending)?.id, "e1");
  });

  it("tracks shown news ids in session storage", () => {
    const shownKey = `superclub_gc_shown_news_ids_game-2`;
    const original = globalThis.sessionStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      configurable: true,
    });
    markNewsIdsShown("game-2", ["n-abc"]);
    assert.equal(isNewsShownInSession("game-2", "n-abc"), true);
    assert.equal(getShownNewsIds("game-2").has("n-abc"), true);
    assert.ok(store.has(shownKey));
    Object.defineProperty(globalThis, "sessionStorage", { value: original, configurable: true });
  });

  it("counts unread own news after last seen", () => {
    const news: MatchNewsSnapshot[] = [
      {
        id: "n1",
        game_id: "game-1",
        club_id: "club-1",
        category: "good_news",
        headline: "A",
        created_at: "2026-01-02T10:00:00Z",
      },
      {
        id: "n2",
        game_id: "game-1",
        club_id: "club-2",
        category: "bad_news",
        headline: "B",
        created_at: "2026-01-02T11:00:00Z",
      },
    ];
    const storageKey = getSeenStorageKey("game-1");
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      configurable: true,
    });
    store.set(storageKey, "2026-01-02T09:00:00Z");
    assert.equal(countUnreadOwnNews(news, "club-1", "game-1"), 1);
    Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
  });
});
