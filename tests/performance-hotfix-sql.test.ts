import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "performance_hotfix_indexes.sql"), "utf8");

describe("performance hotfix SQL", () => {
  it("adds cached squad aggregates and realtime indexes", () => {
    assert.match(sql, /add column if not exists squad_stars/i);
    assert.match(sql, /add column if not exists squad_size/i);
    assert.match(sql, /game_events_game_seq_desc_idx/i);
    assert.match(sql, /game_events_game_created_at_idx/i);
  });

  it("provides private cleanup for non-rule-critical live history only", () => {
    assert.match(sql, /create schema if not exists private/i);
    assert.match(sql, /private\.cleanup_game_performance_history/i);
    assert.match(sql, /delete from public\.game_events/i);
    assert.match(sql, /delete from public\.match_news/i);
    assert.doesNotMatch(sql, /delete from public\.transactions/i);
    assert.doesNotMatch(sql, /delete from public\.club_players/i);
    assert.doesNotMatch(sql, /delete from public\.fixtures/i);
  });
});
