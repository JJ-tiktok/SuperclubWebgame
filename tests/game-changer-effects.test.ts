import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPendingChoice,
  buildZoneModifiers,
  describeEffect,
  describeGameChangerEffects,
  effectToPendingScope,
  getMatchCardChoiceKind,
  injuryDurationMatchday,
  parseEffects,
  pickWeightedIndex,
  rollRetroWin,
  selectInjuryTarget,
  type GameChangerEffect,
  type InjuryCandidate,
} from "@/lib/game/game-changer-effects";

describe("Game Changer effects engine", () => {
  it("describes money_change as +/- million euro", () => {
    assert.equal(describeEffect({ type: "money_change", amount: 50_000_000 }), "+50M Einnahmen");
    assert.equal(describeEffect({ type: "money_change", amount: -10_000_000 }), "-10M Verlust");
  });

  it("describes free_facility_upgrade with facility label", () => {
    const text = describeEffect({ type: "free_facility_upgrade", facility: "stadium", levels: 1 });
    assert.match(text, /Stadion \+1 Level/);
  });

  it("returns null for non-choice effects in buildPendingChoice", () => {
    assert.equal(buildPendingChoice({ type: "money_change", amount: 1 }), null);
    assert.equal(buildPendingChoice({ type: "next_match_zone_delta", delta: -2, zone: "DEF" }), null);
  });

  it("returns a pick_player choice for player_potential_bonus with choice=any_owned", () => {
    const choice = buildPendingChoice({ type: "player_potential_bonus", stars: 1, choice: "any_owned" });
    assert.deepEqual(choice, { type: "pick_player", effect_type: "player_potential_bonus", stars: 1, filter: "owned" });
  });

  it("returns a pick_zone choice for next_match_zone_delta with choice=zone", () => {
    const choice = buildPendingChoice({ type: "next_match_zone_delta", delta: 2, choice: "zone" });
    assert.deepEqual(choice, { type: "pick_zone", effect_type: "next_match_zone_delta", delta: 2 });
  });

  it("maps next_match_* effects to pending scope next_match", () => {
    const eff: GameChangerEffect = { type: "next_match_lineup_locked" };
    assert.equal(effectToPendingScope(eff)?.scope, "next_match");
  });

  it("maps next_transfer_price_delta to scope next_transfer", () => {
    const eff: GameChangerEffect = { type: "next_transfer_price_delta", amount: -10_000_000 };
    const pending = effectToPendingScope(eff);
    assert.equal(pending?.scope, "next_transfer");
    assert.deepEqual(pending?.payload, { amount: -10_000_000 });
  });

  it("maps training_capacity_delta with current/next scope correctly", () => {
    assert.equal(
      effectToPendingScope({ type: "training_capacity_delta", delta: 1, scope: "current_offseason" })?.scope,
      "current_offseason",
    );
    assert.equal(
      effectToPendingScope({ type: "training_capacity_delta", delta: "double", scope: "next_offseason" })?.scope,
      "next_offseason",
    );
  });

  it("does not return a pending scope for immediate effects", () => {
    assert.equal(effectToPendingScope({ type: "money_change", amount: 1 }), null);
    assert.equal(effectToPendingScope({ type: "status_tier_change", delta: 1, until: "season_end" }), null);
  });

  it("describes the full v3 catalog without throwing", () => {
    const all: GameChangerEffect[] = [
      { type: "money_change", amount: 1 },
      { type: "free_facility_upgrade", facility: "training", levels: 1 },
      { type: "free_facility_upgrade", facility: "scouting", levels: 1 },
      { type: "free_facility_upgrade", facility: "stadium", levels: 1 },
      { type: "player_potential_bonus", stars: 1, choice: "any_owned" },
      { type: "free_scouting_draw", count: 1 },
      { type: "free_scouting_buy_next", count: 1 },
      { type: "free_staff_offer" },
      { type: "free_staff_signing" },
      { type: "training_capacity_delta", delta: 1, scope: "next_offseason" },
      { type: "training_capacity_delta", delta: "double", scope: "next_offseason" },
      { type: "status_tier_change", delta: 1, until: "season_end" },
      { type: "next_transfer_price_delta", amount: -10_000_000 },
      { type: "next_match_zone_delta", delta: 2, choice: "zone" },
      { type: "next_match_zone_delta", delta: -2, zone: "DEF" },
      { type: "next_match_draw_dice_bonus", bonus: 1 },
      { type: "next_match_lineup_locked" },
      { type: "next_match_staff_disabled" },
      { type: "stadium_income_cap", level: 1, until: "season_end" },
      { type: "targeted_injury", selector: "random_zone", zone: "MID", duration: "season" },
      { type: "targeted_injury", selector: "best_zone", zone: "MID", duration: "next_match" },
      { type: "targeted_injury", selector: "random_position", position: "GK", duration: "next_match" },
      { type: "last_trained_star_loss", stars: 1 },
      { type: "force_release_stars", stars: 4 },
      { type: "offseason_lock", blocks: ["scouting", "transfers"] },
    ];
    const text = describeGameChangerEffects(all);
    assert.ok(text.length > 0);
    for (const eff of all) {
      assert.ok(describeEffect(eff).length > 0, `missing description for ${eff.type}`);
    }
  });

  it("describes the v4 active match card effects without throwing", () => {
    const all: GameChangerEffect[] = [
      { type: "match_zone_boost", stars: 2, zone: "ATT" },
      { type: "match_zone_boost", stars: 2, choice: "zone" },
      { type: "man_marking", per_star_attack_penalty: 2, choice: "defender" },
      { type: "captain_reassign", choice: "captain_player" },
      { type: "lineup_reopen" },
      { type: "injure_opponent", duration: "season", choice: "opponent_player" },
      { type: "derby_day" },
      { type: "var_reroll" },
      { type: "heal_injury_choice" },
      { type: "retroactive_win_attempt", attempts: 2, faces: 6, success: 6 },
    ];
    for (const eff of all) {
      assert.ok(describeEffect(eff).length > 0, `missing description for ${eff.type}`);
    }
  });

  it("parses an effects JSON blob from the DB and skips invalid entries", () => {
    const raw = [
      { type: "money_change", amount: 5 },
      null,
      "not an object",
      { type: "noop" },
    ];
    const parsed = parseEffects(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].type, "money_change");
  });
});

describe("Targeted injury selection", () => {
  const candidates: InjuryCandidate[] = [
    { id: "p1", current_stars: 4, current_zone: "DEF", position: "DEF", display_name: "Anna" },
    { id: "p2", current_stars: 5, current_zone: "MID", position: "MID", display_name: "Brigitte" },
    { id: "p3", current_stars: 3, current_zone: "MID", position: "MID", display_name: "Carla" },
    { id: "p4", current_stars: 2, current_zone: "ATT", position: "ATT", display_name: "Doris" },
    { id: "gk", current_stars: 3, current_zone: "DEF", position: "GK", display_name: "Emma" },
  ];

  it("returns the strongest MID for best_zone selector", () => {
    const target = selectInjuryTarget(
      { type: "targeted_injury", selector: "best_zone", zone: "MID", duration: "next_match" },
      candidates,
    );
    assert.equal(target?.id, "p2");
  });

  it("returns null when no candidate matches the zone", () => {
    const target = selectInjuryTarget(
      { type: "targeted_injury", selector: "random_zone", zone: "ATT", duration: "next_match" },
      candidates.filter((c) => c.current_zone !== "ATT"),
    );
    assert.equal(target, null);
  });

  it("picks a GK via random_position selector", () => {
    const target = selectInjuryTarget(
      { type: "targeted_injury", selector: "random_position", position: "GK", duration: "next_match" },
      candidates,
    );
    assert.equal(target?.id, "gk");
  });
});

describe("v4 match card classification + modifiers", () => {
  it("classifies the choice UI a card needs", () => {
    assert.equal(getMatchCardChoiceKind([{ type: "match_zone_boost", stars: 2, choice: "zone" }]), "zone");
    assert.equal(getMatchCardChoiceKind([{ type: "match_zone_boost", stars: 2, zone: "ATT" }]), null);
    assert.equal(getMatchCardChoiceKind([{ type: "man_marking", per_star_attack_penalty: 2, choice: "defender" }]), "defender");
    assert.equal(getMatchCardChoiceKind([{ type: "heal_injury_choice" }]), "injured_player");
    assert.equal(getMatchCardChoiceKind([{ type: "captain_reassign", choice: "captain_player" }]), "captain_player");
    // Dirty Tackle resolves server-side (random) -> no client choice.
    assert.equal(getMatchCardChoiceKind([{ type: "injure_opponent", duration: "season", choice: "opponent_player" }]), null);
  });

  it("builds a self zone boost for a fixed-zone match_zone_boost", () => {
    const mods = buildZoneModifiers("cgc1", "home", [{ type: "match_zone_boost", stars: 2, zone: "ATT" }]);
    assert.deepEqual(mods, [{ zone: "ATT", delta: 2, for: "home", source_club_game_changer_id: "cgc1" }]);
  });

  it("uses the chosen zone for a choice-based match_zone_boost", () => {
    const mods = buildZoneModifiers("cgc1", "away", [{ type: "match_zone_boost", stars: 2, choice: "zone" }], { zone: "MID" });
    assert.deepEqual(mods, [{ zone: "MID", delta: 2, for: "away", source_club_game_changer_id: "cgc1" }]);
  });

  it("applies man marking as an opponent ATT penalty scaled by defender stars", () => {
    const mods = buildZoneModifiers("cgc1", "home", [{ type: "man_marking", per_star_attack_penalty: 2, choice: "defender" }], { defender_stars: 3 });
    assert.deepEqual(mods, [{ zone: "ATT", delta: -6, for: "away", source_club_game_changer_id: "cgc1" }]);
  });

  it("emits no man marking modifier when the defender has zero stars", () => {
    const mods = buildZoneModifiers("cgc1", "home", [{ type: "man_marking", per_star_attack_penalty: 2, choice: "defender" }], { defender_stars: 0 });
    assert.equal(mods.length, 0);
  });
});

describe("Weighted draw + retroactive win", () => {
  it("always picks the only positive-weight index", () => {
    assert.equal(pickWeightedIndex([0, 0, 1, 0], () => 0.5), 2);
  });

  it("respects weights at the boundaries of the random roll", () => {
    // weights [3,1] over total 4: roll 0 -> index 0, roll near 1 -> index 1
    assert.equal(pickWeightedIndex([3, 1], () => 0), 0);
    assert.equal(pickWeightedIndex([3, 1], () => 0.99), 1);
  });

  it("rolls the configured number of dice and detects success", () => {
    const fail = rollRetroWin({ type: "retroactive_win_attempt", attempts: 2, faces: 6, success: 6 }, () => 0);
    assert.equal(fail.rolls.length, 2);
    assert.equal(fail.success, false);
    const win = rollRetroWin({ type: "retroactive_win_attempt", attempts: 2, faces: 6, success: 6 }, () => 0.999);
    assert.equal(win.rolls.every((r) => r === 6), true);
    assert.equal(win.success, true);
  });
});

describe("Injury duration helper", () => {
  it("returns matchday+1 for next_match", () => {
    assert.equal(
      injuryDurationMatchday({ type: "targeted_injury", selector: "random_zone", duration: "next_match" }, 3),
      4,
    );
  });

  it("returns -1 (season-long) for season duration", () => {
    assert.equal(
      injuryDurationMatchday({ type: "targeted_injury", selector: "random_zone", duration: "season" }, 5),
      -1,
    );
  });
});
