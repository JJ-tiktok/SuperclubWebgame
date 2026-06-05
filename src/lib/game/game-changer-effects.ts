import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOffseasonScoutingSnapshot } from "@/lib/lobby/scouting";
import { applyClubStatusDelta, normalizeClubStatus, resolveEffectiveClubStatus } from "@/lib/lobby/club-status";
import type { GameChangerCategory } from "@/lib/lobby/types";

// ---------------------------------------------------------------------------
// Effect union
// ---------------------------------------------------------------------------

export type TacticalZone = "ATT" | "MID" | "DEF";
export type FacilityKey = "training" | "scouting" | "stadium";
export type EffectScope = "next_match" | "next_transfer" | "next_offseason" | "current_offseason" | "this_season";

export type GameChangerEffect =
  // Legacy / Secret Weapon
  | { type: "money_change"; amount: number }
  | { type: "third_boost"; zone: TacticalZone; stars: number; for: "self" | "opponent" }
  | { type: "third_penalty"; zone: TacticalZone; stars: number; for: "self" | "opponent" }
  | { type: "reroll_third"; zone?: TacticalZone }
  | { type: "swap_dice_with_opponent"; zone: TacticalZone }
  | { type: "heal_random_injury" }
  | { type: "injure_random_opponent" }
  | { type: "steal_money"; amount: number }
  | { type: "extra_training_attempt" }
  | { type: "noop" }
  // v3 effects (CSV catalog)
  | { type: "free_facility_upgrade"; facility: FacilityKey; levels: number }
  | { type: "player_potential_bonus"; stars: number; choice?: "any_owned" }
  | { type: "free_scouting_draw"; count: number }
  | { type: "free_scouting_buy_next"; count: number }
  | { type: "free_staff_offer" }
  | { type: "free_staff_signing" }
  | { type: "training_capacity_delta"; delta: number | "double"; scope: "current_offseason" | "next_offseason" }
  | { type: "status_tier_change"; delta: number; until: "season_end" }
  | { type: "next_transfer_price_delta"; amount: number }
  | { type: "next_match_zone_delta"; delta: number; zone?: TacticalZone; choice?: "zone" }
  | { type: "next_match_draw_dice_bonus"; bonus: number }
  | { type: "next_match_lineup_locked" }
  | { type: "next_match_staff_disabled" }
  | { type: "stadium_income_cap"; level: number; until: "season_end" }
  | { type: "targeted_injury"; selector: "random_zone" | "best_zone" | "random_position"; zone?: TacticalZone; position?: "GK" | "DEF" | "MID" | "ATT"; duration: "next_match" | "season" }
  | { type: "last_trained_star_loss"; stars: number }
  | { type: "force_release_stars"; stars: number }
  | { type: "offseason_lock"; blocks: Array<"scouting" | "transfers"> }
  // v4 active match cards (secret-weapon family with play windows)
  | { type: "match_zone_boost"; stars: number; zone?: TacticalZone; choice?: "zone" }
  | { type: "man_marking"; per_star_attack_penalty: number; choice: "defender" }
  | { type: "captain_reassign"; choice: "captain_player" | "captain_zone" }
  | { type: "lineup_reopen" }
  | { type: "injure_opponent"; duration: "season" | "next_match"; choice: "opponent_player" }
  | { type: "derby_day" }
  | { type: "var_reroll" }
  | { type: "heal_injury_choice" }
  | { type: "retroactive_win_attempt"; attempts: number; faces: number; success: number };

// Zone modifier written into fixture.partial_result.pending_modifiers for the next third
export type ZoneModifier = {
  zone: TacticalZone;
  delta: number; // positive = boost, negative = penalty
  for: "home" | "away";
  source_club_game_changer_id: string;
};

// Shape stored in fixture.partial_result (thirds are stored as JSON)
export type PartialResult = {
  thirds: unknown[];
  pending_modifiers: ZoneModifier[];
};

export type ThirdSummary = {
  index: 1 | 2 | 3;
  home_score: number;
  away_score: number;
  home_third_points: number;
  away_third_points: number;
  events: unknown[];
};

// ---------------------------------------------------------------------------
// Choice descriptions for pending Game Changers
// ---------------------------------------------------------------------------

export type ChoiceType = "pick_player" | "pick_zone" | "accept_or_decline" | "pick_staff";

export type PendingChoice =
  | { type: "pick_player"; effect_type: "player_potential_bonus"; stars: number; filter?: "owned" }
  | { type: "pick_zone"; effect_type: "next_match_zone_delta"; delta: number }
  | { type: "accept_or_decline"; effect_type: "free_scouting_buy_next" }
  | { type: "pick_staff"; effect_type: "free_staff_offer" };

export function buildPendingChoice(effect: GameChangerEffect): PendingChoice | null {
  if (effect.type === "player_potential_bonus" && effect.choice === "any_owned") {
    return { type: "pick_player", effect_type: "player_potential_bonus", stars: effect.stars, filter: "owned" };
  }

  if (effect.type === "next_match_zone_delta" && effect.choice === "zone") {
    return { type: "pick_zone", effect_type: "next_match_zone_delta", delta: effect.delta };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Active match-card classification (v4)
// ---------------------------------------------------------------------------

export type MatchCardChoiceKind =
  | "zone"
  | "defender"
  | "opponent_player"
  | "injured_player"
  | "captain_player";

/**
 * Returns the choice UI a v4 match card requires before it can be played,
 * or null if it can be played without a target selection.
 */
export function getMatchCardChoiceKind(effects: GameChangerEffect[]): MatchCardChoiceKind | null {
  for (const effect of effects) {
    if (effect.type === "match_zone_boost" && effect.choice === "zone") return "zone";
    if (effect.type === "man_marking") return "defender";
    if (effect.type === "heal_injury_choice") return "injured_player";
    if (effect.type === "captain_reassign") return "captain_player";
    // injure_opponent (Dirty Tackle) targets a hidden opponent roster -> resolved
    // server-side (random) to avoid leaking the opponent squad. No client choice.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Human-readable description
// ---------------------------------------------------------------------------

const FACILITY_LABEL: Record<FacilityKey, string> = {
  training: "Trainingsplatz",
  scouting: "Scouting",
  stadium: "Stadion",
};

export function describeEffect(effect: GameChangerEffect): string {
  switch (effect.type) {
    case "money_change":
      return effect.amount >= 0
        ? `+${Math.round(effect.amount / 1_000_000)}M Einnahmen`
        : `${Math.round(effect.amount / 1_000_000)}M Verlust`;
    case "third_boost":
      return `+${effect.stars} Sterne in Zone ${effect.zone} (${effect.for === "self" ? "eigen" : "Gegner"})`;
    case "third_penalty":
      return `-${effect.stars} Sterne in Zone ${effect.zone} (${effect.for === "self" ? "eigen" : "Gegner"})`;
    case "reroll_third":
      return effect.zone ? `Neuauswurf in Zone ${effect.zone}` : "Neuauswurf beliebige Zone";
    case "swap_dice_with_opponent":
      return `Wuerfeltausch mit Gegner in Zone ${effect.zone}`;
    case "heal_random_injury":
      return "Zufaelliger Spieler wird geheilt";
    case "injure_random_opponent":
      return "Zufaelliger Gegner-Spieler verletzt sich";
    case "steal_money":
      return `${Math.round(effect.amount / 1_000_000)}M vom Gegner gestohlen`;
    case "extra_training_attempt":
      return "Extra Trainingsversuch";
    case "noop":
      return "Kein Effekt";
    case "free_facility_upgrade":
      return `${FACILITY_LABEL[effect.facility]} +${effect.levels} Level (kostenlos)`;
    case "player_potential_bonus":
      return `+${effect.stars} Talentstern fuer einen Spieler`;
    case "free_scouting_draw":
      return `Kostenloser Spieler-Draw (x${effect.count})`;
    case "free_scouting_buy_next":
      return "Naechster Spieler-Kauf kostenlos";
    case "free_staff_offer":
      return "Gratis Staff-Draw (vor letzter Investment-Aktion nutzen)";
    case "free_staff_signing":
      return "Gratis Staff-Verpflichtung (nach dem Draw)";
    case "training_capacity_delta":
      if (effect.delta === "double") {
        return `Trainingseinheiten verdoppelt (${labelScope(effect.scope)})`;
      }
      return `${effect.delta >= 0 ? "+" : ""}${effect.delta} Trainingseinheit(en) (${labelScope(effect.scope)})`;
    case "status_tier_change":
      return `${effect.delta >= 0 ? "+" : ""}${effect.delta} Statuslevel`;
    case "next_transfer_price_delta":
      return effect.amount >= 0
        ? `Naechster Transfer +${Math.round(effect.amount / 1_000_000)}M`
        : `Naechster Transfer ${Math.round(effect.amount / 1_000_000)}M`;
    case "next_match_zone_delta":
      return `${effect.delta >= 0 ? "+" : ""}${effect.delta} in Zone ${effect.zone ?? "(Auswahl)"} im naechsten Spiel`;
    case "next_match_draw_dice_bonus":
      return `+${effect.bonus} Wuerfelbonus bei Unentschieden`;
    case "next_match_lineup_locked":
      return "Aufstellung im naechsten Spiel gesperrt";
    case "next_match_staff_disabled":
      return "Staff-Boni im naechsten Spiel deaktiviert";
    case "stadium_income_cap":
      return `Stadion-Einkommen diese Saison max. Level ${effect.level}`;
    case "targeted_injury":
      return effect.duration === "season"
        ? `Spieler verletzt (Rest der Saison)`
        : `Spieler verletzt (naechstes Spiel)`;
    case "last_trained_star_loss":
      return `Zuletzt trainierter Spieler -${effect.stars} Stern`;
    case "force_release_stars":
      return `Spieler im Wert von ${effect.stars} Sternen entlassen`;
    case "offseason_lock":
      return `Offseason gesperrt: ${effect.blocks.join(", ")}`;
    case "match_zone_boost":
      return effect.choice === "zone"
        ? `+${effect.stars} auf ein beliebiges Drittel`
        : `+${effect.stars} in Zone ${effect.zone ?? "(Auswahl)"}`;
    case "man_marking":
      return `Manndeckung: Gegner-Angriff -${effect.per_star_attack_penalty} pro Verteidiger-Stern`;
    case "captain_reassign":
      return "Captain neu zuweisen (Boost auf anderen Spieler)";
    case "lineup_reopen":
      return "Aufstellung erneut oeffnen und neu locken";
    case "injure_opponent":
      return effect.duration === "season"
        ? "Gegner-Spieler verletzen (Rest der Saison)"
        : "Gegner-Spieler verletzen (naechstes Spiel)";
    case "derby_day":
      return "Derby Day: alle Zusatzeffekte fallen weg";
    case "var_reroll":
      return "VAR: letztes Drittel neu wuerfeln";
    case "heal_injury_choice":
      return "Verletzten Spieler heilen";
    case "retroactive_win_attempt":
      return `${effect.attempts}x W${effect.faces}: bei ${effect.success} nachtraeglicher Sieg`;
  }
}

function labelScope(scope: "current_offseason" | "next_offseason"): string {
  return scope === "current_offseason" ? "diese Offseason" : "naechste Offseason";
}

export function describeGameChangerEffects(effects: GameChangerEffect[]): string {
  if (effects.length === 0) return "Kein Effekt";
  return effects.map(describeEffect).join(", ");
}

// ---------------------------------------------------------------------------
// Immediate effect application
// ---------------------------------------------------------------------------

export type ImmediateContext = {
  fixtureId?: string;
  matchday?: number;
  seasonNumber?: number;
  resolvedPayload?: Record<string, unknown>;
  sourceClubGameChangerId?: string;
};

export async function applyImmediateEffect(
  supabase: SupabaseClient,
  clubId: string,
  effect: GameChangerEffect,
  ctx: ImmediateContext = {},
): Promise<{ applied: boolean; detail?: string }> {
  switch (effect.type) {
    case "money_change": {
      const { data: club } = await supabase
        .from("clubs")
        .select("money")
        .eq("id", clubId)
        .maybeSingle<{ money: number }>();
      if (club != null) {
        await supabase
          .from("clubs")
          .update({ money: Number(club.money) + effect.amount })
          .eq("id", clubId);
      }
      return { applied: true, detail: describeEffect(effect) };
    }

    case "heal_random_injury": {
      const { data: injured } = await supabase
        .from("club_players")
        .select("id, player:players(display_name)")
        .eq("club_id", clubId)
        .eq("injured", true)
        .limit(1)
        .maybeSingle<{ id: string; player: { display_name: string } | null }>();
      if (injured) {
        await supabase
          .from("club_players")
          .update({ injured: false, injured_until_matchday: null })
          .eq("id", injured.id);
        return { applied: true, detail: injured.player?.display_name ?? "Spieler geheilt" };
      }
      return { applied: false };
    }

    case "free_facility_upgrade": {
      const column = `${effect.facility}_level`;
      const { data: club } = await supabase
        .from("clubs")
        .select(column)
        .eq("id", clubId)
        .maybeSingle<Record<string, number>>();
      if (!club) return { applied: false };
      const currentLevel = Number(club[column] ?? 1);
      const newLevel = Math.min(4, currentLevel + Math.max(1, Math.trunc(effect.levels)));
      if (newLevel === currentLevel) return { applied: false, detail: "Max Level erreicht" };
      await supabase.from("clubs").update({ [column]: newLevel }).eq("id", clubId);
      if (effect.facility === "scouting") {
        await refreshOffseasonScoutingSnapshot(supabase, clubId, newLevel);
      }
      return { applied: true, detail: `${FACILITY_LABEL[effect.facility]} jetzt Level ${newLevel}` };
    }

    case "player_potential_bonus": {
      const clubPlayerId = (ctx.resolvedPayload?.club_player_id as string | undefined) ?? "";
      if (!clubPlayerId) return { applied: false, detail: "Kein Spieler gewaehlt" };
      const { data: cp } = await supabase
        .from("club_players")
        .select("id, current_stars, player:players(id, display_name, skill_max)")
        .eq("id", clubPlayerId)
        .eq("club_id", clubId)
        .maybeSingle<{ id: string; current_stars: number | string; player: { id: string; display_name: string; skill_max: number | string } | null }>();
      if (!cp || !cp.player) return { applied: false };
      const skillMax = Number(cp.player.skill_max ?? 0);
      const newSkillMax = skillMax + Math.max(1, Math.trunc(effect.stars));
      await supabase.from("players").update({ skill_max: newSkillMax }).eq("id", cp.player.id);
      return { applied: true, detail: `${cp.player.display_name}: Talent +${effect.stars}` };
    }

    case "last_trained_star_loss": {
      const { data: events } = await supabase
        .from("transactions")
        .select("id, created_at, metadata")
        .eq("club_id", clubId)
        .eq("reason", "training")
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<Array<{ id: string; created_at: string; metadata: { club_player_id?: string } }>>();
      const last = events?.[0];
      const clubPlayerId = last?.metadata?.club_player_id;
      if (!clubPlayerId) return { applied: false };
      const { data: cp } = await supabase
        .from("club_players")
        .select("id, current_stars, player:players(display_name)")
        .eq("id", clubPlayerId)
        .eq("club_id", clubId)
        .maybeSingle<{ id: string; current_stars: number | string; player: { display_name: string } | null }>();
      if (!cp) return { applied: false };
      const newStars = Math.max(0, Number(cp.current_stars) - Math.max(1, Math.trunc(effect.stars)));
      await supabase.from("club_players").update({ current_stars: newStars }).eq("id", cp.id);
      return { applied: true, detail: `${cp.player?.display_name ?? "Spieler"}: -${effect.stars} Stern` };
    }

    case "force_release_stars": {
      const target = Math.max(1, Math.trunc(effect.stars));
      const { data: players } = await supabase
        .from("club_players")
        .select("id, current_stars, player:players(display_name)")
        .eq("club_id", clubId)
        .order("current_stars", { ascending: true })
        .returns<Array<{ id: string; current_stars: number | string; player: { display_name: string } | null }>>();
      const sorted = (players ?? []).slice().sort((a, b) => Number(a.current_stars) - Number(b.current_stars));
      const removed: Array<{ id: string; name: string; stars: number }> = [];
      let removedStars = 0;
      for (const row of sorted) {
        if (removedStars >= target) break;
        removed.push({ id: row.id, name: row.player?.display_name ?? "Spieler", stars: Number(row.current_stars) });
        removedStars += Number(row.current_stars);
      }
      if (removed.length === 0) return { applied: false };
      const ids = removed.map((r) => r.id);
      await supabase.from("club_players").delete().in("id", ids);
      return { applied: true, detail: `Entlassen: ${removed.map((r) => r.name).join(", ")} (${removedStars} Sterne)` };
    }

    case "status_tier_change": {
      const seasonNumber = Math.max(1, Math.trunc(ctx.seasonNumber ?? 1));
      const clubResult = await supabase
        .from("clubs")
        .select("status, status_override, status_override_until_season")
        .eq("id", clubId)
        .maybeSingle<{
          status: string;
          status_override: string | null;
          status_override_until_season: number | null;
        }>();
      let club = clubResult.data;
      const clubError = clubResult.error;

      if (clubError?.code === "42703") {
        const fallback = await supabase
          .from("clubs")
          .select("status")
          .eq("id", clubId)
          .maybeSingle<{ status: string }>();
        if (fallback.error) {
          return { applied: false, detail: fallback.error.message };
        }
        club = fallback.data
          ? { status: fallback.data.status, status_override: null, status_override_until_season: null }
          : null;
      } else if (clubError) {
        return { applied: false, detail: clubError.message };
      }

      if (!club) return { applied: false, detail: "Club nicht gefunden" };

      const currentStatus = resolveEffectiveClubStatus(club, seasonNumber);
      const newStatus = applyClubStatusDelta(currentStatus, effect.delta);

      let { error: updateError } = await supabase
        .from("clubs")
        .update({ status_override: newStatus, status_override_until_season: seasonNumber })
        .eq("id", clubId);

      if (updateError?.code === "42703") {
        const fallback = await supabase.from("clubs").update({ status: newStatus }).eq("id", clubId);
        updateError = fallback.error;
      }

      if (updateError) {
        return { applied: false, detail: updateError.message };
      }

      const label = normalizeClubStatus(newStatus);
      if (label === currentStatus && effect.delta > 0) {
        return { applied: true, detail: `Status bereits maximal (${label})` };
      }
      return { applied: true, detail: `Status: ${label} (bis Saisonende)` };
    }

    case "stadium_income_cap": {
      const seasonNumber = Math.max(1, Math.trunc(ctx.seasonNumber ?? 1));
      await supabase
        .from("clubs")
        .update({ stadium_level_cap: effect.level, stadium_level_cap_until_season: seasonNumber })
        .eq("id", clubId);
      return { applied: true, detail: `Stadion gedeckelt auf Level ${effect.level}` };
    }

    case "free_scouting_draw":
    case "free_scouting_buy_next":
    case "next_transfer_price_delta":
    case "next_match_zone_delta":
    case "next_match_draw_dice_bonus":
    case "next_match_lineup_locked":
    case "next_match_staff_disabled":
    case "training_capacity_delta":
    case "offseason_lock":
    case "free_staff_offer":
    case "free_staff_signing":
      // These are persistent effects, handled via enqueuePendingEffect.
      return { applied: false, detail: "persistent" };

    case "targeted_injury":
      // Resolved via separate selectInjuryTarget + applyInjury helpers below.
      return { applied: false, detail: "needs selector" };

    // Secret-Weapon and PvP-only effects are handled in their own match path.
    case "third_boost":
    case "third_penalty":
    case "reroll_third":
    case "swap_dice_with_opponent":
    case "injure_random_opponent":
    case "steal_money":
    case "extra_training_attempt":
    case "noop":
    // v4 active match cards are resolved in playMatchCardAction, not here.
    case "match_zone_boost":
    case "man_marking":
    case "captain_reassign":
    case "lineup_reopen":
    case "injure_opponent":
    case "derby_day":
    case "var_reroll":
    case "heal_injury_choice":
    case "retroactive_win_attempt":
      return { applied: false };
  }
}

// ---------------------------------------------------------------------------
// Pending Effect dispatch
// ---------------------------------------------------------------------------

export function effectToPendingScope(effect: GameChangerEffect): { scope: EffectScope; payload: Record<string, unknown> } | null {
  switch (effect.type) {
    case "next_match_zone_delta":
      return { scope: "next_match", payload: { delta: effect.delta, zone: effect.zone ?? null } };
    case "next_match_draw_dice_bonus":
      return { scope: "next_match", payload: { bonus: effect.bonus } };
    case "next_match_lineup_locked":
      return { scope: "next_match", payload: {} };
    case "next_match_staff_disabled":
      return { scope: "next_match", payload: {} };
    case "next_transfer_price_delta":
      return { scope: "next_transfer", payload: { amount: effect.amount } };
    case "training_capacity_delta":
      return {
        scope: effect.scope === "current_offseason" ? "current_offseason" : "next_offseason",
        payload: { delta: effect.delta },
      };
    case "offseason_lock":
      return { scope: "current_offseason", payload: { blocks: effect.blocks } };
    case "free_scouting_draw":
      return { scope: "current_offseason", payload: { count: Math.max(1, Math.trunc(effect.count)) } };
    case "free_scouting_buy_next":
      return { scope: "next_transfer", payload: { count: Math.max(1, Math.trunc(effect.count)), free_buy: true } };
    case "free_staff_offer":
      return { scope: "current_offseason", payload: { free_offer: true } };
    case "free_staff_signing":
      return { scope: "current_offseason", payload: { free_signing: true } };
    default:
      return null;
  }
}

export async function enqueuePendingEffect(
  supabase: SupabaseClient,
  clubId: string,
  effect: GameChangerEffect,
  ctx: ImmediateContext = {},
): Promise<boolean> {
  const pending = effectToPendingScope(effect);
  if (!pending) return false;
  await supabase.from("club_pending_effects").insert({
    club_id: clubId,
    season_number: Math.max(1, Math.trunc(ctx.seasonNumber ?? 1)),
    effect_type: effect.type,
    payload: pending.payload,
    scope: pending.scope,
    fixture_id: ctx.fixtureId ?? null,
    source_club_game_changer_id: ctx.sourceClubGameChangerId ?? null,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Secret Weapon buffer helpers
// ---------------------------------------------------------------------------

export type MatchCardModifierPayload = {
  // For match_zone_boost with choice="zone": which zone the player picked.
  zone?: TacticalZone;
  // For man_marking: stars of the chosen defender (penalty = stars * per_star_attack_penalty).
  defender_stars?: number;
};

export function sumNextMatchZoneDeltas(
  effects: Array<{ effect_type: string; scope: string; payload: Record<string, unknown> }>,
): Record<TacticalZone, number> {
  const sums: Record<TacticalZone, number> = { ATT: 0, MID: 0, DEF: 0 };
  for (const effect of effects) {
    if (effect.scope !== "next_match" || effect.effect_type !== "next_match_zone_delta") continue;
    const zone = effect.payload.zone as TacticalZone | null | undefined;
    const delta = Number(effect.payload.delta ?? 0);
    if (!zone || !(zone in sums)) continue;
    sums[zone] += delta;
  }
  return sums;
}

export function sumFixtureZoneModifiersForSide(
  modifiers: ZoneModifier[] | undefined,
  side: "home" | "away",
): Record<TacticalZone, number> {
  const sums: Record<TacticalZone, number> = { ATT: 0, MID: 0, DEF: 0 };
  for (const mod of modifiers ?? []) {
    if (mod.for !== side) continue;
    sums[mod.zone] += mod.delta;
  }
  return sums;
}

export function resolveDisplayZoneBoosts(params: {
  clubId: string | null | undefined;
  partialModifiers?: ZoneModifier[];
  seasonBoostsByClubId?: Record<string, Record<TacticalZone, number>>;
  side: "home" | "away";
}): Record<TacticalZone, number> {
  const fromPartial = sumFixtureZoneModifiersForSide(params.partialModifiers, params.side);
  if (Object.values(fromPartial).some((value) => value !== 0)) {
    return fromPartial;
  }
  if (!params.clubId || !params.seasonBoostsByClubId) {
    return { ATT: 0, MID: 0, DEF: 0 };
  }
  return params.seasonBoostsByClubId[params.clubId] ?? { ATT: 0, MID: 0, DEF: 0 };
}

export function buildNextMatchZoneBoostsByClubId(
  effects: Array<{ club_id: string; effect_type: string; scope: string; payload: Record<string, unknown> }>,
): Record<string, Record<TacticalZone, number>> {
  const byClub = new Map<string, Array<{ effect_type: string; scope: string; payload: Record<string, unknown> }>>();
  for (const effect of effects) {
    const list = byClub.get(effect.club_id) ?? [];
    list.push(effect);
    byClub.set(effect.club_id, list);
  }
  const result: Record<string, Record<TacticalZone, number>> = {};
  for (const [clubId, clubEffects] of byClub) {
    result[clubId] = sumNextMatchZoneDeltas(clubEffects);
  }
  return result;
}

export function buildZoneModifiers(
  clubGameChangerId: string,
  forSide: "home" | "away",
  effects: GameChangerEffect[],
  payload: MatchCardModifierPayload = {},
): ZoneModifier[] {
  const mods: ZoneModifier[] = [];
  const opponentSide: "home" | "away" = forSide === "home" ? "away" : "home";
  for (const effect of effects) {
    if (effect.type === "third_boost") {
      const targetSide = effect.for === "self" ? forSide : opponentSide;
      mods.push({ zone: effect.zone, delta: effect.stars, for: targetSide, source_club_game_changer_id: clubGameChangerId });
    } else if (effect.type === "third_penalty") {
      const targetSide = effect.for === "self" ? forSide : opponentSide;
      mods.push({ zone: effect.zone, delta: -effect.stars, for: targetSide, source_club_game_changer_id: clubGameChangerId });
    } else if (effect.type === "match_zone_boost") {
      const zone = effect.choice === "zone" ? payload.zone : effect.zone;
      if (zone) {
        mods.push({ zone, delta: effect.stars, for: forSide, source_club_game_changer_id: clubGameChangerId });
      }
    } else if (effect.type === "man_marking") {
      const defenderStars = Math.max(0, Math.trunc(payload.defender_stars ?? 0));
      const penalty = defenderStars * Math.max(1, Math.trunc(effect.per_star_attack_penalty));
      if (penalty > 0) {
        mods.push({ zone: "ATT", delta: -penalty, for: opponentSide, source_club_game_changer_id: clubGameChangerId });
      }
    }
  }
  return mods;
}

// ---------------------------------------------------------------------------
// Retroactive win (Sieg oder Spielabbruch) dice helper
// ---------------------------------------------------------------------------

export type RetroWinResult = {
  rolls: number[];
  success: boolean;
};

export function rollRetroWin(
  effect: Extract<GameChangerEffect, { type: "retroactive_win_attempt" }>,
  random: () => number = Math.random,
): RetroWinResult {
  const attempts = Math.max(1, Math.trunc(effect.attempts));
  const faces = Math.max(1, Math.trunc(effect.faces));
  const rolls: number[] = [];
  for (let i = 0; i < attempts; i++) {
    rolls.push(1 + Math.floor(random() * faces));
  }
  return { rolls, success: rolls.some((r) => r >= effect.success) };
}

// ---------------------------------------------------------------------------
// Weighted random draw (CSV duplicate entries -> draw_weight)
// ---------------------------------------------------------------------------

export function pickWeightedIndex(weights: number[], random: () => number = Math.random): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return weights.length > 0 ? Math.floor(random() * weights.length) : -1;
  let roll = random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

export function mergeModifiersIntoPartialResult(
  partial: PartialResult | null | undefined,
  newMods: ZoneModifier[],
): PartialResult {
  const base: PartialResult = partial ?? { thirds: [], pending_modifiers: [] };
  return {
    ...base,
    pending_modifiers: [...base.pending_modifiers, ...newMods],
  };
}

export function consumePendingModifiers(partial: PartialResult): {
  modifiers: ZoneModifier[];
  updated: PartialResult;
} {
  const modifiers = partial.pending_modifiers ?? [];
  return {
    modifiers,
    updated: { ...partial, pending_modifiers: [] },
  };
}

export function applyAndKeepUnmatchedModifiers(
  partial: PartialResult,
  homeZone: TacticalZone,
  awayZone: TacticalZone,
): { active: ZoneModifier[]; updated: PartialResult } {
  const pending = partial.pending_modifiers ?? [];
  const active = pending.filter(
    (m) => (m.for === "home" && m.zone === homeZone) || (m.for === "away" && m.zone === awayZone),
  );
  const remaining = pending.filter(
    (m) => !((m.for === "home" && m.zone === homeZone) || (m.for === "away" && m.zone === awayZone)),
  );
  return {
    active,
    updated: { ...partial, pending_modifiers: remaining },
  };
}

// ---------------------------------------------------------------------------
// Targeted injury helpers
// ---------------------------------------------------------------------------

export type InjuryCandidate = {
  id: string;
  current_stars: number;
  current_zone: string;
  position: string | null;
  display_name: string;
};

export function selectInjuryTarget(
  effect: Extract<GameChangerEffect, { type: "targeted_injury" }>,
  candidates: InjuryCandidate[],
  random: () => number = Math.random,
): InjuryCandidate | null {
  if (candidates.length === 0) return null;

  if (effect.selector === "random_position" && effect.position) {
    const pool = candidates.filter((c) => c.position === effect.position || c.current_zone === effect.position);
    if (pool.length === 0) return null;
    return pool[Math.floor(random() * pool.length)] ?? null;
  }

  if (effect.zone) {
    const pool = candidates.filter((c) => c.current_zone === effect.zone);
    if (pool.length === 0) return null;
    if (effect.selector === "best_zone") {
      return pool.slice().sort((a, b) => Number(b.current_stars) - Number(a.current_stars))[0] ?? null;
    }
    return pool[Math.floor(random() * pool.length)] ?? null;
  }

  return candidates[Math.floor(random() * candidates.length)] ?? null;
}

export function injuryDurationMatchday(
  effect: Extract<GameChangerEffect, { type: "targeted_injury" }>,
  currentMatchday: number,
): number {
  if (effect.duration === "season") {
    return -1;
  }
  return Math.max(1, Math.trunc(currentMatchday)) + 1;
}

// ---------------------------------------------------------------------------
// Utility: parse effects stored as JSON in the DB
// ---------------------------------------------------------------------------

export function parseEffects(raw: unknown): GameChangerEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is GameChangerEffect => typeof e === "object" && e !== null && "type" in e);
}

// ---------------------------------------------------------------------------
// Category label helper
// ---------------------------------------------------------------------------

export function categoryLabel(category: GameChangerCategory): string {
  switch (category) {
    case "good_news":
      return "Good News";
    case "bad_news":
      return "Bad News";
    case "secret_weapon":
      return "Geheimwaffe";
  }
}
