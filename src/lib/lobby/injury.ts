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

export function getFixtureParticipantClubIds(participants: {
  home: { club_id?: string | null };
  away: { club_id?: string | null };
}): string[] {
  return [participants.home.club_id, participants.away.club_id].filter(
    (clubId): clubId is string => typeof clubId === "string" && clubId.length > 0,
  );
}

/**
 * injured_until_matchday > 0: injured through that matchday (inclusive).
 * Heals after the club completes a fixture on completedMatchday when until <= completedMatchday.
 * Season-long injuries (-1) never auto-heal here.
 */
export function isInjuryExpiredAfterMatchday(
  injuredUntilMatchday: number | null | undefined,
  completedMatchday: number,
): boolean {
  if (injuredUntilMatchday == null || injuredUntilMatchday <= 0) {
    return false;
  }
  return injuredUntilMatchday <= completedMatchday;
}

/** Heals expired injuries only for clubs that just finished a fixture. */
export async function healExpiredInjuriesForClubs(
  supabase: SupabaseClient,
  currentMatchday: number,
  clubIds: string[],
): Promise<void> {
  if (clubIds.length === 0) {
    return;
  }

  await supabase
    .from("club_players")
    .update({ injured: false, injured_until_matchday: null })
    .gt("injured_until_matchday", 0)
    .lte("injured_until_matchday", currentMatchday)
    .in("club_id", clubIds);
}
