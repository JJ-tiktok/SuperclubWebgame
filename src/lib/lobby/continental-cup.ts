/**
 * Continental Cup (Champions League) — pure bracket logic.
 */

import type { ClubStatus } from "@/lib/game/types";
import { CLUB_STATUS_ORDER } from "@/lib/lobby/club-status";
import type { LobbySettings, SeasonStandingSnapshot } from "@/lib/lobby/types";

export const CONTINENTAL_BRACKET_SIZE = 32;
/** Minimum catalog rows so a 2-player lobby can fill 30 CPU slots. */
export const MIN_CONTINENTAL_CPU_CATALOG_SIZE = CONTINENTAL_BRACKET_SIZE;
export const CONTINENTAL_PRIZE_AMOUNT = 100_000_000;
export const CONTINENTAL_PRIZE_SEMIFINAL = 40_000_000;
export const CONTINENTAL_PRIZE_FINALIST = 70_000_000;
export const CONTINENTAL_PRIZE_WINNER = 100_000_000;
/** Knockout rounds (32 → 16 → 8 → 4 → 2). The final is round 2 (one match). */
export const CONTINENTAL_ROUNDS = [32, 16, 8, 4, 2] as const;
export const CONTINENTAL_FINAL_ROUND: (typeof CONTINENTAL_ROUNDS)[number] = 2;
export type ContinentalRound = (typeof CONTINENTAL_ROUNDS)[number];

export type ContinentalCpuTier = "underdog" | "schwer" | "sehr_schwer" | "elite";

export const CONTINENTAL_CPU_TIER_LABEL: Record<ContinentalCpuTier, string> = {
  underdog: "Underdog",
  schwer: "Schwer",
  sehr_schwer: "Sehr Schwer",
  elite: "Elite",
};

export const CONTINENTAL_LINEUPS_BY_TIER: Record<
  ContinentalCpuTier,
  Array<{ display_name: "Offensiv" | "Defensiv" | "Ausgeglichen"; def: number; mid: number; att: number; sort_order: number }>
> = {
  underdog: [
    { display_name: "Ausgeglichen", def: 15, mid: 15, att: 15, sort_order: 1 },
    { display_name: "Defensiv", def: 17, mid: 15, att: 13, sort_order: 2 },
    { display_name: "Offensiv", def: 13, mid: 15, att: 17, sort_order: 3 },
  ],
  schwer: [
    { display_name: "Ausgeglichen", def: 17, mid: 17, att: 17, sort_order: 1 },
    { display_name: "Defensiv", def: 20, mid: 18, att: 15, sort_order: 2 },
    { display_name: "Offensiv", def: 15, mid: 18, att: 20, sort_order: 3 },
  ],
  sehr_schwer: [
    { display_name: "Ausgeglichen", def: 24, mid: 24, att: 24, sort_order: 1 },
    { display_name: "Defensiv", def: 27, mid: 25, att: 22, sort_order: 2 },
    { display_name: "Offensiv", def: 22, mid: 25, att: 27, sort_order: 3 },
  ],
  elite: [
    { display_name: "Ausgeglichen", def: 27, mid: 27, att: 27, sort_order: 1 },
    { display_name: "Defensiv", def: 30, mid: 28, att: 26, sort_order: 2 },
    { display_name: "Offensiv", def: 26, mid: 28, att: 30, sort_order: 3 },
  ],
};

const HARD_CPU_TIERS: ContinentalCpuTier[] = ["schwer", "sehr_schwer", "elite"];

/** Legacy DB rows used round `1` as an extra final — treat like the real final. */
export function isContinentalFinalRound(round: number) {
  return round === CONTINENTAL_FINAL_ROUND || round === 1;
}

export type ContinentalParticipantInput = {
  id: string;
  display_name: string;
  kind: "human" | "cpu";
  cpu_strength_tier?: ContinentalCpuTier | null;
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

export type ContinentalQualifiedHuman = {
  club_id: string;
  display_name: string;
  human_league_rank: number;
  opponent_tier: "underdog" | "schwer";
};

export type ContinentalCpuSlot = {
  catalog_team_id: string;
  display_name: string;
  tier: ContinentalCpuTier;
};

export function isContinentalCupEnabled(settings?: Pick<LobbySettings, "continental_cup_enabled"> | null) {
  return settings?.continental_cup_enabled !== false;
}

export function shouldRunContinentalCup(
  seasonNumber: number,
  settings?: Pick<LobbySettings, "continental_cup_enabled"> | null,
) {
  if (!isContinentalCupEnabled(settings)) {
    return false;
  }
  return seasonNumber >= 2 && seasonNumber % 2 === 0;
}

export function isContinentalQualified(status: ClubStatus): boolean {
  const statusIdx = CLUB_STATUS_ORDER.indexOf(status);
  const midTableIdx = CLUB_STATUS_ORDER.indexOf("mid_table");
  return statusIdx >= midTableIdx;
}

export function getHumanLeagueRank(standings: SeasonStandingSnapshot[], clubId: string): number | null {
  const humanStandings = standings
    .filter((standing) => standing.participant.kind === "human" && standing.participant.club_id)
    .sort((a, b) => a.rank - b.rank);

  const index = humanStandings.findIndex((standing) => standing.participant.club_id === clubId);
  return index >= 0 ? index + 1 : null;
}

export function getContinentalLineupStars(tier: ContinentalCpuTier, formationIndex: number) {
  const lineups = CONTINENTAL_LINEUPS_BY_TIER[tier];
  const lineup = lineups[formationIndex] ?? lineups[0];
  if (!lineup) {
    throw new Error(`Missing continental lineup for tier ${tier}.`);
  }
  return { def: lineup.def, mid: lineup.mid, att: lineup.att, display_name: lineup.display_name };
}

export function getPrizeForEliminationRound(eliminatedRound: number): number {
  if (eliminatedRound === 4) {
    return CONTINENTAL_PRIZE_SEMIFINAL;
  }
  if (eliminatedRound === 2 || eliminatedRound === 1) {
    return CONTINENTAL_PRIZE_FINALIST;
  }
  return 0;
}

export function getEliminationPrizeHeadline(eliminatedRound: number): string | null {
  if (eliminatedRound === 4) {
    return "Continental Cup: Halbfinale erreicht!";
  }
  if (eliminatedRound === 2 || eliminatedRound === 1) {
    return "Continental Cup: Finale erreicht!";
  }
  return null;
}

export function getNextContinentalRound(round: ContinentalRound): ContinentalRound | null {
  const index = CONTINENTAL_ROUNDS.indexOf(round);
  if (index < 0 || index >= CONTINENTAL_ROUNDS.length - 1) {
    return null;
  }
  return CONTINENTAL_ROUNDS[index + 1];
}

export function getContinentalRoundLabel(round: number) {
  const labels: Record<number, string> = {
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

export function buildCpuOnlyTierPool(cpuOnlyCount: number, random = Math.random): ContinentalCpuTier[] {
  if (cpuOnlyCount <= 0 || cpuOnlyCount % 2 !== 0) {
    throw new Error(`CPU-only bracket requires an even positive count, got ${cpuOnlyCount}.`);
  }

  const underdogCount = random() < 0.5 ? 1 : 2;
  const hardCount = cpuOnlyCount - underdogCount;
  const tiers: ContinentalCpuTier[] = Array.from({ length: underdogCount }, () => "underdog");

  for (let index = 0; index < hardCount; index += 1) {
    tiers.push(HARD_CPU_TIERS[index % HARD_CPU_TIERS.length]!);
  }

  return shuffleParticipants(tiers, random);
}

export function assignContinentalCpuSlots(
  qualifiedHumans: ContinentalQualifiedHuman[],
  cpuCatalog: Array<{ id: string; display_name: string }>,
  random = Math.random,
): ContinentalCpuSlot[] {
  const cpuNeeded = requiredContinentalCpuCount(qualifiedHumans.length);
  if (cpuCatalog.length < cpuNeeded) {
    throw new Error(`Not enough continental CPU teams in catalog (${cpuCatalog.length}/${cpuNeeded}).`);
  }

  const selectedCatalog = shuffleParticipants(cpuCatalog, random).slice(0, cpuNeeded);
  const humanOpponentTiers: ContinentalCpuTier[] = qualifiedHumans.map((human) => human.opponent_tier);
  const cpuOnlyCount = cpuNeeded - humanOpponentTiers.length;
  const cpuOnlyTiers = buildCpuOnlyTierPool(cpuOnlyCount, random);
  const allTiers = shuffleParticipants([...humanOpponentTiers, ...cpuOnlyTiers], random);

  return selectedCatalog.map((team, index) => ({
    catalog_team_id: team.id,
    display_name: team.display_name,
    tier: allTiers[index]!,
  }));
}

export function classifyQualifiedHumans(
  qualifiedClubIds: Array<{ club_id: string; display_name: string }>,
  standings: SeasonStandingSnapshot[],
): ContinentalQualifiedHuman[] {
  return qualifiedClubIds
    .map((club) => {
      const humanLeagueRank = getHumanLeagueRank(standings, club.club_id);
      if (humanLeagueRank == null) {
        return null;
      }
      return {
        club_id: club.club_id,
        display_name: club.display_name,
        human_league_rank: humanLeagueRank,
        opponent_tier: humanLeagueRank <= 2 ? ("underdog" as const) : ("schwer" as const),
      };
    })
    .filter((entry): entry is ContinentalQualifiedHuman => entry != null)
    .sort((a, b) => a.human_league_rank - b.human_league_rank);
}

export function buildSeededRound32Fixtures(input: {
  humanParticipantIds: Map<string, string>;
  cpuParticipants: Array<{ participant_id: string; tier: ContinentalCpuTier }>;
  qualifiedHumans: ContinentalQualifiedHuman[];
  random?: () => number;
}): ContinentalRoundFixturePair[] {
  const random = input.random ?? Math.random;
  const remainingCpus = [...input.cpuParticipants];
  const humanMatches = input.qualifiedHumans.map((human) => {
    const humanParticipantId = input.humanParticipantIds.get(human.club_id);
    if (!humanParticipantId) {
      throw new Error(`Missing continental participant for club ${human.club_id}.`);
    }

    const opponentTier = human.opponent_tier;
    const opponentIndex = remainingCpus.findIndex((cpu) => cpu.tier === opponentTier);
    if (opponentIndex < 0) {
      throw new Error(`Missing CPU opponent with tier ${opponentTier}.`);
    }

    const [opponent] = remainingCpus.splice(opponentIndex, 1);
    return {
      home_participant_id: humanParticipantId,
      away_participant_id: opponent!.participant_id,
    };
  });

  const remainingCpuIds = shuffleParticipants(
    remainingCpus.map((cpu) => cpu.participant_id),
    random,
  );
  const cpuOnlyMatches: Array<{ home_participant_id: string; away_participant_id: string }> = [];
  for (let index = 0; index < remainingCpuIds.length; index += 2) {
    cpuOnlyMatches.push({
      home_participant_id: remainingCpuIds[index]!,
      away_participant_id: remainingCpuIds[index + 1]!,
    });
  }

  const allMatches = shuffleParticipants([...humanMatches, ...cpuOnlyMatches], random);
  return allMatches.map((match, matchIndex) => ({
    round: 32 as const,
    match_index: matchIndex,
    home_participant_id: match.home_participant_id,
    away_participant_id: match.away_participant_id,
  }));
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

export function requiredContinentalCpuCount(qualifiedHumanCount: number) {
  return Math.max(0, CONTINENTAL_BRACKET_SIZE - qualifiedHumanCount);
}
