import { applyPositionPenalty, getPositionPenalty } from "@/lib/lobby/position-penalty";

export type LineupZone = "ATT" | "DEF" | "GK" | "MID";
export type TacticalLineupZone = "ATT" | "DEF" | "MID";

export type LineupPowerPlayer = {
  /** club_players.id — needed to apply the captain boost to a specific player */
  id?: string | null;
  chemistry_left?: boolean | null;
  chemistry_right?: boolean | null;
  current_stars: number | string;
  current_zone: LineupZone | string;
  injured?: boolean | null;
  lineup_slot?: number | null;
  /** Primary DB position (single string) */
  position?: string | null;
  /** All eligible positions — takes precedence over `position` when present */
  positions?: string[] | null;
};

export type CaptainBoost = {
  clubPlayerId: string;
  boost: number;
};

export type LineupPowerSummary = {
  ATT: LineupZonePower;
  DEF: LineupZonePower;
  MID: LineupZonePower;
};

export type LineupZonePower = {
  base: number;
  chemistry: number;
  staffBonus: number;
  total: number;
};

export type StaffEffectInput = {
  type: string;
  zone?: string;
  stars?: number;
  cards?: number;
  players?: number;
  factor?: number;
  extra?: number;
  amount?: number;
  tiers?: number;
  threshold?: number;
  perMatchday?: number;
};

export function getCaptainBoostExtra(staffEffects: StaffEffectInput[] = []): number {
  return staffEffects
    .filter((effect) => effect.type === "captain_boost_extra")
    .reduce((sum, effect) => sum + (effect.stars ?? 0), 0);
}

export function resolveEffectiveCaptainBoost(
  captain: CaptainBoost | null,
  staffEffects: StaffEffectInput[] = [],
  activePlayerIds?: Iterable<string | null | undefined>,
): CaptainBoost | null {
  if (!captain?.clubPlayerId) {
    return null;
  }

  const activeIds = activePlayerIds ? new Set(activePlayerIds) : null;
  if (activeIds && !activeIds.has(captain.clubPlayerId)) {
    return null;
  }

  const boost = Math.max(0, Math.trunc(Number(captain.boost))) + getCaptainBoostExtra(staffEffects);
  if (boost <= 0) {
    return null;
  }

  return { clubPlayerId: captain.clubPlayerId, boost };
}

export function calculateLineupPower(
  players: LineupPowerPlayer[],
  staffEffects: StaffEffectInput[] = [],
  captain: CaptainBoost | null = null,
): LineupPowerSummary {
  const activePlayers = players
    .filter((player) => !player.injured && isLineupZone(player.current_zone))
    .sort((a, b) => Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999));

  const captainBoost = resolveEffectiveCaptainBoost(
    captain,
    staffEffects,
    activePlayers.map((player) => player.id),
  );

  const diceZoneBonus = staffEffects
    .filter((e) => e.type === "dice_zone_bonus")
    .reduce((sum, e) => sum + (e.stars ?? 0), 0);

  const staffBonusForZone = (zone: "ATT" | "DEF" | "MID"): number => {
    const zoneBonus = staffEffects
      .filter((e) => e.type === "zone_bonus" && e.zone === zone)
      .reduce((sum, e) => sum + (e.stars ?? 0), 0);
    return zoneBonus + diceZoneBonus;
  };

  const summary: LineupPowerSummary = {
    ATT: { base: getBaseStars(activePlayers, "ATT", captainBoost), chemistry: 0, staffBonus: staffBonusForZone("ATT"), total: 0 },
    DEF: { base: getBaseStars(activePlayers, "DEF", captainBoost) + getBaseStars(activePlayers, "GK", captainBoost), chemistry: 0, staffBonus: staffBonusForZone("DEF"), total: 0 },
    MID: { base: getBaseStars(activePlayers, "MID", captainBoost), chemistry: 0, staffBonus: staffBonusForZone("MID"), total: 0 },
  };

  const chemistryMultiplier = staffEffects
    .filter((e) => e.type === "chemistry_multiplier")
    .reduce((best, e) => Math.max(best, e.factor ?? 1), 1);

  for (const zone of ["ATT", "MID", "DEF"] as const) {
    const rawLinks = getAdjacentChemistryLinks(getZonePlayers(activePlayers, zone));
    summary[zone].chemistry += Math.floor(rawLinks * chemistryMultiplier);
  }

  const rawGkLinks = getGoalkeeperChemistryLinks(activePlayers);
  summary.DEF.chemistry += Math.floor(rawGkLinks * chemistryMultiplier);

  for (const zone of ["ATT", "DEF", "MID"] as const) {
    summary[zone].total = summary[zone].base + summary[zone].chemistry + summary[zone].staffBonus;
  }

  return summary;
}

function getBaseStars(players: LineupPowerPlayer[], zone: LineupZone, captain: CaptainBoost | null = null) {
  return getZonePlayers(players, zone).reduce((total, player) => {
    const raw = Number(player.current_stars);
    // Prefer the full eligible-positions array; fall back to single position string
    const naturalPositions: string | string[] =
      player.positions?.length ? player.positions : (player.position ?? zone);
    const penalty = getPositionPenalty(naturalPositions, zone);
    const captainBonus = captain && player.id === captain.clubPlayerId ? captain.boost : 0;
    return total + applyPositionPenalty(raw, penalty) + captainBonus;
  }, 0);
}

function getZonePlayers(players: LineupPowerPlayer[], zone: LineupZone) {
  return players
    .filter((player) => player.current_zone === zone)
    .sort((a, b) => Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999));
}

function getAdjacentChemistryLinks(players: LineupPowerPlayer[]) {
  let links = 0;

  for (let index = 0; index < players.length - 1; index += 1) {
    const left = players[index];
    const right = players[index + 1];

    if (left.chemistry_right && right.chemistry_left) {
      links += 1;
    }
  }

  return links;
}

function getGoalkeeperChemistryLinks(players: LineupPowerPlayer[]) {
  const goalkeeper = getZonePlayers(players, "GK")[0];
  const defenders = getZonePlayers(players, "DEF");

  if (!goalkeeper || defenders.length === 0) {
    return 0;
  }

  let links = 0;
  const leftDefender = getNearestDefenderBySide(defenders, "left");
  const rightDefender = getNearestDefenderBySide(defenders, "right");

  if (leftDefender && goalkeeper.chemistry_left && leftDefender.chemistry_right) {
    links += 1;
  }

  if (rightDefender && goalkeeper.chemistry_right && rightDefender.chemistry_left) {
    links += 1;
  }

  return links;
}

function getNearestDefenderBySide(defenders: LineupPowerPlayer[], side: "left" | "right") {
  const count = defenders.length;
  const withX = defenders.map((player, index) => ({
    player,
    x: ((index + 1) / (count + 1)) * 100,
  }));

  return withX
    .filter((item) => (side === "left" ? item.x < 50 : item.x > 50))
    .sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50))[0]?.player;
}

function isLineupZone(value: string): value is LineupZone {
  return value === "ATT" || value === "DEF" || value === "GK" || value === "MID";
}
