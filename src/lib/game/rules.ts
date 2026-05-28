import {
  type Auction,
  type AuctionBid,
  type Club,
  type ClubPlayer,
  type ClubStatus,
  FORMATIONS,
  type Formation,
  type InvestmentAction,
  type Lineup,
  type MatchEvent,
  type MatchResult,
  type MatchThird,
  type Money,
  type PlayerCard,
  type PlayerPosition,
  type ScoutingCapacity,
  type SeasonResult,
  type TacticalZone,
  type TrainingCapacity,
  type ZonePowerBreakdown,
} from "./types";

const MILLION = 1_000_000;

export const DRAFT_SQUAD_SIZE = 16;
export const MAX_SQUAD_SIZE = 23;

export const PHASE_LABELS: Record<string, string> = {
  lobby: "Lobby",
  draft: "Draft",
  off_season: "Off-Season",
  offseason_finance: "Offseason: Finanzen",
  offseason_training: "Offseason: Training",
  offseason_scouting: "Offseason: Scouting",
  offseason_investments: "Offseason: Investments",
  deadline_day: "Deadline Day",
  season: "Saison",
  prematch: "Taktik",
  match: "Matchday",
  season_end: "Saisonende",
  completed: "Abgeschlossen",
};

export const FORMATION_COUNTS: Record<Formation, Record<TacticalZone, number>> = {
  "3-3-4": { DEF: 3, MID: 3, ATT: 4 },
  "3-4-3": { DEF: 3, MID: 4, ATT: 3 },
  "3-5-2": { DEF: 3, MID: 5, ATT: 2 },
  "4-3-3": { DEF: 4, MID: 3, ATT: 3 },
  "4-4-2": { DEF: 4, MID: 4, ATT: 2 },
};

export const INVESTMENT_COSTS: Record<Exclude<InvestmentAction, "staff">, Money[]> = {
  training: [0, 15 * MILLION, 30 * MILLION, 60 * MILLION],
  scouting: [0, 15 * MILLION, 30 * MILLION, 60 * MILLION],
  stadium: [0, 20 * MILLION, 40 * MILLION, 80 * MILLION],
};

export const TRAINING_CAPACITY: Record<number, TrainingCapacity> = {
  1: { players: 1, maxStarsPerPlayer: 1, guaranteedStarForPlayers: 0 },
  2: { players: 2, maxStarsPerPlayer: 2, guaranteedStarForPlayers: 0 },
  3: { players: 3, maxStarsPerPlayer: 3, guaranteedStarForPlayers: 0 },
  4: { players: 4, maxStarsPerPlayer: 4, guaranteedStarForPlayers: 1 },
};

export const SCOUTING_CAPACITY: Record<number, ScoutingCapacity> = {
  1: { players: 1 },
  2: { players: 2 },
  3: { players: 3 },
  4: { players: 5 },
};

export const PLACEMENT_REWARDS: Record<number, Money> = {
  1: 100 * MILLION,
  2: 90 * MILLION,
  3: 80 * MILLION,
  4: 70 * MILLION,
  5: 60 * MILLION,
  6: 50 * MILLION,
};

export const STADIUM_INCOME: Record<number, Record<ClubStatus, Money>> = {
  1: {
    newly_promoted: 20 * MILLION,
    established: 30 * MILLION,
    mid_table: 40 * MILLION,
    title_contender: 50 * MILLION,
  },
  2: {
    newly_promoted: 30 * MILLION,
    established: 45 * MILLION,
    mid_table: 60 * MILLION,
    title_contender: 75 * MILLION,
  },
  3: {
    newly_promoted: 40 * MILLION,
    established: 60 * MILLION,
    mid_table: 80 * MILLION,
    title_contender: 100 * MILLION,
  },
  4: {
    newly_promoted: 60 * MILLION,
    established: 85 * MILLION,
    mid_table: 110 * MILLION,
    title_contender: 140 * MILLION,
  },
};

export type DraftTurn = {
  clubId: string;
  pickIndex: number;
  roundIndex: number;
};

export type FinanceSummary = {
  placementReward: Money;
  stadiumIncome: Money;
  wages: Money;
  net: Money;
};

export type ManagerScoreBand = {
  attractivenessStars: number;
  status: ClubStatus;
};

export function money(value: Money) {
  return `${Math.round(value / MILLION)}M`;
}

export function clampLevel(level: number) {
  return Math.min(Math.max(Math.trunc(level), 1), 4);
}

export function getDraftPickOrder(clubIds: string[], roundIndex: number, boardSize = 16) {
  if (clubIds.length === 0) {
    return [];
  }

  const startIndex = roundIndex % clubIds.length;
  return Array.from({ length: boardSize }, (_, pickIndex) => {
    const offset = (startIndex + pickIndex) % clubIds.length;
    return clubIds[offset];
  });
}

export function getCurrentDraftTurn(
  clubIds: string[],
  roundIndex: number,
  completedPicks: number,
  boardSize = 16,
): DraftTurn | undefined {
  const pickOrder = getDraftPickOrder(clubIds, roundIndex, boardSize);
  const clubId = pickOrder[completedPicks];

  if (!clubId) {
    return undefined;
  }

  return { clubId, pickIndex: completedPicks, roundIndex };
}

export function canDraftPlayer(params: {
  clubId: string;
  playerId: string;
  boardPlayerIds: string[];
  ownedPlayers: ClubPlayer[];
  maxDraftStars: number;
  playerCatalog: Record<string, PlayerCard>;
}) {
  const { clubId, playerId, boardPlayerIds, ownedPlayers, maxDraftStars, playerCatalog } = params;
  const player = playerCatalog[playerId];

  if (!player) {
    return { ok: false, reason: "player_not_found" } as const;
  }

  if (!boardPlayerIds.includes(playerId)) {
    return { ok: false, reason: "player_not_on_board" } as const;
  }

  if (player.baseStars > maxDraftStars) {
    return { ok: false, reason: "draft_star_cap" } as const;
  }

  const clubSquadSize = ownedPlayers.filter((owned) => owned.clubId === clubId).length;
  if (clubSquadSize >= DRAFT_SQUAD_SIZE) {
    return { ok: false, reason: "draft_squad_full" } as const;
  }

  const alreadyOwned = ownedPlayers.some((owned) => owned.playerId === playerId);
  if (alreadyOwned) {
    return { ok: false, reason: "player_already_owned" } as const;
  }

  return { ok: true } as const;
}

export function calculateSquadStars(
  clubId: string,
  clubPlayers: ClubPlayer[],
  playerCatalog: Record<string, PlayerCard>,
) {
  return clubPlayers
    .filter((owned) => owned.clubId === clubId)
    .reduce((total, owned) => {
      const card = playerCatalog[owned.playerId];
      if (!card) {
        return total;
      }
      return total + owned.currentStars;
    }, 0);
}

export function getPlacementReward(rank: number, clubCount: number) {
  if (rank > clubCount) {
    return 0;
  }

  return PLACEMENT_REWARDS[rank] ?? 0;
}

export function getStadiumIncome(level: number, status: ClubStatus) {
  return STADIUM_INCOME[clampLevel(level)][status];
}

export function calculateManagerScore(squadStars: number, seasonMatchPoints: number) {
  return Math.trunc(Number(squadStars) + Number(seasonMatchPoints));
}

export function getManagerScoreBand(score: number): ManagerScoreBand {
  const normalizedScore = Math.trunc(Number(score));

  if (normalizedScore >= 80) {
    return { attractivenessStars: 6, status: "title_contender" };
  }

  if (normalizedScore >= 60) {
    return { attractivenessStars: 5, status: "mid_table" };
  }

  if (normalizedScore >= 40) {
    return { attractivenessStars: 4, status: "established" };
  }

  return { attractivenessStars: 3, status: "newly_promoted" };
}

export function getWages(
  clubId: string,
  clubPlayers: ClubPlayer[],
  playerCatalog: Record<string, PlayerCard>,
  club?: Club,
) {
  const squadStars = calculateSquadStars(clubId, clubPlayers, playerCatalog);
  const effects = club?.staff.flatMap((staff) => staff.effects) ?? [];

  const discount = effects
    .filter((e) => e.type === "wage_discount")
    .reduce((total, e) => total + (e as { type: "wage_discount"; amountPerStar: number }).amountPerStar, 0);

  const multiplier = effects
    .filter((e) => e.type === "wage_multiplier")
    .reduce((min, e) => Math.min(min, (e as { type: "wage_multiplier"; factor: number }).factor), 1);

  const wagePerStar = Math.max(0, MILLION - discount);

  return Math.round(squadStars * wagePerStar * multiplier);
}

export function applyStatusTierUp(status: ClubStatus, tiers: number): ClubStatus {
  const ORDER: ClubStatus[] = ["newly_promoted", "established", "mid_table", "title_contender"];
  const idx = Math.min(ORDER.length - 1, ORDER.indexOf(status) + tiers);
  return ORDER[idx];
}

export function getEffectiveStatus(club: Club): ClubStatus {
  const tierUp = club.staff
    .flatMap((s) => s.effects)
    .filter((e) => e.type === "status_tier_up")
    .reduce((sum, e) => sum + (e as { type: "status_tier_up"; tiers: number }).tiers, 0);
  return applyStatusTierUp(club.status, tierUp);
}

export function getStaffSeasonIncomeBonus(club: Club): number {
  return club.staff
    .flatMap((s) => s.effects)
    .filter((e) => e.type === "season_income_bonus")
    .reduce((sum, e) => sum + (e as { type: "season_income_bonus"; amount: number }).amount, 0);
}

export function getStaffAttractivenessBonus(club: Club): number {
  return club.staff
    .flatMap((s) => s.effects)
    .filter((e) => e.type === "attractiveness_bonus")
    .reduce((sum, e) => sum + (e as { type: "attractiveness_bonus"; stars: number }).stars, 0);
}

export function getFinanceSummary(params: {
  club: Club;
  clubCount: number;
  clubPlayers: ClubPlayer[];
  playerCatalog: Record<string, PlayerCard>;
}): FinanceSummary {
  const { club, clubCount, clubPlayers, playerCatalog } = params;
  const placementReward = getPlacementReward(club.seasonRank, clubCount);
  const stadiumIncome = getStadiumIncome(club.investments.stadium, club.status);
  const wages = getWages(club.id, clubPlayers, playerCatalog, club);
  const net = placementReward + stadiumIncome - wages;

  return { placementReward, stadiumIncome, wages, net };
}

export function getTrainingCapacity(level: number) {
  return TRAINING_CAPACITY[clampLevel(level)];
}

export function getScoutingCapacity(level: number) {
  return SCOUTING_CAPACITY[clampLevel(level)];
}

export function canTrainPlayer(owned: ClubPlayer, card: PlayerCard, starsToAdd: number) {
  if (owned.injured) {
    return { ok: false, reason: "player_injured" } as const;
  }

  if (starsToAdd <= 0) {
    return { ok: false, reason: "invalid_training_amount" } as const;
  }

  const maxStars = card.baseStars + card.potentialStars;
  if (owned.currentStars + starsToAdd > maxStars) {
    return { ok: false, reason: "potential_exceeded" } as const;
  }

  return { ok: true } as const;
}

export function canUpgradeInvestment(club: Club, action: InvestmentAction, actionsThisOffseason: InvestmentAction[]) {
  if (actionsThisOffseason.length >= 2) {
    return { ok: false, reason: "investment_action_limit" } as const;
  }

  if (actionsThisOffseason.includes(action)) {
    return { ok: false, reason: "same_department_twice" } as const;
  }

  if (action === "staff") {
    if (club.staff.length >= 3) {
      return { ok: false, reason: "staff_limit" } as const;
    }
    return { ok: true, cost: 0 } as const;
  }

  const currentLevel = clampLevel(club.investments[action]);
  if (currentLevel >= 4) {
    return { ok: false, reason: "max_level" } as const;
  }

  const cost = INVESTMENT_COSTS[action][currentLevel];
  if (club.money < cost) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  return { ok: true, cost } as const;
}

export function validateFormation(lineup: Lineup) {
  if (!FORMATIONS.includes(lineup.formation)) {
    return { ok: false, reason: "illegal_formation" } as const;
  }

  if (lineup.starters.GK.length !== 1) {
    return { ok: false, reason: "exactly_one_goalkeeper_required" } as const;
  }

  const counts = FORMATION_COUNTS[lineup.formation];
  for (const zone of ["DEF", "MID", "ATT"] as const) {
    if (lineup.starters[zone].length !== counts[zone]) {
      return { ok: false, reason: `invalid_${zone.toLowerCase()}_count` } as const;
    }
  }

  const allPlayerIds = [
    ...lineup.starters.GK,
    ...lineup.starters.DEF,
    ...lineup.starters.MID,
    ...lineup.starters.ATT,
    ...lineup.bench,
  ];

  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    return { ok: false, reason: "duplicate_player_assignment" } as const;
  }

  return { ok: true } as const;
}

export function positionPenalty(position: PlayerPosition, zone: TacticalZone | "GK") {
  if (position === "GK") {
    return zone === "GK" || zone === "DEF" ? 0 : Number.POSITIVE_INFINITY;
  }

  if (position === zone) {
    return 0;
  }

  if (position === "MID" && (zone === "DEF" || zone === "ATT")) {
    return 0.5;
  }

  if ((position === "DEF" && zone === "MID") || (position === "ATT" && zone === "MID")) {
    return 0.5;
  }

  return 1;
}

export function effectivePlayerStars(card: PlayerCard, owned: ClubPlayer, zone: TacticalZone | "GK") {
  const penalty = positionPenalty(card.position, zone);

  if (!Number.isFinite(penalty)) {
    return 0;
  }

  return Math.max(0, owned.currentStars - penalty);
}

export function getZonePlayerIds(lineup: Lineup, zone: TacticalZone) {
  if (zone === "DEF") {
    return [...lineup.starters.GK, ...lineup.starters.DEF];
  }

  return lineup.starters[zone];
}

export function calculateChemistryBonus(playerIds: string[], playerCatalog: Record<string, PlayerCard>) {
  const sides = playerIds.reduce(
    (counts, playerId) => {
      const chemistry = playerCatalog[playerId]?.chemistry ?? "none";
      if (chemistry === "left" || chemistry === "both") {
        counts.left += 1;
      }
      if (chemistry === "right" || chemistry === "both") {
        counts.right += 1;
      }
      return counts;
    },
    { left: 0, right: 0 },
  );

  return Math.min(sides.left, sides.right);
}

export function calculateZonePower(params: {
  club: Club;
  lineup: Lineup;
  zone: TacticalZone;
  clubPlayers: ClubPlayer[];
  playerCatalog: Record<string, PlayerCard>;
  dice: [number, number];
}) {
  const { club, lineup, zone, clubPlayers, playerCatalog, dice } = params;
  const clubPlayerByPlayerId = Object.fromEntries(
    clubPlayers.filter((owned) => owned.clubId === club.id).map((owned) => [owned.playerId, owned]),
  );
  const playerIds = getZonePlayerIds(lineup, zone);
  const baseStars = playerIds.reduce((total, playerId) => {
    const card = playerCatalog[playerId];
    const owned = clubPlayerByPlayerId[playerId];
    if (!card || !owned) {
      return total;
    }
    const tacticalZone = lineup.starters.GK.includes(playerId) ? "GK" : zone;
    return total + effectivePlayerStars(card, owned, tacticalZone);
  }, 0);
  const allEffects = club.staff.flatMap((staff) => staff.effects);

  const chemistryRawBonus = calculateChemistryBonus(playerIds, playerCatalog);
  const chemistryMultiplier = allEffects
    .filter((e) => e.type === "chemistry_multiplier")
    .reduce((best, e) => Math.max(best, (e as { type: "chemistry_multiplier"; factor: number }).factor), 1);
  const chemistryBonus = Math.floor(chemistryRawBonus * chemistryMultiplier);

  const captainBoostBase = lineup.captainBoostZone === zone && club.captainBoostRank ? club.captainBoostRank : 0;
  const captainBoostExtra = lineup.captainBoostZone === zone
    ? allEffects.filter((e) => e.type === "captain_boost_extra").reduce((sum, e) => sum + (e as { type: "captain_boost_extra"; stars: number }).stars, 0)
    : 0;
  const captainBoost = captainBoostBase + captainBoostExtra;

  const staffBonus = allEffects.reduce((total, effect) => {
    if (effect.type === "zone_bonus" && effect.zone === zone) return total + effect.stars;
    if (effect.type === "dice_zone_bonus" && zone !== ("GK" as string)) return total + (effect as { type: "dice_zone_bonus"; stars: number }).stars;
    return total;
  }, 0);

  const total = baseStars + chemistryBonus + captainBoost + staffBonus + dice[0] + dice[1];

  return {
    clubId: club.id,
    zone,
    baseStars,
    chemistryBonus: chemistryBonus,
    captainBoost,
    staffBonus,
    dice,
    total,
  } satisfies ZonePowerBreakdown;
}

export function resolveAuction(auction: Auction, clubs: Club[], clubPlayers: ClubPlayer[], playerCatalog: Record<string, PlayerCard>) {
  const validBids = auction.bids.filter((bid) => bid.locked && bid.amount >= auction.minimumBid);

  if (validBids.length === 0) {
    return { ...auction, status: "passed", winningClubId: undefined } satisfies Auction;
  }

  const bidsByAmount = [...validBids].sort((a, b) => b.amount - a.amount);
  const topAmount = bidsByAmount[0].amount;
  const tiedBids = bidsByAmount.filter((bid) => bid.amount === topAmount);

  if (tiedBids.length === 1) {
    return { ...auction, status: "resolved", winningClubId: tiedBids[0].clubId } satisfies Auction;
  }

  const winningBid = tiedBids
    .map((bid) => ({
      bid,
      squadStars:
        calculateSquadStars(bid.clubId, clubPlayers, playerCatalog) +
        (clubs
          .find((club) => club.id === bid.clubId)
          ?.staff.flatMap((staff) => staff.effects)
          .reduce((total, effect) => {
            if (effect.type !== "auction_tiebreak") {
              return total;
            }

            return total + effect.stars;
          }, 0) ?? 0),
    }))
    .sort((a, b) => b.squadStars - a.squadStars)[0].bid;

  return { ...auction, status: "resolved", winningClubId: winningBid.clubId } satisfies Auction;
}

export function resolveMatch(params: {
  homeClub: Club;
  awayClub: Club;
  homeLineup: Lineup;
  awayLineup: Lineup;
  clubPlayers: ClubPlayer[];
  playerCatalog: Record<string, PlayerCard>;
  diceRolls: [number, number][];
}) {
  const { homeClub, awayClub, homeLineup, awayLineup, clubPlayers, playerCatalog } = params;
  const diceRolls = params.diceRolls.length >= 6 ? params.diceRolls : padDiceRolls(params.diceRolls);
  const events: MatchEvent[] = [];
  const thirds: MatchThird[] = [];
  let rollIndex = 0;

  const midfieldThird = compareZones({
    index: 1,
    label: "midfield",
    homeClub,
    awayClub,
    homeLineup,
    awayLineup,
    homeZone: "MID",
    awayZone: "MID",
    clubPlayers,
    playerCatalog,
    homeDice: diceRolls[rollIndex++],
    awayDice: diceRolls[rollIndex++],
  });
  thirds.push(midfieldThird);
  events.push(...getDoubleDiceEvents(midfieldThird, homeLineup, awayLineup));

  const secondAttackerId = midfieldThird.winnerClubId ?? homeClub.id;
  const secondThird = compareAttack({
    index: 2,
    attackingClubId: secondAttackerId,
    homeClub,
    awayClub,
    homeLineup,
    awayLineup,
    clubPlayers,
    playerCatalog,
    attackerDice: diceRolls[rollIndex++],
    defenderDice: diceRolls[rollIndex++],
  });
  thirds.push(secondThird);
  events.push(...getDoubleDiceEvents(secondThird, homeLineup, awayLineup));

  const firstTwoWinners = thirds.map((third) => third.winnerClubId).filter(Boolean);
  if (firstTwoWinners.length === 2 && firstTwoWinners[0] === firstTwoWinners[1]) {
    return buildMatchResult(homeClub.id, awayClub.id, thirds, events);
  }

  const thirdAttackerId = secondAttackerId === homeClub.id ? awayClub.id : homeClub.id;
  const third = compareAttack({
    index: 3,
    attackingClubId: thirdAttackerId,
    homeClub,
    awayClub,
    homeLineup,
    awayLineup,
    clubPlayers,
    playerCatalog,
    attackerDice: diceRolls[rollIndex++],
    defenderDice: diceRolls[rollIndex++],
  });
  thirds.push(third);
  events.push(...getDoubleDiceEvents(third, homeLineup, awayLineup));

  return buildMatchResult(homeClub.id, awayClub.id, thirds, events);
}

function compareZones(params: {
  index: number;
  label: "midfield";
  homeClub: Club;
  awayClub: Club;
  homeLineup: Lineup;
  awayLineup: Lineup;
  homeZone: TacticalZone;
  awayZone: TacticalZone;
  clubPlayers: ClubPlayer[];
  playerCatalog: Record<string, PlayerCard>;
  homeDice: [number, number];
  awayDice: [number, number];
}): MatchThird {
  const home = calculateZonePower({
    club: params.homeClub,
    lineup: params.homeLineup,
    zone: params.homeZone,
    clubPlayers: params.clubPlayers,
    playerCatalog: params.playerCatalog,
    dice: params.homeDice,
  });
  const away = calculateZonePower({
    club: params.awayClub,
    lineup: params.awayLineup,
    zone: params.awayZone,
    clubPlayers: params.clubPlayers,
    playerCatalog: params.playerCatalog,
    dice: params.awayDice,
  });

  return {
    index: params.index,
    label: params.label,
    home,
    away,
    winnerClubId: getPowerWinner(home, away),
  };
}

function compareAttack(params: {
  index: number;
  attackingClubId: string;
  homeClub: Club;
  awayClub: Club;
  homeLineup: Lineup;
  awayLineup: Lineup;
  clubPlayers: ClubPlayer[];
  playerCatalog: Record<string, PlayerCard>;
  attackerDice: [number, number];
  defenderDice: [number, number];
}): MatchThird {
  const homeAttacks = params.attackingClubId === params.homeClub.id;
  const homeZone = homeAttacks ? "ATT" : "DEF";
  const awayZone = homeAttacks ? "DEF" : "ATT";

  const compared = compareZones({
    index: params.index,
    label: "midfield",
    homeClub: params.homeClub,
    awayClub: params.awayClub,
    homeLineup: params.homeLineup,
    awayLineup: params.awayLineup,
    homeZone,
    awayZone,
    clubPlayers: params.clubPlayers,
    playerCatalog: params.playerCatalog,
    homeDice: homeAttacks ? params.attackerDice : params.defenderDice,
    awayDice: homeAttacks ? params.defenderDice : params.attackerDice,
  });

  return {
    ...compared,
    label: homeAttacks ? "home_attack" : "away_attack",
    attackingClubId: params.attackingClubId,
  };
}

function getPowerWinner(home: ZonePowerBreakdown, away: ZonePowerBreakdown) {
  if (home.total === away.total) {
    return undefined;
  }

  return home.total > away.total ? home.clubId : away.clubId;
}

function buildMatchResult(homeClubId: string, awayClubId: string, thirds: MatchThird[], events: MatchEvent[]) {
  const thirdScore = thirds.reduce(
    (score, third) => {
      if (!third.winnerClubId) {
        score[homeClubId] += 0.5;
        score[awayClubId] += 0.5;
        return score;
      }

      score[third.winnerClubId] += 1;
      return score;
    },
    { [homeClubId]: 0, [awayClubId]: 0 } as Record<string, number>,
  );
  const winnerClubId =
    thirdScore[homeClubId] === thirdScore[awayClubId]
      ? undefined
      : thirdScore[homeClubId] > thirdScore[awayClubId]
        ? homeClubId
        : awayClubId;

  return {
    homeClubId,
    awayClubId,
    thirds,
    events,
    winnerClubId,
    points: {
      [homeClubId]: winnerClubId ? (winnerClubId === homeClubId ? 6 : 0) : 2,
      [awayClubId]: winnerClubId ? (winnerClubId === awayClubId ? 6 : 0) : 2,
    },
  } satisfies MatchResult;
}

function getDoubleDiceEvents(third: MatchThird, homeLineup: Lineup, awayLineup: Lineup): MatchEvent[] {
  return [
    getDoubleDiceEvent(third.home.clubId, third.index, third.home.dice, homeLineup),
    getDoubleDiceEvent(third.away.clubId, third.index, third.away.dice, awayLineup),
  ].filter((event): event is MatchEvent => Boolean(event));
}

function getDoubleDiceEvent(clubId: string, thirdIndex: number, dice: [number, number], lineup: Lineup) {
  if (dice[0] !== dice[1]) {
    return undefined;
  }

  const orderedStarters = [
    ...lineup.starters.GK,
    ...lineup.starters.DEF,
    ...lineup.starters.MID,
    ...lineup.starters.ATT,
  ];
  const playerId = orderedStarters[dice[0] - 1];

  if (!playerId) {
    return { type: "game_changer", clubId, thirdIndex, dice } satisfies MatchEvent;
  }

  return { type: "injury", clubId, playerId, thirdIndex, dice } satisfies MatchEvent;
}

function padDiceRolls(diceRolls: [number, number][]) {
  const padded = [...diceRolls];
  const fallback: [number, number][] = [
    [3, 4],
    [2, 5],
    [6, 1],
    [4, 3],
    [5, 2],
    [1, 6],
  ];

  while (padded.length < 6) {
    padded.push(fallback[padded.length]);
  }

  return padded;
}

export function checkSeasonResult(clubs: Club[]): SeasonResult {
  const sorted = [...clubs].sort((a, b) => b.points - a.points);
  const clubsAt100 = sorted.filter((club) => club.points >= 100);

  if (clubsAt100.length === 1) {
    return {
      completed: true,
      needsCupFinal: false,
      championClubId: clubsAt100[0].id,
      reason: "100_points",
    };
  }

  if (clubsAt100.length > 1) {
    return {
      completed: false,
      needsCupFinal: true,
      championClubId: clubsAt100[0].id,
      reason: "super_duper_cup_required",
    };
  }

  const superCupCandidate = sorted.find((club) => club.superCupCards >= 3);
  if (superCupCandidate) {
    return {
      completed: false,
      needsCupFinal: true,
      championClubId: superCupCandidate.id,
      reason: "supercup_available",
    };
  }

  return {
    completed: false,
    needsCupFinal: false,
    championClubId: sorted[0]?.id,
    reason: "continue_next_offseason",
  };
}

export function rankToStatus(rank: number, clubCount: number): ClubStatus {
  if (rank === 1) {
    return "title_contender";
  }

  if (rank <= Math.ceil(clubCount / 2)) {
    return "mid_table";
  }

  if (rank < clubCount) {
    return "established";
  }

  return "newly_promoted";
}

export function normalizeBid(bid: AuctionBid) {
  return { ...bid, amount: Math.max(0, Math.trunc(bid.amount / MILLION) * MILLION) };
}
