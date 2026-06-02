/**
 * Continental Cup (Champions League) — pure bracket logic.
 */

export const CONTINENTAL_BRACKET_SIZE = 32;
export const CONTINENTAL_PRIZE_AMOUNT = 100_000_000;
export const CONTINENTAL_ROUNDS = [32, 16, 8, 4, 2, 1] as const;
export type ContinentalRound = (typeof CONTINENTAL_ROUNDS)[number];

export type ContinentalParticipantInput = {
  id: string;
  display_name: string;
  kind: "human" | "cpu";
};

export type ContinentalRoundFixturePair = {
  round: ContinentalRound;
  match_index: number;
  home_participant_id: string;
  away_participant_id: string;
};

export type ContinentalCompletedFixture = {
  round: ContinentalRound;
  match_index: number;
  home_participant_id: string;
  away_participant_id: string;
  winner_participant_id: string;
};

export function shouldRunContinentalCup(seasonNumber: number) {
  return seasonNumber >= 2 && seasonNumber % 2 === 0;
}

export function getNextContinentalRound(round: ContinentalRound): ContinentalRound | null {
  const index = CONTINENTAL_ROUNDS.indexOf(round);
  if (index < 0 || index >= CONTINENTAL_ROUNDS.length - 1) {
    return null;
  }
  return CONTINENTAL_ROUNDS[index + 1];
}

export function getContinentalRoundLabel(round: ContinentalRound) {
  const labels: Record<ContinentalRound, string> = {
    32: "Sechzehntelfinale",
    16: "Achtelfinale",
    8: "Viertelfinale",
    4: "Halbfinale",
    2: "Finale",
    1: "Finale",
  };
  return labels[round] ?? `Runde ${round}`;
}

/** Fisher–Yates shuffle (mutates copy). */
export function shuffleParticipants<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Build 16 first-round pairings from 32 shuffled participants. */
export function buildRound32Fixtures(shuffledParticipantIds: string[]): ContinentalRoundFixturePair[] {
  if (shuffledParticipantIds.length !== CONTINENTAL_BRACKET_SIZE) {
    throw new Error(`Continental cup requires exactly ${CONTINENTAL_BRACKET_SIZE} participants.`);
  }
  const fixtures: ContinentalRoundFixturePair[] = [];
  for (let matchIndex = 0; matchIndex < CONTINENTAL_BRACKET_SIZE / 2; matchIndex += 1) {
    fixtures.push({
      round: 32,
      match_index: matchIndex,
      home_participant_id: shuffledParticipantIds[matchIndex * 2],
      away_participant_id: shuffledParticipantIds[matchIndex * 2 + 1],
    });
  }
  return fixtures;
}

/** Build knockout fixtures for the next round from winners (preserves bracket order). */
export function buildNextRoundFixtures(
  completedRound: ContinentalRound,
  winnersInMatchOrder: string[],
): ContinentalRoundFixturePair[] {
  const nextRound = getNextContinentalRound(completedRound);
  if (!nextRound) {
    return [];
  }
  const expectedMatches = winnersInMatchOrder.length / 2;
  if (!Number.isInteger(expectedMatches) || expectedMatches < 1) {
    throw new Error("Invalid winner count for next continental round.");
  }
  const fixtures: ContinentalRoundFixturePair[] = [];
  for (let matchIndex = 0; matchIndex < expectedMatches; matchIndex += 1) {
    fixtures.push({
      round: nextRound,
      match_index: matchIndex,
      home_participant_id: winnersInMatchOrder[matchIndex * 2],
      away_participant_id: winnersInMatchOrder[matchIndex * 2 + 1],
    });
  }
  return fixtures;
}

export function pickRandomLineupIndex(lineupCount: number, random = Math.random) {
  if (lineupCount <= 0) return 0;
  return Math.floor(random() * lineupCount);
}

export function requiredContinentalCpuCount(humanClubCount: number) {
  return Math.max(0, CONTINENTAL_BRACKET_SIZE - humanClubCount);
}
