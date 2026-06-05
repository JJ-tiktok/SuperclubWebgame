import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CPU_LINEUPS_BY_TIER, pickCpuTeamsForSeason } from "@/lib/lobby/cpu-teams";
import {
  buildSeasonFixtures,
  getMatchPoints,
  getRequiredCpuCount,
  resolveOneThird,
  resolveFixture,
  type FixtureSideInput,
  type SeasonParticipant,
} from "@/lib/lobby/season";

const participants: SeasonParticipant[] = [
  { club_id: "club-a", id: "p-a", kind: "human", name: "Alpha" },
  { club_id: "club-b", id: "p-b", kind: "human", name: "Beta" },
  { cpu_team_id: "cpu-c", id: "p-c", kind: "cpu", name: "CPU C" },
  { cpu_team_id: "cpu-d", id: "p-d", kind: "cpu", name: "CPU D" },
  { cpu_team_id: "cpu-e", id: "p-e", kind: "cpu", name: "CPU E" },
  { cpu_team_id: "cpu-f", id: "p-f", kind: "cpu", name: "CPU F" },
];

function side(input: Partial<FixtureSideInput> & Pick<FixtureSideInput, "participantId">): FixtureSideInput {
  return {
    canReceiveEvents: input.canReceiveEvents ?? true,
    clubId: input.clubId ?? input.participantId,
    lineup: {
      ATT: ["att-1", "att-2", "att-3"],
      DEF: ["def-1", "def-2", "def-3", "def-4"],
      GK: ["gk-1"],
      MID: ["mid-1", "mid-2", "mid-3"],
      ...input.lineup,
    },
    participantId: input.participantId,
    powers: input.powers ?? { ATT: 8, DEF: 8, MID: 8 },
    zone_players: input.zone_players ?? [],
  };
}

describe("season and matchday rules", () => {
  it("fills a six-team league with CPU teams", () => {
    assert.equal(getRequiredCpuCount(1, 6), 5);
    assert.equal(getRequiredCpuCount(4, 6), 2);
    assert.equal(getRequiredCpuCount(6, 6), 0);
  });

  it("picks CPU teams in host order and slices to required count", () => {
    const catalog = [
      { id: "a", display_name: "Alpha" },
      { id: "b", display_name: "Beta" },
      { id: "c", display_name: "Charlie" },
      { id: "d", display_name: "Delta" },
      { id: "e", display_name: "Echo" },
      { id: "f", display_name: "Foxtrot" },
    ];
    const pick = pickCpuTeamsForSeason(["f", "c", "a", "b", "d", "e"], catalog, 3);
    assert.equal(pick.ok, true);
    if (pick.ok) {
      assert.deepEqual(
        pick.teams.map((t) => t.id),
        ["f", "c", "a"],
      );
    }
    const fail = pickCpuTeamsForSeason(["a", "b"], catalog, 5);
    assert.equal(fail.ok, false);
  });

  it("uses the configured tier lineup star values", () => {
    assert.equal(CPU_LINEUPS_BY_TIER.stark[0].def, 19);
    assert.equal(CPU_LINEUPS_BY_TIER.stark[1].att, 17);
    assert.equal(CPU_LINEUPS_BY_TIER.mittel[2].att, 19);
    assert.equal(CPU_LINEUPS_BY_TIER.schwach[2].def, 9);
  });

  it("creates five matchdays or a double round robin for six participants", () => {
    const fiveMatch = buildSeasonFixtures(participants, "five_match");
    const doubleRoundRobin = buildSeasonFixtures(participants, "double_round_robin");

    assert.equal(fiveMatch.length, 15);
    assert.equal(Math.max(...fiveMatch.map((fixture) => fixture.matchday)), 5);
    assert.equal(doubleRoundRobin.length, 30);
    assert.equal(Math.max(...doubleRoundRobin.map((fixture) => fixture.matchday)), 10);
  });

  it("supports football and classic match point modes", () => {
    assert.deepEqual(getMatchPoints("home", "football_3_1_0"), { away: 0, home: 3 });
    assert.deepEqual(getMatchPoints("draw", "football_3_1_0"), { away: 1, home: 1 });
    assert.deepEqual(getMatchPoints("away", "classic_6_2_0"), { away: 6, home: 0 });
    assert.deepEqual(getMatchPoints("draw", "classic_6_2_0"), { away: 2, home: 2 });
  });

  it("resolves drawn thirds as half points", () => {
    const result = resolveFixture({
      away: side({ participantId: "away", powers: { ATT: 5, DEF: 5, MID: 5 } }),
      diceRolls: [
        [2, 3],
        [2, 3],
        [1, 1],
        [1, 1],
        [4, 2],
        [4, 2],
      ],
      home: side({ participantId: "home", powers: { ATT: 5, DEF: 5, MID: 5 } }),
      matchPointsMode: "football_3_1_0",
    });

    assert.equal(result.home_third_points, 1.5);
    assert.equal(result.away_third_points, 1.5);
    assert.equal(result.home_match_points, 1);
    assert.equal(result.away_match_points, 1);
  });

  it("creates both game-changer and injury events for a human double", () => {
    const result = resolveFixture({
      away: side({ canReceiveEvents: false, participantId: "away" }),
      diceRolls: [
        [1, 3],
        [2, 2],
        [1, 2],
        [3, 4],
        [2, 3],
        [4, 5],
      ],
      home: side({ participantId: "home" }),
      matchPointsMode: "football_3_1_0",
    });

    assert.ok(result.events.some((event) => event.event_type === "game_changer"));
    assert.ok(result.events.some((event) => event.event_type === "injury" && event.player_id === "mid-2"));
  });

  it("ignores CPU doubles", () => {
    const result = resolveFixture({
      away: side({ canReceiveEvents: false, participantId: "away" }),
      diceRolls: [
        [6, 6],
        [1, 3],
        [1, 2],
        [3, 4],
        [2, 3],
        [4, 5],
      ],
      home: side({ participantId: "home" }),
      matchPointsMode: "football_3_1_0",
    });

    assert.equal(result.events.length, 0);
  });

  it("applies next-match zone modifiers in the relevant third", () => {
    const result = resolveFixture({
      away: side({ participantId: "away", powers: { ATT: 5, DEF: 5, MID: 5 } }),
      diceRolls: [
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      home: side({ participantId: "home", powers: { ATT: 8, DEF: 8, MID: 8 } }),
      matchPointsMode: "football_3_1_0",
      zoneModifiers: [{ zone: "MID", delta: 2, for: "home", source_club_game_changer_id: "pending_effect" }],
    });

    assert.equal(result.thirds[0]?.home.zone_stars, 10);
    assert.equal(result.thirds[0]?.home.total, 12);
    assert.equal(result.thirds[1]?.home.zone_stars, 8);
  });

  it("uses W8 or W10 for the attacking side when the ATT line has evolved stars", () => {
    const evolvedHome = side({
      participantId: "home",
      powers: { ATT: 8, DEF: 8, MID: 9 },
      zone_players: [
        { current_stars: 4, current_zone: "ATT", id: "att-strong", lineup_slot: 1 },
      ],
    });
    const awaySide = side({ participantId: "away", powers: { ATT: 8, DEF: 8, MID: 5 } });

    const w8 = resolveOneThird({
      away: awaySide,
      home: evolvedHome,
      index: 2,
      priorThirds: [{ away: { dice: [1, 1], dice_faces: 6, participant_id: "away", total: 7, zone: "MID", zone_stars: 5 }, home: { dice: [3, 3], dice_faces: 6, participant_id: "home", total: 15, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "home" }],
    }).third;

    assert.equal(w8.home.dice_faces, 8);
    assert.equal(w8.away.dice_faces, 6);

    const w10 = resolveOneThird({
      away: awaySide,
      home: side({
        participantId: "home",
        powers: { ATT: 8, DEF: 8, MID: 9 },
        zone_players: [
          { current_stars: 4, current_zone: "ATT", id: "att-strong", lineup_slot: 1 },
          { current_stars: 6, current_zone: "ATT", id: "att-elite", lineup_slot: 2 },
        ],
      }),
      index: 2,
      priorThirds: [{ away: { dice: [1, 1], dice_faces: 6, participant_id: "away", total: 7, zone: "MID", zone_stars: 5 }, home: { dice: [3, 3], dice_faces: 6, participant_id: "home", total: 15, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "home" }],
    }).third;

    assert.equal(w10.home.dice_faces, 10);
    assert.equal(w10.away.dice_faces, 6);
  });

  it("keeps midfield and defending sides on W6", () => {
    const home = side({
      participantId: "home",
      powers: { ATT: 9, DEF: 9, MID: 9 },
      zone_players: [{ current_stars: 6, current_zone: "ATT", id: "att-elite", lineup_slot: 1 }],
    });
    const away = side({ participantId: "away", powers: { ATT: 8, DEF: 8, MID: 8 } });

    const midfield = resolveOneThird({ away, home, index: 1 }).third;
    const defense = resolveOneThird({
      away,
      home,
      index: 2,
      priorThirds: [{ away: { dice: [5, 5], dice_faces: 6, participant_id: "away", total: 18, zone: "MID", zone_stars: 8 }, home: { dice: [1, 1], dice_faces: 6, participant_id: "home", total: 11, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "away" }],
    }).third;

    assert.equal(midfield.home.dice_faces, 6);
    assert.equal(defense.home.dice_faces, 6);
  });

  it("applies best and worst archetype duels only for attacking thirds", () => {
    const result = resolveOneThird({
      away: side({
        participantId: "away",
        powers: { ATT: 7, DEF: 8, MID: 5 },
        zone_players: [
          { current_stars: 4, current_zone: "DEF", defender_archetype: "beta", display_name: "Away Top Def", id: "def-top", lineup_slot: 1 },
          { current_stars: 2, current_zone: "DEF", defender_archetype: "alpha", display_name: "Away Low Def", id: "def-low", lineup_slot: 2 },
        ],
      }),
      home: side({
        participantId: "home",
        powers: { ATT: 10, DEF: 8, MID: 9 },
        zone_players: [
          { attacker_archetype: "alpha", current_stars: 5, current_zone: "ATT", display_name: "Home Top Att", id: "att-top", lineup_slot: 1 },
          { attacker_archetype: "gamma", current_stars: 1, current_zone: "ATT", display_name: "Home Low Att", id: "att-low", lineup_slot: 2 },
        ],
      }),
      homeDice: [1, 1],
      awayDice: [1, 1],
      index: 2,
      priorThirds: [{ away: { dice: [1, 1], dice_faces: 6, participant_id: "away", total: 7, zone: "MID", zone_stars: 5 }, home: { dice: [3, 3], dice_faces: 6, participant_id: "home", total: 15, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "home" }],
    });

    assert.equal(result.third.home.zone_stars, 12);
    assert.equal(result.third.away.zone_stars, 6);
    assert.equal(result.third.archetype_effects?.length, 2);
    assert.ok(result.third.archetype_effects?.every((effect) => effect.winner === "attacker"));
  });

  it("can disable archetype effects per fixture", () => {
    const result = resolveOneThird({
      archetypesEnabled: false,
      away: side({
        participantId: "away",
        powers: { ATT: 7, DEF: 8, MID: 5 },
        zone_players: [
          { current_stars: 4, current_zone: "DEF", defender_archetype: "beta", display_name: "Away Top Def", id: "def-top", lineup_slot: 1 },
          { current_stars: 2, current_zone: "DEF", defender_archetype: "alpha", display_name: "Away Low Def", id: "def-low", lineup_slot: 2 },
        ],
      }),
      home: side({
        participantId: "home",
        powers: { ATT: 10, DEF: 8, MID: 9 },
        zone_players: [
          { attacker_archetype: "alpha", current_stars: 5, current_zone: "ATT", display_name: "Home Top Att", id: "att-top", lineup_slot: 1 },
          { attacker_archetype: "gamma", current_stars: 1, current_zone: "ATT", display_name: "Home Low Att", id: "att-low", lineup_slot: 2 },
        ],
      }),
      homeDice: [1, 1],
      awayDice: [1, 1],
      index: 2,
      priorThirds: [{ away: { dice: [1, 1], dice_faces: 6, participant_id: "away", total: 7, zone: "MID", zone_stars: 5 }, home: { dice: [3, 3], dice_faces: 6, participant_id: "home", total: 15, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "home" }],
    });

    assert.equal(result.third.home.zone_stars, 10);
    assert.equal(result.third.away.zone_stars, 8);
    assert.equal(result.third.archetype_effects?.length, 0);
  });

  it("creates only a game-changer when a W10 double misses the active slot count", () => {
    const result = resolveOneThird({
      away: side({ canReceiveEvents: false, participantId: "away" }),
      awayDice: [1, 2],
      home: side({
        participantId: "home",
        lineup: { ATT: ["att-1", "att-2"] },
        powers: { ATT: 9, DEF: 8, MID: 9 },
        zone_players: [{ current_stars: 6, current_zone: "ATT", id: "att-1", lineup_slot: 1 }],
      }),
      homeDice: [10, 10],
      index: 2,
      priorThirds: [{ away: { dice: [1, 1], dice_faces: 6, participant_id: "away", total: 7, zone: "MID", zone_stars: 5 }, home: { dice: [3, 3], dice_faces: 6, participant_id: "home", total: 15, zone: "MID", zone_stars: 9 }, index: 1, label: "midfield", winner_participant_id: "home" }],
    });

    assert.equal(result.third.home.dice_faces, 10);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.event_type, "game_changer");
  });
});
