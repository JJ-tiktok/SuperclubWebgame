import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveEventsUnavailableError } from "@/lib/lobby/emit-game-event";

/**
 * Prunes non-rule-critical live/UI history (old game_events, surplus match_news)
 * for a single savegame to keep long sessions responsive.
 *
 * Best-effort: no-ops when the `run_game_history_cleanup` RPC is missing so core
 * flows keep working before `supabase/auto_cleanup_upgrade.sql` is applied. Never
 * throws, so it is safe to call right before a redirect in a server action.
 */
export async function cleanupGameHistory(
  supabase: SupabaseClient,
  gameId: string,
  options?: { keepEvents?: number; keepMatchNews?: number },
): Promise<void> {
  try {
    const { error } = await supabase.rpc("run_game_history_cleanup", {
      p_game_id: gameId,
      p_keep_events: options?.keepEvents ?? 1000,
      p_keep_match_news: options?.keepMatchNews ?? 50,
    });

    if (error && !isLiveEventsUnavailableError(error)) {
      console.warn(`[cleanup-history] game=${gameId} skipped: ${error.message ?? "unknown error"}`);
    }
  } catch (error) {
    console.warn(`[cleanup-history] game=${gameId} threw: ${error instanceof Error ? error.message : String(error)}`);
  }
}
