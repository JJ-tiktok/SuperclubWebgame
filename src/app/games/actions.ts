"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setReadyAction, startGameAction } from "@/app/lobby/actions";
import { applyStatusTierUp, calculateManagerStageScore, calculateManagerStandingScore, getManagerScoreBand, getPlacementReward, getScoutingCapacity, getStadiumIncome, getTrainingCapacity } from "@/lib/game/rules";
import {
  canPlaceDeadlineBid,
  DEADLINE_BID_STEP,
  getDeadlineAuctionCount,
  getFirstDeadlineBidClubId,
  getNextDeadlineBidClubId,
} from "@/lib/lobby/deadline";
import { DRAFT_PLAYER_SELECT } from "@/lib/lobby/draft";
import { areArchetypesEnabled, normalizeApplicablePlayerArchetype, normalizePlayerArchetype } from "@/lib/lobby/archetypes";
import { createDraftRound, getSquadCounts, allDraftSquadsComplete } from "@/lib/lobby/draft-server";
import { getActiveCpuTeams, pickCpuTeamsForSeason } from "@/lib/lobby/cpu-teams";
import { canRecruitStaff, canUpgradeFacility, type UpgradeAction } from "@/lib/lobby/investments";
import {
  canUpgradeEndgameFacility,
  getEndgameFacilityLevel,
  getInvestmentActionLimit,
  getMedicalHealsRemaining,
  hasAutoMedicalCenter,
  isEndgameFacilityAction,
  getNlzTalentCountPerOffseason,
  resolveClubInvestmentStatus,
  type EndgameFacilityAction,
} from "@/lib/lobby/endgame-facilities";
import { buildLineupSnapshotFromPlayers, type LineupSnapshotClubPlayerRow } from "@/lib/lobby/lineup-snapshot";
import { applyDefaultGivenKeeperToLineupPowerPlayers, shouldUseDefaultGivenKeeper } from "@/lib/lobby/lineup-assignments";
import { getLineupLockValidation, getLineupValidationAfterSave } from "@/lib/lobby/lineup-lock-validation";
import { buildYouthPlayerSeed, isNlzOriginPlayer } from "@/lib/lobby/youth-generator";
import { calculateLineupPower, type CaptainBoost } from "@/lib/lobby/lineup-power";
import {
  ensureContinentalTournament,
  hasContinentalQualifiers,
  isContinentalTournamentComplete,
} from "@/app/games/actions/continental";
import { getNextLobbyPhase, getSettingsForNextPhase, isInvestmentPhase, shouldAdvanceSeason } from "@/lib/lobby/phases";
import { resolvePoachAttractivenessStars } from "@/lib/lobby/club-status";
import {
  maybeTriggerFinalSeason,
  processContinentalPrestigeAtCupEnd,
  processPrestigeAtSeasonEnd,
  processLastPlaceManagerAtSeasonEnd,
  recordQualifiedTransferSale,
  snapshotSeasonStartSquadStars,
} from "@/lib/lobby/prestige-server";
import { isPrestigeEnabled, normalizePrestigeState } from "@/lib/lobby/prestige";
import { incrementPlayerTenureForGame } from "@/lib/lobby/player-tenure";
import { applyClubPlayerInjury, getFixtureParticipantClubIds, healExpiredInjuriesForClubs } from "@/lib/lobby/injury";
import { isMarketPoolPlayer } from "@/lib/lobby/player-pool";
import {
  applyLastPlaceMoneyBonus,
  applyLastPlaceTrainingBonus,
  canClaimLastPlaceBonus,
  drawOffseasonGameChangerCandidates,
  getOffseasonCardCandidates,
  isOffseasonCardChoicePayload,
  markLastPlaceBonusClaimed,
  type LastPlaceBonusType,
} from "@/lib/lobby/last-place-bonus";
import {
  hasActiveTrainingLock,
  loadClubSponsorContracts,
  notifySponsorFixtureComplete,
  onSponsorNewSigning,
  onSponsorOffseasonBudgetCheck,
  onSponsorPlayerGrowth,
  onSponsorPlayerSold,
  onSponsorStadiumUpgrade,
  onSponsorTrainingUsed,
  processSponsorContractsAtSeasonEnd,
} from "@/lib/lobby/sponsoring-server";
import { isSponsoringEnabled, isStadiumUpgradeBlockedBySponsor } from "@/lib/lobby/sponsoring";
import {
  computeTrainingExtraPlayers,
  getOffseasonPromotionTargetSeason,
  isOffseasonPendingEffectWindow,
  isOffseasonPendingScopeActive,
  shouldPromoteOffseasonEffectsOnPhaseAdvance,
} from "@/lib/lobby/offseason-pending-effects";
import {
  buildSeasonFixtures,
  getMatchPoints,
  getMatchPointsMode,
  getRequiredCpuCount,
  getSeasonMode,
  getTargetLeagueSize,
  getThirdZones,
  resolveFixture,
  resolveOneThird,
  type FixtureSideInput,
  type MatchEventResult,
  type SeasonParticipant,
  type TacticalZone,
  type ThirdResult,
} from "@/lib/lobby/season";
import {
  applyAndKeepUnmatchedModifiers,
  applyImmediateEffect,
  buildPendingChoice,
  buildZoneModifiers,
  effectToPendingScope,
  enqueuePendingEffect,
  mergeModifiersIntoPartialResult,
  parseEffects,
  pickWeightedIndex,
  rollRetroWin,
  type GameChangerEffect,
  type ImmediateContext,
  type InjuryCandidate,
  type MatchCardModifierPayload,
  type PartialResult,
  type PendingChoice,
} from "@/lib/game/game-changer-effects";
import { dispatchGameChangerEffects } from "@/lib/game/dispatch-game-changer-effects";
import { formatGameChangerNewsDetail } from "@/lib/game/game-changer-ui";
import type { GameChangerCategory } from "@/lib/lobby/types";
import {
  canBuyScoutedPlayer,
  getEffectiveScoutingDrawCapacity,
  getFreeScoutingDrawCount,
  getScoutingPurchasePrice,
  isOffseasonTransfersBlocked,
  canDrawScoutingPlayer,
  canResolveScoutedPlayer,
  canSellClubPlayer,
  resolveClubPlayerSaleValue,
  computeOffseasonScoutingBaseCapacity,
  getClubScoutingCapacity,
  isOffseasonPhase,
  isScoutingPileKey,
  sumStaffScoutingBonus,
} from "@/lib/lobby/scouting";
import {
  canTrainOwnedPlayer,
  applyNlzTrainingGuarantee,
  filterTrainingEventsForWindow,
  getTrainingStatus,
  parseTrainingEvent,
  resolveTrainingAttempt,
  type TrainingEventMetadata,
} from "@/lib/lobby/training";
import {
  computeCatalogPlayerMarketValues,
  computePlayerMarketValues,
  getClubPlayerMarketValues,
  resolvePlayerMarketMax,
  resolvePlayerPotentialCeiling,
  resolvePlayerSkillDisplayMax,
  syncOwnedPlayerRowMarketValues,
} from "@/lib/lobby/player-market";
import {
  canAcceptTransferOffer,
  canCreateTransferOffer,
  buildTransferOfferClosePayload,
  cancelOpenSwapTransferOffersForClubPlayer,
  getTransferOfferCreatorClubId,
  getTransferOfferResponderClubId,
  normalizeTransferCashAmount,
} from "@/lib/lobby/transfers";
import {
  canAcceptPoachRequest,
  canCreatePoachRequest,
  getPoachUnavailableSeason,
  isPlayerUnavailableForSeason,
  resolvePoachMinimumBid,
} from "@/lib/lobby/poach";
import {
  getClubPlayerDisplayNameFromRow,
  normalizeClubPlayerCustomName,
} from "@/lib/lobby/player-names";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { emitGameEvent } from "@/lib/lobby/emit-game-event";
import { cleanupGameHistory } from "@/lib/lobby/cleanup-history";
import type {
  DraftPickSnapshot,
  DraftPlayerRow,
  LobbyClub,
  LobbyGame,
  LobbyPhase,
  ScoutingDrawSnapshot,
} from "@/lib/lobby/types";

export async function setReadyFromDashboardAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const ready = String(formData.get("ready") || "") === "true";
  const supabase = createSupabaseServiceClient();

  if (gameId && roomCode) {
    const result = await setReadyAction(gameId, ready);
    if (result.ok && userId && supabase) {
      await emitGameEvent(supabase, {
        actorClerkUserId: userId,
        gameId,
        payload: { clerkUserId: userId, ready },
        type: "MEMBER_READY_CHANGED",
      });
    }
    revalidatePath(`/games/${roomCode}`);
  }

  redirect(`/games/${roomCode}`);
}

export async function startGameFromDashboardAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (gameId && roomCode) {
    const result = await startGameAction(gameId);
    if (result.ok && userId && supabase) {
      await emitGameEvent(supabase, {
        actorClerkUserId: userId,
        gameId,
        payload: { phase: "draft" },
        type: "PHASE_CHANGED",
      });
    }
    revalidatePath(`/games/${roomCode}`);
  }

  redirect(`/games/${roomCode}`);
}

export async function upgradeInvestmentAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const actionRaw = String(formData.get("action") || "");
  const supabase = createSupabaseServiceClient();
  const isClassic = isUpgradeAction(actionRaw);
  const isEndgame = isEndgameFacilityAction(actionRaw);

  if (!userId || !gameId || !roomCode || !clubId || (!isClassic && !isEndgame) || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const [{ data: game, error: gameError }, { data: club, error: clubError }] = await Promise.all([
    supabase
      .from("games")
      .select("id, room_code, phase, settings")
      .eq("id", gameId)
      .single<{ id: string; phase: LobbyPhase; room_code: string; settings: { seasonNumber?: number } }>(),
    supabase
      .from("clubs")
      .select(
        "id, game_id, clerk_user_id, money, training_level, scouting_level, stadium_level, medical_center_level, analytics_hub_level, youth_academy_level, construction_yard_built, status, status_override, status_override_until_season",
      )
      .eq("id", clubId)
      .eq("game_id", gameId)
      .single<LobbyClub>(),
  ]);

  if (gameError) {
    throw gameError;
  }

  if (clubError) {
    throw clubError;
  }

  if (club.clerk_user_id !== userId) {
    throw new Error("Du kannst nur deinen eigenen Club ausbauen.");
  }

  if (!isInvestmentPhase(game.phase)) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [{ data: investments, error: investmentsError }, { data: upgradeStaffRows }] = await Promise.all([
    supabase
      .from("investments")
      .select("action")
      .eq("club_id", clubId)
      .eq("season_number", seasonNumber)
      .returns<Array<{ action: string }>>(),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", clubId)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
  ]);

  if (investmentsError) {
    throw investmentsError;
  }

  const upgradeExtraBonus = (upgradeStaffRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "investment_action_bonus")
    .reduce((sum, e) => sum + Number(e.extra ?? 0), 0);
  const actionsThisSeason = (investments ?? []).map((investment) => investment.action);
  const actionLimit = getInvestmentActionLimit(upgradeExtraBonus, club.construction_yard_built ?? false);
  const clubStatus = resolveClubInvestmentStatus(club, seasonNumber);

  let check: { ok: true; cost: number } | { ok: false; reason: string };
  let clubUpdate: Record<string, unknown> = { money: 0 };
  const investmentAction = actionRaw;

  if (isEndgame) {
    const action = actionRaw as EndgameFacilityAction;
    const currentLevel = getEndgameFacilityLevel(club, action);
    const endgameCheck = canUpgradeEndgameFacility({
      action,
      actionsThisSeason,
      clubStatus,
      currentLevel,
      money: Number(club.money),
      actionLimit,
    });
    if (!endgameCheck.ok) {
      redirect(`/games/${roomCode}?view=grounds`);
    }
    check = endgameCheck;
    clubUpdate = { money: Number(club.money) - endgameCheck.cost };
    if (action === "construction_yard") {
      clubUpdate.construction_yard_built = true;
    } else if (action === "medical") {
      clubUpdate.medical_center_level = currentLevel + 1;
    } else if (action === "analytics") {
      clubUpdate.analytics_hub_level = currentLevel + 1;
    } else if (action === "youth_academy") {
      clubUpdate.youth_academy_level = currentLevel + 1;
    }
  } else {
    const action = actionRaw as UpgradeAction;
    const currentLevel = getClubFacilityLevel(club, action);
    const classicCheck = canUpgradeFacility({
      action,
      actionsThisSeason,
      currentLevel,
      extraActionBonus: upgradeExtraBonus,
      money: Number(club.money),
      actionLimit,
    });
    if (!classicCheck.ok) {
      redirect(`/games/${roomCode}?view=grounds`);
    }
    check = classicCheck;
    clubUpdate = {
      [`${action}_level`]: currentLevel + 1,
      money: Number(club.money) - classicCheck.cost,
    };

    if (action === "stadium" && isSponsoringEnabled(game.settings)) {
      const sponsorContracts = await loadClubSponsorContracts(supabase, clubId);
      if (isStadiumUpgradeBlockedBySponsor(sponsorContracts)) {
        redirect(`/games/${roomCode}?view=grounds&sponsor_error=${encodeURIComponent("Denkmalschutz: Stadionausbau während Sponsoring gesperrt")}`);
      }
    }
  }

  const { error: investmentError } = await supabase.from("investments").insert({
    action: investmentAction,
    club_id: clubId,
    cost: check.cost,
    game_id: gameId,
    season_number: seasonNumber,
  });

  if (investmentError) {
    throw investmentError;
  }

  const { error: updateClubError } = await supabase
    .from("clubs")
    .update(clubUpdate)
    .eq("id", clubId)
    .eq("clerk_user_id", userId);

  if (updateClubError) {
    throw updateClubError;
  }

  if (isClassic && actionRaw === "stadium" && isSponsoringEnabled(game.settings)) {
    await onSponsorStadiumUpgrade(supabase, clubId, seasonNumber);
  }

  const { error: saveError } = await supabase
    .from("games")
    .update({
      last_saved_at: new Date().toISOString(),
      last_saved_by_clerk_user_id: userId,
      save_status: "active",
    })
    .eq("id", gameId);

  if (saveError) {
    throw saveError;
  }

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}

export async function makeDraftPickAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const submittedClubId = String(formData.get("club_id") || "");
  const playerId = String(formData.get("player_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !submittedClubId || !playerId || !supabase) {
    redirect(`/games/${roomCode}?view=draft`);
  }

  const [{ data: game, error: gameError }, { data: clubs, error: clubsError }] = await Promise.all([
    supabase
      .from("games")
      .select("id, room_code, phase, host_clerk_user_id, current_turn_club_id, settings")
      .eq("id", gameId)
      .single<LobbyGame>(),
    supabase
      .from("clubs")
      .select("id, game_id, clerk_user_id, club_name, manager_name, money, points, is_ready, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>(),
  ]);

  if (gameError) {
    throw gameError;
  }

  if (clubsError) {
    throw clubsError;
  }

  if (game.phase !== "draft") {
    redirect(`/games/${roomCode}?view=draft`);
  }

  const ownClub = (clubs ?? []).find((club) => club.clerk_user_id === userId);

  if (!ownClub || ownClub.id !== submittedClubId) {
    throw new Error("Du kannst nur fuer deinen eigenen Club draften.");
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("draft_rounds")
    .select("id, game_id, round_index, board_player_ids, pick_order_club_ids, picks, completed")
    .eq("game_id", gameId)
    .eq("completed", false)
    .order("round_index", { ascending: false })
    .limit(1)
    .returns<
      Array<{
        id: string;
        game_id: string;
        round_index: number;
        board_player_ids: string[];
        pick_order_club_ids: string[];
        picks: DraftPickSnapshot[];
        completed: boolean;
      }>
    >();

  if (roundsError) {
    throw roundsError;
  }

  const draftRound = rounds?.[0];

  if (!draftRound) {
    throw new Error("Kein aktives Draftboard gefunden.");
  }

  const picks = Array.isArray(draftRound.picks) ? draftRound.picks : [];
  const currentClubId = draftRound.pick_order_club_ids[picks.length];
  const alreadyPicked = picks.some((pick) => pick.playerId === playerId);

  if (currentClubId !== ownClub.id || game.current_turn_club_id !== ownClub.id) {
    throw new Error("Du bist aktuell nicht am Zug.");
  }

  if (!draftRound.board_player_ids.includes(playerId) || alreadyPicked) {
    throw new Error("Dieser Spieler ist nicht mehr verfuegbar.");
  }

  const [{ data: player, error: playerError }, squadCounts] = await Promise.all([
    supabase
      .from("players")
      .select("id, base_stars, potential_stars, skill_max")
      .eq("id", playerId)
      .single<{ id: string; base_stars: number; potential_stars: number | string; skill_max: number | string | null }>(),
    getSquadCounts(
      supabase,
      (clubs ?? []).map((club) => club.id),
    ),
  ]);

  if (playerError) {
    throw playerError;
  }

  if (Number(player.base_stars) > Number(game.settings?.max_draft_stars ?? 5)) {
    throw new Error("Dieser Spieler ueberschreitet das Sternlimit fuer diesen Draft.");
  }

  if ((squadCounts.get(ownClub.id) ?? 0) >= 16) {
    throw new Error("Dein Draftkader ist bereits voll.");
  }

  const draftPurchasePrice = computeCatalogPlayerMarketValues(player).scoutingPrice;

  const { error: insertError } = await supabase.from("club_players").insert({
    club_id: ownClub.id,
    current_stars: player.base_stars,
    current_zone: "bench",
    player_id: playerId,
    purchase_price: draftPurchasePrice,
    stars_at_acquisition: player.base_stars,
  });

  if (insertError) {
    throw insertError;
  }

  const squadStats = await syncClubSquadCache(supabase, ownClub.id);
  const ownSquadStats = squadStats.get(ownClub.id);

  const nextPicks: DraftPickSnapshot[] = [
    ...picks,
    {
      pickIndex: picks.length,
      clubId: ownClub.id,
      playerId,
      pickedAt: new Date().toISOString(),
    },
  ];
  const roundComplete = nextPicks.length >= draftRound.board_player_ids.length;

  const { error: updateRoundError } = await supabase
    .from("draft_rounds")
    .update({ picks: nextPicks, completed: roundComplete })
    .eq("id", draftRound.id);

  if (updateRoundError) {
    throw updateRoundError;
  }

  const nextSquadCounts = new Map(squadCounts);
  nextSquadCounts.set(ownClub.id, (nextSquadCounts.get(ownClub.id) ?? 0) + 1);

  if (roundComplete) {
    const clubIds = (clubs ?? []).map((club) => club.id);

    if (allDraftSquadsComplete(nextSquadCounts, clubIds)) {
      const { error: clearTurnError } = await supabase.from("games").update({ current_turn_club_id: null }).eq("id", gameId);

      if (clearTurnError) {
        throw clearTurnError;
      }
    } else {
      await createDraftRound({
        supabase,
        game,
        clubs: clubs ?? [],
        roundIndex: draftRound.round_index + 1,
      });
    }
  } else {
    const nextClubId = draftRound.pick_order_club_ids[nextPicks.length] ?? null;
    const { error: turnError } = await supabase.from("games").update({ current_turn_club_id: nextClubId }).eq("id", gameId);

    if (turnError) {
      throw turnError;
    }
  }

  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      nextClubId: roundComplete ? null : draftRound.pick_order_club_ids[nextPicks.length] ?? null,
      pickIndex: nextPicks.at(-1)?.pickIndex ?? picks.length,
      pickedAt: nextPicks.at(-1)?.pickedAt,
      playerId,
      roundComplete,
      roundId: draftRound.id,
      squadCount: ownSquadStats?.squad_size ?? nextSquadCounts.get(ownClub.id) ?? 0,
      squadStars: ownSquadStats?.squad_stars,
    },
    type: "DRAFT_PICK_MADE",
  });

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=draft`);
}

export async function trainPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const allowTestMode = String(formData.get("allow_test_mode") || "") === "true";
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubPlayerId || !supabase) {
    redirect(`/games/${roomCode}?view=training`);
  }

  const [{ data: game, error: gameError }, { data: ownedPlayer, error: ownedPlayerError }] = await Promise.all([
    supabase
      .from("games")
      .select("id, room_code, phase, host_clerk_user_id, settings")
      .eq("id", gameId)
      .single<LobbyGame>(),
    supabase
      .from("club_players")
      .select(
        `id, club_id, player_id, current_stars, injured,
        club:clubs!club_players_club_id_fkey(id, game_id, clerk_user_id, training_level, offseason_training_capacity, youth_academy_level),
        player:players(id, skill_max, potential_stars, metadata, base_stars)`,
      )
      .eq("id", clubPlayerId)
      .single<{
        id: string;
        club_id: string;
        player_id: string;
        current_stars: number | string;
        injured: boolean;
        club: {
          id: string;
          game_id: string;
          clerk_user_id: string;
          training_level: number;
          offseason_training_capacity: number | null;
          youth_academy_level?: number | null;
        };
        player: {
          id: string;
          base_stars?: number | string | null;
          skill_max: number | string | null;
          potential_stars?: number | string | null;
          metadata?: Record<string, unknown> | null;
        };
      }>(),
  ]);

  if (gameError) {
    throw gameError;
  }

  if (ownedPlayerError) {
    throw ownedPlayerError;
  }

  if (ownedPlayer.club.game_id !== gameId || ownedPlayer.club.clerk_user_id !== userId) {
    throw new Error("Du kannst nur Spieler aus deinem eigenen Club trainieren.");
  }

  const isHostTestMode = allowTestMode && game.host_clerk_user_id === userId;
  if (game.phase !== "off_season" && game.phase !== "offseason_training" && !isHostTestMode) {
    redirect(`/games/${roomCode}?view=training`);
  }

  if (isSponsoringEnabled(game.settings) && await hasActiveTrainingLock(supabase, ownedPlayer.club_id)) {
    redirect(`/games/${roomCode}?view=training&sponsor_error=training_locked`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  // These two reads are independent: run them in parallel to save a round-trip.
  // The training history is scoped to the current season (matching the snapshot
  // loader) so it stays O(1) instead of scanning the whole club history.
  const [{ data: transactionRows, error: transactionsError }, { data: trainStaffRows }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, created_at, metadata")
      .eq("game_id", gameId)
      .eq("club_id", ownedPlayer.club_id)
      .eq("reason", "training")
      .contains("metadata", { season_number: seasonNumber })
      .order("created_at", { ascending: false })
      .limit(80)
      .returns<Array<{ id: string; created_at: string; metadata: unknown }>>(),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", ownedPlayer.club_id)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
  ]);

  if (transactionsError) {
    throw transactionsError;
  }

  const trainStaffEffects = (trainStaffRows ?? []).flatMap((s) => s.card?.effects ?? []);

  const trainingEvents = filterTrainingEventsForWindow(
    (transactionRows ?? [])
      .map(parseTrainingEvent)
      .filter((event): event is NonNullable<ReturnType<typeof parseTrainingEvent>> => Boolean(event)),
    { gamePhase: game.phase, seasonNumber },
  );

  if (isOffseasonPendingEffectWindow(game.phase)) {
    await transitionPendingEffectsToOffseason(supabase, gameId);
  }

  const baseCapacity = getTrainingCapacity(ownedPlayer.club.training_level).players;
  const pendingRows = await getActivePendingEffects(supabase, ownedPlayer.club_id);
  const offseasonPending = pendingRows.filter((eff) =>
    isOffseasonPendingScopeActive(eff.scope, game.phase),
  );
  const extraPlayers = computeTrainingExtraPlayers({
    baseCapacity,
    offseasonTrainingCapacity: ownedPlayer.club.offseason_training_capacity,
    staffEffects: trainStaffEffects,
    pendingEffects: offseasonPending,
    phase: game.phase,
  });

  const trainingStatus = getTrainingStatus({
    events: trainingEvents,
    trainingLevel: ownedPlayer.club.training_level,
    extraPlayers,
  });
  const currentStars = Math.trunc(Number(ownedPlayer.current_stars));
  const skillMax = resolvePlayerSkillDisplayMax({
    baseStars: ownedPlayer.player.base_stars,
    currentStars,
    potentialStars: ownedPlayer.player.potential_stars,
    skillMax: ownedPlayer.player.skill_max,
  });
  const eligibility = canTrainOwnedPlayer({
    alreadyTrained: trainingEvents.some((event) => event.club_player_id === ownedPlayer.id),
    attemptsUsed: trainingStatus.attempts_used,
    capacityPlayers: trainingStatus.capacity_players,
    currentStars,
    injured: ownedPlayer.injured,
    skillMax,
  });

  if (!eligibility.ok) {
    redirect(`/games/${roomCode}?view=training`);
  }

  const diceRoll = Math.floor(Math.random() * 6) + 1;
  const potentialCeiling = resolvePlayerPotentialCeiling({
    baseStars: ownedPlayer.player.base_stars,
    currentStars,
    potentialStars: ownedPlayer.player.potential_stars,
    skillMax: ownedPlayer.player.skill_max,
  });
  const nlzGuaranteed =
    (ownedPlayer.club.youth_academy_level ?? 0) >= 3 &&
    isNlzOriginPlayer(ownedPlayer.player.metadata) &&
    currentStars < potentialCeiling;

  const resolution = applyNlzTrainingGuarantee(
    resolveTrainingAttempt({
      currentStars,
      diceRoll,
      guaranteedBonusAvailable: trainingStatus.guaranteed_bonus_available,
      skillMax,
      trainingLevel: ownedPlayer.club.training_level ?? 1,
    }),
    { enabled: nlzGuaranteed, skillMax },
  );
  const metadata: TrainingEventMetadata = {
    after_stars: resolution.afterStars,
    before_stars: resolution.beforeStars,
    club_player_id: ownedPlayer.id,
    dice_roll: resolution.diceRoll,
    game_phase: game.phase,
    guaranteed_bonus_used: resolution.guaranteedBonusUsed,
    nlz_guaranteed_used: resolution.nlzGuaranteedUsed,
    player_id: ownedPlayer.player_id,
    season_number: seasonNumber,
    success: resolution.success,
    training_level: ownedPlayer.club.training_level,
  };

  const { error: updatePlayerError } = await supabase
    .from("club_players")
    .update({ current_stars: resolution.afterStars })
    .eq("id", ownedPlayer.id)
    .eq("club_id", ownedPlayer.club_id);

  if (updatePlayerError) {
    throw updatePlayerError;
  }

  const updatedSquadStats =
    resolution.afterStars !== resolution.beforeStars
      ? await syncClubSquadCache(supabase, ownedPlayer.club_id)
      : new Map<string, { squad_size: number; squad_stars: number }>();

  if (resolution.afterStars !== resolution.beforeStars) {
    await syncOwnedPlayerRowMarketValues(supabase, ownedPlayer.player_id, {
      current_stars: resolution.afterStars,
      player: ownedPlayer.player,
    });
  }

  const { error: insertTransactionError } = await supabase.from("transactions").insert({
    amount: 0,
    club_id: ownedPlayer.club_id,
    game_id: gameId,
    metadata,
    reason: "training",
  });

  if (insertTransactionError) {
    throw insertTransactionError;
  }

  if (isSponsoringEnabled(game.settings)) {
    await onSponsorTrainingUsed(supabase, ownedPlayer.club_id, seasonNumber);
  }

  const starsGained = resolution.afterStars - resolution.beforeStars;
  if (starsGained > 0 && isSponsoringEnabled(game.settings)) {
    await onSponsorPlayerGrowth(supabase, ownedPlayer.club_id, seasonNumber, starsGained);
  }

  const { error: saveError } = await supabase
    .from("games")
    .update({
      last_saved_at: new Date().toISOString(),
      last_saved_by_clerk_user_id: userId,
      save_status: "active",
    })
    .eq("id", gameId);

  if (saveError) {
    throw saveError;
  }

  if (starsGained > 0) {
    await emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        clubId: ownedPlayer.club_id,
        clubPlayerId: ownedPlayer.id,
        currentStars: resolution.afterStars,
        needsRefetch: false,
        squadStars: updatedSquadStats.get(ownedPlayer.club_id)?.squad_stars,
      },
      type: "SAVE_UPDATED",
    });
  }

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=training`);
}

async function calculateLiveScoutingCapacity(supabase: SupabaseServiceClient, club: LobbyClub) {
  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("card:staff_cards(effects)")
    .eq("club_id", club.id)
    .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>();
  const bonus = sumStaffScoutingBonus((staffRows ?? []).flatMap((s) => s.card?.effects ?? []));
  return getClubScoutingCapacity(club) + bonus;
}

/**
 * Base scouting draws for this off-season (facility snapshot at phase start).
 * If no snapshot exists yet but the club already drew cards, grandfather the
 * count so mid-off-season upgrades do not block buy/pass.
 */
async function resolveScoutingBaseCapacity(
  supabase: SupabaseServiceClient,
  club: LobbyClub,
  drawnCount: number,
  seasonNumber: number,
): Promise<number> {
  const staffBonus = sumStaffScoutingBonus(
    (
      await supabase
        .from("club_staff")
        .select("card:staff_cards(effects)")
        .eq("club_id", club.id)
        .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>()
    ).data?.flatMap((s) => s.card?.effects ?? []) ?? [],
  );

  const { data: scoutingInvestments } = await supabase
    .from("investments")
    .select("id")
    .eq("club_id", club.id)
    .eq("season_number", seasonNumber)
    .eq("action", "scouting")
    .limit(1);

  const hadScoutingInvestment = (scoutingInvestments?.length ?? 0) > 0;
  const baseCapacity = computeOffseasonScoutingBaseCapacity({
    scoutingLevel: club.scouting_level ?? 1,
    snapshotCapacity: club.offseason_scouting_capacity,
    staffBonus,
    drawnCount,
    hadScoutingInvestmentThisSeason: hadScoutingInvestment,
  });

  if (
    club.offseason_scouting_capacity != null &&
    baseCapacity > club.offseason_scouting_capacity &&
    !hadScoutingInvestment
  ) {
    await supabase.from("clubs").update({ offseason_scouting_capacity: baseCapacity }).eq("id", club.id);
  } else if (club.offseason_scouting_capacity == null && drawnCount > 0 && baseCapacity > drawnCount) {
    await supabase.from("clubs").update({ offseason_scouting_capacity: drawnCount }).eq("id", club.id);
    return drawnCount;
  }

  return baseCapacity;
}

export async function drawScoutingPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const pileKey = String(formData.get("pile_key") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !isScoutingPileKey(pileKey) || !supabase) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const { game, ownClub, clubs } = await getGameClubContext(supabase, gameId, userId);
  if ((game.phase !== "off_season" && game.phase !== "offseason_scouting") || ownClub.id !== clubId) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  if (isOffseasonPendingEffectWindow(game.phase)) {
    await transitionPendingEffectsToOffseason(supabase, gameId);
  }

  const scoutingPendingEffects = (await getActivePendingEffects(supabase, ownClub.id)).filter((eff) =>
    isOffseasonPendingScopeActive(eff.scope, game.phase),
  );
  const scoutingBlocked = scoutingPendingEffects.some((eff) => {
    if (eff.effect_type !== "offseason_lock") return false;
    const blocks = ((eff.payload as { blocks?: string[] }).blocks ?? []);
    return blocks.includes("scouting");
  });

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const draws = await getScoutingDraws(supabase, gameId, seasonNumber);
  const ownDraws = draws.filter((draw) => draw.club_id === ownClub.id);
  const baseCapacity = await resolveScoutingBaseCapacity(supabase, ownClub, ownDraws.length, seasonNumber);
  const freeDrawCount = getFreeScoutingDrawCount(scoutingPendingEffects, game.phase);
  const effectiveCapacity = getEffectiveScoutingDrawCapacity(baseCapacity, scoutingPendingEffects, game.phase);
  const freeDrawEffect = scoutingPendingEffects.find(
    (eff) => eff.effect_type === "free_scouting_draw" && Number((eff.payload as { count?: number }).count ?? 0) > 0,
  );
  const drawCheck = canDrawScoutingPlayer({
    drawnCount: ownDraws.length,
    ownClubId: ownClub.id,
    scoutingCapacity: effectiveCapacity,
  });

  if (scoutingBlocked && ownDraws.length >= baseCapacity && freeDrawCount === 0) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  if (!drawCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  // Consume one free_scouting_draw use if the draw goes beyond base capacity
  let consumeFreeDrawId: string | null = null;
  if (freeDrawEffect && ownDraws.length >= baseCapacity) {
    const remaining = freeDrawCount - 1;
    if (remaining <= 0) {
      consumeFreeDrawId = freeDrawEffect.id;
    } else {
      await supabase
        .from("club_pending_effects")
        .update({ payload: { ...(freeDrawEffect.payload as object), count: remaining } })
        .eq("id", freeDrawEffect.id);
    }
  }

  const selectedPlayer = await pickAvailableScoutingPlayer({
    clubs,
    draws,
    gameId,
    seasonNumber,
    supabase,
  });

  if (!selectedPlayer) {
    throw new Error("Kein verfuegbarer Spieler fuer Scouting gefunden.");
  }

  const { data: insertedDraw, error: insertError } = await supabase.from("scouting_draws").insert({
    club_id: ownClub.id,
    draw_index: ownDraws.length,
    game_id: gameId,
    pile_key: pileKey,
    player_id: selectedPlayer.id,
    season_number: seasonNumber,
    status: "drawn",
  }).select("id, created_at").single<{ created_at: string; id: string }>();

  if (insertError) {
    throw insertError;
  }

  if (consumeFreeDrawId) {
    await consumePendingEffects(supabase, [consumeFreeDrawId]);
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      createdAt: insertedDraw?.created_at,
      drawId: insertedDraw?.id,
      drawIndex: ownDraws.length,
      pileKey,
      player: selectedPlayer,
      playerId: selectedPlayer.id,
      seasonNumber,
    },
    type: "SCOUTING_CARD_DRAWN",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=scouting`);
}

export async function buyScoutedPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const drawId = String(formData.get("draw_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !drawId || !supabase) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "off_season" && game.phase !== "offseason_scouting") {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  if (isOffseasonPendingEffectWindow(game.phase)) {
    await transitionPendingEffectsToOffseason(supabase, gameId);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [draws, squadCount, buyStaffRows, buyPendingEffects] = await Promise.all([
    getScoutingDraws(supabase, gameId, seasonNumber),
    getClubSquadCount(supabase, ownClub.id),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", ownClub.id)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
    getActivePendingEffects(supabase, ownClub.id),
  ]);
  const draw = draws.find((item) => item.id === drawId);

  if (!draw || draw.club_id !== ownClub.id || draw.status !== "drawn") {
    redirect(`/games/${roomCode}?view=scouting&scouting_error=invalid_draw`);
  }

  const ownDraws = draws.filter((item) => item.club_id === ownClub.id);
  const drawBaseStars = Number(draw.player.base_stars ?? 1);
  const drawMarketMax = resolvePlayerMarketMax({
    baseStars: drawBaseStars,
    currentStars: drawBaseStars,
    potentialStars: draw.player.potential_stars,
    skillMax: draw.player.skill_max,
  });
  const baseScoutingPrice = computePlayerMarketValues({
    potentialCeiling: drawMarketMax,
    stars: drawBaseStars,
  }).scoutingPrice;
  const scoutingPendingEffects = buyPendingEffects.filter((eff) =>
    isOffseasonPendingScopeActive(eff.scope, game.phase),
  );
  const baseCapacity = await resolveScoutingBaseCapacity(supabase, ownClub, ownDraws.length, seasonNumber);
  const resolveCapacity = getEffectiveScoutingDrawCapacity(baseCapacity, scoutingPendingEffects, game.phase);

  const transfersBlocked = isOffseasonTransfersBlocked(buyPendingEffects, game.phase);
  if (transfersBlocked) {
    redirect(`/games/${roomCode}?view=scouting&scouting_error=transfers_blocked`);
  }

  const price = getScoutingPurchasePrice(baseScoutingPrice, buyPendingEffects);
  const transferDeltaEffect = buyPendingEffects.find(
    (eff) => eff.effect_type === "next_transfer_price_delta" && eff.scope === "next_transfer",
  );
  const freeBuyEffect = buyPendingEffects.find(
    (eff) =>
      eff.effect_type === "free_scouting_buy_next" &&
      eff.scope === "next_transfer" &&
      Number((eff.payload as { count?: number }).count ?? 0) > 0,
  );

  const buyCheck = canBuyScoutedPlayer({
    drawnCount: ownDraws.length,
    money: Number(ownClub.money),
    ownClubId: ownClub.id,
    playerPrice: price,
    scoutingCapacity: resolveCapacity,
    squadSize: squadCount,
    transfersBlocked,
  });

  if (!buyCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting&scouting_error=${buyCheck.reason}`);
  }

  const newSigningBonus = (buyStaffRows.data ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "new_signing_star_bonus")
    .reduce((sum, e) => sum + Number(e.stars ?? 0), 0);
  const playerSkillMax = Number(draw.player.skill_max ?? draw.player.base_stars);
  const newSigningStars = Math.min(playerSkillMax, draw.player.base_stars + newSigningBonus);

  await assertPlayerNotOwnedInGame(supabase, gameId, draw.player_id);

  const { error: insertClubPlayerError } = await supabase.from("club_players").insert({
    club_id: ownClub.id,
    current_stars: newSigningStars,
    current_zone: "bench",
    player_id: draw.player_id,
    purchase_price: price,
    stars_at_acquisition: newSigningStars,
  });

  if (insertClubPlayerError) {
    throw insertClubPlayerError;
  }

  const scoutingSquadStats = await syncClubSquadCache(supabase, ownClub.id);

  await syncOwnedPlayerRowMarketValues(supabase, draw.player_id, {
    current_stars: newSigningStars,
    player: draw.player,
  });

  const { error: clubError } = await supabase
    .from("clubs")
    .update({ money: Number(ownClub.money) - price })
    .eq("id", ownClub.id)
    .eq("clerk_user_id", userId);

  if (clubError) {
    throw clubError;
  }

  const now = new Date().toISOString();
  const { error: drawError } = await supabase
    .from("scouting_draws")
    .update({ resolved_at: now, status: "bought" })
    .eq("id", draw.id)
    .eq("club_id", ownClub.id)
    .eq("status", "drawn");

  if (drawError) {
    throw drawError;
  }

  const { error: transactionError } = await supabase.from("transactions").insert({
    amount: -price,
    club_id: ownClub.id,
    game_id: gameId,
    metadata: {
      draw_id: draw.id,
      player_id: draw.player_id,
      season_number: seasonNumber,
    },
    reason: "scouting_purchase",
  });

  if (transactionError) {
    throw transactionError;
  }

  if (isSponsoringEnabled(game.settings)) {
    await onSponsorNewSigning(supabase, ownClub.id, seasonNumber, price);
  }

  // Consume one-shot transfer effects after a successful buy
  const toConsume: string[] = [];
  if (freeBuyEffect) toConsume.push(freeBuyEffect.id);
  if (transferDeltaEffect) toConsume.push(transferDeltaEffect.id);
  if (toConsume.length > 0) {
    await consumePendingEffects(supabase, toConsume);
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      drawId: draw.id,
      playerId: draw.player_id,
      price,
      resolvedAt: now,
      seasonNumber,
      squadStars: scoutingSquadStats.get(ownClub.id)?.squad_stars,
    },
    type: "SCOUTING_CARD_BOUGHT",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=scouting`);
}

export async function passScoutedPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const drawId = String(formData.get("draw_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !drawId || !supabase) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "off_season" && game.phase !== "offseason_scouting") {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  if (isOffseasonPendingEffectWindow(game.phase)) {
    await transitionPendingEffectsToOffseason(supabase, gameId);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const draws = await getScoutingDraws(supabase, gameId, seasonNumber);
  const draw = draws.find((item) => item.id === drawId);
  const ownDraws = draws.filter((item) => item.club_id === ownClub.id);
  const scoutingPendingEffects = (await getActivePendingEffects(supabase, ownClub.id)).filter((eff) =>
    isOffseasonPendingScopeActive(eff.scope, game.phase),
  );
  const baseCapacity = await resolveScoutingBaseCapacity(supabase, ownClub, ownDraws.length, seasonNumber);
  const resolveCapacity = getEffectiveScoutingDrawCapacity(baseCapacity, scoutingPendingEffects, game.phase);
  const resolveCheck = canResolveScoutedPlayer({
    drawnCount: ownDraws.length,
    ownClubId: ownClub.id,
    scoutingCapacity: resolveCapacity,
  });

  if (!draw || draw.club_id !== ownClub.id || draw.status !== "drawn" || !resolveCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting&scouting_error=${resolveCheck.ok ? "invalid_draw" : resolveCheck.reason}`);
  }

  const { error } = await supabase
    .from("scouting_draws")
    .update({ resolved_at: new Date().toISOString(), status: "passed" })
    .eq("id", draw.id)
    .eq("club_id", ownClub.id)
    .eq("status", "drawn");

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      drawId: draw.id,
      playerId: draw.player_id,
      resolvedAt: new Date().toISOString(),
      seasonNumber,
    },
    type: "SCOUTING_CARD_PASSED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=scouting`);
}

export async function passAllScoutedPlayersAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "off_season" && game.phase !== "offseason_scouting") {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const draws = await getScoutingDraws(supabase, gameId, seasonNumber);
  const openDrawIds = draws
    .filter((d) => d.club_id === ownClub.id && d.status === "drawn")
    .map((d) => d.id);

  if (openDrawIds.length === 0) {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const { error } = await supabase
    .from("scouting_draws")
    .update({ resolved_at: new Date().toISOString(), status: "passed" })
    .in("id", openDrawIds)
    .eq("club_id", ownClub.id)
    .eq("status", "drawn");

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      drawIds: openDrawIds,
      needsRefetch: true,
      seasonNumber,
    },
    type: "SCOUTING_STATUS_CHANGED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=scouting`);
}

export async function sellClubPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const returnView = String(formData.get("return_view") || "scouting");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubPlayerId || !supabase) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  const [{ game, ownClub }, { data: ownedPlayer, error: ownedPlayerError }] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    supabase
      .from("club_players")
      .select("id, club_id, current_stars, player_id, purchase_price, player:players(id, potential_stars, metadata)")
      .eq("id", clubPlayerId)
      .single<{
        club_id: string;
        current_stars: number | string;
        id: string;
        purchase_price?: number | string | null;
        player: { id: string; metadata?: Record<string, unknown> | null; potential_stars?: number | string | null };
        player_id: string;
      }>(),
  ]);

  if (ownedPlayerError) {
    throw ownedPlayerError;
  }

  if (ownedPlayer.club_id !== ownClub.id || !isOffseasonPhase(game.phase)) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  // Block when an offseason_lock with transfers is active
  const sellPendingEffects = await getActivePendingEffects(supabase, ownClub.id, "current_offseason");
  const sellBlocked = sellPendingEffects.some((eff) => {
    if (eff.effect_type !== "offseason_lock") return false;
    const blocks = ((eff.payload as { blocks?: string[] }).blocks ?? []);
    return blocks.includes("transfers");
  });
  if (sellBlocked) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [salesCount, squadCount] = await Promise.all([
    getPlayerSaleCount(supabase, gameId, ownClub.id, seasonNumber),
    getClubSquadCount(supabase, ownClub.id),
  ]);
  const saleCheck = canSellClubPlayer({ isOffseason: true, salesCount, squadSize: squadCount });

  if (!saleCheck.ok) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  const isRelease = saleCheck.mode === "release";
  const saleValue = resolveClubPlayerSaleValue({
    scoutingPrice: getClubPlayerMarketValues(ownedPlayer).scoutingPrice,
    squadSize: squadCount,
  });

  if (isPrestigeEnabled(game.settings) && !isRelease) {
    await recordQualifiedTransferSale(
      supabase,
      ownClub.id,
      saleValue,
      ownedPlayer.purchase_price == null ? null : Number(ownedPlayer.purchase_price),
      ownedPlayer.player.metadata,
    );
  }

  await cancelOpenSwapTransferOffersForClubPlayer(supabase, ownedPlayer.id, "cancelled");
  const { error: deleteError } = await supabase.from("club_players").delete().eq("id", ownedPlayer.id).eq("club_id", ownClub.id);

  if (deleteError) {
    throw deleteError;
  }

  const saleSquadStats = await syncClubSquadCache(supabase, ownClub.id);

  const { error: clubError } = await supabase
    .from("clubs")
    .update({ money: Number(ownClub.money) + saleValue })
    .eq("id", ownClub.id)
    .eq("clerk_user_id", userId);

  if (clubError) {
    throw clubError;
  }

  const { error: transactionError } = await supabase.from("transactions").insert({
    amount: saleValue,
    club_id: ownClub.id,
    game_id: gameId,
    metadata: {
      club_player_id: ownedPlayer.id,
      player_id: ownedPlayer.player_id,
      release_reason: isRelease ? "squad_over_capacity" : null,
      season_number: seasonNumber,
    },
    reason: isRelease ? "player_release" : "player_sale",
  });

  if (transactionError) {
    throw transactionError;
  }

  if (isSponsoringEnabled(game.settings)) {
    await onSponsorPlayerSold(supabase, ownClub.id, seasonNumber);
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      money: Number(ownClub.money) + saleValue,
      needsRefetch: false,
      squadSize: saleSquadStats.get(ownClub.id)?.squad_size,
      squadStars: saleSquadStats.get(ownClub.id)?.squad_stars,
    },
    type: "SAVE_UPDATED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=${returnView}`);
}

export async function createTransferOfferAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const targetClubPlayerId = String(formData.get("target_club_player_id") || "");
  const offeredClubPlayerIdRaw = String(formData.get("offered_club_player_id") || "");
  const offeredClubPlayerId = offeredClubPlayerIdRaw === "none" ? "" : offeredClubPlayerIdRaw;
  const cashAmount = normalizeTransferCashAmount(Number(formData.get("cash_amount_millions") || 0) * 1_000_000);
  const returnView = String(formData.get("return_view") || "") === "squad" ? "squad" : "transfer";
  const returnClubId = String(formData.get("return_club_id") || "");
  const returnPath =
    returnView === "squad" && returnClubId
      ? `/games/${roomCode}?view=squad&club=${encodeURIComponent(returnClubId)}`
      : `/games/${roomCode}?view=${returnView}`;
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !targetClubPlayerId || !supabase) {
    redirect(returnPath);
  }

  const [{ game, ownClub }, { data: target, error: targetError }] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    supabase
      .from("club_players")
      .select("id, club_id, player_id, club:clubs!club_players_club_id_fkey!inner(id, game_id, clerk_user_id)")
      .eq("id", targetClubPlayerId)
      .single<{
        club: { game_id: string; id: string; clerk_user_id: string };
        club_id: string;
        id: string;
        player_id: string;
      }>(),
  ]);

  if (targetError) {
    throw targetError;
  }

  if (target.club.game_id !== gameId) {
    redirect(returnPath);
  }

  let offeredPlayerId: string | null = null;
  if (offeredClubPlayerId) {
    const { data: offered, error: offeredError } = await supabase
      .from("club_players")
      .select("id, club_id, player_id")
      .eq("id", offeredClubPlayerId)
      .single<{ club_id: string; id: string; player_id: string }>();

    if (offeredError) {
      throw offeredError;
    }

    if (offered.club_id !== ownClub.id) {
      redirect(returnPath);
    }

    offeredPlayerId = offered.player_id;
  }

  const transfersBlocked =
    (await isClubTransferBlocked(supabase, ownClub.id, game.phase)) ||
    (await isClubTransferBlocked(supabase, target.club_id, game.phase));
  const offerCheck = canCreateTransferOffer({
    cashAmount,
    hasOfferedPlayer: Boolean(offeredClubPlayerId),
    isOffseason: isOffseasonPhase(game.phase),
    targetOwnClub: target.club_id === ownClub.id,
    transfersBlocked,
  });

  if (!offerCheck.ok) {
    redirect(returnPath);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [{ data: existingTargetOffers, error: existingTargetError }, offeredConflictResult] = await Promise.all([
    supabase
      .from("transfer_offers")
      .select("id")
      .eq("from_club_id", ownClub.id)
      .eq("target_club_player_id", target.id)
      .eq("status", "open")
      .limit(1)
      .returns<Array<{ id: string }>>(),
    offeredClubPlayerId
      ? supabase
          .from("transfer_offers")
          .select("id")
          .eq("offered_club_player_id", offeredClubPlayerId)
          .eq("status", "open")
          .limit(1)
          .returns<Array<{ id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingTargetError) {
    throw existingTargetError;
  }

  if (offeredConflictResult.error) {
    throw offeredConflictResult.error;
  }

  if (existingTargetOffers?.length || offeredConflictResult.data?.length) {
    redirect(returnPath);
  }

  const { data: insertedOffer, error: insertError } = await supabase.from("transfer_offers").insert({
    cash_amount: cashAmount,
    created_by_club_id: ownClub.id,
    from_club_id: ownClub.id,
    game_id: gameId,
    offered_club_player_id: offeredClubPlayerId || null,
    offered_player_id: offeredPlayerId,
    responder_club_id: target.club_id,
    season_number: seasonNumber,
    target_club_player_id: target.id,
    target_player_id: target.player_id,
    to_club_id: target.club_id,
  }).select("id").single<{ id: string }>();

  if (insertError) {
    throw insertError;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: ownClub.id,
      needsRefetch: true,
      offerId: insertedOffer?.id,
      toClubId: target.club_id,
    },
    type: "TRANSFER_OFFER_CREATED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(returnPath);
}

export async function renameClubPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const returnViewRaw = String(formData.get("return_view") || "squad");
  const returnView = returnViewRaw === "transfer" || returnViewRaw === "lineup" || returnViewRaw === "training" ? returnViewRaw : "squad";
  const returnPath = `/games/${roomCode}?view=${returnView}`;
  const normalized = normalizeClubPlayerCustomName(formData.get("custom_name"));
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubPlayerId || !supabase || !normalized.ok) {
    redirect(returnPath);
  }

  const [{ ownClub }, { data: ownedPlayer, error: ownedPlayerError }] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    supabase
      .from("club_players")
      .select("id, club_id, player:players(display_name)")
      .eq("id", clubPlayerId)
      .maybeSingle<{ club_id: string; id: string; player: { display_name?: string | null } | null }>(),
  ]);

  if (ownedPlayerError) {
    throw ownedPlayerError;
  }

  if (!ownedPlayer || ownedPlayer.club_id !== ownClub.id) {
    redirect(returnPath);
  }

  const { error } = await supabase
    .from("club_players")
    .update({ custom_name: normalized.value })
    .eq("id", clubPlayerId)
    .eq("club_id", ownClub.id);

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      clubPlayerId,
      customName: normalized.value,
      displayName: normalized.value || getClubPlayerDisplayNameFromRow(ownedPlayer),
      needsRefetch: true,
    },
    type: "SAVE_UPDATED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(returnPath);
}

export async function counterTransferOfferAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const offerId = String(formData.get("offer_id") || "");
  const offeredClubPlayerIdRaw = String(formData.get("offered_club_player_id") || "");
  const offeredClubPlayerId = offeredClubPlayerIdRaw === "none" ? "" : offeredClubPlayerIdRaw;
  const cashAmount = normalizeTransferCashAmount(Number(formData.get("cash_amount_millions") || 0) * 1_000_000);
  const supabase = createSupabaseServiceClient();
  const returnPath = `/games/${roomCode}?view=transfer`;

  if (!userId || !gameId || !roomCode || !offerId || !supabase) {
    redirect(returnPath);
  }

  const [{ game, ownClub }, offer] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getTransferOfferForAction(supabase, offerId, gameId),
  ]);

  if (!offer || offer.status !== "open" || offer.to_club_id !== ownClub.id) {
    redirect(returnPath);
  }

  let offeredPlayerId: string | null = null;
  if (offeredClubPlayerId) {
    const { data: offered, error: offeredError } = await supabase
      .from("club_players")
      .select("id, club_id, player_id")
      .eq("id", offeredClubPlayerId)
      .single<{ club_id: string; id: string; player_id: string }>();

    if (offeredError) {
      throw offeredError;
    }

    if (offered.club_id !== offer.from_club_id) {
      redirect(returnPath);
    }

    offeredPlayerId = offered.player_id;
  }

  const transfersBlocked =
    (await isClubTransferBlocked(supabase, offer.from_club_id, game.phase)) ||
    (await isClubTransferBlocked(supabase, offer.to_club_id, game.phase));
  const offerCheck = canCreateTransferOffer({
    cashAmount,
    hasOfferedPlayer: Boolean(offeredClubPlayerId),
    isOffseason: isOffseasonPhase(game.phase),
    targetOwnClub: false,
    transfersBlocked,
  });

  if (!offerCheck.ok) {
    redirect(returnPath);
  }

  const [{ data: existingTargetOffers, error: existingTargetError }, offeredConflictResult] = await Promise.all([
    supabase
      .from("transfer_offers")
      .select("id")
      .eq("from_club_id", offer.from_club_id)
      .eq("target_club_player_id", offer.target_club_player_id)
      .eq("status", "open")
      .neq("id", offer.id)
      .limit(1)
      .returns<Array<{ id: string }>>(),
    offeredClubPlayerId
      ? supabase
          .from("transfer_offers")
          .select("id")
          .eq("offered_club_player_id", offeredClubPlayerId)
          .eq("status", "open")
          .neq("id", offer.id)
          .limit(1)
          .returns<Array<{ id: string }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingTargetError) {
    throw existingTargetError;
  }

  if (offeredConflictResult.error) {
    throw offeredConflictResult.error;
  }

  if (existingTargetOffers?.length || offeredConflictResult.data?.length) {
    redirect(returnPath);
  }

  const now = new Date().toISOString();
  const { data: counteredOffer, error: counteredError } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("countered", now))
    .eq("id", offer.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (counteredError) {
    throw counteredError;
  }

  if (!counteredOffer) {
    redirect(returnPath);
  }

  const { data: insertedOffer, error: insertError } = await supabase.from("transfer_offers").insert({
    cash_amount: cashAmount,
    created_by_club_id: ownClub.id,
    from_club_id: offer.from_club_id,
    game_id: gameId,
    offered_club_player_id: offeredClubPlayerId || null,
    offered_player_id: offeredPlayerId,
    parent_offer_id: offer.id,
    responder_club_id: offer.from_club_id,
    season_number: offer.season_number,
    target_club_player_id: offer.target_club_player_id,
    target_player_id: offer.target_player_id,
    to_club_id: offer.to_club_id,
  }).select("id").single<{ id: string }>();

  if (insertError) {
    throw insertError;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: offer.from_club_id,
      needsRefetch: true,
      offerId: offer.id,
      status: "countered",
      toClubId: offer.to_club_id,
    },
    type: "TRANSFER_OFFER_RESOLVED",
  });
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: offer.from_club_id,
      needsRefetch: true,
      offerId: insertedOffer?.id,
      parentOfferId: offer.id,
      toClubId: offer.to_club_id,
    },
    type: "TRANSFER_OFFER_CREATED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(returnPath);
}

export async function acceptTransferOfferAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const offerId = String(formData.get("offer_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !offerId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ game, ownClub }, offer] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getTransferOfferForAction(supabase, offerId, gameId),
  ]);

  if (!offer || offer.status !== "open" || getTransferOfferResponderClubId(offer) !== ownClub.id) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [
    { data: clubs, error: clubsError },
    { data: targetPlayer, error: targetPlayerError },
    offeredPlayerResult,
    buyerSquadSize,
    sellerSquadSize,
    buyerDepartureCount,
    sellerDepartureCount,
  ] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, money")
      .in("id", [offer.from_club_id, offer.to_club_id])
      .returns<Array<{ id: string; money: number | string }>>(),
    supabase
      .from("club_players")
      .select("id, club_id, player_id, current_stars, purchase_price, player:players(metadata)")
      .eq("id", offer.target_club_player_id)
      .maybeSingle<{
        club_id: string;
        current_stars: number | string;
        id: string;
        player: { metadata?: Record<string, unknown> | null } | null;
        player_id: string;
        purchase_price?: number | string | null;
      }>(),
    offer.offered_club_player_id
      ? supabase
          .from("club_players")
          .select("id, club_id, player_id, current_stars")
          .eq("id", offer.offered_club_player_id)
          .maybeSingle<{ club_id: string; current_stars: number | string; id: string; player_id: string }>()
      : Promise.resolve({ data: null, error: null }),
    getClubSquadCount(supabase, offer.from_club_id),
    getClubSquadCount(supabase, offer.to_club_id),
    getManagerTransferDepartureCount(supabase, gameId, offer.from_club_id, offer.season_number),
    getManagerTransferDepartureCount(supabase, gameId, offer.to_club_id, offer.season_number),
  ]);

  if (clubsError) throw clubsError;
  if (targetPlayerError) throw targetPlayerError;
  if (offeredPlayerResult.error) throw offeredPlayerResult.error;

  if (!targetPlayer || targetPlayer.club_id !== offer.to_club_id) {
    await expireTransferOffer(supabase, offer.id);
    redirect(`/games/${roomCode}?view=transfer`);
  }

  if (offer.offered_club_player_id && (!offeredPlayerResult.data || offeredPlayerResult.data.club_id !== offer.from_club_id)) {
    await expireTransferOffer(supabase, offer.id);
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const buyer = clubs?.find((club) => club.id === offer.from_club_id);
  const seller = clubs?.find((club) => club.id === offer.to_club_id);

  if (!buyer || !seller) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const transfersBlocked =
    (await isClubTransferBlocked(supabase, offer.from_club_id, game.phase)) ||
    (await isClubTransferBlocked(supabase, offer.to_club_id, game.phase));
  const acceptCheck = canAcceptTransferOffer({
    buyerDepartureCount,
    buyerGivesPlayer: Boolean(offer.offered_club_player_id),
    buyerMoney: Number(buyer.money),
    buyerSquadSize,
    cashAmount: Number(offer.cash_amount),
    isOffseason: isOffseasonPhase(game.phase),
    sellerDepartureCount,
    sellerSquadSize,
    transfersBlocked,
  });

  if (!acceptCheck.ok) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const now = new Date().toISOString();
  const movedClubPlayerIds = [offer.target_club_player_id, offer.offered_club_player_id].filter((id): id is string => Boolean(id));
  const mutationResults = await Promise.all([
    supabase.from("clubs").update({ money: Number(buyer.money) - Number(offer.cash_amount) }).eq("id", offer.from_club_id),
    supabase.from("clubs").update({ money: Number(seller.money) + Number(offer.cash_amount) }).eq("id", offer.to_club_id),
    supabase
      .from("clubs")
      .update({ captain_club_player_id: null })
      .eq("id", offer.to_club_id)
      .eq("captain_club_player_id", offer.target_club_player_id),
    offer.offered_club_player_id
      ? supabase
          .from("clubs")
          .update({ captain_club_player_id: null })
          .eq("id", offer.from_club_id)
          .eq("captain_club_player_id", offer.offered_club_player_id)
      : Promise.resolve({ error: null }),
    supabase
      .from("club_players")
      .update({
        acquired_at: now,
        club_id: offer.from_club_id,
        current_zone: "bench",
        lineup_slot: null,
        purchase_price: Number(offer.cash_amount),
        seasons_at_club: 1,
        stars_at_acquisition: Math.trunc(Number(targetPlayer.current_stars)),
      })
      .eq("id", offer.target_club_player_id)
      .eq("club_id", offer.to_club_id),
    offer.offered_club_player_id && offeredPlayerResult.data
      ? supabase
          .from("club_players")
          .update({
            acquired_at: now,
            club_id: offer.to_club_id,
            current_zone: "bench",
            lineup_slot: null,
            seasons_at_club: 1,
            stars_at_acquisition: Math.trunc(Number(offeredPlayerResult.data.current_stars)),
          })
          .eq("id", offer.offered_club_player_id)
          .eq("club_id", offer.from_club_id)
      : Promise.resolve({ error: null }),
    supabase
      .from("transfer_offers")
      .update({ resolved_at: now, status: "accepted" })
      .eq("id", offer.id)
      .eq("status", "open"),
  ]);
  const mutationError = mutationResults.find((result) => result.error)?.error;
  if (mutationError) {
    throw mutationError;
  }

  if (isPrestigeEnabled(game.settings)) {
    await recordQualifiedTransferSale(
      supabase,
      offer.to_club_id,
      Number(offer.cash_amount),
      targetPlayer.purchase_price == null ? null : Number(targetPlayer.purchase_price),
      targetPlayer.player?.metadata ?? null,
    );
  }

  await syncClubSquadCache(supabase, [offer.from_club_id, offer.to_club_id]);

  await expireCompetingTransferOffers(supabase, {
    acceptedOfferId: offer.id,
    clubPlayerIds: movedClubPlayerIds,
    gameId,
    seasonNumber: offer.season_number,
  });

  const transactionRows = [
    {
      amount: -Number(offer.cash_amount),
      club_id: offer.from_club_id,
      game_id: gameId,
      metadata: buildManagerTransferMetadata(offer, "buyer"),
      reason: "manager_transfer",
    },
    {
      amount: Number(offer.cash_amount),
      club_id: offer.to_club_id,
      game_id: gameId,
      metadata: buildManagerTransferMetadata(offer, "seller"),
      reason: "manager_transfer",
    },
  ];
  const { error: transactionError } = await supabase.from("transactions").insert(transactionRows);
  if (transactionError) {
    throw transactionError;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: offer.from_club_id,
      needsRefetch: true,
      offerId: offer.id,
      status: "accepted",
      toClubId: offer.to_club_id,
    },
    type: "TRANSFER_OFFER_RESOLVED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function declineTransferOfferAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const offerId = String(formData.get("offer_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !offerId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ ownClub }, offer] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getTransferOfferForAction(supabase, offerId, gameId),
  ]);

  if (!offer || getTransferOfferResponderClubId(offer) !== ownClub.id || offer.status !== "open") {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const { error } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("declined"))
    .eq("id", offer.id)
    .eq("status", "open");

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: offer.from_club_id,
      needsRefetch: false,
      offerId: offer.id,
      status: "declined",
      toClubId: offer.to_club_id,
    },
    type: "TRANSFER_OFFER_RESOLVED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function cancelTransferOfferAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const offerId = String(formData.get("offer_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !offerId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ ownClub }, offer] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getTransferOfferForAction(supabase, offerId, gameId),
  ]);

  if (!offer || getTransferOfferCreatorClubId(offer) !== ownClub.id || offer.status !== "open") {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const { error } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("cancelled"))
    .eq("id", offer.id)
    .eq("status", "open");

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      fromClubId: offer.from_club_id,
      needsRefetch: false,
      offerId: offer.id,
      status: "cancelled",
      toClubId: offer.to_club_id,
    },
    type: "TRANSFER_OFFER_RESOLVED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function createPoachRequestAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const targetClubPlayerId = String(formData.get("target_club_player_id") || "");
  const cashAmount = normalizeTransferCashAmount(Number(formData.get("cash_amount_millions") || 0) * 1_000_000);
  const supabase = createSupabaseServiceClient();
  const redirectTransfer = (params?: { error?: string; success?: boolean }) => {
    const search = new URLSearchParams({ view: "transfer" });
    if (params?.error) {
      search.set("poach_error", params.error);
    }
    if (params?.success) {
      search.set("poach_success", "1");
    }
    redirect(`/games/${roomCode}?${search.toString()}`);
  };

  if (!userId || !gameId || !roomCode || !targetClubPlayerId || !supabase) {
    const search = new URLSearchParams({ view: "transfer", poach_error: "invalid_target" });
    redirect(`/games/${roomCode}?${search.toString()}`);
  }

  const [{ game, ownClub }, { data: target, error: targetError }] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    supabase
      .from("club_players")
      .select(
        `id, club_id, player_id, current_stars, unavailable_until_season, club:clubs!club_players_club_id_fkey!inner(id, game_id, attractiveness_stars, status, status_override, status_override_until_season), player:players(${DRAFT_PLAYER_SELECT})`,
      )
      .eq("id", targetClubPlayerId)
      .single<{
        club: {
          attractiveness_stars?: number | string | null;
          game_id: string;
          id: string;
          status?: string | null;
          status_override?: string | null;
          status_override_until_season?: number | null;
        };
        club_id: string;
        current_stars: number | string;
        id: string;
        player: {
          base_stars?: number | string | null;
          minimum_bid?: number | string | null;
          potential_stars?: number | string | null;
          scouting_price?: number | string | null;
          skill_max?: number | string | null;
        };
        player_id: string;
        unavailable_until_season?: number | null;
      }>(),
  ]);

  if (targetError) {
    throw targetError;
  }

  if (target.club.game_id !== gameId || target.club_id === ownClub.id) {
    redirectTransfer({ error: "invalid_target" });
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [
    buyerSquadSize,
    { data: pairRequests, error: pairError },
    { data: lastSeasonRequests, error: lastSeasonError },
    { data: openTargetRequests, error: openTargetError },
  ] = await Promise.all([
    getClubSquadCount(supabase, ownClub.id),
    supabase
      .from("poach_requests")
      .select("id")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .eq("from_club_id", ownClub.id)
      .eq("to_club_id", target.club_id)
      .in("status", ["open", "accepted", "declined"])
      .limit(1)
      .returns<Array<{ id: string }>>(),
    supabase
      .from("poach_requests")
      .select("id")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber - 1)
      .eq("target_club_player_id", target.id)
      .in("status", ["open", "accepted", "declined"])
      .limit(1)
      .returns<Array<{ id: string }>>(),
    supabase
      .from("poach_requests")
      .select("id")
      .eq("from_club_id", ownClub.id)
      .eq("target_club_player_id", target.id)
      .eq("status", "open")
      .limit(1)
      .returns<Array<{ id: string }>>(),
  ]);

  if (pairError) throw pairError;
  if (lastSeasonError) throw lastSeasonError;
  if (openTargetError) throw openTargetError;

  const transfersBlocked =
    (await isClubTransferBlocked(supabase, ownClub.id, game.phase)) ||
    (await isClubTransferBlocked(supabase, target.club_id, game.phase));
  const minimumMarketValue = resolvePoachMinimumBid(target);
  const createCheck = canCreatePoachRequest({
    buyerAttractivenessStars: resolvePoachAttractivenessStars(ownClub, seasonNumber),
    buyerClubId: ownClub.id,
    buyerMoney: Number(ownClub.money),
    buyerSquadSize,
    cashAmount,
    currentSeason: seasonNumber,
    hasOpenRequestForPair: Boolean(pairRequests?.length),
    hasPoachRequestLastSeason: Boolean(lastSeasonRequests?.length),
    isOffseason: isOffseasonPhase(game.phase),
    minimumMarketValue,
    playerStars: Number(target.current_stars),
    sellerAttractivenessStars: resolvePoachAttractivenessStars(target.club, seasonNumber),
    sellerClubId: target.club_id,
    targetClubId: target.club_id,
    transfersBlocked,
    unavailableUntilSeason: target.unavailable_until_season,
  });

  if (!createCheck.ok) {
    redirectTransfer({ error: createCheck.reason });
  }

  if (openTargetRequests?.length) {
    redirectTransfer({ error: "pair_request_exists" });
  }

  const { error: insertError } = await supabase.from("poach_requests").insert({
    cash_amount: createCheck.cashAmount,
    from_club_id: ownClub.id,
    game_id: gameId,
    season_number: seasonNumber,
    target_club_player_id: target.id,
    target_player_id: target.player_id,
    to_club_id: target.club_id,
  });

  if (insertError) {
    throw insertError;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirectTransfer({ success: true });
}

export async function acceptPoachRequestAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const requestId = String(formData.get("request_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !requestId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ game, ownClub }, request] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getPoachRequestForAction(supabase, requestId, gameId),
  ]);

  if (!request || request.status !== "open" || request.to_club_id !== ownClub.id) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [
    { data: clubs, error: clubsError },
    { data: targetPlayer, error: targetPlayerError },
    buyerSquadSize,
  ] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, money")
      .in("id", [request.from_club_id, request.to_club_id])
      .returns<Array<{ id: string; money: number | string }>>(),
    supabase
      .from("club_players")
      .select("id, club_id, player_id, current_stars")
      .eq("id", request.target_club_player_id)
      .maybeSingle<{ club_id: string; current_stars: number | string; id: string; player_id: string }>(),
    getClubSquadCount(supabase, request.from_club_id),
  ]);

  if (clubsError) throw clubsError;
  if (targetPlayerError) throw targetPlayerError;

  if (!targetPlayer || targetPlayer.club_id !== request.to_club_id) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const buyer = clubs?.find((club) => club.id === request.from_club_id);
  const seller = clubs?.find((club) => club.id === request.to_club_id);
  if (!buyer || !seller) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const transfersBlocked =
    (await isClubTransferBlocked(supabase, request.from_club_id, game.phase)) ||
    (await isClubTransferBlocked(supabase, request.to_club_id, game.phase));
  const acceptCheck = canAcceptPoachRequest({
    buyerMoney: Number(buyer.money),
    buyerSquadSize,
    cashAmount: Number(request.cash_amount),
    isOffseason: isOffseasonPhase(game.phase),
    sellerClubId: request.to_club_id,
    status: request.status,
    targetClubId: targetPlayer.club_id,
    transfersBlocked,
  });

  if (!acceptCheck.ok) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const now = new Date().toISOString();
  const mutationResults = await Promise.all([
    supabase.from("clubs").update({ money: Number(buyer.money) - Number(request.cash_amount) }).eq("id", request.from_club_id),
    supabase.from("clubs").update({ money: Number(seller.money) + Number(request.cash_amount) }).eq("id", request.to_club_id),
    supabase
      .from("clubs")
      .update({ captain_club_player_id: null })
      .eq("id", request.to_club_id)
      .eq("captain_club_player_id", request.target_club_player_id),
    supabase
      .from("club_players")
      .update({
        acquired_at: now,
        club_id: request.from_club_id,
        current_zone: "bench",
        lineup_slot: null,
        purchase_price: Number(request.cash_amount),
        seasons_at_club: 1,
        stars_at_acquisition: Math.trunc(Number(targetPlayer.current_stars)),
        unavailable_until_season: null,
      })
      .eq("id", request.target_club_player_id)
      .eq("club_id", request.to_club_id),
    supabase
      .from("poach_requests")
      .update({ resolved_at: now, status: "accepted" })
      .eq("id", request.id)
      .eq("status", "open"),
  ]);
  const mutationError = mutationResults.find((result) => result.error)?.error;
  if (mutationError) {
    throw mutationError;
  }

  await syncClubSquadCache(supabase, [request.from_club_id, request.to_club_id]);

  const { error: transactionError } = await supabase.from("transactions").insert([
    {
      amount: -Number(request.cash_amount),
      club_id: request.from_club_id,
      game_id: gameId,
      metadata: { poach_request_id: request.id, role: "buyer", target_club_player_id: request.target_club_player_id },
      reason: "manager_transfer",
    },
    {
      amount: Number(request.cash_amount),
      club_id: request.to_club_id,
      game_id: gameId,
      metadata: { poach_request_id: request.id, role: "seller", target_club_player_id: request.target_club_player_id },
      reason: "manager_transfer",
    },
  ]);
  if (transactionError) {
    throw transactionError;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function declinePoachRequestAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const requestId = String(formData.get("request_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !requestId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ game, ownClub }, request] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getPoachRequestForAction(supabase, requestId, gameId),
  ]);

  if (!request || request.status !== "open" || request.to_club_id !== ownClub.id) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const now = new Date().toISOString();
  const unavailableUntilSeason = getPoachUnavailableSeason(seasonNumber);
  const mutationResults = await Promise.all([
    supabase
      .from("club_players")
      .update({
        current_zone: "bench",
        lineup_slot: null,
        unavailable_until_season: unavailableUntilSeason,
      })
      .eq("id", request.target_club_player_id)
      .eq("club_id", request.to_club_id),
    supabase
      .from("poach_requests")
      .update({ resolved_at: now, status: "declined" })
      .eq("id", request.id)
      .eq("status", "open"),
  ]);
  const mutationError = mutationResults.find((result) => result.error)?.error;
  if (mutationError) {
    throw mutationError;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function cancelPoachRequestAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const requestId = String(formData.get("request_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !requestId || !supabase) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const [{ ownClub }, request] = await Promise.all([
    getGameClubContext(supabase, gameId, userId),
    getPoachRequestForAction(supabase, requestId, gameId),
  ]);

  if (!request || request.status !== "open" || request.from_club_id !== ownClub.id) {
    redirect(`/games/${roomCode}?view=transfer`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("poach_requests")
    .update({ resolved_at: now, status: "cancelled" })
    .eq("id", request.id)
    .eq("status", "open");

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=transfer`);
}

export async function initializeDeadlineDayAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const { game, clubs } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "deadline_day" || game.host_clerk_user_id !== userId) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const existingAuctions = await getDeadlineAuctions(supabase, gameId, seasonNumber);
  if (existingAuctions.length > 0) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const auctionCount = getDeadlineAuctionCount(clubs.length);
  const players = await pickDeadlinePlayers({ count: auctionCount, gameId, seasonNumber, supabase });
  const bidOrderClubIds = clubs.map((club) => club.id);
  const firstClubId = getFirstDeadlineBidClubId(clubs);

  if (players.length < auctionCount || !firstClubId) {
    throw new Error("Nicht genug verfuegbare Spieler fuer den Deadline Day gefunden.");
  }

  const now = new Date().toISOString();
  const auctionRows = players.map((player, index) => ({
    auction_index: index,
    bid_order_club_ids: bidOrderClubIds,
    current_amount: 0,
    current_bid_club_id: index === 0 ? firstClubId : null,
    game_id: gameId,
    minimum_bid: computePlayerMarketValues({
      potentialCeiling: resolvePlayerMarketMax({
        baseStars: player.base_stars,
        currentStars: player.base_stars,
        potentialStars: player.potential_stars,
        skillMax: player.skill_max,
      }),
      stars: Number(player.base_stars ?? 1),
    }).minimumBid,
    passed_club_ids: [],
    player_id: player.id,
    season_number: seasonNumber,
    status: index === 0 ? "open" : "scheduled",
    turn_started_at: index === 0 ? now : null,
  }));
  const { data: insertedAuctions, error } = await supabase.from("auctions").insert(
    auctionRows,
  ).select("id, status").returns<Array<{ id: string; status: string }>>();

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      activeAuctionId: insertedAuctions?.find((auction) => auction.status === "open")?.id ?? null,
      auctionCount: insertedAuctions?.length ?? auctionRows.length,
      needsRefetch: true,
    },
    type: "DEADLINE_INITIALIZED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=deadline`);
}

export async function placeDeadlineBidAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const auctionId = String(formData.get("auction_id") || "");
  const amountMillions = Number(formData.get("amount_millions") || 0);
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !auctionId || !supabase) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "deadline_day") {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const [auction, squadCount, bidStaffRows] = await Promise.all([
    getDeadlineAuction(supabase, auctionId),
    getClubSquadCount(supabase, ownClub.id),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", ownClub.id)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
  ]);

  if (!auction || auction.game_id !== gameId || auction.status !== "open") {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const auctionDiscount = (bidStaffRows.data ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "auction_discount")
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  const bidCheck = canPlaceDeadlineBid({
    amount: amountMillions * DEADLINE_BID_STEP,
    currentAmount: Number(auction.current_amount ?? 0),
    currentBidClubId: auction.current_bid_club_id,
    minimumBid: Math.max(0, Number(auction.minimum_bid ?? 0) - auctionDiscount),
    ownClubId: ownClub.id,
    ownMoney: Number(ownClub.money),
    squadSize: squadCount,
  });

  if (!bidCheck.ok) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const nextClubId = getNextDeadlineBidClubId({
    bidOrderClubIds: auction.bid_order_club_ids,
    currentClubId: ownClub.id,
    highestBidClubId: ownClub.id,
    passedClubIds: auction.passed_club_ids,
  });

  const { data: bidRow, error: bidError } = await supabase.from("bids").upsert(
    {
      amount: bidCheck.normalizedAmount,
      auction_id: auction.id,
      club_id: ownClub.id,
      locked: true,
    },
    { onConflict: "auction_id,club_id" },
  ).select("id").single<{ id: string }>();

  if (bidError) {
    throw bidError;
  }

  const turnStartedAt = nextClubId ? new Date().toISOString() : null;
  const { error: auctionError } = await supabase
    .from("auctions")
    .update({
      current_amount: bidCheck.normalizedAmount,
      current_bid_club_id: nextClubId,
      status: nextClubId ? "open" : "resolving",
      turn_started_at: turnStartedAt,
      winning_club_id: ownClub.id,
    })
    .eq("id", auction.id);

  if (auctionError) {
    throw auctionError;
  }

  if (!nextClubId) {
    await resolveDeadlineAuction(supabase, auction.id, gameId, userId, {
      sponsoringEnabled: isSponsoringEnabled(game.settings),
    });
  } else {
    await touchGameSave(supabase, gameId, userId);
  }

  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      amount: bidCheck.normalizedAmount,
      auctionId: auction.id,
      bidId: bidRow?.id,
      clubId: ownClub.id,
      currentAmount: bidCheck.normalizedAmount,
      nextClubId,
      passedClubIds: auction.passed_club_ids,
      status: nextClubId ? "open" : "resolving",
      turnStartedAt,
      winningClubId: ownClub.id,
    },
    type: "AUCTION_BID_PLACED",
  });

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=deadline`);
}

export async function passDeadlineBidAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const auctionId = String(formData.get("auction_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !auctionId || !supabase) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  const auction = await getDeadlineAuction(supabase, auctionId);

  if (!auction || game.phase !== "deadline_day" || auction.game_id !== gameId || auction.status !== "open" || auction.current_bid_club_id !== ownClub.id) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const passedClubIds = [...new Set([...auction.passed_club_ids, ownClub.id])];
  const highestBidClubId = auction.winning_club_id ?? null;
  const nextClubId = getNextDeadlineBidClubId({
    bidOrderClubIds: auction.bid_order_club_ids,
    currentClubId: ownClub.id,
    highestBidClubId,
    passedClubIds,
  });

  const { data: bidRow, error: bidError } = await supabase.from("bids").upsert(
    {
      amount: 0,
      auction_id: auction.id,
      club_id: ownClub.id,
      locked: true,
    },
    { onConflict: "auction_id,club_id" },
  ).select("id").single<{ id: string }>();

  if (bidError) {
    throw bidError;
  }

  let passStatus: "open" | "passed" | "resolving" = "open";
  let turnStartedAt: string | null = null;
  let needsRefetch = false;
  let shouldEmitPassEvent = true;

  if (!highestBidClubId && !nextClubId) {
    await markDeadlineAuctionPassed(supabase, auction.id, passedClubIds);
    const nextAuction = await openNextDeadlineAuction(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
    await touchGameSave(supabase, gameId, userId);
    await emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        auctionId: auction.id,
        needsRefetch: true,
        nextAuctionId: nextAuction?.id ?? null,
        nextClubId: nextAuction?.firstClubId ?? null,
        nextTurnStartedAt: nextAuction?.turnStartedAt ?? null,
        passedClubIds,
        status: "passed",
      },
      type: "AUCTION_CLOSED",
    });
    passStatus = "passed";
    needsRefetch = true;
    shouldEmitPassEvent = false;
  } else if (!nextClubId) {
    const { error } = await supabase
      .from("auctions")
      .update({ current_bid_club_id: null, passed_club_ids: passedClubIds, status: "resolving", turn_started_at: null })
      .eq("id", auction.id);

    if (error) {
      throw error;
    }

    await resolveDeadlineAuction(supabase, auction.id, gameId, userId, {
      sponsoringEnabled: isSponsoringEnabled(game.settings),
    });
    passStatus = "resolving";
    needsRefetch = true;
    shouldEmitPassEvent = false;
  } else {
    turnStartedAt = new Date().toISOString();
    const { error } = await supabase
      .from("auctions")
      .update({
        current_bid_club_id: nextClubId,
        passed_club_ids: passedClubIds,
        turn_started_at: turnStartedAt,
      })
      .eq("id", auction.id);

    if (error) {
      throw error;
    }

    await touchGameSave(supabase, gameId, userId);
  }

  if (shouldEmitPassEvent) {
    await emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        auctionId: auction.id,
        bidId: bidRow?.id,
        clubId: ownClub.id,
        needsRefetch,
        nextClubId,
        passedClubIds,
        status: passStatus,
        turnStartedAt,
      },
      type: "AUCTION_PASSED",
    });
  }

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=deadline`);
}

export async function resolveDeadlineAuctionAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const auctionId = String(formData.get("auction_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !auctionId || !supabase) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  const { game } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "deadline_day" || game.host_clerk_user_id !== userId) {
    redirect(`/games/${roomCode}?view=deadline`);
  }

  await resolveDeadlineAuction(supabase, auctionId, gameId, userId, {
    sponsoringEnabled: isSponsoringEnabled(game.settings),
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=deadline`);
}

export async function saveLineupAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const lineupPayload = String(formData.get("lineup_payload") || "[]");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=lineup`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);

  // If a "next_match_lineup_locked" pending effect is active for this club, refuse to save changes.
  const lineupLockedEffects = await getActivePendingEffects(supabase, ownClub.id, "next_match");
  if (lineupLockedEffects.some((eff) => eff.effect_type === "next_match_lineup_locked")) {
    redirect(`/games/${roomCode}?view=lineup&locked=1`);
  }

  const submitted = parseLineupPayload(lineupPayload);
  const { data: ownedRows, error: ownedError } = await supabase
    .from("club_players")
    .select("id, current_zone, injured, unavailable_until_season, player:players(position, eligible_positions)")
    .eq("club_id", ownClub.id)
    .returns<
      Array<{
        id: string;
        current_zone: string;
        injured: boolean;
        unavailable_until_season?: number | null;
        player: { eligible_positions?: string[] | null; position?: string | null } | null;
      }>
    >();

  if (ownedError) {
    throw ownedError;
  }

  const injuredIds = new Set((ownedRows ?? []).filter((row) => row.injured).map((row) => row.id));
  const unavailableIds = new Set(
    (ownedRows ?? [])
      .filter((row) => isPlayerUnavailableForSeason(seasonNumber, row.unavailable_until_season))
      .map((row) => row.id),
  );
  if (submitted.some((item) => injuredIds.has(item.club_player_id) || unavailableIds.has(item.club_player_id))) {
    redirect(`/games/${roomCode}?view=lineup&lineup_error=unavailable`);
  }

  const postSaveValidation = getLineupValidationAfterSave(ownedRows ?? [], submitted, {
    shouldUseDefaultGivenKeeper,
  });
  if (postSaveValidation.hasIncompleteLineup) {
    redirect(`/games/${roomCode}?view=lineup&lineup_error=incomplete`);
  }

  const submittedById = new Map(submitted.map((item) => [item.club_player_id, item]));

  const updateResults = await Promise.all(
    (ownedRows ?? []).map((row) => {
      const item = submittedById.get(row.id);

      return supabase
        .from("club_players")
        .update({
          current_zone: item?.zone ?? "bench",
          lineup_slot: item?.slot ?? null,
        })
        .eq("id", row.id)
        .eq("club_id", ownClub.id);
    }),
  );
  const updateError = updateResults.find((result) => result.error)?.error;

  if (updateError) {
    throw updateError;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      assignments: submitted.map((item) => ({
        clubPlayerId: item.club_player_id,
        slot: item.slot,
        zone: item.zone,
      })),
      clubId: ownClub.id,
    },
    type: "LINEUP_SAVED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=lineup&saved=1`);
}

/**
 * Assigns (or clears) the club captain — the player who receives the placement-based
 * captain boost. Club-wide and valid for the whole season; reassignable anytime.
 */
export async function setCaptainAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=lineup`);
  }

  const { ownClub } = await getGameClubContext(supabase, gameId, userId);

  // Empty club_player_id clears the captain; otherwise validate ownership.
  let nextCaptain: string | null = null;
  if (clubPlayerId) {
    const { data: owned } = await supabase
      .from("club_players")
      .select("id")
      .eq("id", clubPlayerId)
      .eq("club_id", ownClub.id)
      .maybeSingle<{ id: string }>();
    if (!owned) {
      redirect(`/games/${roomCode}?view=lineup`);
    }
    nextCaptain = clubPlayerId;
  }

  const { error } = await supabase
    .from("clubs")
    .update({ captain_club_player_id: nextCaptain })
    .eq("id", ownClub.id);
  if (error && (error as { code?: string }).code !== "42703") {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=lineup`);
}

export async function lockFixtureLineupAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const forceLock = String(formData.get("force_lock") || "") === "1";
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "season" && game.phase !== "prematch" && game.phase !== "match") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const fixture = await getFixtureForAction(supabase, fixtureId, gameId);
  const side = await getHumanFixtureSide(supabase, fixture, ownClub.id);

  if (!side) {
    throw new Error("Du kannst nur deine eigenen Fixtures locken.");
  }

  const { data: clubPlayers, error: lineupPlayersError } = await supabase
    .from("club_players")
    .select("current_zone, injured, player:players(position, eligible_positions)")
    .eq("club_id", ownClub.id)
    .returns<
      Array<{
        current_zone: string;
        injured: boolean;
        player: { eligible_positions?: string[] | null; position?: string | null } | null;
      }>
    >();

  if (lineupPlayersError) {
    throw lineupPlayersError;
  }

  const squadPlayers = clubPlayers ?? [];
  const useDefaultGivenKeeper = shouldUseDefaultGivenKeeper({
    lineupPlayers: squadPlayers,
    squadPlayers,
  });
  const lineupValidation = getLineupLockValidation(squadPlayers, {
    implicitDefaultGoalkeeper: useDefaultGivenKeeper,
  });
  if ((lineupValidation.hasIncompleteLineup || lineupValidation.hasInjuredInLineup) && !forceLock) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Check for next_match pending effects that affect locked-power computation
  const nextMatchEffects = await getActivePendingEffects(supabase, ownClub.id, "next_match");
  const staffDisabled = nextMatchEffects.some((eff) => eff.effect_type === "next_match_staff_disabled");

  // Calculate locked lineup power including staff bonuses (unless disabled) and captain boost.
  const powers = await computeClubLockedPower(supabase, ownClub.id, {
    sponsoringEnabled: isSponsoringEnabled(game.settings),
    staffDisabled,
  });

  const lockUpdate = side === "home"
    ? { home_lineup_locked: true, home_locked_def: powers.DEF, home_locked_mid: powers.MID, home_locked_att: powers.ATT }
    : { away_lineup_locked: true, away_locked_def: powers.DEF, away_locked_mid: powers.MID, away_locked_att: powers.ATT };

  const { error } = await supabase
    .from("fixtures")
    .update(lockUpdate)
    .eq("id", fixtureId)
    .eq("game_id", gameId);

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId: ownClub.id,
      fixturePatch: {
        ...(side === "home"
          ? { home_lineup_locked: true, home_locked_att: powers.ATT, home_locked_def: powers.DEF, home_locked_mid: powers.MID }
          : { away_lineup_locked: true, away_locked_att: powers.ATT, away_locked_def: powers.DEF, away_locked_mid: powers.MID }),
      },
      fixtureId,
      lockedAtt: powers.ATT,
      lockedDef: powers.DEF,
      lockedMid: powers.MID,
      powers,
      side,
    },
    type: "LINEUP_LOCKED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

export async function resolveFixtureAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "season" && game.phase !== "prematch" && game.phase !== "match") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const fixture = await getFixtureForAction(supabase, fixtureId, gameId);
  const participants = await getFixtureParticipants(supabase, fixture);
  const homeHuman = participants.home.kind === "human";
  const awayHuman = participants.away.kind === "human";
  const ownSide = await getHumanFixtureSide(supabase, fixture, ownClub.id);
  const canResolveCpuFixture = ownSide && (!homeHuman || !awayHuman);
  const canResolveCpuOnlyFixture = !homeHuman && !awayHuman && game.host_clerk_user_id === userId;
  const canResolvePvpFixture = homeHuman && awayHuman && game.host_clerk_user_id === userId;

  if (!canResolveCpuFixture && !canResolveCpuOnlyFixture && !canResolvePvpFixture) {
    throw new Error("Dieses Match darfst du aktuell nicht aufloesen.");
  }

  if ((homeHuman && !fixture.home_lineup_locked) || (awayHuman && !fixture.away_lineup_locked)) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  await resolveFixtureServer({
    fixture,
    game,
    participants,
    supabase,
    userId,
  });

  await autoSimulateCpuOnlyFixtures(supabase, gameId, game, userId, {
    matchday: fixture.matchday,
    seasonNumber: fixture.season_number,
  });
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: { fixtureId },
    type: "MATCH_SIMULATED",
  });

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

export async function initializeSeasonScheduleAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, phase, host_clerk_user_id, settings")
    .eq("id", gameId)
    .maybeSingle<{ id: string; phase: LobbyPhase; host_clerk_user_id: string; settings: LobbyGame["settings"] }>();

  if (gameError) {
    throw gameError;
  }

  if (!game || game.host_clerk_user_id !== userId || (game.phase !== "season" && game.phase !== "prematch" && game.phase !== "match")) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  await ensureSeasonSchedule(supabase, gameId, game.settings);
  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

export async function setPhaseDoneAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const done = String(formData.get("done") || "") === "true";
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}`);
  }

  const { error } = await supabase
    .from("game_members")
    .update({
      phase_done: done,
      phase_done_at: done ? new Date().toISOString() : null,
    })
    .eq("game_id", gameId)
    .eq("clerk_user_id", userId);

  if (error) {
    throw error;
  }

  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: { clerkUserId: userId, phaseDone: done },
    type: "MEMBER_READY_CHANGED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

async function snapshotOffseasonCapacities(supabase: SupabaseServiceClient, gameId: string) {
  const { data: gameClubs } = await supabase
    .from("clubs")
    .select("id, scouting_level, training_level, youth_academy_level")
    .eq("game_id", gameId)
    .returns<Array<{ id: string; scouting_level: number; training_level: number; youth_academy_level?: number }>>();

  if (!gameClubs?.length) return;

  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("club_id, staff_card:staff_cards(effects)")
    .in("club_id", gameClubs.map((c) => c.id))
    .returns<Array<{ club_id: string; staff_card: { effects: Array<{ type: string; cards?: number; players?: number }> } | null }>>();

  await Promise.all(
    gameClubs.map(async (club) => {
      const clubStaff = (staffRows ?? []).filter((s) => s.club_id === club.id);
      const allEffects = clubStaff.flatMap((s) => s.staff_card?.effects ?? []);
      const scoutingBonus = allEffects
        .filter((e) => e.type === "scouting_extra_cards")
        .reduce((sum, e) => sum + Number(e.cards ?? 0), 0);
      const trainingBonus = allEffects
        .filter((e) => e.type === "training_player_bonus")
        .reduce((sum, e) => sum + Number(e.players ?? 0), 0);
      const scoutingCap = getScoutingCapacity(club.scouting_level ?? 1).players + scoutingBonus;
      const trainingCap = getTrainingCapacity(club.training_level ?? 1).players + trainingBonus;
      await supabase
        .from("clubs")
        .update({
          offseason_scouting_capacity: scoutingCap,
          offseason_training_capacity: trainingCap,
          medical_heals_used_season: 0,
          nlz_archetype_respecs_used_season: 0,
        })
        .eq("id", club.id);

      const talentCount = getNlzTalentCountPerOffseason(club.youth_academy_level ?? 0);
      for (let index = 0; index < talentCount; index += 1) {
        await insertNlzTalentForClub(supabase, gameId, club.id);
      }
    }),
  );
}

async function insertNlzTalentForClub(supabase: SupabaseServiceClient, gameId: string, clubId: string) {
  const seed = buildYouthPlayerSeed();
  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert(seed)
    .select("id")
    .single<{ id: string }>();

  if (playerError) {
    throw playerError;
  }

  const { error: clubPlayerError } = await supabase.from("club_players").insert({
    club_id: clubId,
    current_stars: seed.base_stars,
    current_zone: "bench",
    player_id: player.id,
    stars_at_acquisition: seed.base_stars,
  });

  if (clubPlayerError) {
    throw clubPlayerError;
  }

  await syncClubSquadCache(supabase, clubId);

  await syncOwnedPlayerRowMarketValues(supabase, player.id, {
    current_stars: seed.base_stars,
    player: {
      base_stars: seed.base_stars,
      potential_stars: seed.potential_stars,
      skill_max: seed.skill_max,
    },
  });
}

export async function advancePhaseAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}`);
  }

  const [{ data: game, error: gameError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("games")
      .select("id, phase, host_clerk_user_id, settings")
      .eq("id", gameId)
      .maybeSingle<{ id: string; phase: LobbyPhase; host_clerk_user_id: string; settings: LobbyGame["settings"] }>(),
    supabase
      .from("game_members")
      .select("phase_done")
      .eq("game_id", gameId)
      .returns<Array<{ phase_done: boolean }>>(),
  ]);

  if (gameError) {
    throw new Error(gameError.message ?? "Spielstand konnte nicht geladen werden.");
  }

  if (membersError) {
    throw new Error(membersError.message ?? "Mitglieder konnten nicht geladen werden.");
  }

  if (!game || game.host_clerk_user_id !== userId) {
    redirect(`/games/${roomCode}`);
  }

  if (!members?.length || members.some((member) => !member.phase_done)) {
    redirect(`/games/${roomCode}`);
  }

  if (game.phase === "deadline_day") {
    const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
    const deadlineComplete = await areDeadlineAuctionsComplete(supabase, gameId, seasonNumber);

    if (!deadlineComplete) {
      redirect(`/games/${roomCode}?view=deadline`);
    }
  }

  if (game.phase === "season" || game.phase === "match") {
    const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
    const seasonComplete = await areSeasonFixturesComplete(supabase, gameId, seasonNumber);

    if (!seasonComplete) {
      redirect(`/games/${roomCode}?view=matchday`);
    }
  }

  let nextPhase = getNextLobbyPhase(game.phase, game.settings);
  if (game.phase === "season_end" && nextPhase === "champions_league") {
    const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
    const qualified = await hasContinentalQualifiers(supabase, gameId, seasonNumber);
    if (!qualified) {
      nextPhase = game.settings.final_season_number === seasonNumber ? "completed" : "off_season";
    }
  }
  const now = new Date().toISOString();
  // Scouting is now parallel — no turn concept needed; keep null for all phases that don't need a turn
  const nextTurnClubId = null;
  let nextSettings = getSettingsForNextPhase(game.settings, game.phase, nextPhase);

  if (nextPhase === "season" || nextPhase === "prematch") {
    await ensureSeasonSchedule(supabase, gameId, nextSettings);
  }

  if ((game.phase === "season" || game.phase === "match") && nextPhase === "season_end") {
    if (isSponsoringEnabled(game.settings)) {
      await processSponsorContractsAtSeasonEnd(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
    }
    await finalizeSeasonEnd(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
    await processLastPlaceManagerAtSeasonEnd(
      supabase,
      gameId,
      Number(game.settings?.seasonNumber ?? 1),
      game.settings,
    );
    if (isPrestigeEnabled(game.settings)) {
      await processPrestigeAtSeasonEnd(supabase, gameId, Number(game.settings?.seasonNumber ?? 1), game.settings);
    }
  }

  if (
    game.phase === "season_end" &&
    (nextPhase === "off_season" || nextPhase === "champions_league" || nextPhase === "offseason_finance" || nextPhase === "completed")
  ) {
    await bookSeasonFinance(supabase, gameId, Number(game.settings?.seasonNumber ?? 1), {
      sponsoringEnabled: isSponsoringEnabled(game.settings),
    });
    if (isPrestigeEnabled(game.settings)) {
      nextSettings = await maybeTriggerFinalSeason(
        supabase,
        gameId,
        nextSettings,
        Number(game.settings?.seasonNumber ?? 1),
      );
    }
  }

  if (game.phase === "champions_league" && (nextPhase === "off_season" || nextPhase === "completed")) {
    const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
    const complete = await isContinentalTournamentComplete(supabase, gameId, seasonNumber);
    if (!complete) {
      redirect(`/games/${roomCode}?view=continental`);
    }
    if (isPrestigeEnabled(game.settings)) {
      await processContinentalPrestigeAtCupEnd(supabase, gameId, seasonNumber, game.settings);
      nextSettings = await maybeTriggerFinalSeason(supabase, gameId, nextSettings, seasonNumber);
    }
  }

  if (nextPhase === "season" || nextPhase === "prematch") {
    if (isPrestigeEnabled(nextSettings)) {
      await snapshotSeasonStartSquadStars(supabase, gameId, Number(nextSettings.seasonNumber ?? 1));
    }
  }

  if (shouldAdvanceSeason(game.phase, nextPhase)) {
    await incrementPlayerTenureForGame(supabase, gameId);
  }

  if (nextPhase === "champions_league") {
    await ensureContinentalTournament(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
  }

  if (nextPhase === "season" || nextPhase === "prematch" || nextPhase === "match") {
    await expireOpenTransferOffers(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
  }

  if (shouldPromoteOffseasonEffectsOnPhaseAdvance(game.phase, nextPhase)) {
    await transitionPendingEffectsToOffseason(supabase, gameId);
    await snapshotOffseasonCapacities(supabase, gameId);
  }

  // Consume any remaining current_offseason effects when leaving off_season
  if (game.phase === "off_season" && nextPhase !== "off_season") {
    if (isSponsoringEnabled(game.settings)) {
      await onSponsorOffseasonBudgetCheck(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
    }
    await expireCurrentOffseasonEffects(supabase, gameId);
  }

  const { error: updateGameError } = await supabase
    .from("games")
    .update({
      current_turn_club_id: nextTurnClubId,
      phase: nextPhase,
      settings: nextSettings,
      last_saved_at: now,
      last_saved_by_clerk_user_id: userId,
      save_status: nextPhase === "completed" ? "completed" : "active",
      save_version: (await getNextSaveVersion(supabase, gameId)) + 1,
    })
    .eq("id", gameId);

  if (updateGameError) {
    throw new Error(updateGameError.message ?? "Phase konnte nicht aktualisiert werden.");
  }

  const { error: resetError } = await supabase
    .from("game_members")
    .update({ phase_done: false, phase_done_at: null })
    .eq("game_id", gameId);

  if (resetError) {
    throw new Error(resetError.message ?? "Phase-Status konnte nicht zurueckgesetzt werden.");
  }

  // Auto-simulate CPU-vs-CPU fixtures when entering the season phase
  if (nextPhase === "season" || nextPhase === "prematch") {
    await autoSimulateCpuOnlyFixtures(
      supabase,
      gameId,
      { ...game, phase: nextPhase, room_code: roomCode, settings: nextSettings },
      userId,
      { seasonNumber: Number(nextSettings?.seasonNumber ?? 1) },
    );
  }

  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      currentTurnClubId: nextTurnClubId,
      phase: nextPhase,
      previousPhase: game.phase,
    },
    type: "PHASE_CHANGED",
  });
  // Prune non-rule-critical live/UI history each phase advance so long sessions
  // (4-5h) stay responsive. Best-effort: never blocks the phase transition.
  await cleanupGameHistory(supabase, gameId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

export async function deleteGameAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !supabase) {
    redirect("/lobby");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, host_clerk_user_id")
    .eq("id", gameId)
    .maybeSingle<{ id: string; host_clerk_user_id: string }>();

  if (gameError) {
    throw gameError;
  }

  if (!game || game.host_clerk_user_id !== userId) {
    redirect("/lobby");
  }

  const { error } = await supabase.from("games").delete().eq("id", gameId);

  if (error) {
    throw error;
  }

  revalidatePath("/lobby");
  redirect("/lobby");
}

function isUpgradeAction(value: string): value is UpgradeAction {
  return value === "training" || value === "scouting" || value === "stadium";
}

function getClubFacilityLevel(
  club: {
    scouting_level?: number | null;
    stadium_level?: number | null;
    training_level?: number | null;
  },
  action: UpgradeAction,
) {
  if (action === "scouting") {
    return club.scouting_level ?? 1;
  }

  if (action === "stadium") {
    return club.stadium_level ?? 1;
  }

  return club.training_level ?? 1;
}

async function getNextSaveVersion(supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>, gameId: string) {
  const { data, error } = await supabase
    .from("games")
    .select("save_version")
    .eq("id", gameId)
    .single<{ save_version: number }>();

  if (error) {
    throw error;
  }

  return data.save_version ?? 1;
}

type SupabaseServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

async function syncClubSquadCache(supabase: SupabaseServiceClient, clubIdsInput: string | string[]) {
  const clubIds = [...new Set((Array.isArray(clubIdsInput) ? clubIdsInput : [clubIdsInput]).filter(Boolean))];
  if (clubIds.length === 0) {
    return new Map<string, { squad_size: number; squad_stars: number }>();
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("club_id, current_stars")
    .in("club_id", clubIds)
    .returns<Array<{ club_id: string; current_stars: number | string }>>();

  if (error) {
    throw error;
  }

  const stats = new Map<string, { squad_size: number; squad_stars: number }>();
  for (const clubId of clubIds) {
    stats.set(clubId, { squad_size: 0, squad_stars: 0 });
  }

  for (const row of data ?? []) {
    const current = stats.get(row.club_id) ?? { squad_size: 0, squad_stars: 0 };
    current.squad_size += 1;
    current.squad_stars += Number(row.current_stars ?? 0);
    stats.set(row.club_id, current);
  }

  await Promise.all(
    [...stats.entries()].map(async ([clubId, row]) => {
      const result = await supabase
        .from("clubs")
        .update({ squad_size: row.squad_size, squad_stars: row.squad_stars })
        .eq("id", clubId);

      if (!result.error) {
        return;
      }

      if (result.error.code === "42703") {
        const fallback = await supabase
          .from("clubs")
          .update({ squad_stars: row.squad_stars })
          .eq("id", clubId);
        if (fallback.error && fallback.error.code !== "42703") {
          throw fallback.error;
        }
        return;
      }

      throw result.error;
    }),
  );

  return stats;
}

type FixtureActionRow = {
  away_cpu_lineup_id?: string | null;
  away_lineup_locked: boolean;
  away_locked_att?: number | null;
  away_locked_def?: number | null;
  away_locked_mid?: number | null;
  away_participant_id: string;
  away_ready_for_next_third: boolean;
  current_third: number;
  game_id: string;
  home_cpu_lineup_id?: string | null;
  home_lineup_locked: boolean;
  home_locked_att?: number | null;
  home_locked_def?: number | null;
  home_locked_mid?: number | null;
  home_participant_id: string;
  home_ready_for_next_third: boolean;
  id: string;
  match_state: "scheduled" | "in_progress" | "completed";
  matchday: number;
  partial_result?: Record<string, unknown> | null;
  season_number: number;
  status: "completed" | "scheduled";
};

type FixtureParticipantRow = {
  club_id?: string | null;
  cpu_team_id?: string | null;
  display_name: string;
  id: string;
  kind: "cpu" | "human";
};

type CpuLineupRow = {
  att_stars: number | string;
  def_stars: number | string;
  display_name: string;
  id: string;
  mid_stars: number | string;
};

async function ensureSeasonSchedule(supabase: SupabaseServiceClient, gameId: string, settings: LobbyGame["settings"]) {
  const seasonNumber = Number(settings?.seasonNumber ?? 1);
  const { count, error: existingError } = await supabase
    .from("season_participants")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber);

  if (existingError) {
    throw existingError;
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const targetLeagueSize = getTargetLeagueSize(settings);
  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id, club_name, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .returns<Array<{ id: string; club_name: string; created_at: string }>>();

  if (clubsError) {
    throw clubsError;
  }

  const requiredCpu = getRequiredCpuCount(clubs?.length ?? 0, targetLeagueSize);
  const cpuCatalog = await getActiveCpuTeams(supabase);
  const cpuPick = pickCpuTeamsForSeason(settings.cpu_team_ids, cpuCatalog, requiredCpu);
  if (!cpuPick.ok) {
    throw new Error(cpuPick.error);
  }
  const cpuTeams = cpuPick.teams;

  const participantRows = [
    ...(clubs ?? []).map((club) => ({
      club_id: club.id,
      cpu_team_id: null,
      display_name: club.club_name,
      game_id: gameId,
      kind: "human",
      season_number: seasonNumber,
    })),
    ...(cpuTeams ?? []).slice(0, requiredCpu).map((team) => ({
      club_id: null,
      cpu_team_id: team.id,
      display_name: team.display_name,
      game_id: gameId,
      kind: "cpu",
      season_number: seasonNumber,
    })),
  ];

  const { data: participants, error: participantsError } = await supabase
    .from("season_participants")
    .insert(participantRows)
    .select("id, kind, club_id, cpu_team_id, display_name")
    .returns<FixtureParticipantRow[]>();

  if (participantsError) {
    throw participantsError;
  }

  const participantInputs: SeasonParticipant[] = (participants ?? []).map((participant) => ({
    club_id: participant.club_id,
    cpu_team_id: participant.cpu_team_id,
    id: participant.id,
    kind: participant.kind,
    name: participant.display_name,
  }));
  const fixtures = buildSeasonFixtures(participantInputs, getSeasonMode(settings));
  const cpuLineupsByTeamId = await getCpuLineupsByTeamId(supabase, participants ?? []);
  const pickCpuLineupId = (teamId: string) => {
    const options = cpuLineupsByTeamId.get(teamId) ?? [];
    return options[Math.floor(Math.random() * options.length)]?.id ?? null;
  };

  for (const participant of participants ?? []) {
    if (participant.cpu_team_id && (cpuLineupsByTeamId.get(participant.cpu_team_id)?.length ?? 0) === 0) {
      throw new Error(`CPU-Team ${participant.display_name} hat keine CPU-Aufstellungen.`);
    }
  }

  const fixtureRows = fixtures.map((fixture) => {
    const home = participants?.find((participant) => participant.id === fixture.home_participant_id);
    const away = participants?.find((participant) => participant.id === fixture.away_participant_id);

    return {
      away_cpu_lineup_id: away?.cpu_team_id ? pickCpuLineupId(away.cpu_team_id) : null,
      away_lineup_locked: away?.kind === "cpu",
      away_participant_id: fixture.away_participant_id,
      game_id: gameId,
      home_cpu_lineup_id: home?.cpu_team_id ? pickCpuLineupId(home.cpu_team_id) : null,
      home_lineup_locked: home?.kind === "cpu",
      home_participant_id: fixture.home_participant_id,
      matchday: fixture.matchday,
      season_number: seasonNumber,
    };
  });

  const [{ error: fixtureError }, { error: standingsError }] = await Promise.all([
    supabase.from("fixtures").insert(fixtureRows),
    supabase.from("season_standings").insert(
      (participants ?? []).map((participant, index) => ({
        game_id: gameId,
        participant_id: participant.id,
        rank: index + 1,
        season_number: seasonNumber,
      })),
    ),
  ]);

  if (fixtureError) {
    throw fixtureError;
  }

  if (standingsError) {
    throw standingsError;
  }
}

async function getCpuLineupsByTeamId(supabase: SupabaseServiceClient, participants: FixtureParticipantRow[]) {
  const cpuTeamIds = [...new Set(participants.flatMap((participant) => (participant.cpu_team_id ? [participant.cpu_team_id] : [])))];
  const result = new Map<string, CpuLineupRow[]>();

  if (cpuTeamIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("cpu_lineups")
    .select("id, cpu_team_id, display_name, def_stars, mid_stars, att_stars")
    .in("cpu_team_id", cpuTeamIds)
    .returns<Array<CpuLineupRow & { cpu_team_id: string }>>();

  if (error) {
    throw error;
  }

  for (const teamId of cpuTeamIds) {
    const options = (data ?? []).filter((lineup) => lineup.cpu_team_id === teamId);
    result.set(teamId, options);
  }

  return result;
}

async function getFixtureForAction(supabase: SupabaseServiceClient, fixtureId: string, gameId: string) {
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, game_id, season_number, matchday, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, status, match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result")
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .maybeSingle<FixtureActionRow>();

  if (error) {
    throw error;
  }

  if (!data || data.status === "completed") {
    throw new Error("Fixture nicht gefunden oder bereits abgeschlossen.");
  }

  return data;
}

async function getFixtureParticipants(supabase: SupabaseServiceClient, fixture: FixtureActionRow) {
  const { data, error } = await supabase
    .from("season_participants")
    .select("id, kind, club_id, cpu_team_id, display_name")
    .in("id", [fixture.home_participant_id, fixture.away_participant_id])
    .returns<FixtureParticipantRow[]>();

  if (error) {
    throw error;
  }

  const home = data?.find((participant) => participant.id === fixture.home_participant_id);
  const away = data?.find((participant) => participant.id === fixture.away_participant_id);

  if (!home || !away) {
    throw new Error("Fixture-Teilnehmer fehlen.");
  }

  return { away, home };
}

async function getHumanFixtureSide(supabase: SupabaseServiceClient, fixture: FixtureActionRow, clubId: string) {
  const participants = await getFixtureParticipants(supabase, fixture);
  if (participants.home.club_id === clubId) {
    return "home" as const;
  }

  if (participants.away.club_id === clubId) {
    return "away" as const;
  }

  return null;
}

async function loadClubLineupSnapshotPlayers(supabase: SupabaseServiceClient, clubId: string | null | undefined) {
  if (!clubId) {
    return [];
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, defender_archetype, display_name)")
    .eq("club_id", clubId)
    .neq("current_zone", "bench")
    .order("lineup_slot", { ascending: true })
    .returns<LineupSnapshotClubPlayerRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function buildFixtureLineupSnapshot(
  supabase: SupabaseServiceClient,
  participants: { away: FixtureParticipantRow; home: FixtureParticipantRow },
) {
  const [homePlayers, awayPlayers] = await Promise.all([
    loadClubLineupSnapshotPlayers(supabase, participants.home.club_id),
    loadClubLineupSnapshotPlayers(supabase, participants.away.club_id),
  ]);

  return {
    away: buildLineupSnapshotFromPlayers(awayPlayers),
    home: buildLineupSnapshotFromPlayers(homePlayers),
  };
}

async function applyFixtureInjuryEvent(
  supabase: SupabaseServiceClient,
  params: {
    actorClerkUserId?: string;
    clubId: string;
    playerId: string;
    untilMatchday: number;
    fixtureId: string;
    gameId: string;
    zone: string;
  },
) {
  const { data: club } = await supabase
    .from("clubs")
    .select("medical_center_level")
    .eq("id", params.clubId)
    .maybeSingle<{ medical_center_level: number | null }>();

  if (hasAutoMedicalCenter(club?.medical_center_level ?? 0)) {
    return;
  }

  await applyClubPlayerInjury(supabase, {
    clubId: params.clubId,
    clubPlayerId: params.playerId,
    untilMatchday: params.untilMatchday,
  });

  if (params.actorClerkUserId) {
    await emitGameEvent(supabase, {
      actorClerkUserId: params.actorClerkUserId,
      gameId: params.gameId,
      payload: {
        clubId: params.clubId,
        clubPlayerId: params.playerId,
        currentZone: "bench",
        injured: true,
      },
      type: "PLAYER_INJURED",
    });
  }

  const { data: injuredPlayer } = await supabase
    .from("club_players")
    .select("custom_name, player:players(display_name)")
    .eq("id", params.playerId)
    .maybeSingle<{ custom_name?: string | null; player: { display_name: string } | null }>();

  await writeMatchNews(supabase, {
    gameId: params.gameId,
    fixtureId: params.fixtureId,
    clubId: params.clubId,
    category: "injury",
    headline: `Verletzung in Zone ${params.zone}`,
    detail: injuredPlayer ? `${getClubPlayerDisplayNameFromRow(injuredPlayer)} verletzt` : undefined,
  });
}

async function resolveFixtureServer(params: {
  fixture: FixtureActionRow;
  game: LobbyGame;
  participants: { away: FixtureParticipantRow; home: FixtureParticipantRow };
  supabase: SupabaseServiceClient;
  userId: string;
  resolveOptions?: {
    skipHealInjuries?: boolean;
    skipStandingsRebuild?: boolean;
    skipTouchSave?: boolean;
  };
}) {
  const { fixture, game, participants, supabase, userId, resolveOptions } = params;

  // Apply next_match pending effects (zone deltas, staff disable) before resolving CPU-only fixtures.
  const { consumedIds: preMatchConsumed, updatedPartial, staffDisabled } = await injectNextMatchEffects(supabase, {
    fixtureId: fixture.id,
    homeClubId: participants.home.club_id ?? null,
    awayClubId: participants.away.club_id ?? null,
    currentPartial: (fixture.partial_result ?? null) as PartialResult | null,
  });

  const [homeSide, awaySide] = await Promise.all([
    buildFixtureSide(supabase, participants.home, fixture.home_cpu_lineup_id, { suppressStaff: staffDisabled.home }),
    buildFixtureSide(supabase, participants.away, fixture.away_cpu_lineup_id, { suppressStaff: staffDisabled.away }),
  ]);
  const resolution = resolveFixture({
    archetypesEnabled: areArchetypesEnabled(game.settings),
    away: awaySide,
    home: homeSide,
    matchPointsMode: getMatchPointsMode(game.settings),
    zoneModifiers: updatedPartial.pending_modifiers ?? [],
  });

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  for (const event of resolution.events) {
    if (event.event_type === "injury" && event.club_id) {
      const untilMatchday = Math.max(1, Math.trunc(fixture.matchday)) + 1;
      await applyFixtureInjuryEvent(supabase, {
        actorClerkUserId: params.userId,
        clubId: event.club_id,
        fixtureId: fixture.id,
        gameId: fixture.game_id,
        playerId: event.player_id,
        untilMatchday,
        zone: event.zone,
      });
    }

    if (event.event_type === "game_changer" && event.club_id) {
      const participantKind = event.participant_id === participants.home.id ? participants.home.kind : participants.away.kind;
      const category: GameChangerCategory = participantKind === "cpu" ? "good_news" : (["good_news", "bad_news", "secret_weapon"][Math.floor(Math.random() * 3)] as GameChangerCategory);
      const result = await assignRandomGameChanger(supabase, event.club_id, seasonNumber, category);

      if (result) {
        const { card, clubGameChangerId } = result;
        const effects = parseEffects(card.effects);

        let dispatchDetails: string[] = [];
        if (category !== "secret_weapon") {
          const dispatchResult = await dispatchGameChangerEffects({
            supabase,
            clubId: event.club_id,
            clubGameChangerId,
            effects,
            emitCtx: {
              actorClerkUserId: params.userId,
              gameId: fixture.game_id,
            },
            ctx: {
              fixtureId: fixture.id,
              matchday: fixture.matchday,
              seasonNumber,
            },
          });
          dispatchDetails = dispatchResult.details;
        }

        await writeMatchNews(supabase, {
          gameId: fixture.game_id,
          fixtureId: fixture.id,
          clubId: event.club_id,
          clubGameChangerId,
          category,
          headline: `Game Changer: ${card.display_name}`,
          detail: formatGameChangerNewsDetail(card.description, dispatchDetails),
        });
      }
    }
  }

  const lineupSnapshot = await buildFixtureLineupSnapshot(supabase, participants);
  const { error: fixtureError } = await supabase
    .from("fixtures")
    .update({
      away_score: resolution.away_match_points,
      away_third_points: resolution.away_third_points,
      completed_at: new Date().toISOString(),
      home_score: resolution.home_match_points,
      home_third_points: resolution.home_third_points,
      result: { ...resolution, lineup_snapshot: lineupSnapshot },
      status: "completed",
    })
    .eq("id", fixture.id);

  if (fixtureError) {
    throw fixtureError;
  }

  if (isSponsoringEnabled(game.settings)) {
    await notifySponsorFixtureComplete(supabase, {
      seasonNumber: fixture.season_number,
      homeClubId: participants.home.club_id ?? null,
      awayClubId: participants.away.club_id ?? null,
      homeKind: participants.home.kind,
      awayKind: participants.away.kind,
      homeMatchPoints: resolution.home_match_points,
      awayMatchPoints: resolution.away_match_points,
      homeThirdPoints: resolution.home_third_points,
      awayThirdPoints: resolution.away_third_points,
    });
  }

  await consumePendingEffects(supabase, preMatchConsumed);
  if (!resolveOptions?.skipHealInjuries) {
    await healExpiredInjuriesForClubs(
      supabase,
      fixture.matchday,
      getFixtureParticipantClubIds(participants),
    );
  }
  if (!resolveOptions?.skipStandingsRebuild) {
    await rebuildSeasonStandings(supabase, fixture.game_id, fixture.season_number);
  }
  if (!resolveOptions?.skipTouchSave) {
    await touchGameSave(supabase, fixture.game_id, userId);
  }
}

type AutoSimulateCpuFixturesOptions = {
  matchday?: number;
  maxFixtures?: number;
  seasonNumber?: number;
};

/**
 * Finds pending CPU-vs-CPU fixtures and resolves them automatically.
 * Scoped to the current season (and optionally matchday) so a single user
 * action does not scan/simulate the entire game history.
 */
async function autoSimulateCpuOnlyFixtures(
  supabase: SupabaseServiceClient,
  gameId: string,
  game: LobbyGame,
  userId: string,
  options?: AutoSimulateCpuFixturesOptions,
) {
  const seasonNumber = options?.seasonNumber ?? Number(game.settings?.seasonNumber ?? 1);
  const maxFixtures = options?.maxFixtures ?? 24;

  let query = supabase
    .from("fixtures")
    .select(
      "id, game_id, season_number, matchday, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, status, match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result",
    )
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .neq("status", "completed")
    .order("matchday", { ascending: true })
    .limit(maxFixtures);

  if (options?.matchday != null) {
    query = query.eq("matchday", options.matchday);
  }

  const { data: pendingFixtures, error } = await query.returns<FixtureActionRow[]>();
  if (error) {
    throw error;
  }

  if (!pendingFixtures?.length) {
    return;
  }

  const batchResolveOptions = {
    skipHealInjuries: true,
    skipStandingsRebuild: true,
    skipTouchSave: true,
  };

  const resolvedFixtures: FixtureActionRow[] = [];
  for (const fixture of pendingFixtures) {
    const participants = await getFixtureParticipants(supabase, fixture);
    if (participants.home.kind === "cpu" && participants.away.kind === "cpu") {
      await resolveFixtureServer({
        fixture,
        game,
        participants,
        supabase,
        userId,
        resolveOptions: batchResolveOptions,
      });
      resolvedFixtures.push(fixture);
    }
  }

  if (resolvedFixtures.length === 0) {
    return;
  }

  await rebuildSeasonStandings(supabase, gameId, seasonNumber);
  await touchGameSave(supabase, gameId, userId);
}

function getLockedPowersFromFixture(
  fixture: FixtureActionRow,
  side: "away" | "home",
): { ATT: number; DEF: number; MID: number } | null {
  const locked = side === "home" ? fixture.home_lineup_locked : fixture.away_lineup_locked;
  const def = side === "home" ? fixture.home_locked_def : fixture.away_locked_def;
  const mid = side === "home" ? fixture.home_locked_mid : fixture.away_locked_mid;
  const att = side === "home" ? fixture.home_locked_att : fixture.away_locked_att;

  if (!locked || def == null || mid == null || att == null) {
    return null;
  }

  return {
    ATT: Number(att),
    DEF: Number(def),
    MID: Number(mid),
  };
}

async function buildFixtureSide(
  supabase: SupabaseServiceClient,
  participant: FixtureParticipantRow,
  cpuLineupId?: string | null,
  opts: {
    lockedPowers?: { ATT: number; DEF: number; MID: number } | null;
    suppressStaff?: boolean;
  } = {},
): Promise<FixtureSideInput> {
  if (participant.kind === "cpu") {
    const { data, error } = await supabase
      .from("cpu_lineups")
      .select("id, display_name, def_stars, mid_stars, att_stars")
      .eq("id", cpuLineupId)
      .single<CpuLineupRow>();

    if (error) {
      throw error;
    }

    return {
      canReceiveEvents: false,
      clubId: null,
      lineup: { ATT: [], DEF: [], GK: [], MID: [] },
      participantId: participant.id,
      powers: {
        ATT: Number(data.att_stars),
        DEF: Number(data.def_stars),
        MID: Number(data.mid_stars),
      },
      zone_players: [],
    };
  }

  if (!participant.club_id) {
    throw new Error("Human participant without club.");
  }

  const [{ data, error }, { data: staffData }, captainResult] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, custom_name, current_stars, current_zone, lineup_slot, player:players(attacker_archetype, chemistry_left, chemistry_right, defender_archetype, display_name, position, eligible_positions)")
      .eq("club_id", participant.club_id)
      .neq("current_zone", "bench")
      .eq("injured", false)
      .order("lineup_slot", { ascending: true })
      .returns<
        Array<{
          current_stars: number | string;
          custom_name?: string | null;
          current_zone: string;
          id: string;
          lineup_slot: number | null;
          player: {
            attacker_archetype?: string | null;
            chemistry_left?: boolean | null;
            chemistry_right?: boolean | null;
            defender_archetype?: string | null;
            display_name?: string | null;
            position?: string | null;
            eligible_positions?: string[] | null;
          };
        }>
      >(),
    supabase
      .from("club_staff")
      .select("staff_card:staff_cards(effects)")
      .eq("club_id", participant.club_id)
      .returns<Array<{ staff_card: { effects: Array<{ type: string; zone?: string; stars?: number }> } | null }>>(),
    opts.suppressStaff
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("clubs")
          .select("captain_club_player_id, captain_boost_rank")
          .eq("id", participant.club_id)
          .maybeSingle<{ captain_boost_rank: number | null; captain_club_player_id: string | null }>(),
  ]);

  if (error) {
    throw error;
  }

  const staffEffects = opts.suppressStaff ? [] : (staffData ?? []).flatMap((s) => s.staff_card?.effects ?? []);
  const captain =
    opts.suppressStaff || !captainResult.data?.captain_club_player_id
      ? null
      : {
          clubPlayerId: captainResult.data.captain_club_player_id,
          boost: Math.max(0, Math.trunc(Number(captainResult.data.captain_boost_rank ?? 0))),
        };

  const lineup = {
    ATT: getZoneIds(data ?? [], "ATT"),
    DEF: getZoneIds(data ?? [], "DEF"),
    GK: getZoneIds(data ?? [], "GK"),
    MID: getZoneIds(data ?? [], "MID"),
  };
  const calculatedPowers = calculateLineupPower(
    (data ?? []).map((player) => ({
      id: player.id,
      chemistry_left: player.player?.chemistry_left,
      chemistry_right: player.player?.chemistry_right,
      current_stars: player.current_stars,
      current_zone: player.current_zone,
      lineup_slot: player.lineup_slot,
      position: player.player?.position,
      positions: player.player?.eligible_positions?.length
        ? player.player.eligible_positions
        : player.player?.position
          ? [player.player.position]
          : undefined,
    })),
    staffEffects,
    captain,
  );
  const powers = opts.lockedPowers ?? {
    ATT: calculatedPowers.ATT.total,
    DEF: calculatedPowers.DEF.total,
    MID: calculatedPowers.MID.total,
  };

  return {
    canReceiveEvents: true,
    clubId: participant.club_id,
    lineup,
    participantId: participant.id,
    powers: {
      ATT: powers.ATT,
      DEF: powers.DEF,
      MID: powers.MID,
    },
    zone_players: (data ?? [])
      .filter((player) => ["ATT", "DEF", "GK", "MID"].includes(player.current_zone))
      .map((player) => ({
        attacker_archetype: normalizeApplicablePlayerArchetype(
          player.player?.attacker_archetype,
          player.player?.position,
          player.player?.eligible_positions,
        ),
        current_stars: Number(player.current_stars ?? 0),
        current_zone: player.current_zone as TacticalZone | "GK",
        defender_archetype: normalizeApplicablePlayerArchetype(
          player.player?.defender_archetype,
          player.player?.position,
          player.player?.eligible_positions,
        ),
        display_name: getClubPlayerDisplayNameFromRow(player),
        id: player.id,
        lineup_slot: player.lineup_slot,
        position: player.player?.position ?? null,
      })),
  };
}

export async function updateGameSettingsAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(`/games/${roomCode}?view=settings`);
  }

  const { data: game, error } = await supabase
    .from("games")
    .select("id, room_code, host_clerk_user_id, settings")
    .eq("id", gameId)
    .single<LobbyGame>();

  if (error || !game || game.host_clerk_user_id !== userId) {
    redirect(`/games/${roomCode}?view=settings`);
  }

  const getBooleanFormValue = (name: string) => {
    const values = formData.getAll(name).map(String);
    return values.at(-1) === "1";
  };

  const nextSettings = {
    ...(game.settings ?? {}),
    continental_cup_enabled: getBooleanFormValue("continental_cup_enabled"),
    sponsoring_enabled: getBooleanFormValue("sponsoring_enabled"),
    archetypes_enabled: getBooleanFormValue("archetypes_enabled"),
  };

  const { error: updateError } = await supabase
    .from("games")
    .update({
      last_saved_at: new Date().toISOString(),
      last_saved_by_clerk_user_id: userId,
      save_status: "active",
      settings: nextSettings,
    })
    .eq("id", gameId);

  if (updateError) {
    throw updateError;
  }

  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      settings: {
        archetypes_enabled: nextSettings.archetypes_enabled,
        continental_cup_enabled: nextSettings.continental_cup_enabled,
        sponsoring_enabled: nextSettings.sponsoring_enabled,
      },
    },
    type: "SAVE_UPDATED",
  });

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=settings`);
}

function getZoneIds(players: Array<{ current_zone: string; id: string; lineup_slot: number | null }>, zone: TacticalZone | "GK") {
  return players
    .filter((player) => player.current_zone === zone)
    .sort((a, b) => Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999))
    .map((player) => player.id);
}

/**
 * Loads the captain boost for a club (assigned player + placement-based boost amount).
 * Returns null when no captain is set, no boost rank yet, or the columns are missing
 * (pre-migration DB). Defensive against 42703 errors.
 */
async function loadClubCaptain(
  supabase: SupabaseServiceClient,
  clubId: string,
): Promise<CaptainBoost | null> {
  const { data, error } = await supabase
    .from("clubs")
    .select("captain_club_player_id, captain_boost_rank")
    .eq("id", clubId)
    .maybeSingle<{ captain_club_player_id: string | null; captain_boost_rank: number | null }>();
  if (error || !data?.captain_club_player_id) return null;
  return {
    clubPlayerId: data.captain_club_player_id,
    boost: Math.max(0, Math.trunc(Number(data.captain_boost_rank ?? 0))),
  };
}

/**
 * Computes a club's locked zone power (DEF/MID/ATT) from its current lineup,
 * including staff bonuses (unless disabled) and the captain boost. Shared by the
 * lineup lock and the "Captain-Wechsel" card (which recomputes after a reassign).
 */
async function computeClubLockedPower(
  supabase: SupabaseServiceClient,
  clubId: string,
  opts: { sponsoringEnabled?: boolean; staffDisabled?: boolean } = {},
): Promise<{ DEF: number; MID: number; ATT: number }> {
  const [{ data: playerData }, { data: staffData }, { data: captainData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, current_stars, current_zone, lineup_slot, injured, player:players(chemistry_left, chemistry_right, position, eligible_positions)")
      .eq("club_id", clubId)
      .returns<Array<{
        id: string;
        current_stars: number | string;
        current_zone: string;
        lineup_slot: number | null;
        injured: boolean;
        player: { chemistry_left?: boolean | null; chemistry_right?: boolean | null; position?: string | null; eligible_positions?: string[] | null } | null;
      }>>(),
    supabase
      .from("club_staff")
      .select("staff_card:staff_cards(effects)")
      .eq("club_id", clubId)
      .returns<Array<{ staff_card: { effects: Array<{ type: string; zone?: string; stars?: number; factor?: number }> } | null }>>(),
    supabase
      .from("clubs")
      .select("captain_club_player_id, captain_boost_rank")
      .eq("id", clubId)
      .maybeSingle<{ captain_boost_rank: number | null; captain_club_player_id: string | null }>(),
  ]);

  const staffEffects = opts.staffDisabled ? [] : (staffData ?? []).flatMap((s) => s.staff_card?.effects ?? []);
  const seasonEffects = opts.sponsoringEnabled === false ? [] : await getActivePendingEffects(supabase, clubId, "this_season");
  const sponsorDefBonus = seasonEffects
    .filter((eff) => eff.effect_type === "sponsor_defense_bonus")
    .reduce((sum, eff) => sum + Number((eff.payload as { delta?: number })?.delta ?? 0), 0);
  const captain = captainData?.captain_club_player_id
    ? {
        clubPlayerId: captainData.captain_club_player_id,
        boost: Math.max(0, Math.trunc(Number(captainData.captain_boost_rank ?? 0))),
      }
    : null;
  const squadPlayers = playerData ?? [];
  const lineupStarters = squadPlayers.filter((player) => !player.injured && player.current_zone !== "bench");
  const powers = calculateLineupPower(
    applyDefaultGivenKeeperToLineupPowerPlayers(
      lineupStarters.map((p) => ({
        id: p.id,
        chemistry_left: p.player?.chemistry_left,
        chemistry_right: p.player?.chemistry_right,
        current_stars: p.current_stars,
        current_zone: p.current_zone,
        lineup_slot: p.lineup_slot,
        position: p.player?.position,
        positions: p.player?.eligible_positions?.length
          ? p.player.eligible_positions
          : p.player?.position
            ? [p.player.position]
            : undefined,
      })),
      squadPlayers,
    ),
    staffEffects,
    captain,
  );
  return {
    DEF: powers.DEF.total + sponsorDefBonus,
    MID: powers.MID.total,
    ATT: powers.ATT.total,
  };
}

async function assignRandomGameChanger(
  supabase: SupabaseServiceClient,
  clubId: string,
  seasonNumber: number,
  category?: GameChangerCategory,
) {
  type CardRow = { id: string; category: GameChangerCategory; effects: unknown[]; display_name: string; description: string; draw_weight?: number | null };

  const runQuery = async (withWeight: boolean) => {
    let query = supabase
      .from("game_changer_cards")
      .select(withWeight ? "id, category, effects, display_name, description, draw_weight" : "id, category, effects, display_name, description")
      .limit(80);
    if (category) {
      query = query.eq("category", category) as typeof query;
    }
    return query.returns<CardRow[]>();
  };

  let { data: cards, error } = await runQuery(true);
  if (error?.code === "42703") {
    const fallback = await runQuery(false);
    cards = fallback.data;
    error = fallback.error;
  }

  if (error || !cards?.length) {
    return null;
  }

  // Weighted draw: CSV duplicate entries are represented via draw_weight.
  const weights = cards.map((c) => Math.max(1, Math.trunc(Number(c.draw_weight ?? 1))));
  const pickedIdx = pickWeightedIndex(weights);
  const card = cards[pickedIdx >= 0 ? pickedIdx : Math.floor(Math.random() * cards.length)];

  const baseRow = {
    club_id: clubId,
    game_changer_card_id: card.id,
    status: "resolved" as const,
    season_number: seasonNumber,
  };

  let { data: inserted, error: insertError } = await supabase
    .from("club_game_changers")
    .insert(baseRow)
    .select("id")
    .single<{ id: string }>();

  if (insertError?.code === "42703") {
    const fallback = await supabase
      .from("club_game_changers")
      .insert({ club_id: clubId, game_changer_card_id: card.id, status: "resolved" })
      .select("id")
      .single<{ id: string }>();
    inserted = fallback.data;
    insertError = fallback.error;
  }

  if (insertError) {
    return null;
  }

  return { card, clubGameChangerId: inserted?.id ?? null };
}

async function listClubIds(supabase: SupabaseServiceClient, gameId: string): Promise<string[]> {
  const { data } = await supabase
    .from("clubs")
    .select("id")
    .eq("game_id", gameId)
    .returns<Array<{ id: string }>>();
  return (data ?? []).map((row) => row.id);
}

type PendingEffectRow = {
  id: string;
  club_id: string;
  effect_type: string;
  payload: Record<string, unknown>;
  scope: string;
  consumed_at: string | null;
};

async function getActivePendingEffects(
  supabase: SupabaseServiceClient,
  clubId: string,
  scope?: string,
): Promise<PendingEffectRow[]> {
  let query = supabase
    .from("club_pending_effects")
    .select("id, club_id, effect_type, payload, scope, consumed_at")
    .eq("club_id", clubId)
    .is("consumed_at", null);
  if (scope) {
    query = query.eq("scope", scope) as typeof query;
  }
  const { data, error } = await query.returns<PendingEffectRow[]>();
  if (error) return [];
  return data ?? [];
}

async function consumePendingEffects(
  supabase: SupabaseServiceClient,
  effectIds: string[],
): Promise<void> {
  if (effectIds.length === 0) return;
  await supabase
    .from("club_pending_effects")
    .update({ consumed_at: new Date().toISOString() })
    .in("id", effectIds);
}

/**
 * Promotes next_offseason → current_offseason for all clubs of a game when entering off_season.
 * Also repairs legacy rows that still use the draw season instead of the target offseason season.
 */
async function transitionPendingEffectsToOffseason(
  supabase: SupabaseServiceClient,
  gameId: string,
): Promise<void> {
  const clubIds = await listClubIds(supabase, gameId);
  if (clubIds.length === 0) return;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("settings")
    .eq("id", gameId)
    .single<{ settings: { seasonNumber?: number } | null }>();

  if (gameError) {
    throw gameError;
  }

  const currentSeasonNumber = Number(game?.settings?.seasonNumber ?? 1);
  const promotionTargetSeason = getOffseasonPromotionTargetSeason(currentSeasonNumber);
  const { data: pendingRows, error: pendingError } = await supabase
    .from("club_pending_effects")
    .select("id, season_number")
    .in("club_id", clubIds)
    .eq("scope", "next_offseason")
    .is("consumed_at", null)
    .returns<Array<{ id: string; season_number: number }>>();

  if (pendingError) {
    throw pendingError;
  }

  for (const row of pendingRows ?? []) {
    if (row.season_number > promotionTargetSeason) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("club_pending_effects")
      .update({
        scope: "current_offseason",
        season_number: Math.max(row.season_number, promotionTargetSeason),
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  }

  const { error: legacyRepairError } = await supabase
    .from("club_pending_effects")
    .update({ season_number: currentSeasonNumber })
    .in("club_id", clubIds)
    .in("scope", ["current_offseason", "next_offseason"])
    .is("consumed_at", null)
    .lt("season_number", currentSeasonNumber);

  if (legacyRepairError) {
    throw legacyRepairError;
  }
}

/**
 * Expires all current_offseason pending effects when leaving off_season.
 */
async function expireCurrentOffseasonEffects(
  supabase: SupabaseServiceClient,
  gameId: string,
): Promise<void> {
  const clubIds = await listClubIds(supabase, gameId);
  if (clubIds.length === 0) return;
  await supabase
    .from("club_pending_effects")
    .update({ consumed_at: new Date().toISOString() })
    .in("club_id", clubIds)
    .eq("scope", "current_offseason")
    .is("consumed_at", null);
}

/**
 * Loads next_match effects for both clubs participating in a fixture and translates
 * them into zone modifiers / partial_result flags. Used at match start.
 */
async function injectNextMatchEffects(
  supabase: SupabaseServiceClient,
  params: {
    fixtureId: string;
    homeClubId: string | null;
    awayClubId: string | null;
    currentPartial: PartialResult | null;
  },
): Promise<{ updatedPartial: PartialResult; staffDisabled: { home: boolean; away: boolean }; drawDiceBonus: { home: number; away: number }; lineupLocked: { home: boolean; away: boolean }; consumedIds: string[] }> {
  const base: PartialResult = params.currentPartial ?? { thirds: [], pending_modifiers: [] };
  const consumedIds: string[] = [];
  const newMods = [...base.pending_modifiers];
  const staffDisabled = { home: false, away: false };
  const drawDiceBonus = { home: 0, away: 0 };
  const lineupLocked = { home: false, away: false };

  for (const side of ["home", "away"] as const) {
    const clubId = side === "home" ? params.homeClubId : params.awayClubId;
    if (!clubId) continue;
    const effects = await getActivePendingEffects(supabase, clubId, "next_match");
    for (const eff of effects) {
      consumedIds.push(eff.id);
      switch (eff.effect_type) {
        case "next_match_zone_delta": {
          const zone = (eff.payload.zone ?? null) as "ATT" | "MID" | "DEF" | null;
          const delta = Number(eff.payload.delta ?? 0);
          if (zone) {
            newMods.push({ zone, delta, for: side, source_club_game_changer_id: "" });
          }
          break;
        }
        case "next_match_staff_disabled":
          staffDisabled[side] = true;
          break;
        case "next_match_draw_dice_bonus":
          drawDiceBonus[side] += Number(eff.payload.bonus ?? 0);
          break;
        case "next_match_lineup_locked":
          lineupLocked[side] = true;
          break;
        default:
          break;
      }
    }
  }

  const meta = ((base as unknown) as Record<string, unknown>).meta ?? {};
  const updatedPartial: PartialResult = {
    ...base,
    pending_modifiers: newMods,
  };
  (updatedPartial as unknown as Record<string, unknown>).meta = {
    ...(meta as Record<string, unknown>),
    staff_disabled_home: staffDisabled.home,
    staff_disabled_away: staffDisabled.away,
    draw_dice_bonus_home: drawDiceBonus.home,
    draw_dice_bonus_away: drawDiceBonus.away,
  };

  return { updatedPartial, staffDisabled, drawDiceBonus, lineupLocked, consumedIds };
}

async function writeMatchNews(
  supabase: SupabaseServiceClient,
  params: {
    gameId: string;
    fixtureId: string;
    clubId?: string | null;
    clubGameChangerId?: string | null;
    category: GameChangerCategory | "injury";
    headline: string;
    detail?: string;
  },
) {
  const row: Record<string, unknown> = {
    game_id: params.gameId,
    fixture_id: params.fixtureId,
    club_id: params.clubId ?? null,
    category: params.category,
    headline: params.headline,
    detail: params.detail ?? null,
  };
  if (params.clubGameChangerId) {
    row.club_game_changer_id = params.clubGameChangerId;
  }
  const { error } = await supabase.from("match_news").insert(row);
  if (error?.code === "42703" && params.clubGameChangerId) {
    delete row.club_game_changer_id;
    await supabase.from("match_news").insert(row);
  } else if (error) {
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PvP Match Actions
// ---------------------------------------------------------------------------

export async function markReadyForNextThirdAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { game, ownClub } = await getGameClubContext(supabase, gameId, userId);
  if (game.phase !== "season" && game.phase !== "prematch" && game.phase !== "match") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { data: fixture, error: fetchError } = await supabase
    .from("fixtures")
    .select("id, game_id, season_number, matchday, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, status, match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result")
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .maybeSingle<FixtureActionRow>();

  if (fetchError) throw fetchError;
  if (!fixture || fixture.status === "completed") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  if (fixture.match_state !== "scheduled" && fixture.match_state !== "in_progress") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const participants = await getFixtureParticipants(supabase, fixture);
  const side =
    participants.home.club_id === ownClub.id
      ? ("home" as const)
      : participants.away.club_id === ownClub.id
        ? ("away" as const)
        : null;
  if (!side) {
    throw new Error("Nicht dein Match.");
  }

  if (fixture.match_state === "scheduled" && (!fixture.home_lineup_locked || !fixture.away_lineup_locked)) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Mark own side as ready
  const readyField = side === "home" ? "home_ready_for_next_third" : "away_ready_for_next_third";
  await supabase.from("fixtures").update({ [readyField]: true }).eq("id", fixtureId);

  // Re-fetch to see if both are now ready
  const { data: refreshed } = await supabase
    .from("fixtures")
    .select("home_ready_for_next_third, away_ready_for_next_third, current_third, partial_result, match_state, home_lineup_locked, away_lineup_locked")
    .eq("id", fixtureId)
    .single<{
      away_ready_for_next_third: boolean;
      away_lineup_locked: boolean;
      current_third: number;
      home_lineup_locked: boolean;
      home_ready_for_next_third: boolean;
      match_state: string;
      partial_result: unknown;
    }>();

  const bothReady =
    (side === "home" ? true : refreshed?.home_ready_for_next_third ?? false) &&
    (side === "away" ? true : refreshed?.away_ready_for_next_third ?? false);

  if (!bothReady) {
    await Promise.all([
      touchGameSave(supabase, gameId, userId),
      emitGameEvent(supabase, {
        actorClerkUserId: userId,
        gameId,
        payload: {
          fixtureId,
          fixturePatch: {
            [readyField]: true,
          },
          side,
        },
        type: "MATCH_THIRD_READY_CHANGED",
      }),
    ]);
    revalidatePath(`/games/${roomCode}`);
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Both ready → resolve all remaining thirds in one shot
  const derbyDay = await getFixtureDerbyDay(supabase, fixtureId);
  const [homeSide, awaySide] = await Promise.all([
    buildFixtureSide(supabase, participants.home, fixture.home_cpu_lineup_id, {
      suppressStaff: derbyDay,
      lockedPowers: getLockedPowersFromFixture(fixture, "home"),
    }),
    buildFixtureSide(supabase, participants.away, fixture.away_cpu_lineup_id, {
      suppressStaff: derbyDay,
      lockedPowers: getLockedPowersFromFixture(fixture, "away"),
    }),
  ]);

  let currentPartial = (refreshed?.partial_result ?? { thirds: [], pending_modifiers: [] }) as PartialResult;

  // On first play (scheduled), inject next_match pending effects before resolving.
  if (refreshed?.match_state === "scheduled") {
    const { updatedPartial, consumedIds } = await injectNextMatchEffects(supabase, {
      fixtureId,
      homeClubId: participants.home.club_id ?? null,
      awayClubId: participants.away.club_id ?? null,
      currentPartial,
    });
    for (const mod of updatedPartial.pending_modifiers) {
      if (!mod.source_club_game_changer_id) {
        mod.source_club_game_changer_id = "pending_effect";
      }
    }
    currentPartial = updatedPartial;
    await consumePendingEffects(supabase, consumedIds);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const newThirds = ((currentPartial.thirds ?? []) as unknown as ThirdResult[]).slice();
  const allRoundEvents: MatchEventResult[] = [];

  while (newThirds.length < 3) {
    const nextIndex = (newThirds.length + 1) as 1 | 2 | 3;
    const { homeZone: nextHomeZone, awayZone: nextAwayZone } = getThirdZones(
      nextIndex,
      (newThirds[0]?.winner_participant_id) ?? null,
      homeSide.participantId,
    );
    const { active: rawModifiers, updated: partialAfterSplit } = applyAndKeepUnmatchedModifiers(
      { ...currentPartial, thirds: newThirds as unknown[] },
      nextHomeZone,
      nextAwayZone,
    );
    const modifiers = derbyDay
      ? rawModifiers.filter((m) => !m.source_club_game_changer_id || m.source_club_game_changer_id === "pending_effect")
      : rawModifiers;

    const { third, events } = resolveOneThird({
      archetypesEnabled: areArchetypesEnabled(game.settings),
      index: nextIndex,
      home: homeSide,
      away: awaySide,
      priorThirds: newThirds,
      zoneModifiers: modifiers,
    });

    newThirds.push(third);
    allRoundEvents.push(...events);
    currentPartial = { ...partialAfterSplit, thirds: newThirds as unknown[] };

    for (const event of events) {
      if (event.event_type === "injury" && event.club_id) {
        const untilMatchday = Math.max(1, Math.trunc(fixture.matchday)) + 1;
        await applyFixtureInjuryEvent(supabase, {
          actorClerkUserId: userId,
          clubId: event.club_id,
          fixtureId,
          gameId,
          playerId: event.player_id,
          untilMatchday,
          zone: event.zone,
        });
      }

      if (event.event_type === "game_changer" && event.club_id) {
        const participantKind = event.participant_id === participants.home.id ? participants.home.kind : participants.away.kind;
        const category: GameChangerCategory = participantKind === "cpu" ? "good_news" : (["good_news", "bad_news", "secret_weapon"][Math.floor(Math.random() * 3)] as GameChangerCategory);
        const result = await assignRandomGameChanger(supabase, event.club_id, seasonNumber, category);

        if (result) {
          const { card, clubGameChangerId } = result;
          const effects = parseEffects(card.effects);

          let dispatchDetails: string[] = [];
          if (category !== "secret_weapon") {
            const dispatchResult = await dispatchGameChangerEffects({
              supabase,
              clubId: event.club_id,
              clubGameChangerId,
              effects,
              emitCtx: {
                actorClerkUserId: userId,
                gameId,
              },
              ctx: {
                fixtureId,
                matchday: fixture.matchday,
                seasonNumber,
              },
            });
            dispatchDetails = dispatchResult.details;
          }

          await writeMatchNews(supabase, {
            gameId,
            fixtureId,
            clubId: event.club_id,
            clubGameChangerId,
            category,
            headline: `Game Changer: ${card.display_name}`,
            detail: formatGameChangerNewsDetail(card.description, dispatchDetails),
          });
        }
      }
    }
  }

  const newPartial: PartialResult = { ...currentPartial, thirds: newThirds as unknown[] };

  const scores = newThirds.reduce(
    (total, t) => {
      if (!t.winner_participant_id) {
        total.home += 0.5;
        total.away += 0.5;
      } else if (t.winner_participant_id === participants.home.id) {
        total.home += 1;
      } else {
        total.away += 1;
      }
      return total;
    },
    { away: 0, home: 0 },
  );
  const winnerSide = scores.home === scores.away ? "draw" : scores.home > scores.away ? "home" : "away";
  const matchPoints = getMatchPoints(winnerSide, getMatchPointsMode(game.settings));
  const allEvents = newThirds.flatMap((t) => getDoubleDiceEventsFromThird(t, homeSide, awaySide));

  const completedAt = new Date().toISOString();
  const lineupSnapshot = await buildFixtureLineupSnapshot(supabase, participants);
  const fixturePatch = {
    away_ready_for_next_third: false,
    away_score: matchPoints.away,
    away_third_points: scores.away,
    completed_at: completedAt,
    current_third: 3,
    home_ready_for_next_third: false,
    home_score: matchPoints.home,
    home_third_points: scores.home,
    match_state: "completed",
    partial_result: newPartial,
    result: {
      thirds: newThirds,
      events: allEvents,
      home_match_points: matchPoints.home,
      away_match_points: matchPoints.away,
      lineup_snapshot: lineupSnapshot,
    },
    status: "completed",
  };
  const { error: updateError } = await supabase
    .from("fixtures")
    .update(fixturePatch)
    .eq("id", fixtureId);

  if (updateError) throw updateError;
  if (isSponsoringEnabled(game.settings)) {
    await notifySponsorFixtureComplete(supabase, {
      seasonNumber: fixture.season_number,
      homeClubId: participants.home.club_id ?? null,
      awayClubId: participants.away.club_id ?? null,
      homeKind: participants.home.kind,
      awayKind: participants.away.kind,
      homeMatchPoints: matchPoints.home,
      awayMatchPoints: matchPoints.away,
      homeThirdPoints: scores.home,
      awayThirdPoints: scores.away,
    });
  }
  await healExpiredInjuriesForClubs(
    supabase,
    fixture.matchday,
    getFixtureParticipantClubIds(participants),
  );
  await rebuildSeasonStandings(supabase, gameId, fixture.season_number);
  await autoSimulateCpuOnlyFixtures(supabase, gameId, game, userId, {
    matchday: fixture.matchday,
    seasonNumber: fixture.season_number,
  });
  await Promise.all([
    touchGameSave(supabase, gameId, userId),
    emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        events: allRoundEvents,
        fixtureId,
        fixturePatch,
        needsRefetch: true,
        thirds: newThirds,
      },
      type: "MATCH_RESOLVED",
    }),
  ]);

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

export async function playSecretWeaponAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const clubGameChangerId = String(formData.get("club_game_changer_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !fixtureId || !clubGameChangerId || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const { ownClub } = await getGameClubContext(supabase, gameId, userId);

  // Fetch the club_game_changer + card
  const { data: cgc, error: cgcError } = await supabase
    .from("club_game_changers")
    .select("id, club_id, used_at, game_changer_card:game_changer_cards(id, category, effects, display_name, description)")
    .eq("id", clubGameChangerId)
    .eq("club_id", ownClub.id)
    .maybeSingle<{
      id: string;
      club_id: string;
      used_at: string | null;
      game_changer_card: { id: string; category: GameChangerCategory; effects: unknown[]; display_name: string; description: string } | null;
    }>();

  if (cgcError) throw cgcError;
  if (!cgc || cgc.used_at !== null || cgc.game_changer_card?.category !== "secret_weapon") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Enforce 1 Secret Weapon per match per club
  const { count: alreadyPlayedCount } = await supabase
    .from("club_game_changers")
    .select("id", { count: "exact", head: true })
    .eq("club_id", ownClub.id)
    .eq("fixture_id", fixtureId);
  if ((alreadyPlayedCount ?? 0) > 0) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Fetch fixture to check state
  const { data: fixture } = await supabase
    .from("fixtures")
    .select("id, match_state, current_third, partial_result, home_participant_id, away_participant_id")
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .maybeSingle<{
      id: string;
      match_state: string;
      current_third: number;
      partial_result: unknown;
      home_participant_id: string;
      away_participant_id: string;
    }>();

  if (!fixture || (fixture.match_state !== "in_progress" && fixture.match_state !== "scheduled")) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Determine which side the club is on
  const { data: participants } = await supabase
    .from("season_participants")
    .select("id, club_id")
    .in("id", [fixture.home_participant_id, fixture.away_participant_id])
    .returns<Array<{ id: string; club_id: string | null }>>();

  const homeParticipant = participants?.find((p) => p.id === fixture.home_participant_id);
  const forSide: "home" | "away" = homeParticipant?.club_id === ownClub.id ? "home" : "away";

  const effects = parseEffects(cgc.game_changer_card?.effects ?? []);
  const mods = buildZoneModifiers(cgc.id, forSide, effects);

  const currentPartial = (fixture.partial_result ?? { thirds: [], pending_modifiers: [] }) as PartialResult;
  const updatedPartial = mergeModifiersIntoPartialResult(currentPartial, mods);

  await Promise.all([
    supabase.from("fixtures").update({ partial_result: updatedPartial }).eq("id", fixtureId),
    supabase.from("club_game_changers").update({
      used_at: new Date().toISOString(),
      fixture_id: fixtureId,
      applied_third: fixture.current_third,
    }).eq("id", clubGameChangerId),
    writeMatchNews(supabase, {
      gameId,
      fixtureId,
      clubId: ownClub.id,
      clubGameChangerId,
      category: "secret_weapon",
      headline: `Geheimwaffe eingesetzt: ${cgc.game_changer_card?.display_name ?? "Unbekannt"}`,
      detail: cgc.game_changer_card?.description || undefined,
    }),
  ]);

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubGameChangerId,
      clubId: ownClub.id,
      fixtureId,
      fixturePatch: { partial_result: updatedPartial },
      needsRefetch: true,
    },
    type: "SECRET_WEAPON_PLAYED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

/**
 * Reads the derby_day flag defensively (column may be absent before the v4 migration).
 */
async function getFixtureDerbyDay(supabase: SupabaseServiceClient, fixtureId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("derby_day")
    .eq("id", fixtureId)
    .maybeSingle<{ derby_day: boolean | null }>();
  if (error) return false;
  return Boolean(data?.derby_day);
}

type MatchCardFixtureRow = {
  id: string;
  game_id: string;
  season_number: number;
  matchday: number;
  match_state: "scheduled" | "in_progress" | "completed";
  status: "scheduled" | "completed";
  current_third: number;
  partial_result: unknown;
  home_participant_id: string;
  away_participant_id: string;
  home_cpu_lineup_id?: string | null;
  away_cpu_lineup_id?: string | null;
  home_lineup_locked: boolean;
  away_lineup_locked: boolean;
  home_locked_def?: number | null;
  home_locked_mid?: number | null;
  home_locked_att?: number | null;
  away_locked_def?: number | null;
  away_locked_mid?: number | null;
  away_locked_att?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  home_third_points?: number | string | null;
  away_third_points?: number | string | null;
  result?: Record<string, unknown> | null;
  derby_day?: boolean | null;
  retro_win_used?: boolean | null;
};

const MATCH_CARD_FIXTURE_SELECT_V4 =
  "id, game_id, season_number, matchday, match_state, status, current_third, partial_result, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, home_score, away_score, home_third_points, away_third_points, result, derby_day, retro_win_used";
const MATCH_CARD_FIXTURE_SELECT_LEGACY =
  "id, game_id, season_number, matchday, match_state, status, current_third, partial_result, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, home_locked_def, home_locked_mid, home_locked_att, away_locked_def, away_locked_mid, away_locked_att, home_score, away_score, home_third_points, away_third_points, result";

/**
 * Plays an active v4 match card (secret-weapon family) in one of three windows:
 *   - before_match  (both lineups locked, match scheduled)
 *   - during_match  (match in progress, between thirds)
 *   - after_match   (match completed; e.g. "Sieg oder Spielabbruch")
 *
 * Enforces one card per window per match, validates timing, applies the relevant
 * effect (zone boost, man marking, captain reassign, lineup reopen, opponent
 * injury, derby day, VAR reroll, injury heal, retroactive win) and writes news.
 */
export async function playMatchCardAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const clubGameChangerId = String(formData.get("club_game_changer_id") || "");
  const playWindow = String(formData.get("play_window") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !fixtureId || !clubGameChangerId || !supabase) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  let choicePayload: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("choice_payload") || "");
    if (raw) choicePayload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    choicePayload = {};
  }

  const { ownClub, game } = await getGameClubContext(supabase, gameId, userId);

  const { data: cgc, error: cgcError } = await supabase
    .from("club_game_changers")
    .select("id, club_id, used_at, game_changer_card:game_changer_cards(id, category, effects, display_name, description, play_window)")
    .eq("id", clubGameChangerId)
    .eq("club_id", ownClub.id)
    .maybeSingle<{
      id: string;
      club_id: string;
      used_at: string | null;
      game_changer_card: { id: string; category: GameChangerCategory; effects: unknown[]; display_name: string; description: string; play_window?: string | null } | null;
    }>();

  if (cgcError && cgcError.code !== "42703") throw cgcError;
  if (!cgc || cgc.used_at !== null || cgc.game_changer_card?.category !== "secret_weapon") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Fetch fixture (with v4 columns where available).
  let fixtureRes = await supabase
    .from("fixtures")
    .select(MATCH_CARD_FIXTURE_SELECT_V4)
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .maybeSingle<MatchCardFixtureRow>();
  if (fixtureRes.error?.code === "42703") {
    fixtureRes = await supabase
      .from("fixtures")
      .select(MATCH_CARD_FIXTURE_SELECT_LEGACY)
      .eq("id", fixtureId)
      .eq("game_id", gameId)
      .maybeSingle<MatchCardFixtureRow>();
  }
  const fixture = fixtureRes.data;
  if (!fixture) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Determine the side this club is on.
  const { data: participants } = await supabase
    .from("season_participants")
    .select("id, club_id")
    .in("id", [fixture.home_participant_id, fixture.away_participant_id])
    .returns<Array<{ id: string; club_id: string | null }>>();
  const homeParticipant = participants?.find((p) => p.id === fixture.home_participant_id);
  const forSide: "home" | "away" = homeParticipant?.club_id === ownClub.id ? "home" : "away";
  const opponentSide: "home" | "away" = forSide === "home" ? "away" : "home";
  const opponentParticipantId = forSide === "home" ? fixture.away_participant_id : fixture.home_participant_id;

  // Validate window vs. current match state.
  const windowValid =
    (playWindow === "before_match" && fixture.match_state === "scheduled" && fixture.home_lineup_locked && fixture.away_lineup_locked) ||
    (playWindow === "during_match" &&
      (fixture.match_state === "in_progress" ||
        (fixture.match_state === "scheduled" && fixture.home_lineup_locked && fixture.away_lineup_locked) ||
        fixture.match_state === "completed")) ||
    (playWindow === "after_match" && fixture.match_state === "completed");
  if (!windowValid) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Enforce one card per window per match (defensive against missing applied_window column).
  const playedCheck = await supabase
    .from("club_game_changers")
    .select("id, applied_window")
    .eq("club_id", ownClub.id)
    .eq("fixture_id", fixtureId)
    .returns<Array<{ id: string; applied_window: string | null }>>();
  if (!playedCheck.error) {
    const alreadyThisWindow = (playedCheck.data ?? []).some((row) => (row.applied_window ?? "") === playWindow);
    if (alreadyThisWindow) {
      redirect(`/games/${roomCode}?view=matchday`);
    }
  }

  const effects = parseEffects(cgc.game_changer_card?.effects ?? []);
  const cardName = cgc.game_changer_card?.display_name ?? "Match-Karte";
  const cardDescription = cgc.game_changer_card?.description || undefined;
  const currentPartial = (fixture.partial_result ?? { thirds: [], pending_modifiers: [] }) as PartialResult;

  const markCardUsed = async (extra: Record<string, unknown> = {}) => {
    const baseUpdate: Record<string, unknown> = {
      used_at: new Date().toISOString(),
      fixture_id: fixtureId,
      applied_third: fixture.current_third,
      applied_window: playWindow,
      ...extra,
    };
    const res = await supabase.from("club_game_changers").update(baseUpdate).eq("id", clubGameChangerId);
    if (res.error?.code === "42703") {
      delete baseUpdate.applied_window;
      await supabase.from("club_game_changers").update(baseUpdate).eq("id", clubGameChangerId);
    }
  };

  const news = (headline: string, detail?: string) =>
    writeMatchNews(supabase, {
      gameId,
      fixtureId,
      clubId: ownClub.id,
      clubGameChangerId,
      category: "secret_weapon",
      headline,
      detail: detail ?? cardDescription,
    });

  let redirectView: "matchday" | "lineup" = "matchday";

  for (const effect of effects) {
    switch (effect.type) {
      case "match_zone_boost":
      case "man_marking": {
        const payload: MatchCardModifierPayload = {};
        if (effect.type === "match_zone_boost" && effect.choice === "zone") {
          const zone = String(choicePayload.zone ?? "");
          if (zone !== "ATT" && zone !== "MID" && zone !== "DEF") {
            redirect(`/games/${roomCode}?view=matchday`);
          }
          payload.zone = zone as TacticalZone;
        }
        if (effect.type === "man_marking") {
          const defenderId = String(choicePayload.club_player_id ?? "");
          if (!defenderId) redirect(`/games/${roomCode}?view=matchday`);
          const { data: defender } = await supabase
            .from("club_players")
            .select("id, current_stars")
            .eq("id", defenderId)
            .eq("club_id", ownClub.id)
            .maybeSingle<{ id: string; current_stars: number | string }>();
          if (!defender) redirect(`/games/${roomCode}?view=matchday`);
          payload.defender_stars = Number(defender!.current_stars);
        }
        const mods = buildZoneModifiers(cgc.id, forSide, effects, payload);
        const updatedPartial = mergeModifiersIntoPartialResult(currentPartial, mods);
        await supabase.from("fixtures").update({ partial_result: updatedPartial }).eq("id", fixtureId);
        await markCardUsed();
        await news(`Geheimwaffe eingesetzt: ${cardName}`);
        break;
      }

      case "captain_reassign": {
        // Reassign the club captain to a chosen player after the lineup is locked.
        const newCaptainId = String(choicePayload.club_player_id ?? "");
        if (!newCaptainId) {
          redirect(`/games/${roomCode}?view=matchday`);
        }
        const { data: owned } = await supabase
          .from("club_players")
          .select("id, custom_name, player:players(display_name)")
          .eq("id", newCaptainId)
          .eq("club_id", ownClub.id)
          .maybeSingle<{ custom_name?: string | null; id: string; player: { display_name: string } | null }>();
        if (!owned) {
          redirect(`/games/${roomCode}?view=matchday`);
        }
        const capUpdate = await supabase
          .from("clubs")
          .update({ captain_club_player_id: newCaptainId })
          .eq("id", ownClub.id);
        if (capUpdate.error && (capUpdate.error as { code?: string }).code !== "42703") {
          throw capUpdate.error;
        }
        // Recompute and overwrite the locked zone power for the affected side so the
        // boost moves with the new captain. Derby Day disables staff (and captain).
        const derbyActive = Boolean((fixture as unknown as Record<string, unknown>).derby_day);
        const powers = await computeClubLockedPower(supabase, ownClub.id, {
          sponsoringEnabled: isSponsoringEnabled(game.settings),
          staffDisabled: derbyActive,
        });
        const lockUpdate =
          forSide === "home"
            ? { home_locked_def: powers.DEF, home_locked_mid: powers.MID, home_locked_att: powers.ATT }
            : { away_locked_def: powers.DEF, away_locked_mid: powers.MID, away_locked_att: powers.ATT };
        await supabase.from("fixtures").update(lockUpdate).eq("id", fixtureId);
        await markCardUsed();
        await news(`Captain-Wechsel: ${getClubPlayerDisplayNameFromRow(owned!)} ist neuer Captain`);
        break;
      }

      case "lineup_reopen": {
        const lockCol = forSide === "home" ? "home_lineup_locked" : "away_lineup_locked";
        await supabase.from("fixtures").update({ [lockCol]: false }).eq("id", fixtureId);
        await markCardUsed();
        await news(`Plan B: Aufstellung wieder geoeffnet`);
        redirectView = "lineup";
        break;
      }

      case "injure_opponent": {
        if (!opponentParticipantId) redirect(`/games/${roomCode}?view=matchday`);
        const { data: opponentClub } = await supabase
          .from("season_participants")
          .select("club_id")
          .eq("id", opponentParticipantId)
          .maybeSingle<{ club_id: string | null }>();
        if (!opponentClub?.club_id) redirect(`/games/${roomCode}?view=matchday`);
        const until = effect.duration === "season" ? -1 : Math.max(1, Math.trunc(fixture.matchday)) + 1;
        const targetId = String(choicePayload.club_player_id ?? "");
        let victim: { custom_name?: string | null; id: string; player: { display_name: string } | null } | null = null;
        if (targetId) {
          const { data } = await supabase
            .from("club_players")
            .select("id, custom_name, player:players(display_name)")
            .eq("id", targetId)
            .eq("club_id", opponentClub!.club_id!)
            .eq("injured", false)
            .maybeSingle<{ custom_name?: string | null; id: string; player: { display_name: string } | null }>();
          victim = data;
        } else {
          // No client choice (hidden roster): pick a random eligible opponent player.
          const { data: pool } = await supabase
            .from("club_players")
            .select("id, custom_name, player:players(display_name)")
            .eq("club_id", opponentClub!.club_id!)
            .eq("injured", false)
            .neq("current_zone", "bench")
            .returns<Array<{ custom_name?: string | null; id: string; player: { display_name: string } | null }>>();
          if (pool && pool.length > 0) {
            victim = pool[Math.floor(Math.random() * pool.length)];
          }
        }
        if (!victim) redirect(`/games/${roomCode}?view=matchday`);
        await applyClubPlayerInjury(supabase, {
          clubId: opponentClub!.club_id!,
          clubPlayerId: victim!.id,
          untilMatchday: until,
        });
        await emitGameEvent(supabase, {
          actorClerkUserId: userId,
          gameId,
          payload: {
            clubId: opponentClub!.club_id!,
            clubPlayerId: victim!.id,
            currentZone: "bench",
            injured: true,
          },
          type: "PLAYER_INJURED",
        });
        // Reopen the opponent's lineup so they must react.
        const oppLockCol = opponentSide === "home" ? "home_lineup_locked" : "away_lineup_locked";
        await supabase.from("fixtures").update({ [oppLockCol]: false }).eq("id", fixtureId);
        await markCardUsed();
        await news(`Dirty Tackle: ${getClubPlayerDisplayNameFromRow(victim!)} verletzt`);
        break;
      }

      case "derby_day": {
        const res = await supabase.from("fixtures").update({ derby_day: true }).eq("id", fixtureId);
        if (res.error && res.error.code !== "42703") throw res.error;
        await markCardUsed();
        await news(`Derby Day! Alle Zusatzeffekte fallen weg`);
        break;
      }

      case "heal_injury_choice": {
        const targetId = String(choicePayload.club_player_id ?? "");
        if (!targetId) redirect(`/games/${roomCode}?view=matchday`);
        const { data: patient } = await supabase
          .from("club_players")
          .select("id, custom_name, player:players(display_name)")
          .eq("id", targetId)
          .eq("club_id", ownClub.id)
          .eq("injured", true)
          .maybeSingle<{ custom_name?: string | null; id: string; player: { display_name: string } | null }>();
        if (!patient) redirect(`/games/${roomCode}?view=matchday`);
        await supabase
          .from("club_players")
          .update({ injured: false, injured_until_matchday: null })
          .eq("id", patient!.id);
        await markCardUsed();
        await news(`Magic Ice Spray: ${getClubPlayerDisplayNameFromRow(patient!)} geheilt`);
        break;
      }

      case "var_reroll": {
        const existingThirds = (
          fixture.match_state === "completed" && fixture.result && Array.isArray((fixture.result as { thirds?: unknown[] }).thirds)
            ? (fixture.result as { thirds: unknown[] }).thirds
            : (currentPartial.thirds ?? [])
        ) as unknown as ThirdResult[];
        if (existingThirds.length === 0) {
          redirect(`/games/${roomCode}?view=matchday`);
        }

        const priorThirds = existingThirds.slice(0, -1);
        const nextIndex = (priorThirds.length + 1) as 1 | 2 | 3;
        const derbyDay = await getFixtureDerbyDay(supabase, fixtureId);
        const participants = await getFixtureParticipants(supabase, fixture as FixtureActionRow);
        const [homeSide, awaySide] = await Promise.all([
          buildFixtureSide(supabase, participants.home, fixture.home_cpu_lineup_id, {
            suppressStaff: derbyDay,
            lockedPowers: getLockedPowersFromFixture(fixture as FixtureActionRow, "home"),
          }),
          buildFixtureSide(supabase, participants.away, fixture.away_cpu_lineup_id, {
            suppressStaff: derbyDay,
            lockedPowers: getLockedPowersFromFixture(fixture as FixtureActionRow, "away"),
          }),
        ]);

        const partialBeforeReroll: PartialResult = { ...currentPartial, thirds: priorThirds as unknown[] };
        const { homeZone: nextHomeZone, awayZone: nextAwayZone } = getThirdZones(
          nextIndex,
          (priorThirds[0]?.winner_participant_id) ?? null,
          homeSide.participantId,
        );
        const { active: rawModifiers, updated: partialAfterSplit } = applyAndKeepUnmatchedModifiers(
          partialBeforeReroll,
          nextHomeZone,
          nextAwayZone,
        );
        const modifiers = derbyDay
          ? rawModifiers.filter((m) => !m.source_club_game_changer_id || m.source_club_game_changer_id === "pending_effect")
          : rawModifiers;

        const { third, events } = resolveOneThird({
          archetypesEnabled: areArchetypesEnabled(game.settings),
          index: nextIndex,
          home: homeSide,
          away: awaySide,
          priorThirds,
          zoneModifiers: modifiers,
        });

        const newThirds: ThirdResult[] = [...priorThirds, third];
        for (const event of events) {
          if (event.event_type === "injury" && event.club_id) {
            const untilMatchday = Math.max(1, Math.trunc(fixture.matchday)) + 1;
            await applyFixtureInjuryEvent(supabase, {
              actorClerkUserId: userId,
              clubId: event.club_id,
              fixtureId,
              gameId,
              playerId: event.player_id,
              untilMatchday,
              zone: event.zone,
            });
          }
        }

        const newPartial: PartialResult = { ...partialAfterSplit, thirds: newThirds as unknown[] };
        const scores = newThirds.reduce(
          (total, t) => {
            if (!t.winner_participant_id) {
              total.home += 0.5;
              total.away += 0.5;
            } else if (t.winner_participant_id === participants.home.id) {
              total.home += 1;
            } else {
              total.away += 1;
            }
            return total;
          },
          { away: 0, home: 0 },
        );
        const winnerSide = scores.home === scores.away ? "draw" : scores.home > scores.away ? "home" : "away";
        const matchPoints = getMatchPoints(winnerSide, getMatchPointsMode(game.settings));
        const allEvents = newThirds.flatMap((t) => getDoubleDiceEventsFromThird(t, homeSide, awaySide));
        const lineupSnapshot =
          fixture.match_state === "completed" && fixture.result
            ? ((fixture.result as { lineup_snapshot?: unknown }).lineup_snapshot ?? null)
            : await buildFixtureLineupSnapshot(supabase, participants);

        const fixturePatch = {
          away_ready_for_next_third: false,
          away_score: matchPoints.away,
          away_third_points: scores.away,
          current_third: 3,
          home_ready_for_next_third: false,
          home_score: matchPoints.home,
          home_third_points: scores.home,
          match_state: "completed",
          partial_result: newPartial,
          result: {
            thirds: newThirds,
            events: allEvents,
            home_match_points: matchPoints.home,
            away_match_points: matchPoints.away,
            lineup_snapshot: lineupSnapshot,
          },
          status: "completed",
        };

        await supabase.from("fixtures").update(fixturePatch).eq("id", fixtureId);
        if (fixture.match_state === "completed") {
          await rebuildSeasonStandings(supabase, gameId, fixture.season_number);
        }
        await markCardUsed();
        await news(`VAR: Drittel ${nextIndex} wurde neu gewuerfelt`);
        break;
      }

      case "retroactive_win_attempt": {
        if (fixture.retro_win_used) {
          redirect(`/games/${roomCode}?view=matchday`);
        }
        const homePoints = Number(fixture.home_score ?? 0);
        const awayPoints = Number(fixture.away_score ?? 0);
        const ownPoints = forSide === "home" ? homePoints : awayPoints;
        const oppPoints = forSide === "home" ? awayPoints : homePoints;
        if (ownPoints >= oppPoints) {
          // Only available after a defeat.
          redirect(`/games/${roomCode}?view=matchday`);
        }
        const rollResult = rollRetroWin(effect);
        const updates: Record<string, unknown> = {
          retro_win_used: true,
          retro_win_result: { rolls: rollResult.rolls, success: rollResult.success, by_side: forSide },
        };
        if (rollResult.success) {
          const matchPoints = getMatchPoints(forSide, getMatchPointsMode(game.settings));
          updates.home_score = matchPoints.home;
          updates.away_score = matchPoints.away;
          const existingResult = (fixture.result ?? {}) as Record<string, unknown>;
          updates.result = {
            ...existingResult,
            home_match_points: matchPoints.home,
            away_match_points: matchPoints.away,
            retro_win: { rolls: rollResult.rolls, by_side: forSide },
          };
        }
        const res = await supabase.from("fixtures").update(updates).eq("id", fixtureId);
        if (res.error?.code === "42703") {
          // v4 columns missing: still flip the score if successful.
          if (rollResult.success) {
            const matchPoints = getMatchPoints(forSide, getMatchPointsMode(game.settings));
            await supabase.from("fixtures").update({ home_score: matchPoints.home, away_score: matchPoints.away }).eq("id", fixtureId);
          }
        } else if (res.error) {
          throw res.error;
        }
        await markCardUsed();
        if (rollResult.success) {
          await rebuildSeasonStandings(supabase, gameId, fixture.season_number);
          await news(`Sieg oder Spielabbruch: Wurf ${rollResult.rolls.join(", ")} – Niederlage in Sieg gedreht!`);
        } else {
          await news(`Sieg oder Spielabbruch: Wurf ${rollResult.rolls.join(", ")} – kein Erfolg`);
        }
        break;
      }

      default:
        break;
    }
  }

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=${redirectView}`);
}

function getDoubleDiceEventsFromThird(third: ThirdResult, home: FixtureSideInput, away: FixtureSideInput) {
  const events = [];
  if (home.canReceiveEvents && third.home.dice[0] === third.home.dice[1]) {
    events.push({ participant_id: home.participantId, club_id: home.clubId, event_type: "game_changer", zone: third.home.zone, dice: third.home.dice, third_index: third.index });
  }
  if (away.canReceiveEvents && third.away.dice[0] === third.away.dice[1]) {
    events.push({ participant_id: away.participantId, club_id: away.clubId, event_type: "game_changer", zone: third.away.zone, dice: third.away.dice, third_index: third.index });
  }
  return events;
}

async function rebuildSeasonStandings(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const [{ data: fixtures, error: fixturesError }, { data: participants, error: participantsError }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("home_participant_id, away_participant_id, home_score, away_score, home_third_points, away_third_points, status")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .returns<
        Array<{
          away_participant_id: string;
          away_score: number | null;
          away_third_points: number | string | null;
          home_participant_id: string;
          home_score: number | null;
          home_third_points: number | string | null;
          status: string;
        }>
      >(),
    supabase
      .from("season_participants")
      .select("id, kind, club_id")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .returns<Array<{ club_id?: string | null; id: string; kind: string }>>(),
  ]);

  if (fixturesError) {
    throw fixturesError;
  }

  if (participantsError) {
    throw participantsError;
  }

  const rows = new Map(
    (participants ?? []).map((participant) => [
      participant.id,
      {
        draws: 0,
        fixture_points_against: 0,
        fixture_points_for: 0,
        game_id: gameId,
        losses: 0,
        manager_match_points: 0,
        match_points: 0,
        participant_id: participant.id,
        played: 0,
        rank: 1,
        season_number: seasonNumber,
        third_points_against: 0,
        third_points_for: 0,
        wins: 0,
      },
    ]),
  );

  const humanParticipantIds = new Set(
    (participants ?? []).filter((participant) => participant.kind === "human").map((participant) => participant.id),
  );

  for (const fixture of fixtures ?? []) {
    if (fixture.status !== "completed") {
      continue;
    }

    const home = rows.get(fixture.home_participant_id);
    const away = rows.get(fixture.away_participant_id);
    if (!home || !away) {
      continue;
    }

    const homeScore = Number(fixture.home_score ?? 0);
    const awayScore = Number(fixture.away_score ?? 0);
    const homeThirds = Number(fixture.home_third_points ?? 0);
    const awayThirds = Number(fixture.away_third_points ?? 0);
    const isHumanVsHuman =
      humanParticipantIds.has(fixture.home_participant_id) && humanParticipantIds.has(fixture.away_participant_id);

    home.played += 1;
    away.played += 1;
    home.match_points += homeScore;
    away.match_points += awayScore;
    if (isHumanVsHuman) {
      home.manager_match_points += homeScore;
      away.manager_match_points += awayScore;
    }
    home.third_points_for += homeThirds;
    home.third_points_against += awayThirds;
    away.third_points_for += awayThirds;
    away.third_points_against += homeThirds;
    home.fixture_points_for += homeScore;
    home.fixture_points_against += awayScore;
    away.fixture_points_for += awayScore;
    away.fixture_points_against += homeScore;

    if (homeScore === awayScore) {
      home.draws += 1;
      away.draws += 1;
    } else if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  const sorted = [...rows.values()].sort((a, b) => {
    const pointsDiff = b.match_points - a.match_points;
    if (pointsDiff !== 0) return pointsDiff;
    const thirdDiff = b.third_points_for - b.third_points_against - (a.third_points_for - a.third_points_against);
    if (thirdDiff !== 0) return thirdDiff;
    return b.third_points_for - a.third_points_for;
  });

  const upsertRows = sorted.map((row, index) => ({ ...row, rank: index + 1, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("season_standings").upsert(upsertRows);

  if (error) {
    throw error;
  }

  await updateHumanClubRanks(supabase, participants ?? [], upsertRows);
}

async function updateHumanClubRanks(
  supabase: SupabaseServiceClient,
  participants: Array<{ club_id?: string | null; id: string; kind: string }>,
  standings: Array<{ participant_id: string; rank: number }>,
) {
  const updates = standings.flatMap((standing) => {
    const participant = participants.find((item) => item.id === standing.participant_id);
    if (!participant?.club_id || participant.kind !== "human") {
      return [];
    }

    return [
      supabase.from("clubs").update({ season_rank: standing.rank }).eq("id", participant.club_id),
    ];
  });

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

type ManagerScoreRow = {
  attractiveness_stars: number;
  club_id: string;
  club_name: string;
  match_points: number;
  rank: number;
  season_score: number;
  squad_stars: number;
  stage_score: number;
  status: string;
};

async function finalizeSeasonEnd(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  // status + attractiveness_stars are frozen for the entire offseason (poaching, display).
  const rows = await getManagerScoreRows(supabase, gameId, seasonNumber);

  for (const row of rows) {
    const { error } = await supabase
      .from("clubs")
      .update({
        attractiveness_stars: row.attractiveness_stars,
        points: row.stage_score,
        season_rank: row.rank,
        status: row.status,
      })
      .eq("id", row.club_id)
      .eq("game_id", gameId);

    if (error) {
      throw error;
    }
  }
}

async function bookSeasonFinance(
  supabase: SupabaseServiceClient,
  gameId: string,
  seasonNumber: number,
  opts: { sponsoringEnabled?: boolean } = {},
) {
  const rows = await getManagerScoreRows(supabase, gameId, seasonNumber);
  const humanClubCount = rows.length;

  for (const row of rows) {
    const { data: existing, error: existingError } = await supabase
      .from("transactions")
      .select("id")
      .eq("game_id", gameId)
      .eq("club_id", row.club_id)
      .eq("reason", "season_finance")
      .contains("metadata", { season_number: seasonNumber })
      .limit(1)
      .returns<Array<{ id: string }>>();

    if (existingError) {
      throw existingError;
    }

    if (existing?.length) {
      continue;
    }

    const [clubResultV3, { data: staffRows }] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, money, stadium_level, status, status_override, status_override_until_season, stadium_level_cap, stadium_level_cap_until_season, season_rank")
        .eq("id", row.club_id)
        .eq("game_id", gameId)
        .single<{ id: string; money: number | string; season_rank: number | null; stadium_level: number | null; status: string | null; status_override: string | null; status_override_until_season: number | null; stadium_level_cap: number | null; stadium_level_cap_until_season: number | null }>(),
      supabase
        .from("club_staff")
        .select("id, card:staff_cards(effects)")
        .eq("club_id", row.club_id)
        .returns<Array<{ id: string; card: { effects: unknown[] } }>>(),
    ]);

    let club = clubResultV3.data;
    let clubError = clubResultV3.error;
    if (clubError && (clubError as { code?: string }).code === "42703") {
      const legacy = await supabase
        .from("clubs")
        .select("id, money, stadium_level, status, season_rank")
        .eq("id", row.club_id)
        .eq("game_id", gameId)
        .single<{ id: string; money: number | string; season_rank: number | null; stadium_level: number | null; status: string | null }>();
      if (legacy.data) {
        club = { ...legacy.data, status_override: null, status_override_until_season: null, stadium_level_cap: null, stadium_level_cap_until_season: null };
        clubError = null;
      } else {
        clubError = legacy.error;
      }
    }

    if (clubError) {
      throw clubError;
    }
    if (!club) {
      throw new Error("Club not found while booking season finance");
    }

    const staffEffects = (staffRows ?? []).flatMap((s) => s.card?.effects ?? []) as Array<Record<string, unknown>>;
    const tierUp = staffEffects.filter((e) => e.type === "status_tier_up").reduce((sum, e) => sum + Number(e.tiers ?? 0), 0);
    const staffIncomeBonus = staffEffects.filter((e) => e.type === "season_income_bonus").reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const staffAttrBonus = staffEffects.filter((e) => e.type === "attractiveness_bonus").reduce((sum, e) => sum + Number(e.stars ?? 0), 0);
    const wageMultiplier = staffEffects.filter((e) => e.type === "wage_multiplier").reduce((min, e) => Math.min(min, Number(e.factor ?? 1)), 1);

    // Game Changer effects: status_override (Fanmarsch / Pressekonferenz) and stadium_level_cap (Sicherheitsluecke)
    const statusOverrideActive = club.status_override && (club.status_override_until_season == null || club.status_override_until_season >= seasonNumber);
    const stadiumCapActive = club.stadium_level_cap != null && (club.stadium_level_cap_until_season == null || club.stadium_level_cap_until_season >= seasonNumber);

    const baseStatusKey = (statusOverrideActive ? club.status_override : row.status) as "established" | "mid_table" | "newly_promoted" | "title_contender";
    const baseStatus = baseStatusKey ?? (row.status as "established" | "mid_table" | "newly_promoted" | "title_contender");
    const effectiveStatus = applyStatusTierUp(baseStatus, tierUp);
    const stadiumLevelEffective = stadiumCapActive
      ? Math.min(Number(club.stadium_level ?? 1), Number(club.stadium_level_cap ?? 1))
      : Number(club.stadium_level ?? 1);

    const baseStadiumIncome = getStadiumIncome(stadiumLevelEffective, effectiveStatus);
    const { data: sponsorIncomeEffects } = opts.sponsoringEnabled === false
      ? { data: [] as Array<{ payload: { factor?: number } | null }> }
      : await supabase
          .from("club_pending_effects")
          .select("payload")
          .eq("club_id", row.club_id)
          .eq("season_number", seasonNumber)
          .eq("effect_type", "sponsor_stadium_income_multiplier")
          .is("consumed_at", null)
          .returns<Array<{ payload: { factor?: number } | null }>>();
    const stadiumIncomeFactor = (sponsorIncomeEffects ?? []).reduce(
      (max, row) => Math.max(max, Number(row.payload?.factor ?? 1)),
      1,
    );
    const stadiumIncome = Math.round(baseStadiumIncome * stadiumIncomeFactor);
    const placementReward = getPlacementReward(row.rank, humanClubCount);
    const wages = Math.round(row.squad_stars * 1_000_000 * wageMultiplier);
    const net = stadiumIncome + placementReward + staffIncomeBonus - wages;

    const finalAttractivenessStars = Math.min(6, row.attractiveness_stars + staffAttrBonus);

    // Final offseason snapshot: not recomputed when the squad grows during scouting/transfers.
    const clubUpdate: Record<string, unknown> = {
      attractiveness_stars: finalAttractivenessStars,
      money: Number(club.money ?? 0) + net,
      points: row.season_score,
      season_rank: row.rank,
      status: row.status,
      // Captain boost for the upcoming season: best placement +1 ... last place +N.
      // Only human managers reach this loop; recomputed every season end (one season only).
      captain_boost_rank: row.rank,
    };
    let { error: updateClubError } = await supabase
      .from("clubs")
      .update(clubUpdate)
      .eq("id", row.club_id)
      .eq("game_id", gameId);

    if ((updateClubError as { code?: string } | null)?.code === "42703") {
      delete clubUpdate.captain_boost_rank;
      const retry = await supabase
        .from("clubs")
        .update(clubUpdate)
        .eq("id", row.club_id)
        .eq("game_id", gameId);
      updateClubError = retry.error;
    }

    if (updateClubError) {
      throw updateClubError;
    }

    const { error: transactionError } = await supabase.from("transactions").insert({
      amount: Math.max(0, net),
      club_id: row.club_id,
      game_id: gameId,
      metadata: {
        attractiveness_stars: finalAttractivenessStars,
        net,
        placement_reward: placementReward,
        season_match_points: row.match_points,
        season_number: seasonNumber,
        season_rank: row.rank,
        season_score: row.season_score,
        squad_stars: row.squad_stars,
        stage_score: row.stage_score,
        staff_income_bonus: staffIncomeBonus,
        stadium_income: stadiumIncome,
        status: row.status,
        wages,
      },
      reason: "season_finance",
    });

    if (transactionError) {
      throw transactionError;
    }
  }

  const clubIds = rows.map((row) => row.club_id);
  if (clubIds.length > 0) {
    const { error: injuryResetError } = await supabase.from("club_players").update({ injured: false }).in("club_id", clubIds);

    if (injuryResetError) {
      throw injuryResetError;
    }
  }
}

async function getManagerScoreRows(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number): Promise<ManagerScoreRow[]> {
  const [{ data: standings, error: standingsError }, { data: squadRows, error: squadError }] = await Promise.all([
    supabase
      .from("season_standings")
      .select("match_points, manager_match_points, participant:season_participants(id, kind, club_id, display_name)")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .returns<
        Array<{
          manager_match_points?: number | string | null;
          match_points: number | string;
          participant: { club_id?: string | null; display_name: string; id: string; kind: string };
        }>
      >(),
    supabase
      .from("club_players")
      .select("club_id, current_stars, club:clubs!club_players_club_id_fkey!inner(game_id)")
      .eq("club.game_id", gameId)
      .returns<Array<{ club_id: string; current_stars: number | string }>>(),
  ]);

  if (standingsError) {
    throw standingsError;
  }

  if (squadError) {
    throw squadError;
  }

  const starsByClubId = new Map<string, number>();
  for (const row of squadRows ?? []) {
    starsByClubId.set(row.club_id, (starsByClubId.get(row.club_id) ?? 0) + Number(row.current_stars ?? 0));
  }

  const rows = (standings ?? [])
    .filter((standing) => standing.participant.kind === "human" && standing.participant.club_id)
    .map((standing) => {
      const clubId = standing.participant.club_id as string;
      const squadStars = starsByClubId.get(clubId) ?? 0;
      const matchPoints = Number(standing.manager_match_points ?? standing.match_points ?? 0);
      const seasonScore = calculateManagerStandingScore(matchPoints);
      const stageScore = calculateManagerStageScore(squadStars, matchPoints);
      const band = getManagerScoreBand(stageScore);

      return {
        attractiveness_stars: band.attractivenessStars,
        club_id: clubId,
        club_name: standing.participant.display_name,
        match_points: matchPoints,
        rank: 1,
        season_score: seasonScore,
        squad_stars: squadStars,
        stage_score: stageScore,
        status: band.status,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.season_score - a.season_score;
      if (scoreDiff !== 0) return scoreDiff;
      const squadDiff = b.squad_stars - a.squad_stars;
      if (squadDiff !== 0) return squadDiff;
      return a.club_name.localeCompare(b.club_name);
    });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

async function areSeasonFixturesComplete(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("fixtures")
    .select("status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .returns<Array<{ status: string }>>();

  if (error) {
    throw error;
  }

  return Boolean(data?.length) && data.every((fixture) => fixture.status === "completed");
}

type SubmittedLineupItem = {
  club_player_id: string;
  slot: number;
  zone: "ATT" | "DEF" | "GK" | "MID";
};

function parseLineupPayload(value: string): SubmittedLineupItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const usedClubPlayerIds = new Set<string>();
  const validZones = new Set(["ATT", "DEF", "GK", "MID"]);
  const items: SubmittedLineupItem[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const clubPlayerId = "club_player_id" in item ? String(item.club_player_id) : "";
    const zone = "zone" in item ? String(item.zone) : "";
    const slot = "slot" in item ? Number(item.slot) : Number.NaN;

    if (!clubPlayerId || clubPlayerId.startsWith("default-") || usedClubPlayerIds.has(clubPlayerId)) {
      continue;
    }

    if (!validZones.has(zone) || !Number.isInteger(slot) || slot < 1 || slot > 11) {
      continue;
    }

    usedClubPlayerIds.add(clubPlayerId);
    items.push({
      club_player_id: clubPlayerId,
      slot,
      zone: zone as SubmittedLineupItem["zone"],
    });
  }

  return items;
}

type DeadlineAuctionActionRow = {
  auction_index: number;
  bid_order_club_ids: string[];
  current_amount: number | string;
  current_bid_club_id?: string | null;
  game_id: string;
  id: string;
  minimum_bid: number | string;
  passed_club_ids: string[];
  player_id: string;
  season_number: number;
  status: "scheduled" | "open" | "resolving" | "resolved" | "passed";
  turn_started_at?: string | null;
  winning_club_id?: string | null;
};

async function getGameClubContext(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  const [{ data: game, error: gameError }, { data: clubs, error: clubsError }] = await Promise.all([
    supabase
      .from("games")
      .select("id, room_code, phase, host_clerk_user_id, current_turn_club_id, settings")
      .eq("id", gameId)
      .single<LobbyGame>(),
    supabase
      .from("clubs")
      .select(
        "id, game_id, clerk_user_id, club_name, manager_name, money, points, is_ready, created_at, scouting_level, training_level, stadium_level, season_rank, status, status_override, status_override_until_season, attractiveness_stars, offseason_scouting_capacity, offseason_training_capacity, prestige_state",
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: true })
      .returns<LobbyClub[]>(),
  ]);

  if (gameError) {
    throw gameError;
  }

  if (clubsError) {
    throw clubsError;
  }

  const ownClub = (clubs ?? []).find((club) => club.clerk_user_id === userId);

  if (!ownClub) {
    throw new Error("Du bist in diesem Spielstand keinem Club zugeordnet.");
  }

  return { clubs: clubs ?? [], game, ownClub };
}

async function getScoutingDraws(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("scouting_draws")
    .select(`id, game_id, club_id, season_number, pile_key, draw_index, player_id, status, created_at, resolved_at, player:players(${DRAFT_PLAYER_SELECT})`)
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .order("draw_index", { ascending: true })
    .returns<ScoutingDrawSnapshot[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function pickAvailableScoutingPlayer(params: {
  clubs: LobbyClub[];
  draws: ScoutingDrawSnapshot[];
  gameId: string;
  seasonNumber: number;
  supabase: SupabaseServiceClient;
}) {
  const { clubs, draws, supabase } = params;
  const clubIds = clubs.map((club) => club.id);
  const openPlayerIds = new Set(draws.filter((draw) => draw.status === "drawn").map((draw) => draw.player_id));
  const ownedPlayerIds = new Set<string>();

  if (clubIds.length > 0) {
    const { data: ownedRows, error: ownedError } = await supabase
      .from("club_players")
      .select("player_id")
      .in("club_id", clubIds)
      .returns<Array<{ player_id: string }>>();

    if (ownedError) {
      throw ownedError;
    }

    for (const row of ownedRows ?? []) {
      ownedPlayerIds.add(row.player_id);
    }
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select(DRAFT_PLAYER_SELECT)
    .in("visibility", ["public", "room"])
    .neq("region", "academy")
    .returns<DraftPlayerRow[]>();

  if (playersError) {
    throw playersError;
  }

  const available = (players ?? []).filter(
    (player) =>
      isMarketPoolPlayer(player) &&
      !openPlayerIds.has(player.id) &&
      !ownedPlayerIds.has(player.id),
  );

  if (available.length === 0) {
    return null;
  }

  return available[Math.floor(Math.random() * available.length)];
}

async function assertPlayerNotOwnedInGame(supabase: SupabaseServiceClient, gameId: string, playerId: string) {
  const { data: clubs, error: clubsError } = await supabase
    .from("clubs")
    .select("id")
    .eq("game_id", gameId)
    .returns<Array<{ id: string }>>();

  if (clubsError) {
    throw clubsError;
  }

  const clubIds = (clubs ?? []).map((club) => club.id);

  if (clubIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("club_players")
    .select("id")
    .in("club_id", clubIds)
    .eq("player_id", playerId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (data) {
    throw new Error("Dieser Spieler ist in diesem Spielstand bereits vergeben.");
  }
}

async function getClubSquadCount(supabase: SupabaseServiceClient, clubId: string) {
  const { count, error } = await supabase
    .from("club_players")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function getPlayerSaleCount(supabase: SupabaseServiceClient, gameId: string, clubId: string, seasonNumber: number) {
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("club_id", clubId)
    .eq("reason", "player_sale")
    .contains("metadata", { season_number: seasonNumber });

  if (error) {
    throw error;
  }

  return count ?? 0;
}

type TransferOfferActionRow = {
  cash_amount: number | string;
  created_by_club_id?: string | null;
  from_club_id: string;
  game_id: string;
  id: string;
  offered_club_player_id?: string | null;
  offered_player_id?: string | null;
  parent_offer_id?: string | null;
  responder_club_id?: string | null;
  season_number: number;
  status: "accepted" | "cancelled" | "countered" | "declined" | "expired" | "open";
  target_club_player_id: string;
  target_player_id: string;
  to_club_id: string;
};

async function getTransferOfferForAction(supabase: SupabaseServiceClient, offerId: string, gameId: string) {
  const { data, error } = await supabase
    .from("transfer_offers")
    .select(
      "id, game_id, season_number, parent_offer_id, created_by_club_id, responder_club_id, from_club_id, to_club_id, target_club_player_id, target_player_id, offered_club_player_id, offered_player_id, cash_amount, status",
    )
    .eq("id", offerId)
    .eq("game_id", gameId)
    .maybeSingle<TransferOfferActionRow>();

  if (error) {
    throw error;
  }

  return data;
}

type PoachRequestActionRow = {
  cash_amount: number | string;
  from_club_id: string;
  game_id: string;
  id: string;
  season_number: number;
  status: "open" | "accepted" | "declined" | "cancelled";
  target_club_player_id: string;
  target_player_id: string;
  to_club_id: string;
};

async function getPoachRequestForAction(supabase: SupabaseServiceClient, requestId: string, gameId: string) {
  const { data, error } = await supabase
    .from("poach_requests")
    .select(
      "id, game_id, season_number, from_club_id, to_club_id, target_club_player_id, target_player_id, cash_amount, status",
    )
    .eq("id", requestId)
    .eq("game_id", gameId)
    .maybeSingle<PoachRequestActionRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function getManagerTransferDepartureCount(
  supabase: SupabaseServiceClient,
  gameId: string,
  clubId: string,
  seasonNumber: number,
) {
  const { data, error } = await supabase
    .from("transfer_offers")
    .select("from_club_id, to_club_id, offered_club_player_id")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .eq("status", "accepted")
    .or(`from_club_id.eq.${clubId},to_club_id.eq.${clubId}`)
    .returns<Array<{ from_club_id: string; offered_club_player_id: string | null; to_club_id: string }>>();

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((count, row) => {
    if (row.to_club_id === clubId) {
      count += 1;
    }
    if (row.from_club_id === clubId && row.offered_club_player_id) {
      count += 1;
    }
    return count;
  }, 0);
}

async function isClubTransferBlocked(supabase: SupabaseServiceClient, clubId: string, phase: string) {
  const pendingEffects = await getActivePendingEffects(supabase, clubId);
  return isOffseasonTransfersBlocked(pendingEffects, phase);
}

async function expireTransferOffer(supabase: SupabaseServiceClient, offerId: string) {
  const { error } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("expired"))
    .eq("id", offerId)
    .eq("status", "open");

  if (error) {
    throw error;
  }
}

async function expireCompetingTransferOffers(
  supabase: SupabaseServiceClient,
  params: {
    acceptedOfferId: string;
    clubPlayerIds: string[];
    gameId: string;
    seasonNumber: number;
  },
) {
  if (params.clubPlayerIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("transfer_offers")
    .select("id, offered_club_player_id, target_club_player_id")
    .eq("game_id", params.gameId)
    .eq("season_number", params.seasonNumber)
    .eq("status", "open")
    .neq("id", params.acceptedOfferId)
    .returns<Array<{ id: string; offered_club_player_id: string | null; target_club_player_id: string }>>();

  if (error) {
    throw error;
  }

  const movedIds = new Set(params.clubPlayerIds);
  const competingIds = (data ?? [])
    .filter((row) => movedIds.has(row.target_club_player_id) || (row.offered_club_player_id && movedIds.has(row.offered_club_player_id)))
    .map((row) => row.id);

  if (competingIds.length === 0) {
    return;
  }

  const { error: updateError } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("expired"))
    .in("id", competingIds)
    .eq("status", "open");

  if (updateError) {
    throw updateError;
  }
}

async function expireOpenTransferOffers(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { error } = await supabase
    .from("transfer_offers")
    .update(buildTransferOfferClosePayload("expired"))
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .eq("status", "open");

  if (error) {
    throw error;
  }
}

function buildManagerTransferMetadata(offer: TransferOfferActionRow, role: "buyer" | "seller") {
  return {
    cash_amount: Number(offer.cash_amount),
    from_club_id: offer.from_club_id,
    offered_club_player_id: offer.offered_club_player_id ?? null,
    offered_player_id: offer.offered_player_id ?? null,
    role,
    season_number: offer.season_number,
    target_club_player_id: offer.target_club_player_id,
    target_player_id: offer.target_player_id,
    to_club_id: offer.to_club_id,
    transfer_offer_id: offer.id,
  };
}

async function getDeadlineAuctions(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("auctions")
    .select("id, game_id, player_id, status, minimum_bid, winning_club_id, season_number, auction_index, current_bid_club_id, current_amount, turn_started_at, passed_club_ids, bid_order_club_ids")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .order("auction_index", { ascending: true })
    .returns<DeadlineAuctionActionRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getDeadlineAuction(supabase: SupabaseServiceClient, auctionId: string) {
  const { data, error } = await supabase
    .from("auctions")
    .select("id, game_id, player_id, status, minimum_bid, winning_club_id, season_number, auction_index, current_bid_club_id, current_amount, turn_started_at, passed_club_ids, bid_order_club_ids")
    .eq("id", auctionId)
    .maybeSingle<DeadlineAuctionActionRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function areDeadlineAuctionsComplete(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data, error } = await supabase
    .from("auctions")
    .select("status")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .returns<Array<{ status: string }>>();

  if (error) {
    throw error;
  }

  return Boolean(data?.length) && data.every((auction) => auction.status === "resolved" || auction.status === "passed");
}

async function pickDeadlinePlayers(params: {
  count: number;
  gameId: string;
  seasonNumber: number;
  supabase: SupabaseServiceClient;
}) {
  const { count, gameId, seasonNumber, supabase } = params;
  const [{ data: clubs, error: clubsError }, { data: auctionRows, error: auctionError }, { data: players, error: playersError }] = await Promise.all([
    supabase.from("clubs").select("id").eq("game_id", gameId).returns<Array<{ id: string }>>(),
    supabase
      .from("auctions")
      .select("player_id")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .returns<Array<{ player_id: string }>>(),
    supabase
      .from("players")
      .select(DRAFT_PLAYER_SELECT)
      .in("visibility", ["public", "room"])
      .neq("region", "academy")
      .returns<DraftPlayerRow[]>(),
  ]);

  if (clubsError) {
    throw clubsError;
  }

  if (auctionError) {
    throw auctionError;
  }

  if (playersError) {
    throw playersError;
  }

  const clubIds = (clubs ?? []).map((club) => club.id);
  const ownedPlayerIds = new Set<string>();
  const auctionPlayerIds = new Set((auctionRows ?? []).map((row) => row.player_id));

  if (clubIds.length > 0) {
    const { data: ownedRows, error: ownedError } = await supabase
      .from("club_players")
      .select("player_id")
      .in("club_id", clubIds)
      .returns<Array<{ player_id: string }>>();

    if (ownedError) {
      throw ownedError;
    }

    for (const row of ownedRows ?? []) {
      ownedPlayerIds.add(row.player_id);
    }
  }

  const available = (players ?? []).filter(
    (player) =>
      isMarketPoolPlayer(player) && !ownedPlayerIds.has(player.id) && !auctionPlayerIds.has(player.id),
  );
  return shuffle(available).slice(0, count);
}

async function resolveDeadlineAuction(
  supabase: SupabaseServiceClient,
  auctionId: string,
  gameId: string,
  userId: string,
  opts: { sponsoringEnabled?: boolean } = {},
) {
  const auction = await getDeadlineAuction(supabase, auctionId);

  if (!auction || auction.game_id !== gameId) {
    return;
  }

  if (!auction.winning_club_id || Number(auction.current_amount ?? 0) <= 0) {
    await markDeadlineAuctionPassed(supabase, auction.id, auction.passed_club_ids ?? []);
    const nextAuction = await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
    await touchGameSave(supabase, gameId, userId);
    await emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        auctionId: auction.id,
        needsRefetch: true,
        nextAuctionId: nextAuction?.id ?? null,
        nextClubId: nextAuction?.firstClubId ?? null,
        nextTurnStartedAt: nextAuction?.turnStartedAt ?? null,
        passedClubIds: auction.passed_club_ids ?? [],
        status: "passed",
      },
      type: "AUCTION_CLOSED",
    });
    return;
  }

  const [{ data: club, error: clubError }, squadCount] = await Promise.all([
    supabase.from("clubs").select("id, money").eq("id", auction.winning_club_id).single<{ id: string; money: number | string }>(),
    getClubSquadCount(supabase, auction.winning_club_id),
  ]);

  if (clubError) {
    throw clubError;
  }

  const winningAmount = Number(auction.current_amount ?? 0);
  if (Number(club.money) < winningAmount || squadCount >= 23) {
    await markDeadlineAuctionPassed(supabase, auction.id, auction.passed_club_ids ?? []);
    const nextAuction = await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
    await touchGameSave(supabase, gameId, userId);
    await emitGameEvent(supabase, {
      actorClerkUserId: userId,
      gameId,
      payload: {
        auctionId: auction.id,
        needsRefetch: true,
        nextAuctionId: nextAuction?.id ?? null,
        nextClubId: nextAuction?.firstClubId ?? null,
        nextTurnStartedAt: nextAuction?.turnStartedAt ?? null,
        passedClubIds: auction.passed_club_ids ?? [],
        status: "passed",
      },
      type: "AUCTION_CLOSED",
    });
    return;
  }

  const [{ data: player, error: playerError }, { data: deadlineStaffRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, base_stars, skill_max")
      .eq("id", auction.player_id)
      .single<{ id: string; base_stars: number | string; skill_max: number | null }>(),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", auction.winning_club_id)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
  ]);

  if (playerError) {
    throw playerError;
  }

  const deadlineNewSigningBonus = (deadlineStaffRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "new_signing_star_bonus")
    .reduce((sum, e) => sum + Number(e.stars ?? 0), 0);
  const deadlineSkillMax = Number(player.skill_max ?? player.base_stars);
  const deadlineStars = Math.min(deadlineSkillMax, Number(player.base_stars) + deadlineNewSigningBonus);

  const { error: insertPlayerError } = await supabase.from("club_players").insert({
    club_id: auction.winning_club_id,
    current_stars: deadlineStars,
    current_zone: "bench",
    player_id: auction.player_id,
    purchase_price: winningAmount,
    stars_at_acquisition: deadlineStars,
  });

  if (insertPlayerError) {
    throw insertPlayerError;
  }

  await syncClubSquadCache(supabase, auction.winning_club_id);

  const { error: clubUpdateError } = await supabase
    .from("clubs")
    .update({ money: Number(club.money) - winningAmount })
    .eq("id", auction.winning_club_id);

  if (clubUpdateError) {
    throw clubUpdateError;
  }

  const { error: auctionError } = await supabase
    .from("auctions")
    .update({
      current_bid_club_id: null,
      resolved_at: new Date().toISOString(),
      status: "resolved",
      turn_started_at: null,
    })
    .eq("id", auction.id);

  if (auctionError) {
    throw auctionError;
  }

  const { error: transactionError } = await supabase.from("transactions").insert({
    amount: -winningAmount,
    club_id: auction.winning_club_id,
    game_id: gameId,
    metadata: {
      auction_id: auction.id,
      player_id: auction.player_id,
      season_number: auction.season_number,
    },
    reason: "deadline_purchase",
  });

  if (transactionError) {
    throw transactionError;
  }

  if (opts.sponsoringEnabled !== false) {
    await onSponsorNewSigning(
      supabase,
      auction.winning_club_id,
      Number(auction.season_number ?? 1),
      winningAmount,
    );
  }

  const nextAuction = await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      amount: winningAmount,
      auctionId: auction.id,
      needsRefetch: true,
      nextAuctionId: nextAuction?.id ?? null,
      nextClubId: nextAuction?.firstClubId ?? null,
      nextTurnStartedAt: nextAuction?.turnStartedAt ?? null,
      playerId: auction.player_id,
      resolvedAt: new Date().toISOString(),
      status: "resolved",
      winningClubId: auction.winning_club_id,
    },
    type: "AUCTION_CLOSED",
  });
}

async function markDeadlineAuctionPassed(supabase: SupabaseServiceClient, auctionId: string, passedClubIds: string[]) {
  const { error } = await supabase
    .from("auctions")
    .update({
      current_bid_club_id: null,
      passed_club_ids: passedClubIds,
      resolved_at: new Date().toISOString(),
      status: "passed",
      turn_started_at: null,
    })
    .eq("id", auctionId);

  if (error) {
    throw error;
  }
}

async function openNextDeadlineAuction(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const { data: nextAuction, error: nextError } = await supabase
    .from("auctions")
    .select("id, bid_order_club_ids")
    .eq("game_id", gameId)
    .eq("season_number", seasonNumber)
    .eq("status", "scheduled")
    .order("auction_index", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; bid_order_club_ids: string[] | null }>();

  if (nextError) {
    throw nextError;
  }

  if (!nextAuction) {
    return null;
  }

  const firstClubId = nextAuction.bid_order_club_ids?.[0] ?? null;
  const turnStartedAt = firstClubId ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("auctions")
    .update({
      current_bid_club_id: firstClubId,
      status: "open",
      turn_started_at: turnStartedAt,
    })
    .eq("id", nextAuction.id);

  if (error) {
    throw error;
  }

  return {
    firstClubId,
    id: nextAuction.id,
    turnStartedAt,
  };
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

async function touchGameSave(supabase: SupabaseServiceClient, gameId: string, userId: string) {
  const { error } = await supabase
    .from("games")
    .update({
      last_saved_at: new Date().toISOString(),
      last_saved_by_clerk_user_id: userId,
      save_status: "active",
    })
    .eq("id", gameId);

  if (error) {
    throw error;
  }
}

// ─── Staff Recruitment ────────────────────────────────────────────────────────

export async function recruitStaffOpenAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const [{ data: game, error: gameError }, { data: club, error: clubError }] = await Promise.all([
    supabase.from("games").select("id, room_code, phase, settings").eq("id", gameId).single<{ id: string; phase: LobbyPhase; room_code: string; settings: { seasonNumber?: number } }>(),
    supabase.from("clubs").select("id, game_id, clerk_user_id, money").eq("id", clubId).eq("game_id", gameId).single<{ id: string; game_id: string; clerk_user_id: string; money: number }>(),
  ]);

  if (gameError) throw gameError;
  if (clubError) throw clubError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");
  if (!isInvestmentPhase(game.phase)) redirect(`/games/${roomCode}?view=grounds`);

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);

  const [{ data: investments }, { data: existingStaff }, { data: openOffer }, { data: staffEffectRows }] = await Promise.all([
    supabase.from("investments").select("action").eq("club_id", clubId).eq("season_number", seasonNumber).returns<Array<{ action: string }>>(),
    supabase.from("club_staff").select("id").eq("club_id", clubId).returns<Array<{ id: string }>>(),
    supabase.from("staff_offers").select("id").eq("club_id", clubId).eq("season_number", seasonNumber).eq("status", "open").limit(1).returns<Array<{ id: string }>>(),
    supabase.from("club_staff").select("card:staff_cards(effects)").eq("club_id", clubId).returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
  ]);

  const extraBonus = (staffEffectRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "investment_action_bonus")
    .reduce((sum, e) => sum + Number(e.extra ?? 0), 0);

  // Free staff offer: no investment row, but still requires a free investment slot this offseason.
  const staffPendingEffects = await getActivePendingEffects(supabase, clubId, "current_offseason");
  const freeOfferEffect = staffPendingEffects.find((eff) => eff.effect_type === "free_staff_offer");

  const check = canRecruitStaff({
    actionsThisSeason: (investments ?? []).map((i) => i.action),
    currentStaffCount: existingStaff?.length ?? 0,
    hasOpenOffer: (openOffer?.length ?? 0) > 0,
    extraActionBonus: extraBonus,
  });

  if (!check.ok) redirect(`/games/${roomCode}?view=grounds`);

  // Build pool: all staff_cards not yet hired by any club in this game
  const { data: allHired } = await supabase
    .from("club_staff")
    .select("staff_card_id, clubs!inner(game_id)")
    .eq("clubs.game_id", gameId)
    .returns<Array<{ staff_card_id: string }>>();

  const hiredIds = (allHired ?? []).map((r) => r.staff_card_id);

  let cardsQuery = supabase.from("staff_cards").select("id").eq("visibility", "room");
  if (hiredIds.length > 0) {
    // PostgREST expects UUIDs without quotes: (uuid1,uuid2)
    cardsQuery = cardsQuery.not("id", "in", `(${hiredIds.join(",")})`);
  }
  const { data: availableCards, error: cardsError } = await cardsQuery.returns<Array<{ id: string }>>();

  if (cardsError) throw cardsError;

  const pool = [...(availableCards ?? [])];
  if (pool.length === 0) redirect(`/games/${roomCode}?view=grounds`);

  const shuffled = pool.sort(() => Math.random() - 0.5);
  const offeredIds = shuffled.slice(0, Math.min(2, shuffled.length)).map((c) => c.id);

  const { error: offerError } = await supabase.from("staff_offers").insert({
    game_id: gameId,
    club_id: clubId,
    season_number: seasonNumber,
    offered_card_ids: offeredIds,
    status: "open",
  });

  if (offerError) throw offerError;

  if (freeOfferEffect) {
    // Consume the free_staff_offer pending effect; no investment row.
    await consumePendingEffects(supabase, [freeOfferEffect.id]);
  } else {
    const { error: investmentError } = await supabase.from("investments").insert({
      action: "staff",
      club_id: clubId,
      cost: 0,
      game_id: gameId,
      season_number: seasonNumber,
    });

    if (investmentError) throw investmentError;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}

export async function recruitStaffResolveAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const offerId = String(formData.get("offer_id") || "");
  const chosenCardId = String(formData.get("chosen_card_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !offerId || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, clerk_user_id, money")
    .eq("id", clubId)
    .eq("game_id", gameId)
    .single<{ id: string; clerk_user_id: string; money: number }>();

  if (clubError) throw clubError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");

  const { data: offer, error: offerError } = await supabase
    .from("staff_offers")
    .select("id, offered_card_ids, status")
    .eq("id", offerId)
    .eq("club_id", clubId)
    .eq("status", "open")
    .single<{ id: string; offered_card_ids: string[]; status: string }>();

  if (offerError || !offer) redirect(`/games/${roomCode}?view=grounds`);

  let freeSigningEffectId: string | null = null;
  if (chosenCardId && offer.offered_card_ids.includes(chosenCardId)) {
    const { data: card, error: cardError } = await supabase
      .from("staff_cards")
      .select("id, price, effects")
      .eq("id", chosenCardId)
      .single<{ id: string; price: number; effects: unknown[] }>();

    if (cardError || !card) redirect(`/games/${roomCode}?view=grounds`);

    // Apply free_staff_signing pending effect if available
    const staffPendingEffects = await getActivePendingEffects(supabase, clubId, "current_offseason");
    const freeSigning = staffPendingEffects.find((eff) => eff.effect_type === "free_staff_signing");
    const effectivePrice = freeSigning ? 0 : card.price;
    if (freeSigning) freeSigningEffectId = freeSigning.id;

    if (Number(club.money) < effectivePrice) redirect(`/games/${roomCode}?view=grounds`);

    const { error: hireError } = await supabase.from("club_staff").insert({
      club_id: clubId,
      staff_card_id: chosenCardId,
    });

    if (hireError) throw hireError;

    if (effectivePrice > 0) {
      const { error: moneyError } = await supabase
        .from("clubs")
        .update({ money: Number(club.money) - effectivePrice })
        .eq("id", clubId);

      if (moneyError) throw moneyError;
    }
  }

  if (freeSigningEffectId) {
    await consumePendingEffects(supabase, [freeSigningEffectId]);
  }

  const { error: resolveError } = await supabase
    .from("staff_offers")
    .update({
      status: chosenCardId ? "resolved" : "declined",
      chosen_card_id: chosenCardId || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (resolveError) throw resolveError;

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}

export async function dismissStaffAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const clubStaffId = String(formData.get("club_staff_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !clubStaffId || !supabase) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, clerk_user_id")
    .eq("id", clubId)
    .eq("game_id", gameId)
    .single<{ id: string; clerk_user_id: string }>();

  if (clubError) throw clubError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");

  const { error: deleteError } = await supabase
    .from("club_staff")
    .delete()
    .eq("id", clubStaffId)
    .eq("club_id", clubId);

  if (deleteError) throw deleteError;

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=grounds`);
}

export async function healInjuredPlayerAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !clubPlayerId || !supabase) {
    redirect(`/games/${roomCode}`);
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, clerk_user_id")
    .eq("id", clubId)
    .eq("game_id", gameId)
    .single<{ id: string; clerk_user_id: string }>();

  if (clubError) throw clubError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");

  const { error: healError } = await supabase
    .from("club_players")
    .update({ injured: false, injured_until_matchday: null })
    .eq("id", clubPlayerId)
    .eq("club_id", clubId);

  if (healError) throw healError;

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

export async function healPlayerMedicalAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !clubPlayerId || !supabase) {
    redirect(`/games/${roomCode}?view=squad`);
  }

  const [{ data: club, error: clubError }, { data: ownedPlayer, error: playerError }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, clerk_user_id, medical_center_level, medical_heals_used_season")
      .eq("id", clubId)
      .eq("game_id", gameId)
      .single<{
        id: string;
        clerk_user_id: string;
        medical_center_level: number | null;
        medical_heals_used_season: number | null;
      }>(),
    supabase
      .from("club_players")
      .select("id, injured")
      .eq("id", clubPlayerId)
      .eq("club_id", clubId)
      .single<{ id: string; injured: boolean }>(),
  ]);

  if (clubError) throw clubError;
  if (playerError) throw playerError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");

  const medicalLevel = club.medical_center_level ?? 0;
  const healsUsed = club.medical_heals_used_season ?? 0;
  if (
    medicalLevel <= 0 ||
    hasAutoMedicalCenter(medicalLevel) ||
    getMedicalHealsRemaining(medicalLevel, healsUsed) <= 0 ||
    !ownedPlayer.injured
  ) {
    redirect(`/games/${roomCode}?view=squad`);
  }

  const { error: healError } = await supabase
    .from("club_players")
    .update({ injured: false, injured_until_matchday: null })
    .eq("id", clubPlayerId)
    .eq("club_id", clubId);

  if (healError) throw healError;

  const { error: clubUpdateError } = await supabase
    .from("clubs")
    .update({ medical_heals_used_season: healsUsed + 1 })
    .eq("id", clubId);

  if (clubUpdateError) throw clubUpdateError;

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=squad`);
}

export async function respecPlayerArchetypeAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const clubPlayerId = String(formData.get("club_player_id") || "");
  const archetype = String(formData.get("archetype") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !clubPlayerId || !archetype || !supabase) {
    redirect(`/games/${roomCode}?view=squad`);
  }

  const [{ data: game, error: gameError }, { data: club, error: clubError }, { data: ownedPlayer, error: playerError }] =
    await Promise.all([
      supabase.from("games").select("id, phase").eq("id", gameId).single<{ id: string; phase: LobbyPhase }>(),
      supabase
        .from("clubs")
        .select("id, clerk_user_id, youth_academy_level, nlz_archetype_respecs_used_season")
        .eq("id", clubId)
        .eq("game_id", gameId)
        .single<{
          id: string;
          clerk_user_id: string;
          youth_academy_level: number | null;
          nlz_archetype_respecs_used_season: number | null;
        }>(),
      supabase
        .from("club_players")
        .select("id, player:players(id, position, metadata, attacker_archetype, defender_archetype)")
        .eq("id", clubPlayerId)
        .eq("club_id", clubId)
        .single<{
          id: string;
          player: {
            id: string;
            position: string;
            metadata: Record<string, unknown> | null;
            attacker_archetype: string | null;
            defender_archetype: string | null;
          };
        }>(),
    ]);

  if (gameError) throw gameError;
  if (clubError) throw clubError;
  if (playerError) throw playerError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");
  if (!isOffseasonPhase(game.phase)) {
    redirect(`/games/${roomCode}?view=squad`);
  }
  if ((club.youth_academy_level ?? 0) < 2 || (club.nlz_archetype_respecs_used_season ?? 0) >= 1) {
    redirect(`/games/${roomCode}?view=squad`);
  }
  if (!isNlzOriginPlayer(ownedPlayer.player.metadata)) {
    redirect(`/games/${roomCode}?view=squad`);
  }

  const normalizedArchetype = normalizePlayerArchetype(archetype);
  if (!normalizedArchetype) {
    redirect(`/games/${roomCode}?view=squad`);
  }

  const position = ownedPlayer.player.position;
  const playerUpdate =
    position === "ATT" || position === "MID"
      ? { attacker_archetype: normalizedArchetype }
      : { defender_archetype: normalizedArchetype };

  const { error: updatePlayerError } = await supabase
    .from("players")
    .update(playerUpdate)
    .eq("id", ownedPlayer.player.id);

  if (updatePlayerError) throw updatePlayerError;

  const { error: clubUpdateError } = await supabase
    .from("clubs")
    .update({ nlz_archetype_respecs_used_season: (club.nlz_archetype_respecs_used_season ?? 0) + 1 })
    .eq("id", clubId);

  if (clubUpdateError) throw clubUpdateError;

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=squad`);
}

export async function triggerDrawRerollAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const fixtureId = String(formData.get("fixture_id") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !fixtureId || !supabase) {
    redirect(`/games/${roomCode}`);
  }

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, clerk_user_id")
    .eq("id", clubId)
    .eq("game_id", gameId)
    .single<{ id: string; clerk_user_id: string }>();

  if (clubError) throw clubError;
  if (club.clerk_user_id !== userId) throw new Error("Unauthorized");

  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("card:staff_cards(effects)")
    .eq("club_id", clubId)
    .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>();

  const threshold = (staffRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "draw_reroll")
    .reduce((min, e) => Math.min(min, Number(e.threshold ?? 8)), Infinity);

  if (!isFinite(threshold)) {
    redirect(`/games/${roomCode}`);
  }

  const { data: fixture, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, game_id, home_participant_id, away_participant_id, home_score, away_score, status")
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .single<{ id: string; game_id: string; home_participant_id: string; away_participant_id: string; home_score: number; away_score: number; status: string }>();

  if (fixtureError || !fixture || fixture.status !== "completed") {
    redirect(`/games/${roomCode}`);
  }

  if (fixture.home_score !== fixture.away_score) {
    redirect(`/games/${roomCode}`);
  }

  const { data: homeParticipant } = await supabase
    .from("season_participants")
    .select("id, club_id")
    .eq("id", fixture.home_participant_id)
    .single<{ id: string; club_id: string | null }>();

  const { data: awayParticipant } = await supabase
    .from("season_participants")
    .select("id, club_id")
    .eq("id", fixture.away_participant_id)
    .single<{ id: string; club_id: string | null }>();

  const ownSide = homeParticipant?.club_id === clubId ? "home" : awayParticipant?.club_id === clubId ? "away" : null;
  if (!ownSide) redirect(`/games/${roomCode}`);

  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  const total = dice1 + dice2;
  const rerollWin = total >= threshold;
  let fixturePatch: Record<string, unknown> | null = null;

  if (rerollWin) {
    const winnerParticipantId = ownSide === "home" ? fixture.home_participant_id : fixture.away_participant_id;
    const loserParticipantId = ownSide === "home" ? fixture.away_participant_id : fixture.home_participant_id;

    const newHomeScore = ownSide === "home" ? fixture.home_score + 1 : fixture.home_score;
    const newAwayScore = ownSide === "away" ? fixture.away_score + 1 : fixture.away_score;
    fixturePatch = { home_score: newHomeScore, away_score: newAwayScore };

    const { error: fixtureUpdateError } = await supabase
      .from("fixtures")
      .update(fixturePatch)
      .eq("id", fixtureId);

    if (fixtureUpdateError) throw fixtureUpdateError;

    const seasonNumber = Number(
      await supabase
        .from("season_participants")
        .select("season_number")
        .eq("id", fixture.home_participant_id)
        .single<{ season_number: number }>()
        .then((r) => r.data?.season_number ?? 1),
    );

    const POINTS_MODE_WIN = 3;
    const POINTS_MODE_DRAW = 1;

    const { data: winnerStanding } = await supabase
      .from("season_standings")
      .select("wins, draws, match_points")
      .eq("participant_id", winnerParticipantId)
      .eq("season_number", seasonNumber)
      .single<{ wins: number; draws: number; match_points: number }>();

    const { data: loserStanding } = await supabase
      .from("season_standings")
      .select("draws, match_points")
      .eq("participant_id", loserParticipantId)
      .eq("season_number", seasonNumber)
      .single<{ draws: number; match_points: number }>();

    if (winnerStanding) {
      await supabase.from("season_standings").update({
        wins: (winnerStanding.wins ?? 0) + 1,
        draws: Math.max(0, (winnerStanding.draws ?? 0) - 1),
        match_points: (winnerStanding.match_points ?? 0) + POINTS_MODE_WIN - POINTS_MODE_DRAW,
      })
        .eq("participant_id", winnerParticipantId)
        .eq("season_number", seasonNumber);
    }

    if (loserStanding) {
      await supabase.from("season_standings").update({
        draws: Math.max(0, (loserStanding.draws ?? 0) - 1),
        match_points: Math.max(0, (loserStanding.match_points ?? 0) - POINTS_MODE_DRAW),
      })
        .eq("participant_id", loserParticipantId)
        .eq("season_number", seasonNumber);
    }
  }

  await touchGameSave(supabase, gameId, userId);
  await emitGameEvent(supabase, {
    actorClerkUserId: userId,
    gameId,
    payload: {
      clubId,
      dice: [dice1, dice2],
      fixtureId,
      fixturePatch,
      needsRefetch: true,
      success: rerollWin,
      threshold,
    },
    type: "DRAW_REROLL_TRIGGERED",
  });
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

// ---------------------------------------------------------------------------
// Game Changer Choice resolution (player/zone/staff selection)
// ---------------------------------------------------------------------------

export async function resolveGameChangerChoiceAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubGameChangerId = String(formData.get("club_game_changer_id") || "");
  const choiceType = String(formData.get("choice_type") || "");
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubGameChangerId || !supabase) {
    redirect(`/games/${roomCode}`);
  }

  const { ownClub, game } = await getGameClubContext(supabase, gameId, userId);

  const { data: cgc, error: cgcError } = await supabase
    .from("club_game_changers")
    .select("id, club_id, status, choice_payload, game_changer_card:game_changer_cards(id, display_name, description, category, effects)")
    .eq("id", clubGameChangerId)
    .eq("club_id", ownClub.id)
    .maybeSingle<{
      id: string;
      club_id: string;
      status: string;
      choice_payload: Record<string, unknown> | null;
      game_changer_card: { id: string; display_name: string; description: string; category: GameChangerCategory; effects: unknown[] } | null;
    }>();

  if (cgcError) throw cgcError;
  if (!cgc || cgc.status !== "pending" || !cgc.choice_payload) {
    redirect(`/games/${roomCode}`);
  }

  const isOffseasonCardPick = isOffseasonCardChoicePayload(cgc.choice_payload);
  if (!isOffseasonCardPick && !cgc.game_changer_card) {
    redirect(`/games/${roomCode}`);
  }

  const effects = cgc.game_changer_card ? parseEffects(cgc.game_changer_card.effects) : [];
  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  let resolvedPayload: Record<string, unknown> = {};
  let detail: string | undefined;

  if (choiceType === "pick_player") {
    const clubPlayerId = String(formData.get("club_player_id") || "");
    if (!clubPlayerId) redirect(`/games/${roomCode}`);

    const { data: cp } = await supabase
      .from("club_players")
      .select("id, club_id, custom_name, player:players(display_name)")
      .eq("id", clubPlayerId)
      .eq("club_id", ownClub.id)
      .maybeSingle<{ club_id: string; custom_name?: string | null; id: string; player: { display_name: string } | null }>();
    if (!cp) redirect(`/games/${roomCode}`);

    const effect = effects.find((e) => e.type === "player_potential_bonus");
    if (!effect) redirect(`/games/${roomCode}`);

    resolvedPayload = { type: "pick_player", club_player_id: clubPlayerId };
    const res = await applyImmediateEffect(supabase, ownClub.id, effect, { resolvedPayload, seasonNumber });
    detail = res.detail;
  } else if (choiceType === "pick_release_players") {
    const clubPlayerIds = formData
      .getAll("club_player_id")
      .map((value) => String(value))
      .filter((value) => value.length > 0);

    if (clubPlayerIds.length === 0) redirect(`/games/${roomCode}`);

    const effect = effects.find((e) => e.type === "force_release_stars");
    if (!effect || effect.type !== "force_release_stars") redirect(`/games/${roomCode}`);

    resolvedPayload = { club_player_ids: clubPlayerIds, type: "pick_release_players" };
    const res = await applyImmediateEffect(supabase, ownClub.id, effect, { resolvedPayload, seasonNumber });
    if (!res.applied) {
      redirect(`/games/${roomCode}`);
    }
    detail = res.detail;
  } else if (choiceType === "pick_offseason_card") {
    const cardId = String(formData.get("card_id") || "");
    if (!cardId) redirect(`/games/${roomCode}`);

    const candidates = getOffseasonCardCandidates(cgc.choice_payload);
    const chosen = candidates.find((candidate) => candidate.card_id === cardId);
    if (!chosen) redirect(`/games/${roomCode}`);

    const effects = parseEffects(chosen.effects);
    resolvedPayload = { type: "pick_offseason_card", card_id: cardId };

    const isLastPlaceBonus =
      isOffseasonCardChoicePayload(cgc.choice_payload) && cgc.choice_payload.last_place_bonus === true;
    if (isLastPlaceBonus) {
      const nextState = markLastPlaceBonusClaimed(normalizePrestigeState(ownClub.prestige_state), seasonNumber);
      await supabase.from("clubs").update({ prestige_state: nextState }).eq("id", ownClub.id);
    }

    const dispatchResult = await dispatchGameChangerEffects({
      supabase,
      clubId: ownClub.id,
      clubGameChangerId: cgc.id,
      effects,
      emitCtx: {
        actorClerkUserId: userId,
        gameId,
      },
      ctx: {
        seasonNumber,
        matchday: 0,
        gamePhase: game.phase,
      },
    });

    detail = dispatchResult.details.join("; ") || chosen.display_name;

    await supabase
      .from("club_game_changers")
      .update({
        game_changer_card_id: cardId,
        status: dispatchResult.status === "pending" ? "pending" : "resolved",
        resolved_payload: dispatchResult.status === "pending" ? null : resolvedPayload,
        used_at: dispatchResult.status === "pending" ? null : new Date().toISOString(),
      })
      .eq("id", cgc.id);

    if (detail) {
      await supabase.from("match_news").insert({
        game_id: gameId,
        club_id: ownClub.id,
        category: chosen.category,
        headline: `Comeback-Bonus: ${chosen.display_name}`,
        detail,
        club_game_changer_id: cgc.id,
      });
    }

    await touchGameSave(supabase, gameId, userId);
    revalidatePath(`/games/${roomCode}`);
    redirect(`/games/${roomCode}`);
  } else if (choiceType === "pick_zone") {
    const zone = String(formData.get("zone") || "").toUpperCase();
    if (!["ATT", "MID", "DEF"].includes(zone)) redirect(`/games/${roomCode}`);

    const effect = effects.find((e) => e.type === "next_match_zone_delta");
    if (!effect || effect.type !== "next_match_zone_delta") redirect(`/games/${roomCode}`);

    resolvedPayload = { type: "pick_zone", zone };
    const concreteEffect: GameChangerEffect = { ...effect, zone: zone as "ATT" | "MID" | "DEF" };
    await enqueuePendingEffect(supabase, ownClub.id, concreteEffect, {
      seasonNumber,
      sourceClubGameChangerId: cgc!.id,
    });
    detail = `Zone ${zone} im naechsten Spiel ${effect.delta >= 0 ? "+" : ""}${effect.delta}`;
  } else {
    redirect(`/games/${roomCode}`);
  }

  await supabase
    .from("club_game_changers")
    .update({
      status: "resolved",
      resolved_payload: resolvedPayload,
      used_at: new Date().toISOString(),
    })
    .eq("id", cgc!.id);

  if (detail) {
    await supabase.from("match_news").insert({
      game_id: gameId,
      club_id: ownClub.id,
      category: cgc!.game_changer_card!.category,
      headline: `Game Changer aufgeloest: ${cgc!.game_changer_card!.display_name}`,
      detail,
    });
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

export async function claimLastPlaceBonusAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const bonusType = String(formData.get("bonus_type") || "") as LastPlaceBonusType;
  const supabase = createSupabaseServiceClient();
  const comebackDashboardPath = `/games/${roomCode}?view=dashboard`;

  if (!userId || !gameId || !roomCode || !supabase) {
    redirect(comebackDashboardPath);
  }

  const { ownClub, game } = await getGameClubContext(supabase, gameId, userId);
  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);

  if (!isOffseasonPhase(game.phase)) {
    redirect(`${comebackDashboardPath}&comeback_error=wrong_phase`);
  }

  const state = normalizePrestigeState(ownClub.prestige_state);
  if (!canClaimLastPlaceBonus(state, seasonNumber)) {
    redirect(`${comebackDashboardPath}&comeback_error=not_eligible`);
  }

  if (bonusType === "training") {
    await applyLastPlaceTrainingBonus(supabase, ownClub.id, seasonNumber);
    const nextState = markLastPlaceBonusClaimed(state, seasonNumber);
    await supabase.from("clubs").update({ prestige_state: nextState }).eq("id", ownClub.id);
  } else if (bonusType === "money") {
    await applyLastPlaceMoneyBonus(supabase, gameId, ownClub.id, seasonNumber);
    const nextState = markLastPlaceBonusClaimed(state, seasonNumber);
    await supabase.from("clubs").update({ prestige_state: nextState }).eq("id", ownClub.id);
  } else if (bonusType === "game_changer") {
    const { data: existingPending } = await supabase
      .from("club_game_changers")
      .select("id, choice_payload")
      .eq("club_id", ownClub.id)
      .eq("status", "pending")
      .limit(20)
      .returns<Array<{ id: string; choice_payload: Record<string, unknown> | null }>>();

    if ((existingPending ?? []).some((row) => isOffseasonCardChoicePayload(row.choice_payload))) {
      redirect(`${comebackDashboardPath}&comeback_error=choice_open`);
    }

    const candidates = await drawOffseasonGameChangerCandidates(supabase, 2);
    if (candidates.length === 0) {
      redirect(`${comebackDashboardPath}&comeback_error=no_cards`);
    }

    const choicePayload = {
      type: "pick_offseason_card",
      candidates,
      last_place_bonus: true,
    };

    const { error: insertError } = await supabase.from("club_game_changers").insert({
      club_id: ownClub.id,
      game_changer_card_id: candidates[0].card_id,
      season_number: seasonNumber,
      status: "pending",
      choice_payload: choicePayload,
    });

    if (insertError) {
      throw insertError;
    }
  } else {
    redirect(`${comebackDashboardPath}&comeback_error=invalid_type`);
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(comebackDashboardPath);
}
