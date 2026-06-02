import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredCpuCount, getTargetLeagueSize } from "@/lib/lobby/season";
import type { CpuStrengthTier, LobbySettings } from "@/lib/lobby/types";

export type { CpuStrengthTier };

export type CpuTeamCatalogRow = {
  id: string;
  content_key: string;
  display_name: string;
  color: string;
  strength_tier: CpuStrengthTier;
};

export type CpuTeamPick = Pick<CpuTeamCatalogRow, "id" | "display_name">;

const TIER_ORDER: Record<CpuStrengthTier, number> = { stark: 0, mittel: 1, schwach: 2 };

export const CPU_TIER_LABEL: Record<CpuStrengthTier, string> = {
  stark: "Stark",
  mittel: "Mittel",
  schwach: "Schwach",
};

/** Lineup star values per tier (for tests and documentation). */
export const CPU_LINEUPS_BY_TIER: Record<
  CpuStrengthTier,
  Array<{ display_name: string; def: number; mid: number; att: number; sort_order: number }>
> = {
  stark: [
    { display_name: "Ausgeglichen", def: 19, mid: 19, att: 19, sort_order: 1 },
    { display_name: "Defensiv", def: 23, mid: 19, att: 17, sort_order: 2 },
    { display_name: "Offensiv", def: 17, mid: 19, att: 23, sort_order: 3 },
  ],
  mittel: [
    { display_name: "Ausgeglichen", def: 15, mid: 15, att: 15, sort_order: 1 },
    { display_name: "Defensiv", def: 19, mid: 15, att: 13, sort_order: 2 },
    { display_name: "Offensiv", def: 13, mid: 15, att: 19, sort_order: 3 },
  ],
  schwach: [
    { display_name: "Ausgeglichen", def: 12, mid: 12, att: 12, sort_order: 1 },
    { display_name: "Defensiv", def: 15, mid: 12, att: 9, sort_order: 2 },
    { display_name: "Offensiv", def: 9, mid: 12, att: 15, sort_order: 3 },
  ],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCpuTeamIdsFromFormData(formData: FormData): string[] {
  const raw = String(formData.get("cpu_team_ids") ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeCpuTeamIds(parsed.map((v) => String(v)));
  } catch {
    return dedupeCpuTeamIds(formData.getAll("cpu_team_id").map((v) => String(v)));
  }
}

export function dedupeCpuTeamIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!UUID_RE.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.slice(0, 6);
}

export function getMinCpuTeamsForLobby(settings: Pick<LobbySettings, "target_league_size"> | null | undefined) {
  return getRequiredCpuCount(1, getTargetLeagueSize(settings));
}

export async function getActiveCpuTeams(supabase: SupabaseClient): Promise<CpuTeamCatalogRow[]> {
  const { data, error } = await supabase
    .from("cpu_teams")
    .select("id, content_key, display_name, color, strength_tier")
    .eq("active", true)
    .returns<CpuTeamCatalogRow[]>();

  if (error) {
    if ((error as { code?: string }).code === "42703") {
      const fallback = await supabase
        .from("cpu_teams")
        .select("id, content_key, display_name, color")
        .eq("active", true)
        .returns<Array<Omit<CpuTeamCatalogRow, "strength_tier">>>();
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []).map((row) => ({ ...row, strength_tier: "schwach" as const }));
    }
    throw error;
  }

  return (data ?? []).sort((a, b) => {
    const tierDiff = TIER_ORDER[a.strength_tier] - TIER_ORDER[b.strength_tier];
    if (tierDiff !== 0) return tierDiff;
    return a.display_name.localeCompare(b.display_name, "de");
  });
}

/**
 * Picks CPU teams for a season in host selection order (or alphabetical fallback).
 */
export function pickCpuTeamsForSeason(
  preferredIds: string[] | undefined,
  catalog: CpuTeamPick[],
  requiredCpu: number,
): { ok: true; teams: CpuTeamPick[] } | { ok: false; error: string } {
  const byId = new Map(catalog.map((team) => [team.id, team]));
  let ordered: CpuTeamPick[];

  if (preferredIds && preferredIds.length > 0) {
    const seen = new Set<string>();
    ordered = [];
    for (const id of preferredIds) {
      if (seen.has(id)) continue;
      const team = byId.get(id);
      if (team) {
        ordered.push(team);
        seen.add(id);
      }
    }
  } else {
    ordered = [...catalog].sort((a, b) => a.display_name.localeCompare(b.display_name, "de"));
  }

  if (ordered.length < requiredCpu) {
    return {
      ok: false,
      error: `Zu wenige CPU-Teams in der Auswahl. Benoetigt: ${requiredCpu}, verfuegbar: ${ordered.length}.`,
    };
  }

  return { ok: true, teams: ordered.slice(0, requiredCpu) };
}

export async function validateCpuTeamSelection(
  supabase: SupabaseClient,
  ids: string[],
  settings?: { target_league_size?: number } | null,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const catalog = await getActiveCpuTeams(supabase);
  const catalogIds = new Set(catalog.map((t) => t.id));
  const minRequired = getMinCpuTeamsForLobby(settings);

  if (ids.length === 0) {
    return { ok: false, error: `Bitte waehle mindestens ${minRequired} CPU-Mannschaften.` };
  }

  if (ids.length > catalog.length) {
    return { ok: false, error: "Zu viele CPU-Mannschaften ausgewaehlt." };
  }

  const invalid = ids.filter((id) => !catalogIds.has(id));
  if (invalid.length > 0) {
    return { ok: false, error: "Ungueltige CPU-Mannschaft in der Auswahl." };
  }

  if (ids.length < minRequired) {
    return {
      ok: false,
      error: `Fuer eine ${getTargetLeagueSize(settings)}er-Liga brauchst du mindestens ${minRequired} CPU-Mannschaften (bei einem menschlichen Manager).`,
    };
  }

  return { ok: true, ids };
}
