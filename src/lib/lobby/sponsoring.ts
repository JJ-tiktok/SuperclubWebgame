import type { ClubStatus } from "@/lib/game/types";
import type { ClubOverviewSnapshot, SponsorContractOverviewSnapshot, SponsorDealOverviewSnapshot } from "@/lib/lobby/types";
import {
  getSponsorDealById,
  SPONSOR_DEALS,
  SPONSOR_PRESTIGE_LABELS,
  type SponsorDealDefinition,
  type SponsorObjectiveType,
} from "@/lib/lobby/sponsor-deals";

export type SponsorContractStatus = "active" | "completed" | "failed" | "awaiting_reward_pick";

export type SponsorProgress = {
  wins?: number;
  losses?: number;
  draws?: number;
  thirds_won?: number;
  new_signings?: number;
  player_sold?: boolean;
  stadium_upgraded?: boolean;
  offseason_budget?: number;
  offseason_budget_ok?: boolean;
  end_budget?: number;
  consecutive_win_balance_seasons?: number;
  consecutive_first_place_seasons?: number;
  seasons_without_win_count?: number;
  seasons_without_win_failed?: boolean;
  player_growth_streak?: number;
  signing_over_limit?: boolean;
  human_loss?: boolean;
  training_used?: boolean;
  rank?: number;
  total_participants?: number;
  stadium_level?: number;
};

export type SponsorContractRow = {
  id: string;
  game_id: string;
  club_id: string;
  deal_id: string;
  prestige_tier: ClubStatus;
  status: SponsorContractStatus;
  signed_season: number;
  ends_season: number;
  seasons_elapsed: number;
  progress: SponsorProgress;
  reward_payload?: Record<string, unknown> | null;
  resolved_season?: number | null;
  resolved_at?: string | null;
  created_at?: string;
};

export type SponsorContractSnapshot = SponsorContractRow & {
  deal: SponsorDealDefinition;
};

export function isSponsorSigningPhase(phase: string) {
  return phase === "off_season";
}

export function isSponsoringEnabled(settings?: unknown) {
  const value =
    settings && typeof settings === "object"
      ? (settings as { sponsoring_enabled?: unknown }).sponsoring_enabled
      : undefined;
  return value !== false;
}

export function normalizeSponsorProgress(raw: unknown): SponsorProgress {
  if (!raw || typeof raw !== "object") return {};
  return raw as SponsorProgress;
}

export function buildSponsorContractSnapshot(
  row: SponsorContractRow,
  deal?: SponsorDealDefinition,
): SponsorContractSnapshot {
  const resolvedDeal = deal ?? getSponsorDealById(row.deal_id);
  if (!resolvedDeal) {
    throw new Error(`Unknown sponsor deal: ${row.deal_id}`);
  }
  return {
    ...row,
    progress: normalizeSponsorProgress(row.progress),
    deal: resolvedDeal,
  };
}

export function getConsumedPrestigeTiers(contracts: SponsorContractRow[]): Set<ClubStatus> {
  return new Set(contracts.map((c) => c.prestige_tier));
}

export function getActiveSponsorContract(contracts: SponsorContractRow[]): SponsorContractRow | null {
  return contracts.find((c) => c.status === "active" || c.status === "awaiting_reward_pick") ?? null;
}

export const SPONSOR_PRESTIGE_ORDER: ClubStatus[] = [
  "newly_promoted",
  "established",
  "mid_table",
  "title_contender",
];

export function getPrestigeTierRank(tier: ClubStatus): number {
  return SPONSOR_PRESTIGE_ORDER.indexOf(tier);
}

export function isPrestigeTierAccessible(tier: ClubStatus, clubStatus: ClubStatus): boolean {
  const tierRank = getPrestigeTierRank(tier);
  const clubRank = getPrestigeTierRank(clubStatus);
  if (tierRank < 0 || clubRank < 0) {
    return false;
  }
  return tierRank <= clubRank;
}

export function getAccessiblePrestigeTiers(clubStatus: ClubStatus): ClubStatus[] {
  const clubRank = getPrestigeTierRank(clubStatus);
  if (clubRank < 0) {
    return [];
  }
  return SPONSOR_PRESTIGE_ORDER.filter((_, index) => index <= clubRank);
}

export function getAvailableSponsorDeals(
  contracts: SponsorContractRow[],
  clubStatus: ClubStatus,
): SponsorDealDefinition[] {
  const consumedTiers = getConsumedPrestigeTiers(contracts);
  const active = getActiveSponsorContract(contracts);
  if (active) return [];
  return SPONSOR_DEALS.filter(
    (deal) =>
      isPrestigeTierAccessible(deal.prestige_tier, clubStatus) && !consumedTiers.has(deal.prestige_tier),
  );
}

export function getAvailableSponsorDealsForTier(
  contracts: SponsorContractRow[],
  tier: ClubStatus,
  clubStatus: ClubStatus,
): SponsorDealDefinition[] {
  const consumedTiers = getConsumedPrestigeTiers(contracts);
  const active = getActiveSponsorContract(contracts);
  if (active || consumedTiers.has(tier) || !isPrestigeTierAccessible(tier, clubStatus)) {
    return [];
  }
  return SPONSOR_DEALS.filter((deal) => deal.prestige_tier === tier).sort((a, b) => a.sort_order - b.sort_order);
}

export function isStadiumUpgradeBlockedBySponsor(contracts: SponsorContractRow[]): boolean {
  const active = contracts.find((contract) => contract.status === "active");
  if (!active) return false;
  const deal = getSponsorDealById(active.deal_id);
  return deal?.objective_type === "no_stadium_upgrade";
}

export type CanSignSponsorDealInput = {
  phase: string;
  contracts: SponsorContractRow[];
  dealId: string;
  clubStatus: ClubStatus;
};

export type CanSignSponsorDealResult =
  | { ok: true; deal: SponsorDealDefinition }
  | { ok: false; reason: string };

export function canSignSponsorDeal(input: CanSignSponsorDealInput): CanSignSponsorDealResult {
  if (!isSponsorSigningPhase(input.phase)) {
    return { ok: false, reason: "Nur in der Off-Season abschliessbar" };
  }
  if (getActiveSponsorContract(input.contracts)) {
    return { ok: false, reason: "Bereits ein aktiver Sponsorenvertrag" };
  }
  const deal = getSponsorDealById(input.dealId);
  if (!deal) {
    return { ok: false, reason: "Deal nicht gefunden" };
  }
  const consumedTiers = getConsumedPrestigeTiers(input.contracts);
  if (consumedTiers.has(deal.prestige_tier)) {
    return { ok: false, reason: `Prestige-Stufe ${SPONSOR_PRESTIGE_LABELS[deal.prestige_tier]} bereits verbraucht` };
  }
  if (!isPrestigeTierAccessible(deal.prestige_tier, input.clubStatus)) {
    return {
      ok: false,
      reason: `Deal erst ab Prestige-Stufe ${SPONSOR_PRESTIGE_LABELS[deal.prestige_tier]} verfügbar`,
    };
  }
  return { ok: true, deal };
}

export function createInitialProgress(): SponsorProgress {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    thirds_won: 0,
    new_signings: 0,
    consecutive_win_balance_seasons: 0,
    consecutive_first_place_seasons: 0,
    seasons_without_win_count: 0,
    player_growth_streak: 0,
  };
}

export function describeSponsorProgress(contract: SponsorContractSnapshot): string {
  const p = contract.progress;
  const cfg = contract.deal.objective_config;
  switch (contract.deal.objective_type) {
    case "min_wins":
      return `${p.wins ?? 0}/${Number(cfg.min ?? 1)} Siege`;
    case "max_losses":
      return `${p.losses ?? 0}/${Number(cfg.max ?? 2)} Niederlagen max.`;
    case "min_thirds_won":
      return `${p.thirds_won ?? 0}/${Number(cfg.min ?? 6)} Drittel gewonnen`;
    case "max_new_signings":
      return `${p.new_signings ?? 0}/${Number(cfg.max ?? 1)} Zugaenge max.`;
    case "min_budget_after_offseason":
      return p.offseason_budget_ok
        ? "Budget-Ziel erreicht"
        : `Budget nach Off-Season: ${formatMoneyShort(p.offseason_budget ?? 0)} / ${formatMoneyShort(Number(cfg.min ?? 0))}`;
    case "min_end_budget":
      return `Saisonende-Budget: ${formatMoneyShort(p.end_budget ?? 0)} (Ziel ${formatMoneyShort(Number(cfg.min ?? 0))})`;
    case "consecutive_win_balance":
      return `${p.consecutive_win_balance_seasons ?? 0}/${Number(cfg.seasons ?? 2)} Saisons Siege > Niederlagen`;
    case "consecutive_league_first":
      return `${p.consecutive_first_place_seasons ?? 0}/${Number(cfg.seasons ?? 2)} Meisterschaften`;
    case "seasons_without_win":
      return p.seasons_without_win_failed
        ? "Gescheitert (Sieg erzielt)"
        : `${p.seasons_without_win_count ?? 0}/${Number(cfg.seasons ?? 2)} Saisons ohne Sieg`;
    case "consecutive_player_growth":
      return `${p.player_growth_streak ?? 0}/${Number(cfg.seasons ?? 2)} Jahre +${Number(cfg.min_stars ?? 2)} Entwicklung`;
    case "no_stadium_upgrade":
      return p.stadium_upgraded ? "Gescheitert (Stadionausbau)" : `Saison ${contract.seasons_elapsed + 1}/${contract.deal.duration_seasons} ohne Ausbau`;
    case "no_player_sold":
      return p.player_sold ? "Gescheitert (Spieler verkauft)" : `Saison ${contract.seasons_elapsed + 1}/${contract.deal.duration_seasons} ohne Verkauf`;
    case "no_draws":
      return p.draws ? "Gescheitert (Unentschieden)" : "Kein Unentschieden bisher";
    case "max_signing_market_value":
      return p.signing_over_limit ? "Gescheitert (Teurer Zugang)" : `Saison ${contract.seasons_elapsed + 1}/${contract.deal.duration_seasons} unter Limit`;
    case "no_loss_vs_human":
      return p.human_loss ? "Gescheitert (Niederlage vs Manager)" : "Keine Manager-Niederlage";
    case "reach_max_stadium":
      return `Stadion Level ${p.stadium_level ?? "?"} / ${Number(cfg.level ?? 4)}`;
    case "training_facility_locked":
      return p.training_used ? "Gescheitert (Training genutzt)" : `Saison ${contract.seasons_elapsed + 1}/${contract.deal.duration_seasons} ohne Training`;
    case "not_last_overall":
      return p.rank != null && p.total_participants != null
        ? `Platz ${p.rank} von ${p.total_participants}`
        : "Saisonende ausstehend";
    default:
      return "In Bearbeitung";
  }
}

function formatMoneyShort(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  return String(value);
}

export function isObjectiveFailed(contract: SponsorContractSnapshot): boolean {
  const p = contract.progress;
  switch (contract.deal.objective_type) {
    case "max_new_signings":
      return (p.new_signings ?? 0) > Number(contract.deal.objective_config.max ?? 1);
    case "no_stadium_upgrade":
      return Boolean(p.stadium_upgraded);
    case "no_player_sold":
      return Boolean(p.player_sold);
    case "no_draws":
      return (p.draws ?? 0) > 0;
    case "max_signing_market_value":
      return Boolean(p.signing_over_limit);
    case "no_loss_vs_human":
      return Boolean(p.human_loss);
    case "seasons_without_win":
      return Boolean(p.seasons_without_win_failed);
    case "training_facility_locked":
      return Boolean(p.training_used);
    case "min_budget_after_offseason":
      return p.offseason_budget_ok === false;
    default:
      return false;
  }
}

export function isObjectiveMetAtSeasonEnd(contract: SponsorContractSnapshot): boolean {
  if (isObjectiveFailed(contract)) return false;
  const p = contract.progress;
  const cfg = contract.deal.objective_config;
  switch (contract.deal.objective_type) {
    case "min_wins":
      return (p.wins ?? 0) >= Number(cfg.min ?? 1);
    case "not_last_overall":
      return p.rank != null && p.total_participants != null && p.rank < p.total_participants;
    case "max_new_signings":
      return (p.new_signings ?? 0) <= Number(cfg.max ?? 1);
    case "min_budget_after_offseason":
      return p.offseason_budget_ok === true;
    case "min_thirds_won":
      return (p.thirds_won ?? 0) >= Number(cfg.min ?? 6);
    case "no_stadium_upgrade":
      return !p.stadium_upgraded;
    case "consecutive_player_growth":
      return (p.player_growth_streak ?? 0) >= Number(cfg.seasons ?? 2);
    case "no_player_sold":
      return !p.player_sold;
    case "no_draws":
      return (p.draws ?? 0) === 0;
    case "seasons_without_win":
      return (p.seasons_without_win_count ?? 0) >= Number(cfg.seasons ?? 2) && !p.seasons_without_win_failed;
    case "consecutive_win_balance":
      return (p.consecutive_win_balance_seasons ?? 0) >= Number(cfg.seasons ?? 2);
    case "max_signing_market_value":
      return !p.signing_over_limit;
    case "max_losses":
      return (p.losses ?? 0) <= Number(cfg.max ?? 2);
    case "min_end_budget":
      return (p.end_budget ?? 0) >= Number(cfg.min ?? 0);
    case "consecutive_league_first":
      return (p.consecutive_first_place_seasons ?? 0) >= Number(cfg.seasons ?? 2);
    case "no_loss_vs_human":
      return !p.human_loss;
    case "reach_max_stadium":
      return (p.stadium_level ?? 0) >= Number(cfg.level ?? 4);
    case "training_facility_locked":
      return !p.training_used;
    default:
      return false;
  }
}

export function shouldFailImmediately(
  contract: SponsorContractSnapshot,
  event: SponsorObjectiveType,
): boolean {
  if (contract.deal.objective_type !== event) return false;
  return isObjectiveFailed(contract);
}

export function applyMatchResultToProgress(
  progress: SponsorProgress,
  params: {
    isWin: boolean;
    isLoss: boolean;
    isDraw: boolean;
    thirdsWon: number;
    isHumanOpponent: boolean;
  },
): SponsorProgress {
  const next = { ...progress };
  if (params.isWin) next.wins = (next.wins ?? 0) + 1;
  if (params.isLoss) next.losses = (next.losses ?? 0) + 1;
  if (params.isDraw) next.draws = (next.draws ?? 0) + 1;
  next.thirds_won = (next.thirds_won ?? 0) + params.thirdsWon;
  if (params.isLoss && params.isHumanOpponent) next.human_loss = true;
  if (params.isWin && (next.seasons_without_win_failed == null)) {
    next.seasons_without_win_failed = true;
  }
  return next;
}

export function applySeasonEndToProgress(
  progress: SponsorProgress,
  params: {
    wins: number;
    losses: number;
    rank: number;
    totalParticipants: number;
    endBudget: number;
    stadiumLevel: number;
  },
): SponsorProgress {
  const next = { ...progress };
  next.wins = params.wins;
  next.losses = params.losses;
  next.rank = params.rank;
  next.total_participants = params.totalParticipants;
  next.end_budget = params.endBudget;
  next.stadium_level = params.stadiumLevel;

  if (params.wins > params.losses) {
    next.consecutive_win_balance_seasons = (next.consecutive_win_balance_seasons ?? 0) + 1;
  } else {
    next.consecutive_win_balance_seasons = 0;
  }

  if (params.rank === 1) {
    next.consecutive_first_place_seasons = (next.consecutive_first_place_seasons ?? 0) + 1;
  } else {
    next.consecutive_first_place_seasons = 0;
  }

  if (params.wins === 0 && !next.seasons_without_win_failed) {
    next.seasons_without_win_count = (next.seasons_without_win_count ?? 0) + 1;
  }

  return next;
}

export function rewardNeedsPlayerPick(rewardType: SponsorDealDefinition["reward_type"]): boolean {
  return (
    rewardType === "player_potential_boost" ||
    rewardType === "player_star_boost" ||
    rewardType === "player_max_level" ||
    rewardType === "money_and_player_star"
  );
}

export function describeSponsorReward(deal: SponsorDealDefinition): string {
  const cfg = deal.reward_config;
  switch (deal.reward_type) {
    case "money":
      return `+${formatMoneyShort(Number(cfg.amount ?? 0))}`;
    case "extra_training_unit":
      return `+${Number(cfg.count ?? 1)} Trainingseinheit(en)`;
    case "status_boost":
      return `Status +${Number(cfg.delta ?? 1)} fuer ${Number(cfg.seasons ?? 1)} Saison(en)`;
    case "stadium_rebuild":
      return `Stadion Level ${Number(cfg.stadium_level ?? 2)} + Status-Bonus`;
    case "extra_scouting_draws":
      return `+${Number(cfg.count ?? 2)} Scouting-Karten`;
    case "free_staff":
      return "Gratis Mitarbeiter";
    case "defense_bonus":
      return `Abwehr +${Number(cfg.delta ?? 1)} fuer ${Number(cfg.seasons ?? 1)} Saison(en)`;
    case "stadium_income_multiplier":
      return `Stadioneinnahmen x${Number(cfg.factor ?? 2)}`;
    case "player_potential_boost":
      return `+${Number(cfg.stars ?? 1)} Potential (${Number(cfg.pick_count ?? 1)} Spieler)`;
    case "player_star_boost":
    case "money_and_player_star":
      return `+${Number(cfg.stars ?? 1)} Stern(e)`;
    case "player_max_level":
      return `+${Number(cfg.potential_stars ?? 1)} Potential + Max-Level`;
    case "money_and_scouting":
      return `+${formatMoneyShort(Number(cfg.amount ?? 0))} + ${Number(cfg.scouting_draws ?? 1)} Scout`;
    default:
      return deal.reward_type;
  }
}

function toContractOverview(row: SponsorContractRow): SponsorContractOverviewSnapshot {
  const snapshot = buildSponsorContractSnapshot(row);
  const rewardPickCount =
    snapshot.deal.reward_type === "player_max_level"
      ? 1 + Number(snapshot.deal.reward_config.max_level_count ?? 1)
      : Number(snapshot.deal.reward_config.pick_count ?? 1);
  return {
    id: row.id,
    deal_id: row.deal_id,
    prestige_tier: row.prestige_tier,
    prestige_label: SPONSOR_PRESTIGE_LABELS[row.prestige_tier],
    status: row.status,
    signed_season: row.signed_season,
    ends_season: row.ends_season,
    seasons_elapsed: row.seasons_elapsed,
    progress_label: describeSponsorProgress(snapshot),
    display_name: snapshot.deal.display_name,
    task_description: snapshot.deal.task_description,
    reward_description: describeSponsorReward(snapshot.deal),
    flavor_text: snapshot.deal.flavor_text,
    duration_seasons: snapshot.deal.duration_seasons,
    needs_player_pick: row.status === "awaiting_reward_pick",
    reward_pick_count: rewardPickCount,
  };
}

function toDealOverview(deal: SponsorDealDefinition): SponsorDealOverviewSnapshot {
  return {
    id: deal.id,
    prestige_tier: deal.prestige_tier,
    prestige_label: SPONSOR_PRESTIGE_LABELS[deal.prestige_tier],
    display_name: deal.display_name,
    task_description: deal.task_description,
    reward_description: describeSponsorReward(deal),
    flavor_text: deal.flavor_text,
    duration_seasons: deal.duration_seasons,
  };
}

export function buildClubSponsorOverview(
  contracts: SponsorContractRow[],
  phase: string,
  clubStatus: ClubStatus,
): Pick<
  ClubOverviewSnapshot,
  | "sponsor_contract"
  | "sponsor_history"
  | "available_sponsor_deals"
  | "sponsor_signing_allowed"
  | "stadium_upgrade_blocked_by_sponsor"
  | "sponsor_prestige_tier"
  | "sponsor_prestige_label"
> {
  const active = getActiveSponsorContract(contracts);
  const history = contracts
    .filter((contract) => contract.status === "completed" || contract.status === "failed")
    .map(toContractOverview);
  const available = getAvailableSponsorDeals(contracts, clubStatus).map(toDealOverview);
  const signingAllowed = isSponsorSigningPhase(phase) && !active && available.length > 0;

  return {
    sponsor_contract: active ? toContractOverview(active) : null,
    sponsor_history: history,
    available_sponsor_deals: available,
    sponsor_signing_allowed: signingAllowed,
    stadium_upgrade_blocked_by_sponsor: isStadiumUpgradeBlockedBySponsor(contracts),
    sponsor_prestige_tier: clubStatus,
    sponsor_prestige_label: SPONSOR_PRESTIGE_LABELS[clubStatus],
  };
}

const EMPTY_SPONSOR_OVERVIEW: Pick<
  ClubOverviewSnapshot,
  | "sponsor_contract"
  | "sponsor_history"
  | "available_sponsor_deals"
  | "sponsor_signing_allowed"
  | "stadium_upgrade_blocked_by_sponsor"
  | "sponsor_prestige_tier"
  | "sponsor_prestige_label"
> = {
  sponsor_contract: null,
  sponsor_history: [],
  available_sponsor_deals: [],
  sponsor_signing_allowed: false,
  stadium_upgrade_blocked_by_sponsor: false,
  sponsor_prestige_tier: "newly_promoted",
  sponsor_prestige_label: SPONSOR_PRESTIGE_LABELS.newly_promoted,
};

export { EMPTY_SPONSOR_OVERVIEW, SPONSOR_PRESTIGE_LABELS };
