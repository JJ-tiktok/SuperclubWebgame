import {
  checkSeasonResult,
  getCurrentDraftTurn,
  getDraftPickOrder,
  getFinanceSummary,
  getScoutingCapacity,
  getTrainingCapacity,
  resolveAuction,
  resolveMatch,
} from "./rules";
import {
  playerCatalog,
  sampleClubPlayers,
  sampleClubs,
  sampleDraftBoard,
  sampleLineups,
  samplePlayers,
  sampleStaff,
} from "./sample-data";
import type { Auction, DraftRound, Game } from "./types";

export function createDemoGame() {
  const game: Game = {
    id: "game-demo",
    status: "draft",
    currentTurnClubId: "club-red",
    hostClubId: "club-red",
    settings: {
      roomCode: "SC-2026",
      maxManagers: 4,
      maxDraftStars: 3,
      startingMoney: 120_000_000,
      squadDraftSize: 16,
      squadMaxSize: 23,
      seasonNumber: 2,
    },
  };

  const clubIds = sampleClubs.map((club) => club.id);
  const draftOrder = getDraftPickOrder(clubIds, 0, 16);
  const draftRound: DraftRound = {
    roundIndex: 0,
    boardPlayerIds: sampleDraftBoard.map((player) => player.id),
    pickOrderClubIds: draftOrder,
    picks: [
      { pickIndex: 0, clubId: draftOrder[0], playerId: sampleDraftBoard[0].id },
      { pickIndex: 1, clubId: draftOrder[1], playerId: sampleDraftBoard[1].id },
      { pickIndex: 2, clubId: draftOrder[2], playerId: sampleDraftBoard[2].id },
    ],
  };

  const auction: Auction = {
    id: "auction-1",
    gameId: game.id,
    playerId: samplePlayers[70].id,
    status: "open",
    minimumBid: samplePlayers[70].minimumBid,
    bids: [
      { clubId: "club-red", amount: 42_000_000, locked: true },
      { clubId: "club-blue", amount: 42_000_000, locked: true },
      { clubId: "club-green", amount: 38_000_000, locked: true },
      { clubId: "club-amber", amount: 0, locked: true },
    ],
  };

  const match = resolveMatch({
    homeClub: sampleClubs[0],
    awayClub: sampleClubs[1],
    homeLineup: sampleLineups["club-red"],
    awayLineup: sampleLineups["club-blue"],
    clubPlayers: sampleClubPlayers,
    playerCatalog,
    diceRolls: [
      [3, 4],
      [2, 2],
      [5, 1],
      [6, 3],
      [4, 4],
      [1, 5],
    ],
  });

  return {
    game,
    clubs: sampleClubs,
    clubPlayers: sampleClubPlayers,
    players: samplePlayers,
    playerCatalog,
    draftRound,
    currentDraftTurn: getCurrentDraftTurn(clubIds, draftRound.roundIndex, draftRound.picks.length),
    finance: Object.fromEntries(
      sampleClubs.map((club) => [
        club.id,
        getFinanceSummary({
          club,
          clubCount: sampleClubs.length,
          clubPlayers: sampleClubPlayers,
          playerCatalog,
        }),
      ]),
    ),
    training: Object.fromEntries(sampleClubs.map((club) => [club.id, getTrainingCapacity(club.investments.training)])),
    scouting: Object.fromEntries(sampleClubs.map((club) => [club.id, getScoutingCapacity(club.investments.scouting)])),
    auction,
    resolvedAuction: resolveAuction(auction, sampleClubs, sampleClubPlayers, playerCatalog),
    lineups: sampleLineups,
    match,
    seasonResult: checkSeasonResult(sampleClubs),
    staffMarket: sampleStaff,
  };
}

export type DemoGame = ReturnType<typeof createDemoGame>;
