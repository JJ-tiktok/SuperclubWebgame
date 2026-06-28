import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSymmetricBracket,
  computeParticipantRecord,
  didParticipantLoseFixture,
  findOwnCurrentFixture,
  getNextRoundFeedMatchIndex,
  sortManagersForDisplay,
} from "@/components/game/continental/continental-bracket-utils";
import type {
  ContinentalFixtureSnapshot,
  ContinentalParticipantSnapshot,
  ContinentalTournamentSnapshot,
} from "@/lib/lobby/types";

function makeParticipant(id: string, clubId: string | null, name: string): ContinentalParticipantSnapshot {
  return {
    id,
    kind: clubId ? "human" : "cpu",
    club_id: clubId,
    display_name: name,
    bracket_seed: 1,
    eliminated_round: null,
  };
}

function makeFixture(
  round: number,
  matchIndex: number,
  home: ContinentalParticipantSnapshot,
  away: ContinentalParticipantSnapshot,
  status: "scheduled" | "completed" = "scheduled",
  scores?: { home: number; away: number },
): ContinentalFixtureSnapshot {
  return {
    id: `f-${round}-${matchIndex}`,
    round,
    match_index: matchIndex,
    status,
    match_state: status,
    home_lineup_locked: false,
    away_lineup_locked: false,
    home_score: scores?.home ?? null,
    away_score: scores?.away ?? null,
    winner_participant_id:
      status === "completed" && scores
        ? scores.home > scores.away
          ? home.id
          : scores.away > scores.home
            ? away.id
            : null
        : null,
    home_participant: home,
    away_participant: away,
  };
}

function makeTournament(
  overrides: Partial<ContinentalTournamentSnapshot> = {},
): ContinentalTournamentSnapshot {
  return {
    id: "t1",
    season_number: 2,
    status: "active",
    current_round: 16,
    prize_amount: 100_000_000,
    winner_club_id: null,
    participants: [],
    fixtures: [],
    ...overrides,
  };
}

describe("continental-bracket-utils", () => {
  it("maps match_index to the next round feeder slot", () => {
    assert.equal(getNextRoundFeedMatchIndex(32, 0), 0);
    assert.equal(getNextRoundFeedMatchIndex(32, 1), 0);
    assert.equal(getNextRoundFeedMatchIndex(32, 2), 1);
    assert.equal(getNextRoundFeedMatchIndex(16, 3), 1);
  });

  it("computes wins draws and losses for a participant", () => {
    const home = makeParticipant("p-home", "club-home", "Home FC");
    const away = makeParticipant("p-away", null, "Away CPU");
    const fixtures = [
      makeFixture(32, 0, home, away, "completed", { home: 2, away: 1 }),
      makeFixture(16, 0, home, away, "completed", { home: 1, away: 1 }),
      makeFixture(8, 0, home, away, "completed", { home: 0, away: 3 }),
    ];

    assert.deepEqual(computeParticipantRecord(fixtures, "p-home"), {
      wins: 1,
      draws: 1,
      losses: 1,
    });
  });

  it("builds symmetric left and right bracket halves", () => {
    const fixtures = Array.from({ length: 16 }, (_, index) =>
      makeFixture(
        32,
        index,
        makeParticipant(`h-${index}`, null, `Home ${index}`),
        makeParticipant(`a-${index}`, null, `Away ${index}`),
      ),
    );

    const bracket = buildSymmetricBracket(fixtures);
    assert.equal(bracket.leftColumns.length, 4);
    assert.equal(bracket.rightColumns.length, 4);
    assert.equal(bracket.leftColumns[0]?.slots.length, 8);
    assert.equal(bracket.leftColumns[0]?.slots[0]?.matchIndex, 0);
    assert.equal(bracket.rightColumns[3]?.slots[0]?.matchIndex, 15);
    assert.equal(bracket.center.round, 2);
  });

  it("finds the active own fixture in the current round", () => {
    const own = makeParticipant("p-own", "club-own", "Own FC");
    const cpu = makeParticipant("p-cpu", null, "CPU FC");
    const continental = makeTournament({
      current_round: 16,
      participants: [own, cpu],
      fixtures: [makeFixture(16, 0, own, cpu)],
    });

    const fixture = findOwnCurrentFixture(continental, "club-own");
    assert.equal(fixture?.round, 16);
    assert.equal(fixture?.id, "f-16-0");
  });

  it("shows the elimination fixture instead of the previous win when knocked out", () => {
    const own = makeParticipant("p-own", "club-own", "Own FC");
    const cpu32 = makeParticipant("p-cpu-32", null, "CPU 32");
    const cpu16 = makeParticipant("p-cpu-16", null, "CPU 16");
    own.eliminated_round = 16;

    const continental = makeTournament({
      current_round: 8,
      status: "in_progress",
      participants: [own, cpu32, cpu16],
      fixtures: [
        makeFixture(32, 0, own, cpu32, "completed", { home: 2, away: 0 }),
        makeFixture(16, 0, own, cpu16, "completed", { home: 0, away: 2 }),
      ],
    });

    const fixture = findOwnCurrentFixture(continental, "club-own");
    assert.equal(fixture?.round, 16);
    assert.equal(fixture?.id, "f-16-0");
    assert.equal(didParticipantLoseFixture(fixture!, "p-own"), true);
  });

  it("shows the final for the tournament winner after completion", () => {
    const own = makeParticipant("p-own", "club-own", "Own FC");
    const cpuFinal = makeParticipant("p-cpu-final", null, "CPU Final");
    const continental = makeTournament({
      current_round: 2,
      status: "completed",
      winner_club_id: "club-own",
      participants: [own, cpuFinal],
      fixtures: [
        makeFixture(32, 0, own, makeParticipant("p-cpu-32", null, "CPU 32"), "completed", { home: 2, away: 0 }),
        makeFixture(2, 0, own, cpuFinal, "completed", { home: 3, away: 1 }),
      ],
    });

    const fixture = findOwnCurrentFixture(continental, "club-own");
    assert.equal(fixture?.round, 2);
    assert.equal(fixture?.id, "f-2-0");
  });

  it("sorts own manager first then active managers alphabetically", () => {
    const participants = [
      makeParticipant("p-b", "club-b", "Bravo"),
      makeParticipant("p-a", "club-a", "Alpha"),
      makeParticipant("p-own", "club-own", "Own"),
    ];
    participants[0]!.eliminated_round = 16;

    const sorted = sortManagersForDisplay(participants, "club-own");
    assert.equal(sorted[0]?.id, "p-own");
    assert.equal(sorted[1]?.id, "p-a");
    assert.equal(sorted[2]?.id, "p-b");
  });
});
