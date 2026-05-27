import type { LobbySettings } from "@/lib/lobby/types";
import type { ZoneModifier } from "@/lib/game/game-changer-effects";

export type SeasonMode = "double_round_robin" | "five_match";
export type MatchPointsMode = "classic_6_2_0" | "football_3_1_0";
export type ParticipantKind = "cpu" | "human";
export type FixtureStatus = "completed" | "scheduled";
export type TacticalZone = "ATT" | "DEF" | "MID";

export type SeasonParticipant = {
  club_id?: string | null;
  cpu_team_id?: string | null;
  id: string;
  kind: ParticipantKind;
  name: string;
};

export type FixturePair = {
  away_participant_id: string;
  home_participant_id: string;
  matchday: number;
};

export type ZonePowerInput = Record<TacticalZone, number>;

export type FixtureSideInput = {
  canReceiveEvents: boolean;
  clubId?: string | null;
  lineup: {
    ATT: string[];
    DEF: string[];
    GK: string[];
    MID: string[];
  };
  participantId: string;
  powers: ZonePowerInput;
};

export type DicePair = [number, number];

export type FixtureResolution = {
  away_match_points: number;
  away_third_points: number;
  events: MatchEventResult[];
  home_match_points: number;
  home_third_points: number;
  thirds: ThirdResult[];
  winner_participant_id?: string | null;
};

export type MatchEventResult =
  | {
      club_id?: string | null;
      dice: DicePair;
      event_type: "game_changer";
      participant_id: string;
      third_index: number;
      zone: TacticalZone;
    }
  | {
      club_id?: string | null;
      dice: DicePair;
      event_type: "injury";
      participant_id: string;
      player_id: string;
      third_index: number;
      zone: TacticalZone;
    };

export type ThirdResult = {
  away: ThirdSideResult;
  home: ThirdSideResult;
  index: number;
  label: "away_attack" | "home_attack" | "midfield";
  winner_participant_id?: string | null;
};

export type ThirdSideResult = {
  dice: DicePair;
  participant_id: string;
  total: number;
  zone: TacticalZone;
  zone_stars: number;
};

export function getSeasonMode(settings: Pick<LobbySettings, "season_mode"> | null | undefined): SeasonMode {
  return settings?.season_mode === "double_round_robin" ? "double_round_robin" : "five_match";
}

export function getMatchPointsMode(settings: Pick<LobbySettings, "match_points_mode"> | null | undefined): MatchPointsMode {
  return settings?.match_points_mode === "classic_6_2_0" ? "classic_6_2_0" : "football_3_1_0";
}

export function getTargetLeagueSize(settings: Pick<LobbySettings, "target_league_size"> | null | undefined) {
  return Math.max(2, Math.trunc(Number(settings?.target_league_size ?? 6)));
}

export function getRequiredCpuCount(managerCount: number, targetLeagueSize = 6) {
  return Math.max(0, targetLeagueSize - managerCount);
}

export function buildSeasonFixtures(participants: SeasonParticipant[], seasonMode: SeasonMode): FixturePair[] {
  const singleRound = buildSingleRoundRobin(participants);

  if (seasonMode === "five_match") {
    return singleRound;
  }

  const reverseRound = singleRound.map((fixture) => ({
    away_participant_id: fixture.home_participant_id,
    home_participant_id: fixture.away_participant_id,
    matchday: fixture.matchday + singleRound.length / (participants.length / 2),
  }));

  return [...singleRound, ...reverseRound];
}

export function getMatchPoints(winnerSide: "away" | "draw" | "home", mode: MatchPointsMode) {
  const win = mode === "classic_6_2_0" ? 6 : 3;
  const draw = mode === "classic_6_2_0" ? 2 : 1;

  return {
    away: winnerSide === "away" ? win : winnerSide === "draw" ? draw : 0,
    home: winnerSide === "home" ? win : winnerSide === "draw" ? draw : 0,
  };
}

export function resolveFixture(params: {
  away: FixtureSideInput;
  diceRolls: DicePair[];
  home: FixtureSideInput;
  matchPointsMode: MatchPointsMode;
}): FixtureResolution {
  const diceRolls = padDiceRolls(params.diceRolls);
  const thirds: ThirdResult[] = [];
  const events: MatchEventResult[] = [];
  let rollIndex = 0;

  const midfield = compareThird({
    away: params.away,
    awayDice: diceRolls[rollIndex++],
    awayZone: "MID",
    home: params.home,
    homeDice: diceRolls[rollIndex++],
    homeZone: "MID",
    index: 1,
    label: "midfield",
  });
  thirds.push(midfield);
  events.push(...getDoubleDiceEvents(midfield, params.home, params.away));

  const secondAttacker = midfield.winner_participant_id ?? params.home.participantId;
  const homeAttacksSecond = secondAttacker === params.home.participantId;
  const second = compareThird({
    away: params.away,
    awayDice: homeAttacksSecond ? diceRolls[rollIndex++] : diceRolls[rollIndex++],
    awayZone: homeAttacksSecond ? "DEF" : "ATT",
    home: params.home,
    homeDice: homeAttacksSecond ? diceRolls[rollIndex++] : diceRolls[rollIndex++],
    homeZone: homeAttacksSecond ? "ATT" : "DEF",
    index: 2,
    label: homeAttacksSecond ? "home_attack" : "away_attack",
  });
  thirds.push(second);
  events.push(...getDoubleDiceEvents(second, params.home, params.away));

  const homeAttacksThird = !homeAttacksSecond;
  const third = compareThird({
    away: params.away,
    awayDice: homeAttacksThird ? diceRolls[rollIndex++] : diceRolls[rollIndex++],
    awayZone: homeAttacksThird ? "DEF" : "ATT",
    home: params.home,
    homeDice: homeAttacksThird ? diceRolls[rollIndex++] : diceRolls[rollIndex++],
    homeZone: homeAttacksThird ? "ATT" : "DEF",
    index: 3,
    label: homeAttacksThird ? "home_attack" : "away_attack",
  });
  thirds.push(third);
  events.push(...getDoubleDiceEvents(third, params.home, params.away));

  const scores = thirds.reduce(
    (total, item) => {
      if (!item.winner_participant_id) {
        total.home += 0.5;
        total.away += 0.5;
      } else if (item.winner_participant_id === params.home.participantId) {
        total.home += 1;
      } else {
        total.away += 1;
      }
      return total;
    },
    { away: 0, home: 0 },
  );
  const winnerSide = scores.home === scores.away ? "draw" : scores.home > scores.away ? "home" : "away";
  const matchPoints = getMatchPoints(winnerSide, params.matchPointsMode);

  return {
    away_match_points: matchPoints.away,
    away_third_points: scores.away,
    events,
    home_match_points: matchPoints.home,
    home_third_points: scores.home,
    thirds,
    winner_participant_id: winnerSide === "draw" ? null : winnerSide === "home" ? params.home.participantId : params.away.participantId,
  };
}

/**
 * Resolves a single third of a PvP match.
 * For index 1 both sides use MID.
 * For index 2/3 the zone assignment depends on who won index 1.
 * Optional zone modifiers (from played Secret Weapons) are applied to zone_stars.
 */
export function resolveOneThird(params: {
  index: 1 | 2 | 3;
  home: FixtureSideInput;
  away: FixtureSideInput;
  homeDice: DicePair;
  awayDice: DicePair;
  /** Required for index 2 and 3 — pass the result of index 1 */
  priorThirds?: ThirdResult[];
  zoneModifiers?: ZoneModifier[];
}): { third: ThirdResult; events: MatchEventResult[] } {
  const { index, home, away, homeDice, awayDice, priorThirds = [], zoneModifiers = [] } = params;

  let homeZone: TacticalZone;
  let awayZone: TacticalZone;
  let label: ThirdResult["label"];

  if (index === 1) {
    homeZone = "MID";
    awayZone = "MID";
    label = "midfield";
  } else {
    // Attacker for second third = winner of midfield (index 1), or home by default
    const midfieldWinner = priorThirds[0]?.winner_participant_id ?? home.participantId;
    const homeAttacksSecond = midfieldWinner === home.participantId;
    // index 2 → second attack phase, index 3 → third attack phase (reversed)
    const homeAttacksThisThird = index === 2 ? homeAttacksSecond : !homeAttacksSecond;

    homeZone = homeAttacksThisThird ? "ATT" : "DEF";
    awayZone = homeAttacksThisThird ? "DEF" : "ATT";
    label = homeAttacksThisThird ? "home_attack" : "away_attack";
  }

  // Apply zone modifiers from Secret Weapons
  const getModifierDelta = (side: "home" | "away", zone: TacticalZone) =>
    zoneModifiers
      .filter((m) => m.for === side && m.zone === zone)
      .reduce((sum, m) => sum + m.delta, 0);

  const homePower = Math.max(0, home.powers[homeZone] + getModifierDelta("home", homeZone));
  const awayPower = Math.max(0, away.powers[awayZone] + getModifierDelta("away", awayZone));

  const homeResult: ThirdSideResult = {
    dice: homeDice,
    participant_id: home.participantId,
    total: homePower + homeDice[0] + homeDice[1],
    zone: homeZone,
    zone_stars: homePower,
  };
  const awayResult: ThirdSideResult = {
    dice: awayDice,
    participant_id: away.participantId,
    total: awayPower + awayDice[0] + awayDice[1],
    zone: awayZone,
    zone_stars: awayPower,
  };

  const third: ThirdResult = {
    away: awayResult,
    home: homeResult,
    index,
    label,
    winner_participant_id:
      homeResult.total === awayResult.total
        ? null
        : homeResult.total > awayResult.total
          ? home.participantId
          : away.participantId,
  };

  const events = getDoubleDiceEvents(third, home, away);
  return { third, events };
}

function buildSingleRoundRobin(participants: SeasonParticipant[]): FixturePair[] {
  const ordered = [...participants].sort((a, b) => a.id.localeCompare(b.id));
  const rounds = ordered.length - 1;
  const half = ordered.length / 2;
  const fixtures: FixturePair[] = [];
  let rotation = [...ordered];

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (let index = 0; index < half; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      const flip = roundIndex % 2 === 1;

      fixtures.push({
        away_participant_id: flip ? first.id : second.id,
        home_participant_id: flip ? second.id : first.id,
        matchday: roundIndex + 1,
      });
    }

    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, rotation.length - 1)];
  }

  return fixtures;
}

function compareThird(params: {
  away: FixtureSideInput;
  awayDice: DicePair;
  awayZone: TacticalZone;
  home: FixtureSideInput;
  homeDice: DicePair;
  homeZone: TacticalZone;
  index: number;
  label: ThirdResult["label"];
}): ThirdResult {
  const home = {
    dice: params.homeDice,
    participant_id: params.home.participantId,
    total: params.home.powers[params.homeZone] + params.homeDice[0] + params.homeDice[1],
    zone: params.homeZone,
    zone_stars: params.home.powers[params.homeZone],
  };
  const away = {
    dice: params.awayDice,
    participant_id: params.away.participantId,
    total: params.away.powers[params.awayZone] + params.awayDice[0] + params.awayDice[1],
    zone: params.awayZone,
    zone_stars: params.away.powers[params.awayZone],
  };

  return {
    away,
    home,
    index: params.index,
    label: params.label,
    winner_participant_id: home.total === away.total ? null : home.total > away.total ? params.home.participantId : params.away.participantId,
  };
}

function getDoubleDiceEvents(third: ThirdResult, home: FixtureSideInput, away: FixtureSideInput) {
  return [
    ...getDoubleDiceEvent(third.home, third.index, home),
    ...getDoubleDiceEvent(third.away, third.index, away),
  ];
}

function getDoubleDiceEvent(side: ThirdSideResult, thirdIndex: number, participant: FixtureSideInput) {
  if (!participant.canReceiveEvents || side.dice[0] !== side.dice[1]) {
    return [];
  }

  const zonePlayers = participant.lineup[side.zone] ?? [];
  const playerId = zonePlayers[side.dice[0] - 1];
  const base = {
    club_id: participant.clubId,
    dice: side.dice,
    participant_id: participant.participantId,
    third_index: thirdIndex,
    zone: side.zone,
  };

  if (!playerId) {
    return [{ ...base, event_type: "game_changer" as const }];
  }

  return [
    { ...base, event_type: "game_changer" as const },
    { ...base, event_type: "injury" as const, player_id: playerId },
  ];
}

function padDiceRolls(diceRolls: DicePair[]) {
  const padded = [...diceRolls];

  while (padded.length < 6) {
    padded.push([rollDie(), rollDie()]);
  }

  return padded.slice(0, 6);
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}
