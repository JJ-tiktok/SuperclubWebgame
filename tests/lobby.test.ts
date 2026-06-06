import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canMutateClub,
  canStartLobby,
  generateRoomCode,
  normalizeClubName,
  normalizeRoomCode,
  parseLobbySettings,
  validateClubName,
  validateRoomCode,
} from "@/lib/lobby/rules";
import {
  buildClubInitials,
  CUSTOM_CLUB_TEMPLATE_VALUE,
  isClubNameTaken,
  normalizeClubColor,
  parseClubSelectionFromFormData,
} from "@/lib/lobby/custom-clubs";
import type { LobbyClub, LobbyGame } from "@/lib/lobby/types";

const game: LobbyGame = {
  id: "game-1",
  room_code: "ABC-23",
  phase: "lobby",
  host_clerk_user_id: "user-host",
  settings: {
    starting_money: 100_000_000,
    max_draft_stars: 3,
    turn_timeout_seconds: 60,
  },
};

const clubs: LobbyClub[] = [
  {
    id: "club-1",
    game_id: "game-1",
    clerk_user_id: "user-host",
    club_name: "Host FC",
    manager_name: "Host",
    money: 100_000_000,
    points: 0,
    is_ready: true,
  },
  {
    id: "club-2",
    game_id: "game-1",
    clerk_user_id: "user-away",
    club_name: "Away FC",
    manager_name: "Away",
    money: 100_000_000,
    points: 0,
    is_ready: true,
  },
];

describe("Lobby rules", () => {
  it("generates clean room codes", () => {
    assert.match(generateRoomCode(() => 0), /^[A-Z]{3}-[0-9]{2}$/);
    assert.equal(normalizeRoomCode(" abc23 "), "ABC-23");
    assert.equal(validateRoomCode("abc-23"), true);
  });

  it("normalizes and validates club names", () => {
    assert.equal(normalizeClubName("  Red    Valley   "), "Red Valley");
    assert.deepEqual(validateClubName("A"), {
      ok: false,
      error: "Der Clubname braucht mindestens 2 Zeichen.",
    });
    assert.deepEqual(validateClubName("Red Valley"), { ok: true, value: "Red Valley" });
  });

  it("only lets the owning Clerk user mutate their club", () => {
    assert.equal(canMutateClub(clubs[0], "user-host"), true);
    assert.equal(canMutateClub(clubs[0], "user-away"), false);
  });

  it("requires host, one ready club, lobby phase, and readiness before start", () => {
    assert.deepEqual(canStartLobby(game, clubs, "user-host"), { ok: true });
    assert.deepEqual(canStartLobby(game, clubs.slice(0, 1), "user-host"), { ok: true });
    assert.equal(canStartLobby(game, clubs, "user-away").ok, false);
    assert.equal(canStartLobby(game, [], "user-host").ok, false);
    assert.equal(canStartLobby(game, [{ ...clubs[0], is_ready: false }, clubs[1]], "user-host").ok, false);
    assert.equal(canStartLobby({ ...game, phase: "draft" }, clubs, "user-host").ok, false);
  });

  it("parses optional feature flags with enabled defaults", () => {
    assert.equal(parseLobbySettings().sponsoring_enabled, true);
    assert.equal(parseLobbySettings().archetypes_enabled, true);

    const settings = parseLobbySettings({
      archetypes_enabled: "0",
      sponsoring_enabled: "false",
    });

    assert.equal(settings.sponsoring_enabled, false);
    assert.equal(settings.archetypes_enabled, false);
  });

  it("validates custom club colors and badge initials", () => {
    assert.equal(normalizeClubColor("#1a2b3c"), "#1A2B3C");
    assert.equal(normalizeClubColor("2563EB"), null);
    assert.equal(normalizeClubColor("#GGGGGG"), null);
    assert.equal(buildClubInitials("Nordstadt United"), "NU");
    assert.equal(buildClubInitials("FC Dynamo Draft"), "FDD");
    assert.equal(buildClubInitials("Ajax"), "AJA");
  });

  it("parses custom club selection from form data", () => {
    const formData = new FormData();
    formData.set("club_template_id", CUSTOM_CLUB_TEMPLATE_VALUE);
    formData.set("custom_club_name", "  Nordstadt   FC ");
    formData.set("custom_club_color", "#2563eb");

    const result = parseClubSelectionFromFormData(formData);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.selection, {
        kind: "custom",
        club_name: "Nordstadt FC",
        club_color: "#2563EB",
      });
    }
  });

  it("detects duplicate club names across templates and custom clubs", () => {
    assert.equal(isClubNameTaken(clubs, "host fc", "user-away"), true);
    assert.equal(isClubNameTaken(clubs, "Host FC", "user-host"), false);
    assert.equal(isClubNameTaken(clubs, "New Club", "user-away"), false);
  });
});

describe("Lobby schema blueprint", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");

  it("uses Clerk IDs instead of Supabase auth user IDs for lobby tables", () => {
    assert.match(schema, /host_clerk_user_id text not null/);
    assert.match(schema, /clerk_user_id text not null/);
    assert.doesNotMatch(schema, /auth\.uid\(\)/);
    assert.doesNotMatch(schema, /\bhost_user_id\b/);
    assert.doesNotMatch(schema, /\buser_id\b/);
  });

  it("publishes lobby tables through Supabase Realtime", () => {
    assert.match(schema, /alter publication supabase_realtime add table public\.games/);
    assert.match(schema, /alter publication supabase_realtime add table public\.clubs/);
    assert.match(schema, /alter publication supabase_realtime add table public\.game_members/);
  });

  it("tracks per-manager completion for phase advancement", () => {
    assert.match(schema, /phase_done boolean not null default false/);
    assert.match(schema, /phase_done_at timestamptz/);
  });

  it("seeds fixed club templates and stores template data on clubs", () => {
    assert.match(schema, /create table public\.club_templates/);
    assert.match(schema, /'vanguard', 'Vanguard FC', 'From Assets to Icons\.'/);
    assert.match(schema, /'crimson_cape', 'Crimson Cape FC', 'Fortune Favors the Bold\.'/);
    assert.match(schema, /club_template_id text references public\.club_templates\(id\)/);
    assert.match(schema, /create unique index clubs_game_template_unique/);
    assert.match(schema, /where club_template_id is not null/);
  });

  it("allows lobby RPCs to create custom clubs with nullable templates", () => {
    assert.match(schema, /custom_club_name text default null/);
    assert.match(schema, /custom_club_color text default null/);
    assert.match(schema, /resolved_template_id := null/);
    assert.match(schema, /raise exception 'club_name_taken'/);
    assert.match(schema, /resolved_club_color !~ '\^#\[0-9A-F\]\{6\}\$'/);
  });

  it("models persistent save metadata and checkpoints", () => {
    assert.match(schema, /save_status text not null default 'active'/);
    assert.match(schema, /save_version int not null default 1/);
    assert.match(schema, /last_saved_at timestamptz not null default now\(\)/);
    assert.match(schema, /create table public\.game_saves/);
    assert.match(schema, /create or replace function public\.save_game_checkpoint/);
    assert.match(schema, /grant select, insert on public\.game_saves to authenticated/);
  });

  it("stores runtime feature flags in game settings", () => {
    assert.match(schema, /'sponsoring_enabled', true/);
    assert.match(schema, /'archetypes_enabled', true/);
  });
});
