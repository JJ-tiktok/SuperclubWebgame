import { computePlayerMarketValues } from "@/lib/lobby/player-market";
import type { Club, ClubPlayer, Lineup, PlayerCard, StaffCard } from "./types";

const MILLION = 1_000_000;

const positions = ["GK", "DEF", "MID", "ATT"] as const;
const chemistry = ["none", "left", "right", "both"] as const;
const regions = ["Europe", "Asia", "Africa", "South America", "North America", "Oceania"];

export const samplePlayers: PlayerCard[] = Array.from({ length: 80 }, (_, index) => {
  const position = positions[index % positions.length];
  const baseStars = (index % 6) + 1;
  const potentialStars = index % 4 === 0 ? 2 : index % 3 === 0 ? 1 : 0;
  const market = computePlayerMarketValues({ baseStars, potentialStars, stars: baseStars });

  return {
    id: `player-${String(index + 1).padStart(2, "0")}`,
    name: `${position} Prospect ${String(index + 1).padStart(2, "0")}`,
    position,
    baseStars,
    potentialStars,
    chemistry: chemistry[index % chemistry.length],
    scoutingPrice: market.scoutingPrice,
    minimumBid: market.minimumBid,
    region: regions[index % regions.length],
    visibility: "room",
  };
});

export const sampleStaff: StaffCard[] = [
  {
    id: "staff-zone-defense",
    name: "Defensive Analyst",
    price: 18 * MILLION,
    effects: [{ type: "zone_bonus", zone: "DEF", stars: 1 }],
  },
  {
    id: "staff-scout",
    name: "Regional Scout Lead",
    price: 16 * MILLION,
    effects: [{ type: "scouting_discount", amount: 4 * MILLION }],
  },
  {
    id: "staff-wages",
    name: "Finance Director",
    price: 20 * MILLION,
    effects: [{ type: "wage_discount", amountPerStar: 100_000 }],
  },
];

export const sampleClubs: Club[] = [
  {
    id: "club-red",
    gameId: "game-demo",
    name: "Red Valley",
    managerName: "Manager 1",
    color: "rose",
    money: 120 * MILLION,
    points: 46,
    seasonRank: 1,
    status: "title_contender",
    investments: { training: 2, scouting: 2, stadium: 2 },
    staff: [sampleStaff[0]],
    superCupCards: 1,
    captainBoostRank: 1,
  },
  {
    id: "club-blue",
    gameId: "game-demo",
    name: "Blue Harbour",
    managerName: "Manager 2",
    color: "sky",
    money: 102 * MILLION,
    points: 42,
    seasonRank: 2,
    status: "mid_table",
    investments: { training: 1, scouting: 3, stadium: 1 },
    staff: [sampleStaff[1]],
    superCupCards: 0,
    captainBoostRank: 2,
  },
  {
    id: "club-green",
    gameId: "game-demo",
    name: "Green Town",
    managerName: "Manager 3",
    color: "emerald",
    money: 90 * MILLION,
    points: 34,
    seasonRank: 3,
    status: "established",
    investments: { training: 3, scouting: 1, stadium: 2 },
    staff: [],
    superCupCards: 0,
    captainBoostRank: 3,
  },
  {
    id: "club-amber",
    gameId: "game-demo",
    name: "Amber United",
    managerName: "Manager 4",
    color: "amber",
    money: 78 * MILLION,
    points: 28,
    seasonRank: 4,
    status: "newly_promoted",
    investments: { training: 1, scouting: 1, stadium: 1 },
    staff: [sampleStaff[2]],
    superCupCards: 0,
    captainBoostRank: 4,
  },
];

export const sampleClubPlayers: ClubPlayer[] = sampleClubs.flatMap((club, clubIndex) =>
  samplePlayers.slice(clubIndex * 16, clubIndex * 16 + 16).map((player, index) => ({
    id: `${club.id}-${player.id}`,
    clubId: club.id,
    playerId: player.id,
    currentStars: player.baseStars + (index % 7 === 0 && player.potentialStars > 0 ? 1 : 0),
    currentZone: index === 0 ? "GK" : index < 5 ? "DEF" : index < 10 ? "MID" : index < 14 ? "ATT" : "bench",
    injured: index === 15 && clubIndex === 1,
    lineupSlot: index + 1,
  })),
);

function lineupForClub(clubId: string, formation: Lineup["formation"], captainBoostZone: Lineup["captainBoostZone"]): Lineup {
  const squad = sampleClubPlayers.filter((owned) => owned.clubId === clubId);
  const [gk] = squad.filter((owned) => samplePlayers.find((player) => player.id === owned.playerId)?.position === "GK");
  const defenders = squad
    .filter((owned) => samplePlayers.find((player) => player.id === owned.playerId)?.position === "DEF")
    .slice(0, formation.startsWith("4") ? 4 : 3);
  const midsNeeded = formation === "3-5-2" ? 5 : formation === "3-4-3" || formation === "4-4-2" ? 4 : 3;
  const midfielders = squad
    .filter((owned) => samplePlayers.find((player) => player.id === owned.playerId)?.position === "MID")
    .slice(0, midsNeeded);
  const attackNeeded = Number(formation.split("-")[2]);
  const attackers = squad
    .filter((owned) => samplePlayers.find((player) => player.id === owned.playerId)?.position === "ATT")
    .slice(0, attackNeeded);
  const starterIds = new Set([
    gk?.playerId,
    ...defenders.map((owned) => owned.playerId),
    ...midfielders.map((owned) => owned.playerId),
    ...attackers.map((owned) => owned.playerId),
  ]);

  return {
    clubId,
    formation,
    locked: true,
    captainBoostZone,
    starters: {
      GK: gk ? [gk.playerId] : [],
      DEF: defenders.map((owned) => owned.playerId),
      MID: midfielders.map((owned) => owned.playerId),
      ATT: attackers.map((owned) => owned.playerId),
    },
    bench: squad.filter((owned) => !starterIds.has(owned.playerId)).map((owned) => owned.playerId),
  };
}

export const sampleLineups: Record<string, Lineup> = {
  "club-red": lineupForClub("club-red", "4-3-3", "MID"),
  "club-blue": lineupForClub("club-blue", "3-4-3", "DEF"),
  "club-green": lineupForClub("club-green", "3-3-4", "ATT"),
  "club-amber": lineupForClub("club-amber", "4-4-2", "MID"),
};

export const sampleDraftBoard = samplePlayers.slice(64, 80);

export const playerCatalog = Object.fromEntries(samplePlayers.map((player) => [player.id, player]));
