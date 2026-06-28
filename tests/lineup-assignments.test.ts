import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GIVEN_KEEPER_ID,
  applyDefaultGivenKeeperToLineupPowerPlayers,
  buildInitialAssignments,
  ensureDefaultKeeper,
  ensureGoalkeeperAssigned,
  getFormationCounts,
  rebuildLineupAssignments,
  shouldUseDefaultGivenKeeper,
  stripUnavailableAssignments,
  type FormationSlot,
  type LineupAssignmentCard,
} from "@/lib/lobby/lineup-assignments";
import { calculateLineupPower } from "@/lib/lobby/lineup-power";

const gkSlot: FormationSlot = { id: "gk", label: "GK", required: true, x: 50, y: 89, zone: "GK" };
const defSlot: FormationSlot = { id: "def-1", label: "DEF", required: true, x: 50, y: 72, zone: "DEF" };
const formation442: FormationSlot[] = [
  { id: "att-1", label: "ATT", required: true, x: 38, y: 16, zone: "ATT" },
  { id: "att-2", label: "ATT", required: true, x: 62, y: 16, zone: "ATT" },
  { id: "mid-1", label: "MID", required: true, x: 18, y: 44, zone: "MID" },
  { id: "mid-2", label: "MID", required: true, x: 40, y: 44, zone: "MID" },
  { id: "mid-3", label: "MID", required: true, x: 60, y: 44, zone: "MID" },
  { id: "mid-4", label: "MID", required: true, x: 82, y: 44, zone: "MID" },
  { id: "def-1", label: "DEF", required: true, x: 18, y: 72, zone: "DEF" },
  { id: "def-2", label: "DEF", required: true, x: 40, y: 72, zone: "DEF" },
  { id: "def-3", label: "DEF", required: true, x: 60, y: 72, zone: "DEF" },
  { id: "def-4", label: "DEF", required: true, x: 82, y: 72, zone: "DEF" },
  gkSlot,
];

function keeper(overrides: Partial<LineupAssignmentCard> = {}): LineupAssignmentCard {
  return {
    ageGroup: "prime",
    cardStyle: { tier: "standard", theme: "dark" },
    chemistry: { left: false, right: false, symbol: "star" },
    id: "keeper-1",
    market: { currency: "M", scoutingFee: 0, transferFee: 0 },
    name: "Keeper",
    position: "GK",
    positions: ["GK"],
    role: "TW",
    skill: { current: 3, max: 4, potential: 4 },
    sourceZone: "GK",
    ...overrides,
  };
}

function fieldPlayer(id: string, zone: "ATT" | "DEF" | "MID"): LineupAssignmentCard {
  return {
    ageGroup: "prime",
    cardStyle: { tier: "standard", theme: "dark" },
    chemistry: { left: false, right: false, symbol: "star" },
    id,
    market: { currency: "M", scoutingFee: 0, transferFee: 0 },
    name: id,
    position: zone,
    positions: [zone],
    role: zone,
    skill: { current: 3, max: 4, potential: 4 },
    sourceZone: zone,
  };
}

describe("lineup-assignments", () => {
  it("does not place injured goalkeeper with sourceZone GK into GK slot", () => {
    const injuredKeeper = keeper({ injured: true, sourceZone: "GK" });
    const assignments = buildInitialAssignments([injuredKeeper], [gkSlot, defSlot], true);

    assert.equal(assignments[gkSlot.id], undefined);
  });

  it("keeps injury block when rebuilding formation with fillRemaining", () => {
    const injuredKeeper = keeper({ injured: true, sourceZone: "GK" });
    const squad = [
      injuredKeeper,
      fieldPlayer("def-a", "DEF"),
      fieldPlayer("mid-a", "MID"),
      fieldPlayer("mid-b", "MID"),
      fieldPlayer("mid-c", "MID"),
      fieldPlayer("mid-d", "MID"),
      fieldPlayer("att-a", "ATT"),
      fieldPlayer("att-b", "ATT"),
      fieldPlayer("def-b", "DEF"),
      fieldPlayer("def-c", "DEF"),
      fieldPlayer("def-d", "DEF"),
    ];

    const first = rebuildLineupAssignments(squad, formation442, true);
    const second = rebuildLineupAssignments(squad, formation442, true);

    assert.equal(first[gkSlot.id], DEFAULT_GIVEN_KEEPER_ID);
    assert.equal(second[gkSlot.id], DEFAULT_GIVEN_KEEPER_ID);
    assert.notEqual(first[gkSlot.id], injuredKeeper.id);
  });

  it("injects Given and auto-assigns GK when only injured keeper remains", () => {
    const injuredKeeper = keeper({ injured: true, sourceZone: "bench" });
    const pool = ensureDefaultKeeper([injuredKeeper]);
    const assignments = rebuildLineupAssignments([injuredKeeper], [gkSlot], true);
    const cardById = new Map(pool.map((card) => [card.id, card]));
    const counts = getFormationCounts(assignments, cardById, [gkSlot]);

    assert.equal(pool.some((card) => card.id === DEFAULT_GIVEN_KEEPER_ID), true);
    assert.equal(assignments[gkSlot.id], DEFAULT_GIVEN_KEEPER_ID);
    assert.equal(counts.GK, 1);
  });

  it("stripUnavailableAssignments removes injured players from slots", () => {
    const injuredKeeper = keeper({ injured: true });
    const cardById = new Map([[injuredKeeper.id, injuredKeeper]]);
    const stripped = stripUnavailableAssignments({ [gkSlot.id]: injuredKeeper.id }, cardById);

    assert.deepEqual(stripped, {});
  });

  it("ensureGoalkeeperAssigned fills empty GK slot after stripping injured keeper", () => {
    const injuredKeeper = keeper({ injured: true });
    const pool = ensureDefaultKeeper([injuredKeeper]);
    const cardById = new Map(pool.map((card) => [card.id, card]));
    const stripped = stripUnavailableAssignments({ [gkSlot.id]: injuredKeeper.id }, cardById);
    const next = ensureGoalkeeperAssigned(stripped, pool, [gkSlot]);

    assert.equal(next[gkSlot.id], DEFAULT_GIVEN_KEEPER_ID);
  });

  it("uses fit keeper instead of Given when another goalkeeper is available", () => {
    const injuredKeeper = keeper({ id: "keeper-injured", injured: true, sourceZone: "bench" });
    const fitKeeper = keeper({ id: "keeper-fit", sourceZone: "bench" });
    const assignments = rebuildLineupAssignments([injuredKeeper, fitKeeper], [gkSlot], true);

    assert.equal(assignments[gkSlot.id], "keeper-fit");
    assert.notEqual(assignments[gkSlot.id], DEFAULT_GIVEN_KEEPER_ID);
  });

  it("adds Given to locked power when outfield lineup has no goalkeeper in squad", () => {
    const outfield = [
      { current_zone: "DEF", injured: false, current_stars: 3 },
      { current_zone: "DEF", injured: false, current_stars: 3 },
      { current_zone: "DEF", injured: false, current_stars: 3 },
      { current_zone: "DEF", injured: false, current_stars: 3 },
      { current_zone: "MID", injured: false, current_stars: 3 },
      { current_zone: "MID", injured: false, current_stars: 3 },
      { current_zone: "MID", injured: false, current_stars: 3 },
      { current_zone: "MID", injured: false, current_stars: 3 },
      { current_zone: "ATT", injured: false, current_stars: 3 },
      { current_zone: "ATT", injured: false, current_stars: 3 },
    ];

    assert.equal(
      shouldUseDefaultGivenKeeper({
        lineupPlayers: outfield,
        squadPlayers: outfield.map((player) => ({ injured: player.injured, player: { position: "DEF" } })),
      }),
      true,
    );

    const powers = calculateLineupPower(
      applyDefaultGivenKeeperToLineupPowerPlayers(
        outfield.map((player, index) => ({
          current_stars: player.current_stars,
          current_zone: player.current_zone,
          id: `p-${index}`,
        })),
        outfield.map((player) => ({ injured: player.injured, player: { position: "DEF" } })),
      ),
    );

    assert.equal(powers.DEF.base, 13);
  });
});
