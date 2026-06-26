import type { createSupabaseServiceClient } from "@/lib/supabase/server";

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

export function normalizeSeasonsAtClub(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
}

export async function incrementPlayerTenureForGame(supabase: ServiceClient, gameId: string) {
  const { error } = await supabase.rpc("increment_club_player_tenure_for_game", {
    p_game_id: gameId,
  });

  if (error) {
    throw new Error(error.message ?? "Vereinszugehoerigkeit konnte nicht aktualisiert werden.");
  }
}
