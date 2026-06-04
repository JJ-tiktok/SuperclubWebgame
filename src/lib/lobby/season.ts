import {
  applyAndKeepUnmatchedModifiers,
  type PartialResult,
  type ZoneModifier,
} from "@/lib/game/game-changer-effects";
import { compareArchetypes, type ArchetypeDuelWinner, type PlayerArchetype } from "@/lib/lobby/archetypes";
import type { LobbySettings } from "@/lib/lobby/types";

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

export type FixtureZonePlayerInput = {
  attacker_archetype?: PlayerArchetype | null;
  current_stars: number;
  current_zone: TacticalZone | "GK";
  defender_archetype?: PlayerArchetype | null;
  display_name?: string | null;
  id: string;
  lineup_slot?: number | null;
  position?: string | null;
};

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
  zone_players?: FixtureZonePlayerInput[];
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
  archetype_effects?: ArchetypeEffect[];
  away: ThirdSideResult;
  home: ThirdSideResult;
  index: number;
  label: "away_attack" | "home_attack" | "midfield";
  winner_participant_id?: string | null;
};

export type ThirdSideResult = {
  dice: DicePair;
  dice_faces: number;
  participant_id: string;
  total: number;
  zone: TacticalZone;
  zone_stars: number;
};

export type ArchetypeEffect = {
  attacker_archetype?: PlayerArchetype | null;
  attacker_delta: number;
  attacker_player_id?: string | null;
  attacker_player_name?: string | null;
  defender_archetype?: PlayerArchetype | null;
  defender_delta: number;
  defender_player_id?: string | null;
  defender_player_name?: string | null;
  pair: "best" | "worst";
  winner: ArchetypeDuelWinner;
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
  diceRolls?: DicePair[];
  home: FixtureSideInput;
  matchPointsMode: MatchPointsMode;
  zoneModifiers?: ZoneModifier[];
}): FixtureResolution {
  const diceRolls = params.diceRolls ?? [];
  const thirds: ThirdResult[] = [];
  const events: MatchEventResult[] = [];
  let rollIndex = 0;
  let partial: PartialResult = {
    thirds: [],
    pending_modifiers: [...(params.zoneModifiers ?? [])],
  };

  for (const index of [1, 2, 3] as const) {
    const { homeZone, awayZone } = getThirdZones(
      index,
      thirds[0]?.winner_participant_id ?? null,
      params.home.participantId,
    );
    const { active: modifiers, updated } = applyAndKeepUnmatchedModifiers(partial, homeZone, awayZone);
    partial = updated;

    const { third, events: thirdEvents } = resolveOneThird({
      index,
      home: params.home,
      away: params.away,
      awayDice: diceRolls[rollIndex++],
      homeDice: diceRolls[rollIndex++],
      priorThirds: thirds,
      zoneModifiers: modifiers,
    });
    thirds.push(third);
    events.push(...thirdEvents);
  }

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
/**
 * Computes which tactical zone each side uses for a given third index.
 * Exported so callers can pre-filter zone modifiers before calling resolveOneThird.
 */
export function getThirdZones(
  index: 1 | 2 | 3,
  firstThirdWinnerParticipantId: string | null | undefined,
  homeParticipantId: string,
): { homeZone: TacticalZone; awayZone: TacticalZone } {
  if (index === 1) return { homeZone: "MID", awayZone: "MID" };
  const midfieldWinner = firstThirdWinnerParticipantId ?? homeParticipantId;
  const homeAttacksSecond = midfieldWinner === homeParticipantId;
  const homeAttacksThisThird = index === 2 ? homeAttacksSecond : !homeAttacksSecond;
  return {
    homeZone: homeAttacksThisThird ? "ATT" : "DEF",
    awayZone: homeAttacksThisThird ? "DEF" : "ATT",
  };
}

export function resolveOneThird(params: {
  index: 1 | 2 | 3;
  home: FixtureSideInput;
  away: FixtureSideInput;
  homeDice?: DicePair;
  awayDice?: DicePair;
  /** Required for index 2 and 3 — pass the result of index 1 */
  priorThirds?: ThirdResult[];
  zoneModifiers?: ZoneModifier[];
}): { third: ThirdResult; events: MatchEventResult[] } {
  const { index, home, away, priorThirds = [], zoneModifiers = [] } = params;

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

  const homeIsAttacking = homeZone === "ATT" && awayZone === "DEF";
  const awayIsAttacking = awayZone === "ATT" && homeZone === "DEF";
  const archetypeResult =
    homeIsAttacking
      ? getArchetypeZoneResultForSides(home, away, "home")
      : awayIsAttacking
        ? getArchetypeZoneResultForSides(away, home, "away")
        : { awayDelta: 0, effects: [], homeDelta: 0 };

  const homePower = Math.max(0, home.powers[homeZone] + getModifierDelta("home", homeZone) + archetypeResult.homeDelta);
  const awayPower = Math.max(0, away.powers[awayZone] + getModifierDelta("away", awayZone) + archetypeResult.awayDelta);
  const homeDiceFaces = getDiceFacesForSide(home, homeZone, homeIsAttacking);
  const awayDiceFaces = getDiceFacesForSide(away, awayZone, awayIsAttacking);
  const homeDice = params.homeDice ?? rollDicePair(homeDiceFaces);
  const awayDice = params.awayDice ?? rollDicePair(awayDiceFaces);

  const homeResult: ThirdSideResult = {
    dice: homeDice,
    dice_faces: homeDiceFaces,
    participant_id: home.participantId,
    total: homePower + homeDice[0] + homeDice[1],
    zone: homeZone,
    zone_stars: homePower,
  };
  const awayResult: ThirdSideResult = {
    dice: awayDice,
    dice_faces: awayDiceFaces,
    participant_id: away.participantId,
    total: awayPower + awayDice[0] + awayDice[1],
    zone: awayZone,
    zone_stars: awayPower,
  };

  const third: ThirdResult = {
    archetype_effects: archetypeResult.effects,
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

export function getDiceFacesForSide(side: FixtureSideInput, zone: TacticalZone, isAttacking: boolean) {
  if (!isAttacking || zone !== "ATT") {
    return 6;
  }

  const attackingPlayers = getSortedZonePlayers(side, "ATT");

  if (attackingPlayers.some((player) => player.current_stars >= 6)) {
    return 10;
  }

  if (attackingPlayers.some((player) => player.current_stars >= 4)) {
    return 8;
  }

  return 6;
}

function getArchetypeZoneResultForSides(
  attacker: FixtureSideInput,
  defender: FixtureSideInput,
  attackerSide: "away" | "home",
): { awayDelta: number; effects: ArchetypeEffect[]; homeDelta: number } {
  const result = getArchetypeZoneResult(attacker, defender);

  if (attackerSide === "home") {
    return {
      awayDelta: result.defenderDelta,
      effects: result.effects,
      homeDelta: result.attackerDelta,
    };
  }

  return {
    awayDelta: result.attackerDelta,
    effects: result.effects,
    homeDelta: result.defenderDelta,
  };
}

function getArchetypeZoneResult(attacker: FixtureSideInput, defender: FixtureSideInput) {
  const attackingPlayers = getSortedZonePlayers(attacker, "ATT");
  const defendingPlayers = getSortedZonePlayers(defender, "DEF");
  const effects: ArchetypeEffect[] = [];

  if (attackingPlayers.length === 0 || defendingPlayers.length === 0) {
    return { attackerDelta: 0, defenderDelta: 0, effects };
  }

  const pairs: Array<{ attacker?: FixtureZonePlayerInput; defender?: FixtureZonePlayerInput; pair: "best" | "worst" }> = [
    { attacker: attackingPlayers[0], defender: defendingPlayers[0], pair: "best" },
  ];

  if (attackingPlayers.length > 1 && defendingPlayers.length > 1) {
    pairs.push({ attacker: attackingPlayers.at(-1), defender: defendingPlayers.at(-1), pair: "worst" });
  }

  let attackerDelta = 0;
  let defenderDelta = 0;

  for (const pair of pairs) {
    if (!pair.attacker || !pair.defender) continue;

    const winner = compareArchetypes(pair.attacker.attacker_archetype, pair.defender.defender_archetype);
    const pairAttackerDelta = winner === "attacker" ? 1 : winner === "defender" ? -1 : 0;
    const pairDefenderDelta = winner === "defender" ? 1 : winner === "attacker" ? -1 : 0;
    attackerDelta += pairAttackerDelta;
    defenderDelta += pairDefenderDelta;

    effects.push({
      attacker_archetype: pair.attacker.attacker_archetype ?? null,
      attacker_delta: pairAttackerDelta,
      attacker_player_id: pair.attacker.id,
      attacker_player_name: pair.attacker.display_name ?? null,
      defender_archetype: pair.defender.defender_archetype ?? null,
      defender_delta: pairDefenderDelta,
      defender_player_id: pair.defender.id,
      defender_player_name: pair.defender.display_name ?? null,
      pair: pair.pair,
      winner,
    });
  }

  return { attackerDelta, defenderDelta, effects };
}

function getSortedZonePlayers(side: FixtureSideInput, zone: TacticalZone) {
  return (side.zone_players ?? [])
    .filter((player) => player.current_zone === zone)
    .sort((a, b) => {
      const stars = b.current_stars - a.current_stars;
      if (stars !== 0) return stars;
      const slot = Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999);
      if (slot !== 0) return slot;
      return (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id);
    });
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

function rollDicePair(faces: number): DicePair {
  return [rollDie(faces), rollDie(faces)];
}

function rollDie(faces: number) {
  return Math.floor(Math.random() * faces) + 1;
}
