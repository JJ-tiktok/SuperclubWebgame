/**
 * Matchday-Performance-Benchmark.
 *
 * Misst die DB-Hotspots des Matchday-Pfads (Fixtures, Teilnehmer, Side-Build,
 * Standing-Rebuild, CPU-Autosimulation-Scan) reproduzierbar.
 *
 * Nutzung:
 *   npm run benchmark:matchday
 *   npm run benchmark:matchday -- PERF-01 30
 *   npm run benchmark:matchday -- UVM-35 20
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch {
      // optional
    }
  }
}

type Stat = { label: string; rows: number; ms: number[] };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(stats: Stat[]) {
  const fmt = (n: number) => n.toFixed(1).padStart(8);
  console.log("\nErgebnisse (ms pro Query, sortiert nach Median):\n");
  console.log(
    `${"query".padEnd(32)}${"rows".padStart(8)}${"median".padStart(9)}${"p95".padStart(9)}${"min".padStart(9)}${"max".padStart(9)}`,
  );
  console.log("-".repeat(76));

  const rows = stats
    .map((s) => {
      const sorted = [...s.ms].sort((a, b) => a - b);
      return {
        label: s.label,
        rows: s.rows,
        median: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
      };
    })
    .sort((a, b) => b.median - a.median);

  for (const r of rows) {
    console.log(
      `${r.label.padEnd(32)}${String(r.rows).padStart(8)}${fmt(r.median)}${fmt(r.p95)}${fmt(r.min)}${fmt(r.max)}`,
    );
  }
  console.log("");
}

async function timeQuery(
  iterations: number,
  warmup: number,
  run: () => Promise<{ data: unknown[] | null; error: unknown }>,
): Promise<{ rows: number; ms: number[] }> {
  const ms: number[] = [];
  let rows = 0;
  for (let i = 0; i < warmup + iterations; i++) {
    const start = performance.now();
    const { data, error } = await run();
    const elapsed = performance.now() - start;
    if (error) {
      throw new Error(`Query-Fehler: ${JSON.stringify(error)}`);
    }
    if (i >= warmup) {
      ms.push(elapsed);
      rows = Array.isArray(data) ? data.length : 0;
    }
  }
  return { rows, ms };
}

async function main() {
  loadEnvLocal();

  const roomCode = (process.argv[2] ?? "PERF-01").toUpperCase();
  const iterations = Number(process.argv[3] ?? 30);
  const warmup = 3;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Fehlende Env: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }

  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, room_code, phase, settings")
    .eq("room_code", roomCode)
    .maybeSingle<{ id: string; phase: string; settings: { seasonNumber?: number; season_number?: number } }>();

  if (gameError) throw gameError;
  if (!game) {
    console.error(`Kein Spiel mit room_code=${roomCode} gefunden.`);
    process.exitCode = 1;
    return;
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? game.settings?.season_number ?? 1);

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id")
    .eq("game_id", game.id)
    .returns<Array<{ id: string }>>();

  const clubIds = (clubs ?? []).map((c) => c.id);
  const ownClubId = clubIds[0] ?? "";

  const { data: seasonFixtures } = await supabase
    .from("fixtures")
    .select("id, matchday, home_participant_id, away_participant_id, status")
    .eq("game_id", game.id)
    .eq("season_number", seasonNumber)
    .order("matchday", { ascending: true });

  const currentMatchday =
    seasonFixtures?.find((f) => f.status !== "completed")?.matchday ??
    seasonFixtures?.at(-1)?.matchday ??
    1;

  const sampleFixture = seasonFixtures?.[0];
  const participantIds = sampleFixture
    ? [sampleFixture.home_participant_id, sampleFixture.away_participant_id]
    : [];

  console.log(
    `\nMatchday-Benchmark room=${roomCode} season=${seasonNumber} matchday=${currentMatchday} ` +
      `clubs=${clubIds.length} iterations=${iterations}`,
  );

  const stats: Stat[] = [];
  const add = async (
    label: string,
    run: () => Promise<{ data: unknown[] | null; error: unknown }>,
  ) => {
    const { rows, ms } = await timeQuery(iterations, warmup, run as never);
    stats.push({ label, rows, ms });
  };

  // CPU-Autosim: alle offenen Fixtures (alt)
  await add("pending_fixtures_ALL", () =>
    supabase
      .from("fixtures")
      .select("id, season_number, matchday, status")
      .eq("game_id", game.id)
      .neq("status", "completed") as never,
  );

  // CPU-Autosim: nur aktuelle Saison
  await add("pending_fixtures_season", () =>
    supabase
      .from("fixtures")
      .select("id, season_number, matchday, status")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .neq("status", "completed") as never,
  );

  // CPU-Autosim: Saison + Spieltag
  await add("pending_fixtures_matchday", () =>
    supabase
      .from("fixtures")
      .select("id, season_number, matchday, status")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .eq("matchday", currentMatchday)
      .neq("status", "completed") as never,
  );

  if (participantIds.length === 2) {
    await add("fixture_participants", () =>
      supabase
        .from("season_participants")
        .select("id, kind, club_id, cpu_team_id, display_name")
        .in("id", participantIds) as never,
    );
  }

  if (ownClubId) {
    await add("human_side_players", () =>
      supabase
        .from("club_players")
        .select("id, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name, position, eligible_positions)")
        .eq("club_id", ownClubId)
        .neq("current_zone", "bench")
        .eq("injured", false)
        .order("lineup_slot", { ascending: true }) as never,
    );

    await add("human_side_staff", () =>
      supabase
        .from("club_staff")
        .select("staff_card:staff_cards(effects)")
        .eq("club_id", ownClubId) as never,
    );

    await add("human_side_captain", () =>
      supabase
        .from("clubs")
        .select("captain_club_player_id, captain_boost_rank")
        .eq("id", ownClubId) as never,
    );

    await add("human_side_combined", async () => {
      const start = performance.now();
      const [players, staff, captain] = await Promise.all([
        supabase
          .from("club_players")
          .select("id, current_stars, current_zone, lineup_slot")
          .eq("club_id", ownClubId)
          .neq("current_zone", "bench")
          .eq("injured", false),
        supabase.from("club_staff").select("staff_card:staff_cards(effects)").eq("club_id", ownClubId),
        supabase.from("clubs").select("captain_club_player_id, captain_boost_rank").eq("id", ownClubId),
      ]);
      if (players.error) return { data: null, error: players.error };
      if (staff.error) return { data: null, error: staff.error };
      if (captain.error) return { data: null, error: captain.error };
      return {
        data: [
          ...(players.data ?? []),
          ...(staff.data ?? []),
          ...(captain.data ? [captain.data] : []),
        ],
        error: null,
      };
    });
  }

  // Standing-Rebuild reads
  await add("standings_fixtures_read", () =>
    supabase
      .from("fixtures")
      .select("home_participant_id, away_participant_id, home_score, away_score, home_third_points, away_third_points, status")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber) as never,
  );

  await add("standings_participants_read", () =>
    supabase
      .from("season_participants")
      .select("id, kind, club_id")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber) as never,
  );

  await add("heal_injuries_club_ids", () =>
    supabase.from("clubs").select("id").eq("game_id", game.id) as never,
  );

  summarize(stats);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
