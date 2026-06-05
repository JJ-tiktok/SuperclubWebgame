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

const SNAPSHOT_RECOVERY_DEBOUNCE_MS = 750;
const VISIBILITY_RECOVERY_AFTER_MS = 60_000;
const MIN_SNAPSHOT_POLL_MS = 15_000;

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
    const supabaseJwtTemplate = process.env.NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE;
    const getSupabaseToken = async () => {
      if (supabaseJwtTemplate) {
        return await activeSession.getToken({ template: supabaseJwtTemplate });
      }

      return activeSession.getToken();
    };
    const supabase = createClerkBrowserClient(getSupabaseToken);
    if (!supabase) {
      return;
    }
    const client = supabase;

    let active = true;
    let recoveryInFlight = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    const gameId = snapshot.game.id;
    const roomCode = snapshot.game.room_code;
    const snapshotPollMs = getConfiguredSnapshotPollMs();
    let lastLiveActivityAt = Date.now();
    const eventChannel = client.channel(`game:${gameId}`, {
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

      lastLiveActivityAt = Date.now();
      await refetchGameSnapshot({ reason, roomCode, view: currentView });
    }

    function scheduleRecover(reason: string) {
      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
      }

      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        if (recoveryInFlight) {
          return;
        }

          recoveryInFlight = true;
          void recover(reason).finally(() => {
            recoveryInFlight = false;
          });
      }, SNAPSHOT_RECOVERY_DEBOUNCE_MS);
    }

    async function subscribe() {
      const token = await getSupabaseToken();
      if (!active || !token) {
        return;
      }

      client.realtime.setAuth(token);

      eventChannel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            filter: `game_id=eq.${gameId}`,
            schema: "public",
            table: "game_events",
          },
          (payload) => {
            lastLiveActivityAt = Date.now();
            const event = normalizeGameEvent(payload.new);
            if (!event) {
              scheduleRecover("invalid_event_payload");
              return;
            }

            const result = applyGameEvent(event);
            if (result.needsRefetch) {
              scheduleRecover(`event_${event.type.toLowerCase()}`);
            }
          },
        )
        .on("presence", { event: "sync" }, () => {
          lastLiveActivityAt = Date.now();
          setGamePresence(normalizePresenceState(eventChannel.presenceState()));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void eventChannel.track({
              clubId: ownClub?.id ?? null,
              currentView,
              displayName: ownMember?.display_name ?? ownClub?.manager_name ?? "Manager",
              lastSeenAt: Date.now(),
              ready: snapshot.game.phase === "lobby" ? Boolean(ownClub?.is_ready) : Boolean(ownMember?.phase_done),
              userId: currentUserId,
            } satisfies GamePresenceEntry);
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            scheduleRecover(`events_${status.toLowerCase()}`);
          }
        });
    }

    void subscribe();
    const pollInterval = snapshotPollMs
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") {
            scheduleRecover("configured_poll");
          }
        }, snapshotPollMs)
      : null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (Date.now() - lastLiveActivityAt >= VISIBILITY_RECOVERY_AFTER_MS) {
        scheduleRecover("visibility_resume");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
      }
      void client.removeChannel(eventChannel);
    };
  }, [currentUserId, currentView, isLoaded, ownClub?.id, ownClub?.is_ready, ownClub?.manager_name, ownMember?.display_name, ownMember?.phase_done, session, snapshot.game.id, snapshot.game.phase, snapshot.game.room_code]);

  return null;
}

function getConfiguredSnapshotPollMs() {
  const raw = process.env.NEXT_PUBLIC_GAME_SNAPSHOT_POLL_MS;
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(MIN_SNAPSHOT_POLL_MS, Math.trunc(value));
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
