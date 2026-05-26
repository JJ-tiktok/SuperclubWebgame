export type LineupZone = "ATT" | "DEF" | "GK" | "MID";
export type TacticalLineupZone = "ATT" | "DEF" | "MID";

export type LineupPowerPlayer = {
  chemistry_left?: boolean | null;
  chemistry_right?: boolean | null;
  current_stars: number | string;
  current_zone: LineupZone | string;
  injured?: boolean | null;
  lineup_slot?: number | null;
};

export type LineupPowerSummary = {
  ATT: LineupZonePower;
  DEF: LineupZonePower;
  MID: LineupZonePower;
};

export type LineupZonePower = {
  base: number;
  chemistry: number;
  total: number;
};

export function calculateLineupPower(players: LineupPowerPlayer[]): LineupPowerSummary {
  const activePlayers = players
    .filter((player) => !player.injured && isLineupZone(player.current_zone))
    .sort((a, b) => Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999));
  const summary: LineupPowerSummary = {
    ATT: { base: getBaseStars(activePlayers, "ATT"), chemistry: 0, total: 0 },
    DEF: { base: getBaseStars(activePlayers, "DEF") + getBaseStars(activePlayers, "GK"), chemistry: 0, total: 0 },
    MID: { base: getBaseStars(activePlayers, "MID"), chemistry: 0, total: 0 },
  };

  for (const zone of ["ATT", "MID", "DEF"] as const) {
    summary[zone].chemistry += getAdjacentChemistryLinks(getZonePlayers(activePlayers, zone));
  }

  summary.DEF.chemistry += getGoalkeeperChemistryLinks(activePlayers);

  for (const zone of ["ATT", "DEF", "MID"] as const) {
    summary[zone].total = summary[zone].base + summary[zone].chemistry;
  }

  return summary;
}

function getBaseStars(players: LineupPowerPlayer[], zone: LineupZone) {
  return getZonePlayers(players, zone).reduce((total, player) => total + Number(player.current_stars), 0);
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
