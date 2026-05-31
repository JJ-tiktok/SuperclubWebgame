/**
 * Shared infrastructure types for the games server actions.
 *
 * This module collects the common Supabase service-client type and the
 * row-shape types that are passed between phase-specific action modules.
 * Each phase module (lobby, draft, offseason, scouting, deadline, staff,
 * match, game-changers) imports from here.
 *
 * The actual implementations of the actions and helpers currently live in
 * `src/app/games/actions.ts`. Each phase module re-exports the matching
 * Server Actions from there so callers can use the modular paths
 * (`@/app/games/actions/<module>`) without us moving 4000+ lines of code
 * in a single commit. A follow-up refactor can physically move the code
 * into these modules once the consumers are stable on the new paths.
 */

import type { createSupabaseServiceClient } from "@/lib/supabase/server";

export type SupabaseServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

export type FixtureActionRow = {
  away_cpu_lineup_id?: string | null;
  away_lineup_locked: boolean;
  away_participant_id: string;
  away_ready_for_next_third: boolean;
  current_third: number;
  game_id: string;
  home_cpu_lineup_id?: string | null;
  home_lineup_locked: boolean;
  home_participant_id: string;
  home_ready_for_next_third: boolean;
  id: string;
  match_state: "scheduled" | "in_progress" | "completed";
  matchday: number;
  partial_result?: Record<string, unknown> | null;
  season_number: number;
  status: "completed" | "scheduled";
};

export type FixtureParticipantRow = {
  club_id?: string | null;
  cpu_team_id?: string | null;
  display_name: string;
  id: string;
  kind: "cpu" | "human";
};

export type CpuLineupRow = {
  att_stars: number | string;
  def_stars: number | string;
  display_name: string;
  id: string;
  mid_stars: number | string;
};

export type PendingEffectRow = {
  id: string;
  club_id: string;
  effect_type: string;
  payload: Record<string, unknown>;
  scope: string;
  consumed_at: string | null;
};

export type ManagerScoreRow = {
  attractiveness_stars: number;
  club_id: string;
  club_name: string;
  match_points: number;
  rank: number;
  season_score: number;
  squad_stars: number;
  status: string;
};

export type SubmittedLineupItem = {
  club_player_id: string;
  slot: number;
  zone: "ATT" | "DEF" | "GK" | "MID";
};

export type DeadlineAuctionActionRow = {
  bid_order_club_ids: string[];
  current_amount: number | string | null;
  current_bid_club_id: string | null;
  game_id: string;
  id: string;
  minimum_bid: number | string | null;
  passed_club_ids: string[];
  player_id: string;
  season_number: number;
  status: "scheduled" | "open" | "resolving" | "resolved" | "passed";
  winning_club_id: string | null;
};

/**
 * Roll a single d6.
 */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Returns a shuffled copy of `items` using Fisher-Yates.
 */
export function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
