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
    const eventChannel = client.channel(`game:${gameId}`, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });
    const fallbackChannel = client.channel(`game-fallback:${gameId}`);

    async function recover(reason: string) {
      if (!active) {
        return;
      }

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
      }, 120);
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

      const fallbackRecover = (reason: string) => {
        scheduleRecover(reason);
      };

      fallbackChannel
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, () => fallbackRecover("fallback_games"))
        .on("postgres_changes", { event: "*", schema: "public", table: "clubs", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_clubs"))
        .on("postgres_changes", { event: "*", schema: "public", table: "game_members", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_game_members"))
        .on("postgres_changes", { event: "*", schema: "public", table: "draft_rounds", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_draft_rounds"))
        .on("postgres_changes", { event: "*", schema: "public", table: "scouting_draws", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_scouting_draws"))
        .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_auctions"))
        .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, () => fallbackRecover("fallback_bids"))
        .on("postgres_changes", { event: "*", schema: "public", table: "fixtures", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_fixtures"))
        .on("postgres_changes", { event: "*", schema: "public", table: "season_standings", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_season_standings"))
        .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_transactions"))
        .on("postgres_changes", { event: "*", schema: "public", table: "club_players" }, () => fallbackRecover("fallback_club_players"))
        .on("postgres_changes", { event: "*", schema: "public", table: "club_staff" }, () => fallbackRecover("fallback_club_staff"))
        .on("postgres_changes", { event: "*", schema: "public", table: "staff_offers" }, () => fallbackRecover("fallback_staff_offers"))
        .on("postgres_changes", { event: "*", schema: "public", table: "transfer_offers" }, () => fallbackRecover("fallback_transfer_offers"))
        .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_investments"))
        .on("postgres_changes", { event: "*", schema: "public", table: "club_game_changers" }, () => fallbackRecover("fallback_club_game_changers"))
        .on("postgres_changes", { event: "*", schema: "public", table: "match_news", filter: `game_id=eq.${gameId}` }, () => fallbackRecover("fallback_match_news"))
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            scheduleRecover(`fallback_${status.toLowerCase()}`);
          }
        });
    }

    void subscribe();
    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        scheduleRecover("poll");
      }
    }, 2_000);

    return () => {
      active = false;
      window.clearInterval(pollInterval);
      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
      }
      void client.removeChannel(eventChannel);
      void client.removeChannel(fallbackChannel);
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
