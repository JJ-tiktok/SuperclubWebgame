"use client";

import { useSession } from "@clerk/nextjs";
import { useEffect } from "react";
import {
  applyGameEvent,
  refetchGameSnapshot,
  setGamePresence,
  type GamePresenceEntry,
} from "@/components/game/game-store";
import { createClerkBrowserClient } from "@/lib/supabase/client";
import type { GameEventSnapshot, LobbySnapshot } from "@/lib/lobby/types";

export function GameRealtimeBridge({
  currentUserId,
  currentView,
  snapshot,
}: {
  currentUserId: string;
  currentView: string;
  snapshot: LobbySnapshot;
}) {
  const { session, isLoaded } = useSession();
  const ownClub = snapshot.clubs.find((club) => club.clerk_user_id === currentUserId);
  const ownMember = snapshot.members.find((member) => member.clerk_user_id === currentUserId);

  useEffect(() => {
    if (!isLoaded || !session || !currentUserId) {
      return;
    }

    const activeSession = session;
    const supabase = createClerkBrowserClient(() => activeSession.getToken());
    if (!supabase) {
      return;
    }
    const client = supabase;

    let active = true;
    const roomCode = snapshot.game.room_code;
    const channel = client.channel(`game:${snapshot.game.id}`, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    async function recover(reason: string) {
      if (!active) {
        return;
      }

      await refetchGameSnapshot({ reason, roomCode, view: currentView });
    }

    async function subscribe() {
      const token = await activeSession.getToken();
      if (!active || !token) {
        return;
      }

      client.realtime.setAuth(token);

      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            filter: `game_id=eq.${snapshot.game.id}`,
            schema: "public",
            table: "game_events",
          },
          (payload) => {
            const event = normalizeGameEvent(payload.new);
            if (!event) {
              void recover("invalid_event_payload");
              return;
            }

            const result = applyGameEvent(event);
            if (result.needsRefetch) {
              void recover(`event_${event.type.toLowerCase()}`);
            }
          },
        )
        .on("presence", { event: "sync" }, () => {
          setGamePresence(normalizePresenceState(channel.presenceState()));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void channel.track({
              clubId: ownClub?.id ?? null,
              currentView,
              displayName: ownMember?.display_name ?? ownClub?.manager_name ?? "Manager",
              lastSeenAt: Date.now(),
              ready: snapshot.game.phase === "lobby" ? Boolean(ownClub?.is_ready) : Boolean(ownMember?.phase_done),
              userId: currentUserId,
            } satisfies GamePresenceEntry);
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void recover(`channel_${status.toLowerCase()}`);
          }
        });
    }

    void subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [currentUserId, currentView, isLoaded, ownClub?.id, ownClub?.is_ready, ownClub?.manager_name, ownMember?.display_name, ownMember?.phase_done, session, snapshot.game.id, snapshot.game.phase, snapshot.game.room_code]);

  return null;
}

function normalizeGameEvent(value: unknown): GameEventSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};

  return {
    actor_clerk_user_id: typeof row.actor_clerk_user_id === "string" ? row.actor_clerk_user_id : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    game_id: String(row.game_id ?? ""),
    id: String(row.id ?? ""),
    payload,
    seq: Number(row.seq ?? 0),
    type: type as GameEventSnapshot["type"],
  };
}

function normalizePresenceState(value: Record<string, unknown[]>): Record<string, GamePresenceEntry> {
  const presence: Record<string, GamePresenceEntry> = {};

  for (const entries of Object.values(value)) {
    const entry = entries.at(-1);
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const item = entry as Record<string, unknown>;
    const userId = typeof item.userId === "string" ? item.userId : "";
    if (!userId) {
      continue;
    }

    presence[userId] = {
      clubId: typeof item.clubId === "string" ? item.clubId : null,
      currentView: typeof item.currentView === "string" ? item.currentView : undefined,
      displayName: typeof item.displayName === "string" ? item.displayName : undefined,
      lastSeenAt: Number(item.lastSeenAt ?? Date.now()),
      ready: typeof item.ready === "boolean" ? item.ready : undefined,
      userId,
    };
  }

  return presence;
}
