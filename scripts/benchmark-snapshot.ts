/**
 * Snapshot-Performance-Benchmark.
 *
 * Misst die "heissen" Datenbank-Queries des Snapshot-Loaders / der Server-Actions
 * reproduzierbar gegen einen vorhandenen Spielstand (Default: das synthetische
 * Benchmark-Spiel aus supabase/performance_seed_synthetic.sql, room_code PERF-01).
 *
 * Es wird der Supabase-Service-Role-Client genutzt (umgeht Clerk-Auth + RLS),
 * daher sind die Messungen unabhaengig von einer Browser-Session.
 *
 * Nutzung (PowerShell, im Projekt-Root):
 *   npm run benchmark                 # Default-Room PERF-01, 30 Iterationen
 *   npm run benchmark -- PERF-01 50   # eigener Room-Code + Iterationszahl
 *   npm run benchmark -- ABC-12 20    # gegen den echten Spielstand (nur Lesen)
 *
 * Vorher sicherstellen, dass .env.local NEXT_PUBLIC_SUPABASE_URL und
 * SUPABASE_SERVICE_ROLE_KEY enthaelt.
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
      // Datei optional
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
    `${"query".padEnd(28)}${"rows".padStart(8)}${"median".padStart(9)}${"p95".padStart(9)}${"min".padStart(9)}${"max".padStart(9)}`,
  );
  console.log("-".repeat(72));

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
      `${r.label.padEnd(28)}${String(r.rows).padStart(8)}${fmt(r.median)}${fmt(r.p95)}${fmt(r.min)}${fmt(r.max)}`,
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
    console.error(
      "Fehlende Env: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY (.env.local).",
    );
    process.exitCode = 1;
    return;
  }

  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Spiel + Kontext aufloesen
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

  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id")
    .eq("game_id", game.id)
    .returns<Array<{ id: string }>>();
  if (clubsError) throw clubsError;

  const clubIds = (clubs ?? []).map((c) => c.id);
  const ownClubId = clubIds[0] ?? "00000000-0000-0000-0000-000000000000";
  const otherClubIds = clubIds.slice(1);

  console.log(
    `\nBenchmark room=${roomCode} phase=${game.phase} season=${seasonNumber} ` +
      `clubs=${clubIds.length} iterations=${iterations} (warmup=${warmup})`,
  );

  const stats: Stat[] = [];
  const add = async (
    label: string,
    run: () => Promise<{ data: unknown[] | null; error: unknown }>,
  ) => {
    const { rows, ms } = await timeQuery(iterations, warmup, run as never);
    stats.push({ label, rows, ms });
  };

  // 1. Verdaechtigster Pfad: komplette Trainingshistorie (ohne Saison-Filter)
  await add("train_history_FULL", () =>
    supabase
      .from("transactions")
      .select("id, created_at, metadata")
      .eq("game_id", game.id)
      .eq("club_id", ownClubId)
      .eq("reason", "training") as never,
  );

  // 2. Vergleich: dieselbe Abfrage saison-gescopt (so sollte es laufen)
  await add("train_history_season", () =>
    supabase
      .from("transactions")
      .select("id, created_at, metadata")
      .eq("game_id", game.id)
      .eq("club_id", ownClubId)
      .eq("reason", "training")
      .contains("metadata", { season_number: seasonNumber })
      .order("created_at", { ascending: false })
      .limit(80) as never,
  );

  // 3. Hall of Fame: bis zu 2000 Trainings-Transaktionen
  await add("hall_of_fame_train_2000", () =>
    supabase
      .from("transactions")
      .select("id, club_id, created_at, metadata")
      .eq("game_id", game.id)
      .eq("reason", "training")
      .order("created_at", { ascending: false })
      .limit(2000) as never,
  );

  // 4. Club-Overview Kader (eigener Club)
  await add("club_overview_squad", () =>
    supabase
      .from("club_players")
      .select("id, club_id, player_id, current_stars, current_zone, injured, lineup_slot, acquired_at, seasons_at_club")
      .eq("club_id", ownClubId)
      .order("acquired_at", { ascending: true }) as never,
  );

  // 5. Transfermarkt: Kader aller anderen Clubs
  await add("transfer_other_squads", () =>
    (otherClubIds.length
      ? supabase
          .from("club_players")
          .select("id, club_id, player_id, current_stars, current_zone, injured, lineup_slot, acquired_at")
          .in("club_id", otherClubIds)
          .order("acquired_at", { ascending: true })
      : supabase.from("club_players").select("id").eq("club_id", ownClubId).limit(1)) as never,
  );

  // 6. Saison-Fixtures (aktuelle Saison)
  await add("season_fixtures", () =>
    supabase
      .from("fixtures")
      .select("id, game_id, season_number, matchday, home_participant_id, away_participant_id, status, home_score, away_score")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("matchday", { ascending: true }) as never,
  );

  // 7. Saison-Tabelle
  await add("season_standings", () =>
    supabase
      .from("season_standings")
      .select("participant_id, season_number, played, wins, draws, losses, match_points, rank")
      .eq("game_id", game.id)
      .eq("season_number", seasonNumber)
      .order("rank", { ascending: true }) as never,
  );

  // 8. match_news (letzte 50)
  await add("match_news_50", () =>
    supabase
      .from("match_news")
      .select("id, game_id, fixture_id, club_id, category, headline, detail, created_at")
      .eq("game_id", game.id)
      .order("created_at", { ascending: false })
      .limit(50) as never,
  );

  // 9. game_events (letzte 200, Realtime-Recovery-Pfad)
  await add("game_events_recent_200", () =>
    supabase
      .from("game_events")
      .select("id, seq, type, payload, created_at")
      .eq("game_id", game.id)
      .order("seq", { ascending: false })
      .limit(200) as never,
  );

  summarize(stats);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
