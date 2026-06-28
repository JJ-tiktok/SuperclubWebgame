import { isOffseasonCardChoicePayload } from "@/lib/game/game-changer-effects";
import { sortPendingGameChangerChoices } from "@/lib/lobby/club-game-changers";
import type { ClubGameChangerSnapshot, LobbySnapshot } from "@/lib/lobby/types";

/**
 * Positive when `server` is fresher than `client`, negative when `client` is fresher.
 */
export function compareSnapshotFreshness(server: LobbySnapshot, client: LobbySnapshot): number {
  const serverSeq = Number(server.game.live_seq ?? 0);
  const clientSeq = Number(client.game.live_seq ?? 0);
  if (serverSeq !== clientSeq) {
    return serverSeq - clientSeq;
  }

  const serverPicks = server.draft?.picks.length ?? 0;
  const clientPicks = client.draft?.picks.length ?? 0;
  if (serverPicks !== clientPicks) {
    return serverPicks - clientPicks;
  }

  const serverTurn = server.game.current_turn_club_id ?? "";
  const clientTurn = client.game.current_turn_club_id ?? "";
  if (serverTurn !== clientTurn) {
    if (!serverTurn) {
      return -1;
    }
    if (!clientTurn) {
      return 1;
    }
    return serverTurn.localeCompare(clientTurn);
  }

  const serverUpdated = server.game.updated_at ?? "";
  const clientUpdated = client.game.updated_at ?? "";
  if (serverUpdated !== clientUpdated) {
    return serverUpdated > clientUpdated ? 1 : -1;
  }

  return 0;
}

export function isServerSnapshotNewer(
  server: LobbySnapshot,
  client: LobbySnapshot | null | undefined,
): boolean {
  if (!client || client.game.id !== server.game.id) {
    return true;
  }

  return compareSnapshotFreshness(server, client) > 0;
}

export function pickFresherSnapshot(
  server: LobbySnapshot,
  client: LobbySnapshot | null | undefined,
): LobbySnapshot {
  if (!client || client.game.id !== server.game.id) {
    return server;
  }

  return compareSnapshotFreshness(server, client) >= 0 ? server : client;
}

function mergePendingRowsById(
  primary: ClubGameChangerSnapshot[],
  secondary: ClubGameChangerSnapshot[],
): ClubGameChangerSnapshot[] {
  const byId = new Map<string, ClubGameChangerSnapshot>();
  for (const row of primary) {
    byId.set(row.id, row);
  }
  for (const row of secondary) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** Keeps pending Game-Changer choices from SSR when the client store snapshot is stale. */
export function mergePendingGameChangerSnapshot(
  server: LobbySnapshot,
  client: LobbySnapshot | null | undefined,
): LobbySnapshot {
  const picked = pickFresherSnapshot(server, client);
  const serverOverview = server.club_overview;
  const pickedOverview = picked.club_overview;

  if (!serverOverview || !pickedOverview) {
    return picked;
  }

  const serverPending = serverOverview.pending_game_changer_choices ?? [];
  const pickedPending = pickedOverview.pending_game_changer_choices ?? [];
  if (serverPending.length === 0 && pickedPending.length === 0) {
    return picked;
  }

  const mergedPending = sortPendingGameChangerChoices(mergePendingRowsById(pickedPending, serverPending));
  const hasOffseasonPending = mergedPending.some((row) => isOffseasonCardChoicePayload(row.choice_payload));

  return {
    ...picked,
    club_overview: {
      ...pickedOverview,
      pending_game_changer_choices: mergedPending,
      last_place_bonus: serverOverview.last_place_bonus
        ? {
            ...serverOverview.last_place_bonus,
            pending_game_changer_choice:
              hasOffseasonPending || serverOverview.last_place_bonus.pending_game_changer_choice,
          }
        : pickedOverview.last_place_bonus,
    },
  };
}
