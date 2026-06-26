"use client";

import { useSyncExternalStore } from "react";
import { compareSnapshotFreshness } from "@/components/game/snapshot-freshness";
import { applyGameEventToSnapshot } from "@/lib/lobby/game-events";
import type { GameEventSnapshot, LobbySnapshot } from "@/lib/lobby/types";

export type GamePresenceEntry = {
  clubId?: string | null;
  currentView?: string;
  displayName?: string;
  lastSeenAt: number;
  ready?: boolean;
  userId: string;
};

type GameStoreState = {
  lastRecoveryReason?: string;
  presence: Record<string, GamePresenceEntry>;
  seq: number;
  snapshot: LobbySnapshot | null;
};

const listeners = new Set<() => void>();
const refetchCountByReason: Record<string, number> = {};

let state: GameStoreState = {
  presence: {},
  seq: 0,
  snapshot: null,
};

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function hydrateGameStore(snapshot: LobbySnapshot, options?: { force?: boolean }) {
  if (
    !options?.force &&
    state.snapshot?.game.id === snapshot.game.id &&
    compareSnapshotFreshness(snapshot, state.snapshot) < 0
  ) {
    return;
  }

  state = {
    ...state,
    seq: Number(snapshot.game.live_seq ?? 0),
    snapshot,
  };
  emit();
}

export function hydrateGameStoreIfNewer(snapshot: LobbySnapshot) {
  if (!state.snapshot || state.snapshot.game.id !== snapshot.game.id) {
    hydrateGameStore(snapshot, { force: true });
    return;
  }

  if (compareSnapshotFreshness(snapshot, state.snapshot) >= 0) {
    hydrateGameStore(snapshot, { force: true });
  }
}

export function applyGameEvent(event: GameEventSnapshot) {
  if (!state.snapshot) {
    state = { ...state, lastRecoveryReason: "missing_snapshot" };
    emit();
    return { needsRefetch: true };
  }

  if (event.seq <= state.seq) {
    return { needsRefetch: false };
  }

  if (event.seq !== state.seq + 1) {
    state = { ...state, lastRecoveryReason: "event_gap" };
    emit();
    return { needsRefetch: true };
  }

  const result = applyGameEventToSnapshot(state.snapshot, event);
  if (!result.applied) {
    state = { ...state, lastRecoveryReason: "unknown_event" };
    emit();
    return { needsRefetch: true };
  }

  state = {
    ...state,
    lastRecoveryReason: result.needsRefetch ? "complex_event" : undefined,
    seq: event.seq,
    snapshot: result.snapshot,
  };
  emit();

  return { needsRefetch: result.needsRefetch };
}

export async function refetchGameSnapshot(params: {
  reason: string;
  roomCode: string;
  view?: string;
}) {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GAME_PERF_LOG === "1") {
    refetchCountByReason[params.reason] = (refetchCountByReason[params.reason] ?? 0) + 1;
    console.info(
      `[game-snapshot-refetch] reason=${params.reason} view=${params.view ?? "dashboard"} count=${refetchCountByReason[params.reason]}`,
    );
  }

  const query = params.view ? `?view=${encodeURIComponent(params.view)}` : "";
  const response = await fetch(`/api/games/${encodeURIComponent(params.roomCode)}/snapshot${query}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    state = { ...state, lastRecoveryReason: params.reason };
    emit();
    return;
  }

  const data = (await response.json()) as { snapshot: LobbySnapshot | null };
  if (data.snapshot) {
    hydrateGameStore(data.snapshot, { force: true });
  }
}

export function setGamePresence(presence: Record<string, GamePresenceEntry>) {
  state = { ...state, presence };
  emit();
}

export function getGameStoreStateForTests() {
  return state;
}

export function resetGameStoreForTests() {
  state = {
    presence: {},
    seq: 0,
    snapshot: null,
  };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}
