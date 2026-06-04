import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubStatus } from "@/lib/game/types";
import { applyStatusTierUp } from "@/lib/game/rules";
import { getSponsorDealById } from "@/lib/lobby/sponsor-deals";
import {
  applyMatchResultToProgress,
  applySeasonEndToProgress,
  buildSponsorContractSnapshot,
  createInitialProgress,
  getActiveSponsorContract,
  isObjectiveFailed,
  isObjectiveMetAtSeasonEnd,
  normalizeSponsorProgress,
  rewardNeedsPlayerPick,
  type SponsorContractRow,
  type SponsorProgress,
} from "@/lib/lobby/sponsoring";

type ServiceClient = SupabaseClient;

export async function loadClubSponsorContracts(
  supabase: ServiceClient,
  clubId: string,
): Promise<SponsorContractRow[]> {
  const { data, error } = await supabase
    .from("club_sponsor_contracts")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: true })
    .returns<SponsorContractRow[]>();
  if (error?.code === "42P01") return [];
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    progress: normalizeSponsorProgress(row.progress),
  }));
}

export async function loadGameSponsorContracts(
  supabase: ServiceClient,
  gameId: string,
): Promise<SponsorContractRow[]> {
  const { data, error } = await supabase
    .from("club_sponsor_contracts")
    .select("*")
    .eq("game_id", gameId)
    .returns<SponsorContractRow[]>();
  if (error?.code === "42P01") return [];
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    progress: normalizeSponsorProgress(row.progress),
  }));
}

async function updateContractProgress(
  supabase: ServiceClient,
  contractId: string,
  progress: SponsorProgress,
  patch: Partial<SponsorContractRow> = {},
) {
  await supabase
    .from("club_sponsor_contracts")
    .update({ progress, ...patch })
    .eq("id", contractId);
}

async function resolveContract(
  supabase: ServiceClient,
  contract: SponsorContractRow,
  status: "completed" | "failed" | "awaiting_reward_pick",
  seasonNumber: number,
) {
  await supabase
    .from("club_sponsor_contracts")
    .update({
      status,
      resolved_season: seasonNumber,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", contract.id);
}

export async function notifySponsorFixtureComplete(
  supabase: ServiceClient,
  params: {
    seasonNumber: number;
    homeClubId: string | null;
    awayClubId: string | null;
    homeKind: "cpu" | "human";
    awayKind: "cpu" | "human";
    homeMatchPoints: number;
    awayMatchPoints: number;
    homeThirdPoints: number;
    awayThirdPoints: number;
  },
) {
  const homeWin = params.homeMatchPoints > params.awayMatchPoints;
  const awayWin = params.awayMatchPoints > params.homeMatchPoints;
  const draw = params.homeMatchPoints === params.awayMatchPoints;

  if (params.homeClubId && params.homeKind === "human") {
    await onSponsorMatchComplete(supabase, {
      clubId: params.homeClubId,
      seasonNumber: params.seasonNumber,
      isWin: homeWin,
      isLoss: awayWin,
      isDraw: draw,
      thirdsWon: Math.floor(params.homeThirdPoints),
      isHumanOpponent: params.awayKind === "human",
    });
  }
  if (params.awayClubId && params.awayKind === "human") {
    await onSponsorMatchComplete(supabase, {
      clubId: params.awayClubId,
      seasonNumber: params.seasonNumber,
      isWin: awayWin,
      isLoss: homeWin,
      isDraw: draw,
      thirdsWon: Math.floor(params.awayThirdPoints),
      isHumanOpponent: params.homeKind === "human",
    });
  }
}

export async function onSponsorMatchComplete(
  supabase: ServiceClient,
  params: {
    clubId: string;
    seasonNumber: number;
    isWin: boolean;
    isLoss: boolean;
    isDraw: boolean;
    thirdsWon: number;
    isHumanOpponent: boolean;
  },
) {
  const contracts = await loadClubSponsorContracts(supabase, params.clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;

  const snapshot = buildSponsorContractSnapshot(active);
  const progress = applyMatchResultToProgress(snapshot.progress, {
    isWin: params.isWin,
    isLoss: params.isLoss,
    isDraw: params.isDraw,
    thirdsWon: params.thirdsWon,
    isHumanOpponent: params.isHumanOpponent,
  });

  if (isObjectiveFailed({ ...snapshot, progress })) {
    await resolveContract(supabase, active, "failed", params.seasonNumber);
    return;
  }

  await updateContractProgress(supabase, active.id, progress);
}

export async function onSponsorNewSigning(
  supabase: ServiceClient,
  clubId: string,
  seasonNumber: number,
  marketValue: number,
) {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;

  const snapshot = buildSponsorContractSnapshot(active);
  const progress = { ...snapshot.progress, new_signings: (snapshot.progress.new_signings ?? 0) + 1 };

  if (snapshot.deal.objective_type === "max_signing_market_value") {
    const maxValue = Number(snapshot.deal.objective_config.max_value ?? 40_000_000);
    if (marketValue > maxValue) progress.signing_over_limit = true;
  }

  if (isObjectiveFailed({ ...snapshot, progress })) {
    await resolveContract(supabase, active, "failed", seasonNumber);
    return;
  }
  await updateContractProgress(supabase, active.id, progress);
}

export async function onSponsorPlayerSold(supabase: ServiceClient, clubId: string, seasonNumber: number) {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;
  const snapshot = buildSponsorContractSnapshot(active);
  if (snapshot.deal.objective_type !== "no_player_sold") return;
  const progress = { ...snapshot.progress, player_sold: true };
  await resolveContract(supabase, active, "failed", seasonNumber);
}

export async function onSponsorStadiumUpgrade(supabase: ServiceClient, clubId: string, seasonNumber: number) {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;
  const snapshot = buildSponsorContractSnapshot(active);
  if (snapshot.deal.objective_type !== "no_stadium_upgrade") return;
  const progress = { ...snapshot.progress, stadium_upgraded: true };
  await resolveContract(supabase, active, "failed", seasonNumber);
}

export async function onSponsorTrainingUsed(supabase: ServiceClient, clubId: string, seasonNumber: number) {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;
  const snapshot = buildSponsorContractSnapshot(active);
  if (snapshot.deal.objective_type !== "training_facility_locked") return;
  const progress = { ...snapshot.progress, training_used: true };
  await resolveContract(supabase, active, "failed", seasonNumber);
}

export async function onSponsorOffseasonBudgetCheck(
  supabase: ServiceClient,
  gameId: string,
  seasonNumber: number,
) {
  const contracts = await loadGameSponsorContracts(supabase, gameId);
  for (const contract of contracts) {
    if (contract.status !== "active") continue;
    const snapshot = buildSponsorContractSnapshot(contract);
    if (snapshot.deal.objective_type !== "min_budget_after_offseason") continue;

    const { data: club } = await supabase
      .from("clubs")
      .select("money")
      .eq("id", contract.club_id)
      .maybeSingle<{ money: number | string }>();
    const budget = Number(club?.money ?? 0);
    const min = Number(snapshot.deal.objective_config.min ?? 0);
    const ok = budget >= min;
    const progress = { ...snapshot.progress, offseason_budget: budget, offseason_budget_ok: ok };

    if (!ok) {
      await resolveContract(supabase, contract, "failed", seasonNumber);
    } else {
      await updateContractProgress(supabase, contract.id, progress);
    }
  }
}

export async function processSponsorContractsAtSeasonEnd(
  supabase: ServiceClient,
  gameId: string,
  seasonNumber: number,
) {
  const contracts = await loadGameSponsorContracts(supabase, gameId);
  const { data: standings } = await supabase
    .from("season_standings")
    .select("participant_id, wins, losses, rank, participant:season_participants(club_id, kind)")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .returns<Array<{ participant_id: string; wins: number; losses: number; rank: number; participant: { club_id: string | null; kind: string } | null }>>();

  const totalParticipants = standings?.length ?? 0;

  for (const contract of contracts) {
    if (contract.status !== "active") continue;
    const snapshot = buildSponsorContractSnapshot(contract);
    const standing = standings?.find((s) => s.participant?.club_id === contract.club_id);
    const { data: club } = await supabase
      .from("clubs")
      .select("money, stadium_level")
      .eq("id", contract.club_id)
      .maybeSingle<{ money: number | string; stadium_level: number | null }>();

    let progress = applySeasonEndToProgress(snapshot.progress, {
      wins: standing?.wins ?? snapshot.progress.wins ?? 0,
      losses: standing?.losses ?? snapshot.progress.losses ?? 0,
      rank: standing?.rank ?? totalParticipants,
      totalParticipants,
      endBudget: Number(club?.money ?? 0),
      stadiumLevel: Number(club?.stadium_level ?? 1),
    });

    const updatedSnapshot = { ...snapshot, progress };
    if (isObjectiveFailed(updatedSnapshot)) {
      await resolveContract(supabase, contract, "failed", seasonNumber);
      continue;
    }

    const seasonsElapsed = contract.seasons_elapsed + 1;
    const isFinalSeason = seasonsElapsed >= contract.deal.duration_seasons;

    if (isFinalSeason) {
      if (isObjectiveMetAtSeasonEnd(updatedSnapshot)) {
        const needsPick = rewardNeedsPlayerPick(snapshot.deal.reward_type);
        await updateContractProgress(supabase, contract.id, progress, { seasons_elapsed: seasonsElapsed });
        if (needsPick) {
          await resolveContract(supabase, contract, "awaiting_reward_pick", seasonNumber);
        } else {
          await applySponsorReward(supabase, contract, seasonNumber);
          await resolveContract(supabase, contract, "completed", seasonNumber);
        }
      } else {
        await resolveContract(supabase, contract, "failed", seasonNumber);
      }
    } else {
      await updateContractProgress(supabase, contract.id, {
        ...createInitialProgress(),
        consecutive_win_balance_seasons: progress.consecutive_win_balance_seasons,
        consecutive_first_place_seasons: progress.consecutive_first_place_seasons,
        seasons_without_win_count: progress.seasons_without_win_count,
        seasons_without_win_failed: progress.seasons_without_win_failed,
        player_growth_streak: progress.player_growth_streak,
        player_sold: progress.player_sold,
        stadium_upgraded: progress.stadium_upgraded,
        signing_over_limit: progress.signing_over_limit,
        human_loss: progress.human_loss,
        training_used: progress.training_used,
        offseason_budget_ok: progress.offseason_budget_ok,
      }, { seasons_elapsed: seasonsElapsed });
    }
  }
}

export async function onSponsorPlayerGrowth(
  supabase: ServiceClient,
  clubId: string,
  seasonNumber: number,
  starsGained: number,
) {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return;
  const snapshot = buildSponsorContractSnapshot(active);
  if (snapshot.deal.objective_type !== "consecutive_player_growth") return;
  const minStars = Number(snapshot.deal.objective_config.min_stars ?? 2);
  const progress = { ...snapshot.progress };
  if (starsGained >= minStars) {
    progress.player_growth_streak = (progress.player_growth_streak ?? 0) + 1;
  } else {
    progress.player_growth_streak = 0;
  }
  await updateContractProgress(supabase, active.id, progress);
}

export async function applySponsorReward(
  supabase: ServiceClient,
  contract: SponsorContractRow,
  seasonNumber: number,
  pickedPlayerIds?: string[],
) {
  const deal = getSponsorDealById(contract.deal_id);
  if (!deal) return;

  const cfg = deal.reward_config;
  const clubId = contract.club_id;
  const gameId = contract.game_id;

  const payMoney = async (amount: number, reason: string) => {
    if (amount <= 0) return;
    const { data: club } = await supabase.from("clubs").select("money").eq("id", clubId).single<{ money: number | string }>();
    await supabase.from("clubs").update({ money: Number(club?.money ?? 0) + amount }).eq("id", clubId);
    await supabase.from("transactions").insert({
      game_id: gameId,
      club_id: clubId,
      amount,
      reason,
      metadata: { season_number: seasonNumber, sponsor_deal_id: deal.id },
    });
  };

  switch (deal.reward_type) {
    case "money":
      await payMoney(Number(cfg.amount ?? 0), "sponsor_reward");
      break;
    case "money_and_scouting":
      await payMoney(Number(cfg.amount ?? 0), "sponsor_reward");
      await supabase.from("club_pending_effects").insert({
        club_id: clubId,
        season_number: seasonNumber + 1,
        effect_type: "free_scouting_draw",
        payload: { count: Number(cfg.scouting_draws ?? 1) },
        scope: "current_offseason",
      });
      break;
    case "money_and_player_star":
      await payMoney(Number(cfg.amount ?? 0), "sponsor_reward");
      if (pickedPlayerIds?.[0]) {
        await boostPlayerStars(supabase, pickedPlayerIds[0], Number(cfg.stars ?? 1));
      }
      break;
    case "extra_training_unit":
      await supabase.from("club_pending_effects").insert({
        club_id: clubId,
        season_number: seasonNumber + 1,
        effect_type: "training_capacity_delta",
        payload: { delta: Number(cfg.count ?? 1) },
        scope: "current_offseason",
      });
      break;
    case "status_boost": {
      const { data: club } = await supabase
        .from("clubs")
        .select("status")
        .eq("id", clubId)
        .single<{ status: ClubStatus | null }>();
      const newStatus = applyStatusTierUp((club?.status ?? "newly_promoted") as ClubStatus, Number(cfg.delta ?? 1));
      await supabase.from("clubs").update({
        status_override: newStatus,
        status_override_until_season: seasonNumber + Number(cfg.seasons ?? 1),
      }).eq("id", clubId);
      break;
    }
    case "stadium_rebuild": {
      const statusDelta = Number(cfg.status_delta ?? 1);
      const { data: club } = await supabase.from("clubs").select("status").eq("id", clubId).single<{ status: ClubStatus | null }>();
      await supabase.from("clubs").update({
        stadium_level: Number(cfg.stadium_level ?? 2),
        status_override: applyStatusTierUp((club?.status ?? "newly_promoted") as ClubStatus, statusDelta),
        status_override_until_season: seasonNumber + Number(cfg.status_seasons ?? 1),
      }).eq("id", clubId);
      break;
    }
    case "extra_scouting_draws":
      await supabase.from("club_pending_effects").insert({
        club_id: clubId,
        season_number: seasonNumber + 1,
        effect_type: "free_scouting_draw",
        payload: { count: Number(cfg.count ?? 2) },
        scope: cfg.scope === "next_offseason" ? "next_offseason" : "current_offseason",
      });
      break;
    case "free_staff":
      await supabase.from("club_pending_effects").insert([
        { club_id: clubId, season_number: seasonNumber + 1, effect_type: "free_staff_offer", payload: { free_offer: true }, scope: "current_offseason" },
        { club_id: clubId, season_number: seasonNumber + 1, effect_type: "free_staff_signing", payload: { free_signing: true }, scope: "current_offseason" },
      ]);
      break;
    case "defense_bonus":
      await supabase.from("club_pending_effects").insert({
        club_id: clubId,
        season_number: seasonNumber + 1,
        effect_type: "sponsor_defense_bonus",
        payload: { delta: Number(cfg.delta ?? 1), seasons: Number(cfg.seasons ?? 1) },
        scope: "this_season",
      });
      break;
    case "stadium_income_multiplier":
      await supabase.from("club_pending_effects").insert({
        club_id: clubId,
        season_number: seasonNumber + 1,
        effect_type: "sponsor_stadium_income_multiplier",
        payload: { factor: Number(cfg.factor ?? 2), seasons: Number(cfg.seasons ?? 1) },
        scope: "this_season",
      });
      break;
    case "player_potential_boost":
      for (const playerId of pickedPlayerIds ?? []) {
        await boostPlayerPotential(supabase, playerId, Number(cfg.stars ?? 1));
      }
      break;
    case "player_max_level":
      if (pickedPlayerIds?.[0]) {
        await boostPlayerPotential(supabase, pickedPlayerIds[0], Number(cfg.potential_stars ?? 1));
        await maxPlayerToSkillMax(supabase, pickedPlayerIds[0]);
      }
      if (pickedPlayerIds?.[1]) {
        await maxPlayerToSkillMax(supabase, pickedPlayerIds[1]);
      }
      break;
    default:
      break;
  }
}

async function boostPlayerStars(supabase: ServiceClient, clubPlayerId: string, stars: number) {
  const { data } = await supabase.from("club_players").select("current_stars").eq("id", clubPlayerId).single<{ current_stars: number | string }>();
  await supabase.from("club_players").update({ current_stars: Number(data?.current_stars ?? 0) + stars }).eq("id", clubPlayerId);
}

async function boostPlayerPotential(supabase: ServiceClient, clubPlayerId: string, stars: number) {
  const { data } = await supabase
    .from("club_players")
    .select("current_stars, player_id, player:players(skill_max)")
    .eq("id", clubPlayerId)
    .single<{ current_stars: number | string; player_id: string; player: { skill_max: number | string | null } | null }>();
  if (!data) return;
  const newMax = Number(data.player?.skill_max ?? 0) + stars;
  await supabase.from("players").update({ skill_max: newMax }).eq("id", data.player_id);
  await supabase.from("club_players").update({ current_stars: Math.min(Number(data.current_stars ?? 0) + stars, newMax) }).eq("id", clubPlayerId);
}

async function maxPlayerToSkillMax(supabase: ServiceClient, clubPlayerId: string) {
  const { data } = await supabase
    .from("club_players")
    .select("player:players(skill_max)")
    .eq("id", clubPlayerId)
    .single<{ player: { skill_max: number | string | null } | null }>();
  const max = Number(data?.player?.skill_max ?? 0);
  await supabase.from("club_players").update({ current_stars: max }).eq("id", clubPlayerId);
}

export async function signSponsorContract(
  supabase: ServiceClient,
  params: {
    gameId: string;
    clubId: string;
    dealId: string;
    prestigeTier: ClubStatus;
    seasonNumber: number;
  },
) {
  const deal = getSponsorDealById(params.dealId);
  if (!deal) throw new Error("Deal not found");
  const endsSeason = params.seasonNumber + deal.duration_seasons - 1;
  const { error } = await supabase.from("club_sponsor_contracts").insert({
    game_id: params.gameId,
    club_id: params.clubId,
    deal_id: params.dealId,
    prestige_tier: params.prestigeTier,
    status: "active",
    signed_season: params.seasonNumber,
    ends_season: endsSeason,
    seasons_elapsed: 0,
    progress: createInitialProgress(),
  });
  if (error) throw error;
}

export async function hasActiveTrainingLock(supabase: ServiceClient, clubId: string): Promise<boolean> {
  const contracts = await loadClubSponsorContracts(supabase, clubId);
  const active = getActiveSponsorContract(contracts);
  if (!active || active.status !== "active") return false;
  return active.deal_id === "future_stars_foundation";
}
