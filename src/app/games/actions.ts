"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setReadyAction, startGameAction } from "@/app/lobby/actions";
import { applyStatusTierUp, calculateManagerScore, getManagerScoreBand, getPlacementReward, getScoutingCapacity, getStadiumIncome, getTrainingCapacity } from "@/lib/game/rules";
import {
  canPlaceDeadlineBid,
  DEADLINE_BID_STEP,
  getDeadlineAuctionCount,
  getFirstDeadlineBidClubId,
  getNextDeadlineBidClubId,
} from "@/lib/lobby/deadline";
import { DRAFT_PLAYER_SELECT } from "@/lib/lobby/draft";
import { createDraftRound, getSquadCounts, allDraftSquadsComplete } from "@/lib/lobby/draft-server";
import { canRecruitStaff, canUpgradeFacility, type UpgradeAction } from "@/lib/lobby/investments";
import { calculateLineupPower } from "@/lib/lobby/lineup-power";
import { getNextLobbyPhase, getSettingsForNextPhase, isInvestmentPhase } from "@/lib/lobby/phases";
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
  type SeasonParticipant,
  type TacticalZone,
  type ThirdResult,
} from "@/lib/lobby/season";
import {
  applyAndKeepUnmatchedModifiers,
  applyImmediateEffect,
  buildZoneModifiers,
  mergeModifiersIntoPartialResult,
  parseEffects,
  type PartialResult,
} from "@/lib/game/game-changer-effects";
import type { GameChangerCategory } from "@/lib/lobby/types";
import {
  canBuyScoutedPlayer,
  canDrawScoutingPlayer,
  canResolveScoutedPlayer,
  canSellClubPlayer,
  getClubScoutingCapacity,
  isOffseasonPhase,
  isScoutingPileKey,
} from "@/lib/lobby/scouting";
import {
  canTrainOwnedPlayer,
  getTrainingStatus,
  parseTrainingEvent,
  resolveTrainingAttempt,
  type TrainingEventMetadata,
} from "@/lib/lobby/training";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { DraftPickSnapshot, DraftPlayerRow, LobbyClub, LobbyGame, LobbyPhase, ScoutingDrawSnapshot, StaffCardRow } from "@/lib/lobby/types";

export async function setReadyFromDashboardAction(formData: FormData) {
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const ready = String(formData.get("ready") || "") === "true";

  if (gameId && roomCode) {
    await setReadyAction(gameId, ready);
    revalidatePath(`/games/${roomCode}`);
  }

  redirect(`/games/${roomCode}`);
}

export async function startGameFromDashboardAction(formData: FormData) {
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");

  if (gameId && roomCode) {
    await startGameAction(gameId);
    revalidatePath(`/games/${roomCode}`);
  }

  redirect(`/games/${roomCode}`);
}

export async function upgradeInvestmentAction(formData: FormData) {
  const { userId } = await auth();
  const gameId = String(formData.get("game_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const clubId = String(formData.get("club_id") || "");
  const action = String(formData.get("action") || "") as UpgradeAction;
  const supabase = createSupabaseServiceClient();

  if (!userId || !gameId || !roomCode || !clubId || !isUpgradeAction(action) || !supabase) {
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
      .select("id, game_id, clerk_user_id, money, training_level, scouting_level, stadium_level")
      .eq("id", clubId)
      .eq("game_id", gameId)
      .single<{
        id: string;
        game_id: string;
        clerk_user_id: string;
        money: number;
        training_level: number;
        scouting_level: number;
        stadium_level: number;
      }>(),
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

  const currentLevel = getClubFacilityLevel(club, action);
  const check = canUpgradeFacility({
    action,
    actionsThisSeason: (investments ?? []).map((investment) => investment.action),
    currentLevel,
    extraActionBonus: upgradeExtraBonus,
    money: Number(club.money),
  });

  if (!check.ok) {
    redirect(`/games/${roomCode}?view=grounds`);
  }

  const { error: investmentError } = await supabase.from("investments").insert({
    action,
    club_id: clubId,
    cost: check.cost,
    game_id: gameId,
    season_number: seasonNumber,
  });

  if (investmentError) {
    throw investmentError;
  }

  const nextLevelColumn = `${action}_level`;
  const { error: updateClubError } = await supabase
    .from("clubs")
    .update({
      [nextLevelColumn]: currentLevel + 1,
      money: Number(club.money) - check.cost,
    })
    .eq("id", clubId)
    .eq("clerk_user_id", userId);

  if (updateClubError) {
    throw updateClubError;
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
    supabase.from("players").select("id, base_stars").eq("id", playerId).single<{ id: string; base_stars: number }>(),
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

  const { error: insertError } = await supabase.from("club_players").insert({
    club_id: ownClub.id,
    player_id: playerId,
    current_stars: player.base_stars,
    current_zone: "bench",
  });

  if (insertError) {
    throw insertError;
  }

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
        club:clubs(id, game_id, clerk_user_id, training_level, offseason_training_capacity),
        player:players(id, skill_max)`,
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
        };
        player: {
          id: string;
          skill_max: number | string | null;
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

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const { data: transactionRows, error: transactionsError } = await supabase
    .from("transactions")
    .select("id, created_at, metadata")
    .eq("game_id", gameId)
    .eq("club_id", ownedPlayer.club_id)
    .eq("reason", "training")
    .returns<Array<{ id: string; created_at: string; metadata: unknown }>>();

  if (transactionsError) {
    throw transactionsError;
  }

  const { data: trainStaffRows } = await supabase
    .from("club_staff")
    .select("card:staff_cards(effects)")
    .eq("club_id", ownedPlayer.club_id)
    .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>();
  const trainingPlayerBonus = (trainStaffRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "training_player_bonus")
    .reduce((sum, e) => sum + Number(e.players ?? 0), 0);

  const trainingEvents = (transactionRows ?? [])
    .map(parseTrainingEvent)
    .filter((event): event is NonNullable<ReturnType<typeof parseTrainingEvent>> => Boolean(event))
    .filter((event) => event.season_number === seasonNumber && event.game_phase === game.phase);

  // Use the snapshotted capacity if available (set at off_season start), otherwise fall back to live calculation
  const snapshotCap = ownedPlayer.club.offseason_training_capacity;
  const effectiveExtraPlayers = snapshotCap != null
    ? snapshotCap - getTrainingCapacity(ownedPlayer.club.training_level).players
    : trainingPlayerBonus;
  const trainingStatus = getTrainingStatus({
    events: trainingEvents,
    trainingLevel: ownedPlayer.club.training_level,
    extraPlayers: Math.max(0, effectiveExtraPlayers),
  });
  const currentStars = Math.trunc(Number(ownedPlayer.current_stars));
  const skillMax = Math.trunc(Number(ownedPlayer.player.skill_max ?? currentStars));
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
  const resolution = resolveTrainingAttempt({
    currentStars,
    diceRoll,
    guaranteedBonusAvailable: trainingStatus.guaranteed_bonus_available,
    skillMax,
    trainingLevel: ownedPlayer.club.training_level,
  });
  const metadata: TrainingEventMetadata = {
    after_stars: resolution.afterStars,
    before_stars: resolution.beforeStars,
    club_player_id: ownedPlayer.id,
    dice_roll: resolution.diceRoll,
    game_phase: game.phase,
    guaranteed_bonus_used: resolution.guaranteedBonusUsed,
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
  redirect(`/games/${roomCode}?view=training`);
}

/**
 * Returns the effective scouting draw capacity for the given club.
 * During off_season, uses the snapshot stored at phase start so that
 * facility upgrades and newly recruited staff don't immediately grant
 * extra draws in the same off-season.
 */
async function getEffectiveScoutingCapacity(
  supabase: SupabaseServiceClient,
  club: LobbyClub,
): Promise<number> {
  if (club.offseason_scouting_capacity != null) {
    return club.offseason_scouting_capacity;
  }
  // Fallback: live calculation (used before first off_season snapshot exists)
  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("card:staff_cards(effects)")
    .eq("club_id", club.id)
    .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>();
  const bonus = (staffRows ?? [])
    .flatMap((s) => s.card?.effects ?? [])
    .filter((e) => e.type === "scouting_extra_cards")
    .reduce((sum, e) => sum + Number(e.cards ?? 0), 0);
  return getClubScoutingCapacity(club) + bonus;
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

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const draws = await getScoutingDraws(supabase, gameId, seasonNumber);
  const ownDraws = draws.filter((draw) => draw.club_id === ownClub.id);
  const capacity = await getEffectiveScoutingCapacity(supabase, ownClub);
  const drawCheck = canDrawScoutingPlayer({
    drawnCount: ownDraws.length,
    ownClubId: ownClub.id,
    scoutingCapacity: capacity,
  });

  if (!drawCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting`);
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

  const { error: insertError } = await supabase.from("scouting_draws").insert({
    club_id: ownClub.id,
    draw_index: ownDraws.length,
    game_id: gameId,
    pile_key: pileKey,
    player_id: selectedPlayer.id,
    season_number: seasonNumber,
    status: "drawn",
  });

  if (insertError) {
    throw insertError;
  }

  await touchGameSave(supabase, gameId, userId);
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

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [draws, squadCount, buyStaffRows, capacity] = await Promise.all([
    getScoutingDraws(supabase, gameId, seasonNumber),
    getClubSquadCount(supabase, ownClub.id),
    supabase
      .from("club_staff")
      .select("card:staff_cards(effects)")
      .eq("club_id", ownClub.id)
      .returns<Array<{ card: { effects: Array<Record<string, unknown>> } }>>(),
    getEffectiveScoutingCapacity(supabase, ownClub),
  ]);
  const draw = draws.find((item) => item.id === drawId);

  if (!draw || draw.club_id !== ownClub.id || draw.status !== "drawn") {
    redirect(`/games/${roomCode}?view=scouting`);
  }

  const ownDraws = draws.filter((item) => item.club_id === ownClub.id);
  const price = Number(draw.player.scouting_price ?? 0);
  const buyCheck = canBuyScoutedPlayer({
    drawnCount: ownDraws.length,
    money: Number(ownClub.money),
    ownClubId: ownClub.id,
    playerPrice: price,
    scoutingCapacity: capacity,
    squadSize: squadCount,
  });

  if (!buyCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting`);
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
  });

  if (insertClubPlayerError) {
    throw insertClubPlayerError;
  }

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

  await touchGameSave(supabase, gameId, userId);
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

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const [draws, capacity] = await Promise.all([
    getScoutingDraws(supabase, gameId, seasonNumber),
    getEffectiveScoutingCapacity(supabase, ownClub),
  ]);
  const draw = draws.find((item) => item.id === drawId);
  const ownDraws = draws.filter((item) => item.club_id === ownClub.id);
  const resolveCheck = canResolveScoutedPlayer({
    drawnCount: ownDraws.length,
    ownClubId: ownClub.id,
    scoutingCapacity: capacity,
  });

  if (!draw || draw.club_id !== ownClub.id || draw.status !== "drawn" || !resolveCheck.ok) {
    redirect(`/games/${roomCode}?view=scouting`);
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
      .select("id, club_id, player_id, player:players(id, scouting_price)")
      .eq("id", clubPlayerId)
      .single<{
        id: string;
        club_id: string;
        player_id: string;
        player: { id: string; scouting_price: number | string | null };
      }>(),
  ]);

  if (ownedPlayerError) {
    throw ownedPlayerError;
  }

  if (ownedPlayer.club_id !== ownClub.id || !isOffseasonPhase(game.phase)) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  const seasonNumber = Number(game.settings?.seasonNumber ?? 1);
  const salesCount = await getPlayerSaleCount(supabase, gameId, ownClub.id, seasonNumber);
  const saleCheck = canSellClubPlayer({ isOffseason: true, salesCount });

  if (!saleCheck.ok) {
    redirect(`/games/${roomCode}?view=${returnView}`);
  }

  const saleValue = Number(ownedPlayer.player.scouting_price ?? 0);
  const { error: deleteError } = await supabase.from("club_players").delete().eq("id", ownedPlayer.id).eq("club_id", ownClub.id);

  if (deleteError) {
    throw deleteError;
  }

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
      season_number: seasonNumber,
    },
    reason: "player_sale",
  });

  if (transactionError) {
    throw transactionError;
  }

  await touchGameSave(supabase, gameId, userId);
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=${returnView}`);
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
  const { error } = await supabase.from("auctions").insert(
    players.map((player, index) => ({
      auction_index: index,
      bid_order_club_ids: bidOrderClubIds,
      current_amount: 0,
      current_bid_club_id: index === 0 ? firstClubId : null,
      game_id: gameId,
      minimum_bid: Number(player.minimum_bid ?? 0),
      passed_club_ids: [],
      player_id: player.id,
      season_number: seasonNumber,
      status: index === 0 ? "open" : "scheduled",
      turn_started_at: index === 0 ? now : null,
    })),
  );

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
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

  const { error: bidError } = await supabase.from("bids").upsert(
    {
      amount: bidCheck.normalizedAmount,
      auction_id: auction.id,
      club_id: ownClub.id,
      locked: true,
    },
    { onConflict: "auction_id,club_id" },
  );

  if (bidError) {
    throw bidError;
  }

  const { error: auctionError } = await supabase
    .from("auctions")
    .update({
      current_amount: bidCheck.normalizedAmount,
      current_bid_club_id: nextClubId,
      status: nextClubId ? "open" : "resolving",
      turn_started_at: nextClubId ? new Date().toISOString() : null,
      winning_club_id: ownClub.id,
    })
    .eq("id", auction.id);

  if (auctionError) {
    throw auctionError;
  }

  if (!nextClubId) {
    await resolveDeadlineAuction(supabase, auction.id, gameId, userId);
  } else {
    await touchGameSave(supabase, gameId, userId);
  }

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

  const { error: bidError } = await supabase.from("bids").upsert(
    {
      amount: 0,
      auction_id: auction.id,
      club_id: ownClub.id,
      locked: true,
    },
    { onConflict: "auction_id,club_id" },
  );

  if (bidError) {
    throw bidError;
  }

  if (!highestBidClubId && !nextClubId) {
    await markDeadlineAuctionPassed(supabase, auction.id, passedClubIds);
    await openNextDeadlineAuction(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
    await touchGameSave(supabase, gameId, userId);
  } else if (!nextClubId) {
    const { error } = await supabase
      .from("auctions")
      .update({ current_bid_club_id: null, passed_club_ids: passedClubIds, status: "resolving", turn_started_at: null })
      .eq("id", auction.id);

    if (error) {
      throw error;
    }

    await resolveDeadlineAuction(supabase, auction.id, gameId, userId);
  } else {
    const { error } = await supabase
      .from("auctions")
      .update({
        current_bid_club_id: nextClubId,
        passed_club_ids: passedClubIds,
        turn_started_at: new Date().toISOString(),
      })
      .eq("id", auction.id);

    if (error) {
      throw error;
    }

    await touchGameSave(supabase, gameId, userId);
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

  await resolveDeadlineAuction(supabase, auctionId, gameId, userId);
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

  const { ownClub } = await getGameClubContext(supabase, gameId, userId);
  const submitted = parseLineupPayload(lineupPayload);
  const { data: ownedRows, error: ownedError } = await supabase
    .from("club_players")
    .select("id, injured")
    .eq("club_id", ownClub.id)
    .returns<Array<{ id: string; injured: boolean }>>();

  if (ownedError) {
    throw ownedError;
  }

  const injuredIds = new Set((ownedRows ?? []).filter((row) => row.injured).map((row) => row.id));
  if (submitted.some((item) => injuredIds.has(item.club_player_id))) {
    redirect(`/games/${roomCode}?view=lineup`);
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
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=lineup`);
}

export async function lockFixtureLineupAction(formData: FormData) {
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
  const side = await getHumanFixtureSide(supabase, fixture, ownClub.id);

  if (!side) {
    throw new Error("Du kannst nur deine eigenen Fixtures locken.");
  }

  // Calculate locked lineup power including staff bonuses
  const [{ data: playerData }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("current_stars, current_zone, lineup_slot, injured, player:players(chemistry_left, chemistry_right, position, eligible_positions)")
      .eq("club_id", ownClub.id)
      .neq("current_zone", "bench")
      .eq("injured", false)
      .returns<Array<{
        current_stars: number | string;
        current_zone: string;
        lineup_slot: number | null;
        injured: boolean;
        player: { chemistry_left?: boolean | null; chemistry_right?: boolean | null; position?: string | null; eligible_positions?: string[] | null } | null;
      }>>(),
    supabase
      .from("club_staff")
      .select("staff_card:staff_cards(effects)")
      .eq("club_id", ownClub.id)
      .returns<Array<{ staff_card: { effects: Array<{ type: string; zone?: string; stars?: number; factor?: number }> } | null }>>(),
  ]);

  const staffEffects = (staffData ?? []).flatMap((s) => s.staff_card?.effects ?? []);
  const powers = calculateLineupPower(
    (playerData ?? []).map((p) => ({
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
    staffEffects,
  );

  const lockUpdate = side === "home"
    ? { home_lineup_locked: true, home_locked_def: powers.DEF.total, home_locked_mid: powers.MID.total, home_locked_att: powers.ATT.total }
    : { away_lineup_locked: true, away_locked_def: powers.DEF.total, away_locked_mid: powers.MID.total, away_locked_att: powers.ATT.total };

  const { error } = await supabase
    .from("fixtures")
    .update(lockUpdate)
    .eq("id", fixtureId)
    .eq("game_id", gameId);

  if (error) {
    throw error;
  }

  await touchGameSave(supabase, gameId, userId);
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

  await autoSimulateCpuOnlyFixtures(supabase, gameId, game, userId);

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

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}

async function snapshotOffseasonCapacities(supabase: SupabaseServiceClient, gameId: string) {
  const { data: gameClubs } = await supabase
    .from("clubs")
    .select("id, scouting_level, training_level")
    .eq("game_id", gameId)
    .returns<Array<{ id: string; scouting_level: number; training_level: number }>>();

  if (!gameClubs?.length) return;

  const { data: staffRows } = await supabase
    .from("club_staff")
    .select("club_id, staff_card:staff_cards(effects)")
    .in("club_id", gameClubs.map((c) => c.id))
    .returns<Array<{ club_id: string; staff_card: { effects: Array<{ type: string; cards?: number; players?: number }> } | null }>>();

  await Promise.all(
    gameClubs.map((club) => {
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
      return supabase
        .from("clubs")
        .update({ offseason_scouting_capacity: scoutingCap, offseason_training_capacity: trainingCap })
        .eq("id", club.id);
    }),
  );
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
    throw gameError;
  }

  if (membersError) {
    throw membersError;
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

  const nextPhase = getNextLobbyPhase(game.phase);
  const now = new Date().toISOString();
  // Scouting is now parallel — no turn concept needed; keep null for all phases that don't need a turn
  const nextTurnClubId = null;
  const nextSettings = getSettingsForNextPhase(game.settings, game.phase, nextPhase);

  if (nextPhase === "season" || nextPhase === "prematch") {
    await ensureSeasonSchedule(supabase, gameId, nextSettings);
  }

  if ((game.phase === "season" || game.phase === "match") && nextPhase === "season_end") {
    await finalizeSeasonEnd(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
  }

  if (game.phase === "season_end" && (nextPhase === "off_season" || nextPhase === "offseason_finance")) {
    await bookSeasonFinance(supabase, gameId, Number(game.settings?.seasonNumber ?? 1));
  }

  if (nextPhase === "off_season") {
    await snapshotOffseasonCapacities(supabase, gameId);
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
    throw updateGameError;
  }

  const { error: resetError } = await supabase
    .from("game_members")
    .update({ phase_done: false, phase_done_at: null })
    .eq("game_id", gameId);

  if (resetError) {
    throw resetError;
  }

  // Auto-simulate CPU-vs-CPU fixtures when entering the season phase
  if (nextPhase === "season" || nextPhase === "prematch") {
    await autoSimulateCpuOnlyFixtures(supabase, gameId, { ...game, phase: nextPhase, room_code: roomCode }, userId);
  }

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
    scouting_level: number;
    stadium_level: number;
    training_level: number;
  },
  action: UpgradeAction,
) {
  if (action === "scouting") {
    return club.scouting_level;
  }

  if (action === "stadium") {
    return club.stadium_level;
  }

  return club.training_level;
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

type FixtureActionRow = {
  away_cpu_lineup_id?: string | null;
  away_lineup_locked: boolean;
  away_participant_id: string;
  away_ready_for_next_third: boolean;
  current_third: number;
  game_id: string;
  home_cpu_lineup_id?: string | null;
  home_lineup_locked: boolean;
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
  const [{ data: clubs, error: clubsError }, { data: cpuTeams, error: cpuError }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, club_name, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true })
      .returns<Array<{ id: string; club_name: string; created_at: string }>>(),
    supabase
      .from("cpu_teams")
      .select("id, display_name")
      .eq("active", true)
      .order("display_name", { ascending: true })
      .limit(Math.max(0, targetLeagueSize))
      .returns<Array<{ id: string; display_name: string }>>(),
  ]);

  if (clubsError) {
    throw clubsError;
  }

  if (cpuError) {
    throw cpuError;
  }

  const requiredCpu = getRequiredCpuCount(clubs?.length ?? 0, targetLeagueSize);
  if ((cpuTeams?.length ?? 0) < requiredCpu) {
    throw new Error(`Zu wenige aktive CPU-Teams. Benoetigt: ${requiredCpu}.`);
  }

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

async function resolveFixtureServer(params: {
  fixture: FixtureActionRow;
  game: LobbyGame;
  participants: { away: FixtureParticipantRow; home: FixtureParticipantRow };
  supabase: SupabaseServiceClient;
  userId: string;
}) {
  const { fixture, game, participants, supabase, userId } = params;
  const [homeSide, awaySide] = await Promise.all([
    buildFixtureSide(supabase, participants.home, fixture.home_cpu_lineup_id),
    buildFixtureSide(supabase, participants.away, fixture.away_cpu_lineup_id),
  ]);
  const resolution = resolveFixture({
    away: awaySide,
    diceRolls: Array.from({ length: 6 }, () => [rollDie(), rollDie()] as [number, number]),
    home: homeSide,
    matchPointsMode: getMatchPointsMode(game.settings),
  });

  for (const event of resolution.events) {
    if (event.event_type === "injury" && event.club_id) {
      await supabase
        .from("club_players")
        .update({ injured: true })
        .eq("id", event.player_id)
        .eq("club_id", event.club_id);
      const { data: injuredPlayer } = await supabase
        .from("club_players")
        .select("player:players(display_name)")
        .eq("id", event.player_id)
        .maybeSingle<{ player: { display_name: string } | null }>();
      await writeMatchNews(supabase, {
        gameId: fixture.game_id,
        fixtureId: fixture.id,
        clubId: event.club_id,
        category: "injury",
        headline: `Verletzung in Zone ${event.zone}`,
        detail: injuredPlayer?.player?.display_name ? `${injuredPlayer.player.display_name} verletzt` : undefined,
      });
    }

    if (event.event_type === "game_changer" && event.club_id) {
      const participantKind = event.participant_id === participants.home.id ? participants.home.kind : participants.away.kind;
      const category: GameChangerCategory = participantKind === "cpu" ? "good_news" : (["good_news", "bad_news", "secret_weapon"][Math.floor(Math.random() * 3)] as GameChangerCategory);
      const result = await assignRandomGameChanger(supabase, event.club_id, category);

      if (result) {
        const { card, clubGameChangerId } = result;
        const effects = parseEffects(card.effects);

        if (category !== "secret_weapon") {
          for (const effect of effects) {
            await applyImmediateEffect(supabase, event.club_id, effect);
          }
          if (clubGameChangerId) {
            await supabase
              .from("club_game_changers")
              .update({ used_at: new Date().toISOString(), fixture_id: fixture.id })
              .eq("id", clubGameChangerId);
          }
        }

        await writeMatchNews(supabase, {
          gameId: fixture.game_id,
          fixtureId: fixture.id,
          clubId: event.club_id,
          category,
          headline: `Game Changer: ${card.display_name}`,
          detail: card.description || undefined,
        });
      }
    }
  }

  const { error: fixtureError } = await supabase
    .from("fixtures")
    .update({
      away_score: resolution.away_match_points,
      away_third_points: resolution.away_third_points,
      completed_at: new Date().toISOString(),
      home_score: resolution.home_match_points,
      home_third_points: resolution.home_third_points,
      result: resolution,
      status: "completed",
    })
    .eq("id", fixture.id);

  if (fixtureError) {
    throw fixtureError;
  }

  await rebuildSeasonStandings(supabase, fixture.game_id, fixture.season_number);
  await touchGameSave(supabase, fixture.game_id, userId);
}

/**
 * Finds all pending CPU-vs-CPU fixtures in the game and resolves them automatically.
 * Called after any action that might complete a matchday, so no manual button press is needed.
 */
async function autoSimulateCpuOnlyFixtures(
  supabase: SupabaseServiceClient,
  gameId: string,
  game: LobbyGame,
  userId: string,
) {
  const { data: pendingFixtures } = await supabase
    .from("fixtures")
    .select("id, game_id, season_number, matchday, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, status, match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result")
    .eq("game_id", gameId)
    .neq("status", "completed")
    .returns<FixtureActionRow[]>();

  for (const fixture of pendingFixtures ?? []) {
    const participants = await getFixtureParticipants(supabase, fixture);
    if (participants.home.kind === "cpu" && participants.away.kind === "cpu") {
      await resolveFixtureServer({ fixture, game, participants, supabase, userId });
    }
  }
}

async function buildFixtureSide(supabase: SupabaseServiceClient, participant: FixtureParticipantRow, cpuLineupId?: string | null): Promise<FixtureSideInput> {
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
    };
  }

  if (!participant.club_id) {
    throw new Error("Human participant without club.");
  }

  const [{ data, error }, { data: staffData }] = await Promise.all([
    supabase
      .from("club_players")
      .select("id, current_stars, current_zone, lineup_slot, player:players(chemistry_left, chemistry_right, position, eligible_positions)")
      .eq("club_id", participant.club_id)
      .neq("current_zone", "bench")
      .eq("injured", false)
      .order("lineup_slot", { ascending: true })
      .returns<
        Array<{
          current_stars: number | string;
          current_zone: string;
          id: string;
          lineup_slot: number | null;
          player: { chemistry_left?: boolean | null; chemistry_right?: boolean | null; position?: string | null; eligible_positions?: string[] | null };
        }>
      >(),
    supabase
      .from("club_staff")
      .select("staff_card:staff_cards(effects)")
      .eq("club_id", participant.club_id)
      .returns<Array<{ staff_card: { effects: Array<{ type: string; zone?: string; stars?: number }> } | null }>>(),
  ]);

  if (error) {
    throw error;
  }

  const staffEffects = (staffData ?? []).flatMap((s) => s.staff_card?.effects ?? []);

  const lineup = {
    ATT: getZoneIds(data ?? [], "ATT"),
    DEF: getZoneIds(data ?? [], "DEF"),
    GK: getZoneIds(data ?? [], "GK"),
    MID: getZoneIds(data ?? [], "MID"),
  };
  const powers = calculateLineupPower(
    (data ?? []).map((player) => ({
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
  );

  return {
    canReceiveEvents: true,
    clubId: participant.club_id,
    lineup,
    participantId: participant.id,
    powers: {
      ATT: powers.ATT.total,
      DEF: powers.DEF.total,
      MID: powers.MID.total,
    },
  };
}

function getZoneIds(players: Array<{ current_zone: string; id: string; lineup_slot: number | null }>, zone: TacticalZone | "GK") {
  return players
    .filter((player) => player.current_zone === zone)
    .sort((a, b) => Number(a.lineup_slot ?? 999) - Number(b.lineup_slot ?? 999))
    .map((player) => player.id);
}

async function assignRandomGameChanger(
  supabase: SupabaseServiceClient,
  clubId: string,
  category?: GameChangerCategory,
) {
  let query = supabase
    .from("game_changer_cards")
    .select("id, category, effects, display_name, description")
    .limit(20);

  if (category) {
    query = query.eq("category", category) as typeof query;
  }

  const { data: cards, error } = await query.returns<
    Array<{ id: string; category: GameChangerCategory; effects: unknown[]; display_name: string; description: string }>
  >();

  if (error || !cards?.length) {
    return null;
  }

  const card = cards[Math.floor(Math.random() * cards.length)];

  const { data: inserted } = await supabase
    .from("club_game_changers")
    .insert({ club_id: clubId, game_changer_card_id: card.id })
    .select("id")
    .single<{ id: string }>();

  return { card, clubGameChangerId: inserted?.id ?? null };
}

async function writeMatchNews(
  supabase: SupabaseServiceClient,
  params: {
    gameId: string;
    fixtureId: string;
    clubId?: string | null;
    category: GameChangerCategory | "injury";
    headline: string;
    detail?: string;
  },
) {
  await supabase.from("match_news").insert({
    game_id: params.gameId,
    fixture_id: params.fixtureId,
    club_id: params.clubId ?? null,
    category: params.category,
    headline: params.headline,
    detail: params.detail ?? null,
  });
}

// ---------------------------------------------------------------------------
// PvP Match Actions
// ---------------------------------------------------------------------------

export async function startMatchAction(formData: FormData) {
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
  if (fixture.match_state !== "scheduled") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const side = await getHumanFixtureSide(supabase, fixture, ownClub.id);
  if (!side) {
    throw new Error("Nicht dein Match.");
  }

  if (!fixture.home_lineup_locked || !fixture.away_lineup_locked) {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  await supabase
    .from("fixtures")
    .update({ match_state: "in_progress", current_third: 0 })
    .eq("id", fixtureId);

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
}

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
    .select("id, game_id, season_number, matchday, home_participant_id, away_participant_id, home_cpu_lineup_id, away_cpu_lineup_id, home_lineup_locked, away_lineup_locked, status, match_state, current_third, home_ready_for_next_third, away_ready_for_next_third, partial_result")
    .eq("id", fixtureId)
    .eq("game_id", gameId)
    .maybeSingle<FixtureActionRow>();

  if (fetchError) throw fetchError;
  if (!fixture || fixture.status === "completed") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  if (fixture.match_state !== "in_progress") {
    redirect(`/games/${roomCode}?view=matchday`);
  }

  const side = await getHumanFixtureSide(supabase, fixture, ownClub.id);
  if (!side) {
    throw new Error("Nicht dein Match.");
  }

  // Mark own side as ready
  const readyField = side === "home" ? "home_ready_for_next_third" : "away_ready_for_next_third";
  await supabase.from("fixtures").update({ [readyField]: true }).eq("id", fixtureId);

  // Re-fetch to see if both are now ready
  const { data: refreshed } = await supabase
    .from("fixtures")
    .select("home_ready_for_next_third, away_ready_for_next_third, current_third, partial_result")
    .eq("id", fixtureId)
    .single<{ home_ready_for_next_third: boolean; away_ready_for_next_third: boolean; current_third: number; partial_result: unknown }>();

  const bothReady =
    (side === "home" ? true : refreshed?.home_ready_for_next_third ?? false) &&
    (side === "away" ? true : refreshed?.away_ready_for_next_third ?? false);

  if (!bothReady) {
    revalidatePath(`/games/${roomCode}`);
    redirect(`/games/${roomCode}?view=matchday`);
  }

  // Both ready → simulate next third
  const participants = await getFixtureParticipants(supabase, fixture);
  const [homeSide, awaySide] = await Promise.all([
    buildFixtureSide(supabase, participants.home, fixture.home_cpu_lineup_id),
    buildFixtureSide(supabase, participants.away, fixture.away_cpu_lineup_id),
  ]);

  const currentPartial = (refreshed?.partial_result ?? { thirds: [], pending_modifiers: [] }) as PartialResult;
  const priorThirds = ((currentPartial.thirds ?? []) as unknown as ThirdResult[]);
  const nextIndex = (priorThirds.length + 1) as 1 | 2 | 3;

  // Only consume modifiers whose zone matches the current third — keep others for later thirds
  const { homeZone: nextHomeZone, awayZone: nextAwayZone } = getThirdZones(
    nextIndex,
    (priorThirds[0]?.winner_participant_id) ?? null,
    homeSide.participantId,
  );
  const { active: modifiers, updated: partialAfterSplit } = applyAndKeepUnmatchedModifiers(
    currentPartial,
    nextHomeZone,
    nextAwayZone,
  );

  const { third, events } = resolveOneThird({
    index: nextIndex,
    home: homeSide,
    away: awaySide,
    homeDice: [rollDie(), rollDie()],
    awayDice: [rollDie(), rollDie()],
    priorThirds,
    zoneModifiers: modifiers,
  });

  const newThirds: ThirdResult[] = [...priorThirds, third];

  // Process events: injuries + game changers
  for (const event of events) {
    if (event.event_type === "injury" && event.club_id) {
      await supabase.from("club_players").update({ injured: true }).eq("id", event.player_id).eq("club_id", event.club_id);
      const { data: injuredPlayer } = await supabase
        .from("club_players")
        .select("player:players(display_name)")
        .eq("id", event.player_id)
        .maybeSingle<{ player: { display_name: string } | null }>();
      await writeMatchNews(supabase, {
        gameId,
        fixtureId,
        clubId: event.club_id,
        category: "injury",
        headline: `Verletzung in Zone ${event.zone}`,
        detail: injuredPlayer?.player?.display_name ? `${injuredPlayer.player.display_name} verletzt` : undefined,
      });
    }

    if (event.event_type === "game_changer" && event.club_id) {
      // Determine club participant kind to pick right category
      const participantKind = event.participant_id === participants.home.id ? participants.home.kind : participants.away.kind;
      // CPU does not collect Secret Weapons — only humans do
      const category: GameChangerCategory = participantKind === "cpu" ? "good_news" : (["good_news", "bad_news", "secret_weapon"][Math.floor(Math.random() * 3)] as GameChangerCategory);
      const result = await assignRandomGameChanger(supabase, event.club_id, category);

      if (result) {
        const { card, clubGameChangerId } = result;
        const effects = parseEffects(card.effects);

        if (category !== "secret_weapon") {
          // Immediate effect
          for (const effect of effects) {
            await applyImmediateEffect(supabase, event.club_id, effect);
          }
          // Mark as used immediately
          if (clubGameChangerId) {
            await supabase
              .from("club_game_changers")
              .update({ used_at: new Date().toISOString(), fixture_id: fixtureId, applied_third: nextIndex })
              .eq("id", clubGameChangerId);
          }
        }

        await writeMatchNews(supabase, {
          gameId,
          fixtureId,
          clubId: event.club_id,
          category,
          headline: `Game Changer: ${card.display_name}`,
          detail: card.description || undefined,
        });
      }
    }
  }

  const newPartial: PartialResult = { ...partialAfterSplit, thirds: newThirds as unknown[] };
  const newThirdCount = newThirds.length;
  const isComplete = newThirdCount >= 3;

  if (isComplete) {
    // Finalize match
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

    const { error: updateError } = await supabase
      .from("fixtures")
      .update({
        match_state: "completed",
        status: "completed",
        current_third: 3,
        home_ready_for_next_third: false,
        away_ready_for_next_third: false,
        home_score: matchPoints.home,
        away_score: matchPoints.away,
        home_third_points: scores.home,
        away_third_points: scores.away,
        result: { thirds: newThirds, events: allEvents, home_match_points: matchPoints.home, away_match_points: matchPoints.away },
        partial_result: newPartial,
        completed_at: new Date().toISOString(),
      })
      .eq("id", fixtureId);

    if (updateError) throw updateError;
    await rebuildSeasonStandings(supabase, gameId, fixture.season_number);
    await touchGameSave(supabase, gameId, userId);
    await autoSimulateCpuOnlyFixtures(supabase, gameId, game, userId);
  } else {
    await supabase
      .from("fixtures")
      .update({
        current_third: newThirdCount,
        home_ready_for_next_third: false,
        away_ready_for_next_third: false,
        partial_result: newPartial,
      })
      .eq("id", fixtureId);
  }

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
      category: "secret_weapon",
      headline: `Geheimwaffe eingesetzt: ${cgc.game_changer_card?.display_name ?? "Unbekannt"}`,
      detail: cgc.game_changer_card?.description || undefined,
    }),
  ]);

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}?view=matchday`);
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

    home.played += 1;
    away.played += 1;
    home.match_points += homeScore;
    away.match_points += awayScore;
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
  for (const standing of standings) {
    const participant = participants.find((item) => item.id === standing.participant_id);
    if (!participant?.club_id || participant.kind !== "human") {
      continue;
    }

    await supabase.from("clubs").update({ season_rank: standing.rank }).eq("id", participant.club_id);
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
  status: string;
};

async function finalizeSeasonEnd(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
  const rows = await getManagerScoreRows(supabase, gameId, seasonNumber);

  for (const row of rows) {
    const { error } = await supabase
      .from("clubs")
      .update({
        attractiveness_stars: row.attractiveness_stars,
        points: row.season_score,
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

async function bookSeasonFinance(supabase: SupabaseServiceClient, gameId: string, seasonNumber: number) {
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

    const [{ data: club, error: clubError }, { data: staffRows }] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, money, stadium_level, status, season_rank")
        .eq("id", row.club_id)
        .eq("game_id", gameId)
        .single<{ id: string; money: number | string; season_rank: number | null; stadium_level: number | null; status: string | null }>(),
      supabase
        .from("club_staff")
        .select("id, card:staff_cards(effects)")
        .eq("club_id", row.club_id)
        .returns<Array<{ id: string; card: { effects: unknown[] } }>>(),
    ]);

    if (clubError) {
      throw clubError;
    }

    const staffEffects = (staffRows ?? []).flatMap((s) => s.card?.effects ?? []) as Array<Record<string, unknown>>;
    const tierUp = staffEffects.filter((e) => e.type === "status_tier_up").reduce((sum, e) => sum + Number(e.tiers ?? 0), 0);
    const staffIncomeBonus = staffEffects.filter((e) => e.type === "season_income_bonus").reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const staffAttrBonus = staffEffects.filter((e) => e.type === "attractiveness_bonus").reduce((sum, e) => sum + Number(e.stars ?? 0), 0);
    const wageMultiplier = staffEffects.filter((e) => e.type === "wage_multiplier").reduce((min, e) => Math.min(min, Number(e.factor ?? 1)), 1);

    const baseStatus = row.status as "established" | "mid_table" | "newly_promoted" | "title_contender";
    const effectiveStatus = applyStatusTierUp(baseStatus, tierUp);

    const stadiumIncome = getStadiumIncome(Number(club.stadium_level ?? 1), effectiveStatus);
    const placementReward = getPlacementReward(row.rank, humanClubCount);
    const wages = Math.round(row.squad_stars * 1_000_000 * wageMultiplier);
    const net = stadiumIncome + placementReward + staffIncomeBonus - wages;

    const finalAttractivenessStars = Math.min(6, row.attractiveness_stars + staffAttrBonus);

    const { error: updateClubError } = await supabase
      .from("clubs")
      .update({
        attractiveness_stars: finalAttractivenessStars,
        money: Number(club.money ?? 0) + net,
        points: row.season_score,
        season_rank: row.rank,
        status: row.status,
      })
      .eq("id", row.club_id)
      .eq("game_id", gameId);

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
      .select("match_points, participant:season_participants(id, kind, club_id, display_name)")
      .eq("game_id", gameId)
      .eq("season_number", seasonNumber)
      .returns<
        Array<{
          match_points: number | string;
          participant: { club_id?: string | null; display_name: string; id: string; kind: string };
        }>
      >(),
    supabase
      .from("club_players")
      .select("club_id, current_stars, club:clubs!inner(game_id)")
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
      const matchPoints = Number(standing.match_points ?? 0);
      const seasonScore = calculateManagerScore(squadStars, matchPoints);
      const band = getManagerScoreBand(seasonScore);

      return {
        attractiveness_stars: band.attractivenessStars,
        club_id: clubId,
        club_name: standing.participant.display_name,
        match_points: matchPoints,
        rank: 1,
        season_score: seasonScore,
        squad_stars: squadStars,
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

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
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
        "id, game_id, clerk_user_id, club_name, manager_name, money, points, is_ready, created_at, scouting_level, training_level, stadium_level, season_rank, status",
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
    .returns<DraftPlayerRow[]>();

  if (playersError) {
    throw playersError;
  }

  const available = (players ?? []).filter((player) => !openPlayerIds.has(player.id) && !ownedPlayerIds.has(player.id));

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
    supabase.from("players").select(DRAFT_PLAYER_SELECT).returns<DraftPlayerRow[]>(),
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

  const available = (players ?? []).filter((player) => !ownedPlayerIds.has(player.id) && !auctionPlayerIds.has(player.id));
  return shuffle(available).slice(0, count);
}

async function resolveDeadlineAuction(supabase: SupabaseServiceClient, auctionId: string, gameId: string, userId: string) {
  const auction = await getDeadlineAuction(supabase, auctionId);

  if (!auction || auction.game_id !== gameId) {
    return;
  }

  if (!auction.winning_club_id || Number(auction.current_amount ?? 0) <= 0) {
    await markDeadlineAuctionPassed(supabase, auction.id, auction.passed_club_ids ?? []);
    await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
    await touchGameSave(supabase, gameId, userId);
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
    await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
    await touchGameSave(supabase, gameId, userId);
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
  });

  if (insertPlayerError) {
    throw insertPlayerError;
  }

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

  await openNextDeadlineAuction(supabase, gameId, Number(auction.season_number ?? 1));
  await touchGameSave(supabase, gameId, userId);
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
    return;
  }

  const firstClubId = nextAuction.bid_order_club_ids?.[0] ?? null;
  const { error } = await supabase
    .from("auctions")
    .update({
      current_bid_club_id: firstClubId,
      status: "open",
      turn_started_at: firstClubId ? new Date().toISOString() : null,
    })
    .eq("id", nextAuction.id);

  if (error) {
    throw error;
  }
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

async function getFirstClubId(supabase: SupabaseServiceClient, gameId: string) {
  const { data, error } = await supabase
    .from("clubs")
    .select("id")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
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

  const { error: investmentError } = await supabase.from("investments").insert({
    action: "staff",
    club_id: clubId,
    cost: 0,
    game_id: gameId,
    season_number: seasonNumber,
  });

  if (investmentError) throw investmentError;

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

  if (chosenCardId && offer.offered_card_ids.includes(chosenCardId)) {
    const { data: card, error: cardError } = await supabase
      .from("staff_cards")
      .select("id, price, effects")
      .eq("id", chosenCardId)
      .single<{ id: string; price: number; effects: unknown[] }>();

    if (cardError || !card) redirect(`/games/${roomCode}?view=grounds`);

    if (Number(club.money) < card.price) redirect(`/games/${roomCode}?view=grounds`);

    const { error: hireError } = await supabase.from("club_staff").insert({
      club_id: clubId,
      staff_card_id: chosenCardId,
    });

    if (hireError) throw hireError;

    const { error: moneyError } = await supabase
      .from("clubs")
      .update({ money: Number(club.money) - card.price })
      .eq("id", clubId);

    if (moneyError) throw moneyError;
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
    .update({ injured: false })
    .eq("id", clubPlayerId)
    .eq("club_id", clubId);

  if (healError) throw healError;

  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
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

  if (rerollWin) {
    const winnerParticipantId = ownSide === "home" ? fixture.home_participant_id : fixture.away_participant_id;
    const loserParticipantId = ownSide === "home" ? fixture.away_participant_id : fixture.home_participant_id;

    const newHomeScore = ownSide === "home" ? fixture.home_score + 1 : fixture.home_score;
    const newAwayScore = ownSide === "away" ? fixture.away_score + 1 : fixture.away_score;

    const { error: fixtureUpdateError } = await supabase
      .from("fixtures")
      .update({ home_score: newHomeScore, away_score: newAwayScore })
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
  revalidatePath(`/games/${roomCode}`);
  redirect(`/games/${roomCode}`);
}
