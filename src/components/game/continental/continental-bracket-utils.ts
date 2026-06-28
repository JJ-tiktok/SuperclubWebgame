import { getContinentalRoundLabel } from "@/lib/lobby/continental-cup";
import type {
  ContinentalFixtureSnapshot,
  ContinentalParticipantSnapshot,
  ContinentalTournamentSnapshot,
} from "@/lib/lobby/types";

export type ParticipantRecord = { wins: number; draws: number; losses: number };

export function findFixtureForParticipant(
  fixtures: ContinentalFixtureSnapshot[],
  participantId: string,
  round: number,
): ContinentalFixtureSnapshot | null {
  return (
    fixtures.find(
      (fixture) =>
        fixture.round === round &&
        (fixture.home_participant.id === participantId || fixture.away_participant.id === participantId),
    ) ?? null
  );
}

function findOwnMostAdvancedCompletedFixture(
  fixtures: ContinentalFixtureSnapshot[],
  participantId: string,
): ContinentalFixtureSnapshot | null {
  return (
    fixtures
      .filter(
        (fixture) =>
          fixture.status === "completed" &&
          (fixture.home_participant.id === participantId || fixture.away_participant.id === participantId),
      )
      .sort((left, right) => left.round - right.round)[0] ?? null
  );
}

export function findOwnCurrentFixture(
  continental: ContinentalTournamentSnapshot,
  clubId: string | undefined,
): ContinentalFixtureSnapshot | null {
  if (!clubId) {
    return null;
  }

  const participant = continental.participants.find((entry) => entry.club_id === clubId);
  if (!participant) {
    return null;
  }

  if (participant.eliminated_round != null) {
    return findFixtureForParticipant(continental.fixtures, participant.id, participant.eliminated_round);
  }

  if (continental.status === "completed") {
    return findOwnMostAdvancedCompletedFixture(continental.fixtures, participant.id);
  }

  return findFixtureForParticipant(continental.fixtures, participant.id, continental.current_round);
}

export function didParticipantLoseFixture(
  fixture: ContinentalFixtureSnapshot,
  participantId: string,
): boolean {
  if (fixture.status !== "completed") {
    return false;
  }
  if (fixture.winner_participant_id != null) {
    return fixture.winner_participant_id !== participantId;
  }

  const isHome = fixture.home_participant.id === participantId;
  const isAway = fixture.away_participant.id === participantId;
  if (!isHome && !isAway) {
    return false;
  }

  const homeScore = fixture.home_score ?? 0;
  const awayScore = fixture.away_score ?? 0;
  if (homeScore === awayScore) {
    return false;
  }
  return (isHome && homeScore < awayScore) || (isAway && awayScore < homeScore);
}

export function computeParticipantRecord(
  fixtures: ContinentalFixtureSnapshot[],
  participantId: string,
): ParticipantRecord {
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const fixture of fixtures) {
    if (fixture.status !== "completed") {
      continue;
    }

    const isHome = fixture.home_participant.id === participantId;
    const isAway = fixture.away_participant.id === participantId;
    if (!isHome && !isAway) {
      continue;
    }

    const homeScore = fixture.home_score ?? 0;
    const awayScore = fixture.away_score ?? 0;
    if (homeScore === awayScore) {
      draws += 1;
    } else if ((isHome && homeScore > awayScore) || (isAway && awayScore > homeScore)) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return { wins, draws, losses };
}

export type BracketSlot = {
  round: number;
  matchIndex: number;
  fixture: ContinentalFixtureSnapshot | null;
  side: "left" | "center" | "right";
};

export type BracketColumn = {
  round: number;
  label: string;
  slots: BracketSlot[];
};

export type SymmetricBracket = {
  leftColumns: BracketColumn[];
  center: BracketSlot;
  rightColumns: BracketColumn[];
};

const LEFT_ROUND_INDICES: Array<{ round: number; indices: number[] }> = [
  { round: 32, indices: [0, 1, 2, 3, 4, 5, 6, 7] },
  { round: 16, indices: [0, 1, 2, 3] },
  { round: 8, indices: [0, 1] },
  { round: 4, indices: [0] },
];

const MATCHES_PER_ROUND: Record<number, number> = {
  32: 16,
  16: 8,
  8: 4,
  4: 2,
  2: 1,
  1: 1,
};

function getFixtureByRoundAndIndex(
  fixtures: ContinentalFixtureSnapshot[],
  round: number,
  matchIndex: number,
): ContinentalFixtureSnapshot | null {
  return fixtures.find((fixture) => fixture.round === round && fixture.match_index === matchIndex) ?? null;
}

function getRightHalfIndices(round: number, leftCount: number): number[] {
  const half = (MATCHES_PER_ROUND[round] ?? 0) / 2;
  return Array.from({ length: leftCount }, (_, index) => half + index);
}

export function buildSymmetricBracket(fixtures: ContinentalFixtureSnapshot[]): SymmetricBracket {
  const leftColumns: BracketColumn[] = LEFT_ROUND_INDICES.map(({ round, indices }) => ({
    round,
    label: getContinentalRoundLabel(round),
    slots: indices.map((matchIndex) => ({
      round,
      matchIndex,
      fixture: getFixtureByRoundAndIndex(fixtures, round, matchIndex),
      side: "left" as const,
    })),
  }));

  const rightColumns: BracketColumn[] = [...LEFT_ROUND_INDICES]
    .reverse()
    .map(({ round, indices }) => {
      const rightIndices = getRightHalfIndices(round, indices.length);
      return {
        round,
        label: getContinentalRoundLabel(round),
        slots: [...rightIndices].reverse().map((matchIndex) => ({
          round,
          matchIndex,
          fixture: getFixtureByRoundAndIndex(fixtures, round, matchIndex),
          side: "right" as const,
        })),
      };
    });

  const center: BracketSlot = {
    round: 2,
    matchIndex: 0,
    fixture:
      getFixtureByRoundAndIndex(fixtures, 2, 0) ?? getFixtureByRoundAndIndex(fixtures, 1, 0),
    side: "center",
  };

  return { leftColumns, center, rightColumns };
}

export type ManagerRoundStatus = {
  participant: ContinentalParticipantSnapshot;
  statusLabel: string;
  isActive: boolean;
  currentFixture: ContinentalFixtureSnapshot | null;
  opponentName: string | null;
  homeLocked: boolean;
  awayLocked: boolean;
};

export function getManagerRoundStatus(
  participant: ContinentalParticipantSnapshot,
  continental: ContinentalTournamentSnapshot,
): ManagerRoundStatus {
  const isWinner =
    continental.winner_club_id != null && participant.club_id === continental.winner_club_id;
  const isEliminated = participant.eliminated_round != null;
  const isActive = !isEliminated && continental.status !== "completed";

  let statusLabel: string;
  if (isWinner) {
    statusLabel = "Continental-Cup-Sieger";
  } else if (isEliminated && participant.eliminated_round != null) {
    statusLabel = `Ausgeschieden (${getContinentalRoundLabel(participant.eliminated_round)})`;
  } else if (continental.status === "completed") {
    statusLabel = "Turnier beendet";
  } else {
    statusLabel = getContinentalRoundLabel(continental.current_round);
  }

  const currentFixture = isActive
    ? findFixtureForParticipant(continental.fixtures, participant.id, continental.current_round)
    : isEliminated && participant.eliminated_round != null
      ? findFixtureForParticipant(continental.fixtures, participant.id, participant.eliminated_round)
      : continental.status === "completed"
        ? findOwnMostAdvancedCompletedFixture(continental.fixtures, participant.id)
        : null;

  let opponentName: string | null = null;
  let homeLocked = false;
  let awayLocked = false;

  if (currentFixture) {
    const isHome = currentFixture.home_participant.id === participant.id;
    opponentName = isHome
      ? currentFixture.away_participant.display_name
      : currentFixture.home_participant.display_name;
    homeLocked = currentFixture.home_lineup_locked;
    awayLocked = currentFixture.away_lineup_locked;
  }

  return {
    participant,
    statusLabel,
    isActive: isActive && !isWinner,
    currentFixture,
    opponentName,
    homeLocked,
    awayLocked,
  };
}

export function getOwnStatusHeadline(
  continental: ContinentalTournamentSnapshot,
  ownParticipant: ContinentalParticipantSnapshot | null | undefined,
): string {
  if (!ownParticipant) {
    return "Zuschauer";
  }
  if (continental.winner_club_id && ownParticipant.club_id === continental.winner_club_id) {
    return "Continental-Cup-Sieger";
  }
  if (ownParticipant.eliminated_round != null) {
    return `Ausgeschieden im ${getContinentalRoundLabel(ownParticipant.eliminated_round)}`;
  }
  if (continental.status === "completed") {
    return "Turnier beendet";
  }
  return `Im ${getContinentalRoundLabel(continental.current_round)}`;
}

export function sortManagersForDisplay(
  participants: ContinentalParticipantSnapshot[],
  ownClubId: string | undefined,
): ContinentalParticipantSnapshot[] {
  return [...participants].sort((left, right) => {
    const leftOwn = left.club_id === ownClubId ? 0 : 1;
    const rightOwn = right.club_id === ownClubId ? 0 : 1;
    if (leftOwn !== rightOwn) {
      return leftOwn - rightOwn;
    }

    const leftActive = left.eliminated_round == null ? 0 : 1;
    const rightActive = right.eliminated_round == null ? 0 : 1;
    if (leftActive !== rightActive) {
      return leftActive - rightActive;
    }

    return left.display_name.localeCompare(right.display_name);
  });
}

export function fixtureInvolvesClub(fixture: ContinentalFixtureSnapshot, clubId: string | undefined): boolean {
  if (!clubId) {
    return false;
  }
  return fixture.home_participant.club_id === clubId || fixture.away_participant.club_id === clubId;
}

export function getNextRoundFeedMatchIndex(round: number, matchIndex: number): number {
  return Math.floor(matchIndex / 2);
}
