export const GAME_PHASES = [
  "lobby",
  "draft",
  "offseason_finance",
  "offseason_training",
  "offseason_scouting",
  "offseason_investments",
  "deadline_day",
  "prematch",
  "match",
  "season_end",
  "completed",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export const PLAYER_POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const TACTICAL_ZONES = ["DEF", "MID", "ATT"] as const;
export type TacticalZone = (typeof TACTICAL_ZONES)[number];

export const LINEUP_ZONES = ["bench", "GK", "DEF", "MID", "ATT"] as const;
export type LineupZone = (typeof LINEUP_ZONES)[number];

export const FORMATIONS = ["3-3-4", "3-4-3", "3-5-2", "4-3-3", "4-4-2"] as const;
export type Formation = (typeof FORMATIONS)[number];

export const AUCTION_STATUSES = ["scheduled", "open", "resolving", "resolved", "passed"] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const MATCH_STATUSES = ["scheduled", "lineup_lock", "resolving", "completed"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const CARD_VISIBILITIES = ["private", "room", "public"] as const;
export type CardVisibility = (typeof CARD_VISIBILITIES)[number];

export const CLUB_STATUSES = [
  "newly_promoted",
  "established",
  "mid_table",
  "title_contender",
] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export type ChemistrySide = "none" | "left" | "right" | "both";

export type Money = number;

export type PlayerCard = {
  id: string;
  name: string;
  position: PlayerPosition;
  baseStars: number;
  potentialStars: number;
  chemistry: ChemistrySide;
  scoutingPrice: Money;
  minimumBid: Money;
  region: string;
  visibility?: CardVisibility;
};

export type ClubPlayer = {
  id: string;
  clubId: string;
  playerId: string;
  currentStars: number;
  currentZone: LineupZone;
  injured: boolean;
  lineupSlot?: number;
};

export type InvestmentTrack = {
  training: number;
  scouting: number;
  stadium: number;
};

export type StaffCard = {
  id: string;
  name: string;
  price: Money;
  effects: StaffEffect[];
};

export type StaffEffect =
  | { type: "zone_bonus"; zone: TacticalZone; stars: number }
  | { type: "dice_zone_bonus"; stars: number }
  | { type: "captain_boost_extra"; stars: number }
  | { type: "wage_multiplier"; factor: number }
  | { type: "auction_discount"; amount: Money }
  | { type: "scouting_extra_cards"; cards: number }
  | { type: "season_income_bonus"; amount: Money }
  | { type: "investment_action_bonus"; extra: number }
  | { type: "attractiveness_bonus"; stars: number }
  | { type: "status_tier_up"; tiers: number }
  | { type: "chemistry_multiplier"; factor: number }
  | { type: "training_player_bonus"; players: number }
  | { type: "new_signing_star_bonus"; stars: number }
  | { type: "injury_heal_manual"; perMatchday: number }
  | { type: "draw_reroll"; threshold: number }
  | { type: "wage_discount"; amountPerStar: Money }
  | { type: "scouting_discount"; amount: Money }
  | { type: "auction_tiebreak"; stars: number };

export type Club = {
  id: string;
  userId?: string;
  gameId: string;
  name: string;
  managerName: string;
  color: string;
  money: Money;
  points: number;
  seasonRank: number;
  status: ClubStatus;
  investments: InvestmentTrack;
  staff: StaffCard[];
  superCupCards: number;
  captainBoostRank?: number;
};

export type GameSettings = {
  maxDraftStars: number;
  startingMoney: Money;
  maxManagers: number;
  squadDraftSize: number;
  squadMaxSize: number;
  seasonNumber: number;
  roomCode: string;
};

export type Game = {
  id: string;
  status: GamePhase;
  settings: GameSettings;
  currentTurnClubId?: string;
  hostClubId?: string;
};

export type DraftRound = {
  roundIndex: number;
  boardPlayerIds: string[];
  pickOrderClubIds: string[];
  picks: DraftPick[];
};

export type DraftPick = {
  pickIndex: number;
  clubId: string;
  playerId: string;
};

export type TrainingCapacity = {
  players: number;
  maxStarsPerPlayer: number;
  guaranteedStarForPlayers: number;
};

export type ScoutingCapacity = {
  players: number;
};

export type InvestmentAction = "training" | "scouting" | "stadium" | "staff";

export type AuctionBid = {
  clubId: string;
  amount: Money;
  locked: boolean;
};

export type Auction = {
  id: string;
  gameId: string;
  playerId: string;
  status: AuctionStatus;
  minimumBid: Money;
  bids: AuctionBid[];
  winningClubId?: string;
};

export type Lineup = {
  clubId: string;
  formation: Formation;
  locked: boolean;
  captainBoostZone?: TacticalZone;
  starters: {
    GK: string[];
    DEF: string[];
    MID: string[];
    ATT: string[];
  };
  bench: string[];
};

export type ZonePowerBreakdown = {
  clubId: string;
  zone: TacticalZone;
  baseStars: number;
  chemistryBonus: number;
  captainBoost: number;
  staffBonus: number;
  dice: [number, number];
  total: number;
};

export type MatchThird = {
  index: number;
  label: "midfield" | "home_attack" | "away_attack";
  attackingClubId?: string;
  home: ZonePowerBreakdown;
  away: ZonePowerBreakdown;
  winnerClubId?: string;
};

export type MatchEvent =
  | {
      type: "injury";
      clubId: string;
      playerId: string;
      thirdIndex: number;
      dice: [number, number];
    }
  | {
      type: "game_changer";
      clubId: string;
      thirdIndex: number;
      dice: [number, number];
    };

export type MatchResult = {
  homeClubId: string;
  awayClubId: string;
  thirds: MatchThird[];
  events: MatchEvent[];
  winnerClubId?: string;
  points: Record<string, number>;
};

export type SeasonResult = {
  championClubId?: string;
  completed: boolean;
  needsCupFinal: boolean;
  reason?: string;
};
