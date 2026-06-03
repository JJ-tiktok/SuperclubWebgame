import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGameChangerEffect,
  dryRunGameChangerEffects,
  summarizeCardEffects,
} from "@/lib/game/game-changer-catalog";
import type { GameChangerEffect } from "@/lib/game/game-changer-effects";

describe("game-changer-catalog", () => {
  it("classifies training_capacity_delta as pending with next_offseason scope", () => {
    const effect: GameChangerEffect = { type: "training_capacity_delta", delta: 1, scope: "next_offseason" };
    assert.equal(classifyGameChangerEffect(effect), "pending");
    const summary = summarizeCardEffects([effect]);
    assert.equal(summary.scopes[0], "next_offseason");
  });

  it("classifies free_facility_upgrade as immediate", () => {
    const effect: GameChangerEffect = { type: "free_facility_upgrade", facility: "scouting", levels: 1 };
    assert.equal(classifyGameChangerEffect(effect), "immediate");
  });

  it("classifies player_potential_bonus with choice as choice mode", () => {
    const effect: GameChangerEffect = { type: "player_potential_bonus", stars: 1, choice: "any_owned" };
    const rows = dryRunGameChangerEffects([effect]);
    assert.equal(rows[0]?.mode, "choice");
    assert.match(rows[0]?.choiceHint ?? "", /Spieler/);
  });

  it("classifies v4 match_zone_boost as match_card", () => {
    const effect: GameChangerEffect = { type: "match_zone_boost", stars: 2, choice: "zone" };
    assert.equal(classifyGameChangerEffect(effect), "match_card");
  });

  it("classifies targeted_injury separately from immediate", () => {
    const effect: GameChangerEffect = {
      type: "targeted_injury",
      selector: "random_zone",
      duration: "next_match",
    };
    assert.equal(classifyGameChangerEffect(effect), "targeted_injury");
  });
});
