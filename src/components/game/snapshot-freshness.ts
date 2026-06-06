import type { LobbySnapshot } from "@/lib/lobby/types";

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
