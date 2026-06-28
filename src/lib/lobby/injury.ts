import type { SupabaseClient } from "@supabase/supabase-js";

export async function applyClubPlayerInjury(
  supabase: SupabaseClient,
  params: {
    clubId: string;
    clubPlayerId: string;
    untilMatchday: number;
  },
) {
  const { error } = await supabase
    .from("club_players")
    .update({
      current_zone: "bench",
      injured: true,
      injured_until_matchday: params.untilMatchday,
      lineup_slot: null,
    })
    .eq("id", params.clubPlayerId)
    .eq("club_id", params.clubId);

  if (error) {
    throw error;
  }
}
