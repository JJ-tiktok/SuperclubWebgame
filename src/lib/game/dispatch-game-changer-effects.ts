import {
  applyImmediateEffect,
  buildPendingChoice,
  effectToPendingScope,
  enqueuePendingEffect,
  injuryDurationMatchday,
  selectInjuryTarget,
  type GameChangerEffect,
  type ImmediateContext,
  type InjuryCandidate,
  type PendingChoice,
} from "@/lib/game/game-changer-effects";
import { getClubPlayerDisplayNameFromRow } from "@/lib/lobby/player-names";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadInjuryCandidates(
  supabase: SupabaseClient,
  clubId: string,
): Promise<InjuryCandidate[]> {
  const { data } = await supabase
    .from("club_players")
    .select("id, custom_name, current_stars, current_zone, injured, player:players(display_name, position)")
    .eq("club_id", clubId)
    .eq("injured", false)
    .returns<
      Array<{
        id: string;
        custom_name?: string | null;
        current_stars: number | string;
        current_zone: string;
        injured: boolean;
        player: { display_name: string; position: string | null } | null;
      }>
    >();
  return (data ?? []).map((row) => ({
    id: row.id,
    current_stars: Number(row.current_stars),
    current_zone: row.current_zone,
    position: row.player?.position ?? null,
    display_name: getClubPlayerDisplayNameFromRow(row),
  }));
}

async function applyTargetedInjury(
  supabase: SupabaseClient,
  clubId: string,
  effect: Extract<GameChangerEffect, { type: "targeted_injury" }>,
  ctx: { matchday: number },
): Promise<{ applied: boolean; detail?: string; clubPlayerId?: string }> {
  const candidates = await loadInjuryCandidates(supabase, clubId);
  const target = selectInjuryTarget(effect, candidates);
  if (!target) return { applied: false };
  const until = injuryDurationMatchday(effect, ctx.matchday);
  await supabase
    .from("club_players")
    .update({ injured: true, injured_until_matchday: until })
    .eq("id", target.id);
  const durationLabel = effect.duration === "season" ? "Rest der Saison" : "naechstes Spiel";
  return { applied: true, detail: `${target.display_name} verletzt (${durationLabel})`, clubPlayerId: target.id };
}

export type DispatchGameChangerResult = {
  status: "resolved" | "pending";
  choice: PendingChoice | null;
  details: string[];
};

/**
 * Central dispatcher for a newly drawn Good/Bad News card.
 */
export async function dispatchGameChangerEffects(params: {
  supabase: SupabaseClient;
  clubId: string;
  clubGameChangerId: string | null;
  effects: GameChangerEffect[];
  ctx: ImmediateContext & { matchday: number };
}): Promise<DispatchGameChangerResult> {
  const { supabase, clubId, clubGameChangerId, effects, ctx } = params;
  const details: string[] = [];
  let pendingChoice: PendingChoice | null = null;
  let pendingChoiceEffectIdx = -1;

  for (let i = 0; i < effects.length; i++) {
    const choice = buildPendingChoice(effects[i]);
    if (choice) {
      pendingChoice = choice;
      pendingChoiceEffectIdx = i;
      break;
    }
  }

  for (let i = 0; i < effects.length; i++) {
    if (i === pendingChoiceEffectIdx) continue;
    const effect = effects[i];

    if (effect.type === "targeted_injury") {
      const result = await applyTargetedInjury(supabase, clubId, effect, { matchday: ctx.matchday });
      if (result.detail) details.push(result.detail);
      continue;
    }

    const persistent = effectToPendingScope(effect);
    if (persistent) {
      await enqueuePendingEffect(supabase, clubId, effect, {
        ...ctx,
        sourceClubGameChangerId: clubGameChangerId ?? undefined,
      });
      details.push(`Pending: ${persistent.scope}`);
      continue;
    }

    const result = await applyImmediateEffect(supabase, clubId, effect, ctx);
    if (result.detail && result.detail !== "persistent") details.push(result.detail);
  }

  if (pendingChoice && clubGameChangerId) {
    await supabase
      .from("club_game_changers")
      .update({ status: "pending", choice_payload: pendingChoice as unknown as Record<string, unknown> })
      .eq("id", clubGameChangerId);
    return { status: "pending", choice: pendingChoice, details };
  }

  if (clubGameChangerId) {
    await supabase
      .from("club_game_changers")
      .update({
        status: "resolved",
        used_at: new Date().toISOString(),
        fixture_id: ctx.fixtureId ?? null,
      })
      .eq("id", clubGameChangerId);
  }

  return { status: "resolved", choice: null, details };
}
