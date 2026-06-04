import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameEventType } from "@/lib/lobby/types";

function isLiveEventsUnavailableError(error: { code?: string; message?: string; details?: string } | null) {
  if (!error) {
    return false;
  }

  const code = error.code ?? "";
  if (code === "42703" || code === "42P01" || code === "PGRST202" || code === "42883") {
    return true;
  }

  const hay = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    hay.includes("live_seq") ||
    hay.includes("append_game_event") ||
    hay.includes("could not find the function") ||
    (hay.includes("game_events") && hay.includes("does not exist"))
  );
}

/**
 * Appends a live event for realtime sync. No-ops when live-events schema/RPC is missing
 * so core game actions still work before `supabase/live_events_upgrade.sql` is applied.
 */
export async function emitGameEvent(
  supabase: SupabaseClient,
  params: {
    actorClerkUserId?: string | null;
    gameId: string;
    payload?: Record<string, unknown>;
    type: GameEventType;
  },
) {
  const { error } = await supabase.rpc("append_game_event", {
    p_actor_clerk_user_id: params.actorClerkUserId ?? null,
    p_game_id: params.gameId,
    p_payload: params.payload ?? {},
    p_type: params.type,
  });

  if (!error) {
    return;
  }

  if (isLiveEventsUnavailableError(error)) {
    return;
  }

  throw new Error(error.message ?? "Live-Event konnte nicht geschrieben werden.");
}

export { isLiveEventsUnavailableError };
