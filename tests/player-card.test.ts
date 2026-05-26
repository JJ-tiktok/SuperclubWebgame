import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sampleCards from "@/data/sample-player-cards.json";
import {
  formatMarketValue,
  getPositionGroup,
  getSkillStarStates,
  MINIMUM_FORMATION_COUNTS,
  type PlayerCardData,
  type PlayerCardPosition,
} from "@/types/player-card";

const players = sampleCards as PlayerCardData[];

describe("Player card rendering data", () => {
  it("calculates skill stars for prime players", () => {
    assert.deepEqual(getSkillStarStates(players[3]), ["filled", "filled", "filled", "filled", "filled"]);
  });

  it("calculates potential and disabled stars for talents", () => {
    assert.deepEqual(getSkillStarStates(players[0]), ["filled", "filled", "filled", "filled", "filled"]);
    assert.deepEqual(getSkillStarStates(players[1]), ["filled", "filled", "filled", "filled", "empty"]);
  });

  it("renders veteran fallback stars after current skill", () => {
    assert.deepEqual(getSkillStarStates(players[5]), ["filled", "filled", "filled", "veteran", "veteran"]);
  });

  it("formats market values with German decimals", () => {
    assert.equal(formatMarketValue(8, "M"), "8M");
    assert.equal(formatMarketValue(1.2, "M"), "1,2M");
  });

  it("keeps sample cards compatible with the typed card model", () => {
    const validPositions: PlayerCardPosition[] = ["GK", "DEF", "MID", "ATT"];

    assert.ok(players.length >= 6);
    for (const player of players) {
      assert.equal(typeof player.id, "string");
      assert.equal(typeof player.name, "string");
      assert.ok(validPositions.includes(player.position));
      assert.ok(player.positions.every((position) => validPositions.includes(position)));
      assert.ok(["talent", "prime", "veteran"].includes(player.ageGroup));
      assert.ok(["standard", "rare", "epic", "legend", "veteran"].includes(player.cardStyle.tier));
      assert.ok(player.skill.current <= player.skill.max);
      assert.ok(player.skill.potential <= player.skill.max);
    }
  });

  it("includes visible chemistry link data for both card sides", () => {
    assert.ok(players.some((player) => player.chemistry.left));
    assert.ok(players.some((player) => player.chemistry.right));
  });

  it("defines the minimum lineup basis", () => {
    assert.deepEqual(MINIMUM_FORMATION_COUNTS, { ATT: 2, DEF: 3, MID: 3 });
  });

  it("maps eligible positions to the card color groups", () => {
    assert.equal(getPositionGroup(["GK"]), "GK");
    assert.equal(getPositionGroup(["DEF"]), "DEF");
    assert.equal(getPositionGroup(["DEF", "MID"]), "DEF_MID");
    assert.equal(getPositionGroup(["MID"]), "MID");
    assert.equal(getPositionGroup(["MID", "ATT"]), "MID_ATT");
    assert.equal(getPositionGroup(["ATT"]), "ATT");
    assert.equal(getPositionGroup(["GK", "DEF", "MID", "ATT"]), "ALL");
  });
});

describe("Player card schema blueprint", () => {
  const schema = readFileSync("supabase/schema.sql", "utf8");

  it("extends players instead of creating a duplicate player_cards table", () => {
    assert.doesNotMatch(schema, /create table public\.player_cards/);
    assert.match(schema, /role text/);
    assert.match(schema, /nationality text/);
    assert.match(schema, /create type public\.player_position as enum \('GK', 'DEF', 'MID', 'ATT'\)/);
    assert.doesNotMatch(schema, /'UTIL'/);
    assert.match(schema, /eligible_positions public\.player_position\[\] not null default '\{\}'/);
    assert.match(schema, /age_group text not null default 'prime'/);
    assert.match(schema, /skill_max numeric\(3,1\) not null default 5/);
    assert.match(schema, /veteran_fallback numeric\(3,1\)/);
    assert.match(schema, /chemistry_left boolean not null default false/);
    assert.match(schema, /chemistry_right boolean not null default false/);
    assert.match(schema, /chemistry_symbol text not null default 'star'/);
    assert.doesNotMatch(schema, /card_tier/);
    assert.doesNotMatch(schema, /card_theme/);
  });
});
