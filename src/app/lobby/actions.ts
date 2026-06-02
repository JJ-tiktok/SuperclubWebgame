"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { validateClubTemplateId } from "@/lib/lobby/club-templates";
import { parseCpuTeamIdsFromFormData, validateCpuTeamSelection } from "@/lib/lobby/cpu-teams";
import { ensureDraftRound } from "@/lib/lobby/draft-server";
import {
  canStartLobby,
  generateRoomCode,
  normalizeClubName,
  normalizeRoomCode,
  parseLobbySettings,
  validateClubName,
  validateRoomCode,
} from "@/lib/lobby/rules";
import type { ActionResult, ClubTemplate, LobbyClub, LobbyGame, LobbySettings } from "@/lib/lobby/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getServiceSupabaseConfigIssue } from "@/lib/supabase/config";
import { getErrorMessage, getSupabaseSetupHint } from "@/lib/supabase/errors";

type SupabaseServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

const CLUB_SELECT =
  "id, game_id, clerk_user_id, club_template_id, club_name, club_slogan, club_color, manager_name, money, points, is_ready, image_url, created_at";

async function requireLobbyContext() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("unauthorized");
  }

  const supabase = createSupabaseServiceClient();

  if (!supabase) {
    throw new Error(getServiceSupabaseConfigIssue()?.message ?? "Supabase service client is not configured.");
  }

  const user = await currentUser();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    user?.emailAddresses.at(0)?.emailAddress ||
    "Manager";

  return {
    userId,
    displayName,
    imageUrl: user?.imageUrl ?? null,
    supabase,
  };
}

async function findGameByRoomCode(supabase: SupabaseServiceClient, roomCode: string) {
  const { data, error } = await supabase
    .from("games")
    .select("id, room_code, phase, host_clerk_user_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id")
    .eq("room_code", roomCode)
    .maybeSingle<LobbyGame>();

  if (error) {
    throw error;
  }

  return data;
}

async function getLobbyClubs(supabase: SupabaseServiceClient, gameId: string) {
  const { data, error } = await supabase
    .from("clubs")
    .select(CLUB_SELECT)
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .returns<LobbyClub[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function touchGameSaveMetadata(supabase: SupabaseServiceClient, gameId: string, clerkUserId: string) {
  const { error } = await supabase
    .from("games")
    .update({
      last_saved_at: new Date().toISOString(),
      last_saved_by_clerk_user_id: clerkUserId,
      save_status: "active",
    })
    .eq("id", gameId);

  if (error) {
    throw error;
  }
}

async function writeGameSaveCheckpoint(params: {
  supabase: SupabaseServiceClient;
  gameId: string;
  clerkUserId: string;
  saveName: string;
  incrementVersion?: boolean;
}) {
  const { supabase, gameId, clerkUserId, saveName, incrementVersion = true } = params;

  const [{ data: game, error: gameError }, { data: clubs, error: clubsError }, { data: members, error: membersError }] =
    await Promise.all([
      supabase
        .from("games")
        .select("id, room_code, phase, host_clerk_user_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id, created_at, updated_at")
        .eq("id", gameId)
        .single<LobbyGame>(),
      supabase
        .from("clubs")
        .select(CLUB_SELECT)
        .eq("game_id", gameId)
        .order("created_at", { ascending: true })
        .returns<LobbyClub[]>(),
      supabase
        .from("game_members")
        .select("id, game_id, clerk_user_id, display_name, image_url, is_host, phase_done, phase_done_at, joined_at")
        .eq("game_id", gameId)
        .order("joined_at", { ascending: true }),
    ]);

  if (gameError) {
    throw gameError;
  }

  if (clubsError) {
    throw clubsError;
  }

  if (membersError) {
    throw membersError;
  }

  const nextVersion = incrementVersion ? (game.save_version ?? 1) + 1 : (game.save_version ?? 1);
  const savedAt = new Date().toISOString();
  const snapshot = {
    game: { ...game, save_version: nextVersion, last_saved_at: savedAt, last_saved_by_clerk_user_id: clerkUserId },
    clubs: clubs ?? [],
    members: members ?? [],
  };

  const { error: saveError } = await supabase.from("game_saves").insert({
    game_id: gameId,
    saved_by_clerk_user_id: clerkUserId,
    save_name: saveName,
    save_version: nextVersion,
    phase: game.phase,
    snapshot,
  });

  if (saveError) {
    throw saveError;
  }

  const { error: updateError } = await supabase
    .from("games")
    .update({
      last_saved_at: savedAt,
      last_saved_by_clerk_user_id: clerkUserId,
      save_status: "active",
      save_version: nextVersion,
    })
    .eq("id", gameId);

  if (updateError) {
    throw updateError;
  }
}

async function createMembershipAndClub(params: {
  supabase: SupabaseServiceClient;
  game: LobbyGame;
  clerkUserId: string;
  displayName: string;
  imageUrl: string | null;
  clubTemplate: ClubTemplate;
  isHost?: boolean;
}) {
  const { supabase, game, clerkUserId, displayName, imageUrl, clubTemplate, isHost = false } = params;

  const { error: memberError } = await supabase.from("game_members").upsert(
    {
      game_id: game.id,
      clerk_user_id: clerkUserId,
      display_name: displayName,
      image_url: imageUrl,
      is_host: isHost,
    },
    { onConflict: "game_id,clerk_user_id" },
  );

  if (memberError) {
    throw memberError;
  }

  const { error: clubError } = await supabase.from("clubs").upsert(
    {
      game_id: game.id,
      clerk_user_id: clerkUserId,
      club_template_id: clubTemplate.id,
      club_name: clubTemplate.name,
      club_slogan: clubTemplate.slogan,
      club_color: clubTemplate.color,
      manager_name: displayName,
      image_url: imageUrl,
      money: game.settings.starting_money,
      is_ready: false,
    },
    { onConflict: "game_id,clerk_user_id" },
  );

  if (clubError) {
    throw clubError;
  }
}

function toActionError(error: unknown, fallback: string): ActionResult {
  if (isRedirectError(error)) {
    throw error;
  }

  return { ok: false, error: getSupabaseSetupHint(error) ?? getErrorMessage(error, fallback) };
}

export async function createGameAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    await createGame(formData);
    return { ok: true };
  } catch (error) {
    return toActionError(error, "Room konnte nicht erstellt werden.");
  }
}

export async function joinGameAction(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    await joinGame(formData);
    return { ok: true };
  } catch (error) {
    return toActionError(error, "Room konnte nicht betreten werden.");
  }
}

async function createGame(formData: FormData) {
  const { userId, displayName, imageUrl, supabase } = await requireLobbyContext();
  const settingsBase: LobbySettings = parseLobbySettings({
    starting_money: formData.get("starting_money") ?? undefined,
    max_draft_stars: formData.get("max_draft_stars") ?? undefined,
    turn_timeout_seconds: formData.get("turn_timeout_seconds") ?? undefined,
    cpu_team_ids: formData.get("cpu_team_ids") ?? undefined,
  });
  const cpuTeamIds = parseCpuTeamIdsFromFormData(formData);
  const cpuValidation = await validateCpuTeamSelection(supabase, cpuTeamIds, settingsBase);
  if (!cpuValidation.ok) {
    throw new Error(cpuValidation.error);
  }
  const settings = { ...settingsBase, cpu_team_ids: cpuValidation.ids };
  const templateResult = validateClubTemplateId(String(formData.get("club_template_id") || ""));

  if (!templateResult.ok) {
    throw new Error(templateResult.error);
  }

  let game: LobbyGame | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateRoomCode();
    const { data, error } = await supabase
      .from("games")
      .insert({
        room_code: roomCode,
        phase: "lobby",
        host_clerk_user_id: userId,
        save_name: `Room ${roomCode}`,
        save_status: "active",
        last_saved_at: new Date().toISOString(),
        last_saved_by_clerk_user_id: userId,
        save_version: 1,
        settings,
      })
      .select("id, room_code, phase, host_clerk_user_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id")
      .single<LobbyGame>();

    if (!error && data) {
      game = data;
      break;
    }

    if (error?.code !== "23505") {
      throw error;
    }
  }

  if (!game) {
    throw new Error("Konnte keinen freien Room-Code erzeugen.");
  }

  await createMembershipAndClub({
    supabase,
    game,
    clerkUserId: userId,
    displayName,
    imageUrl,
    clubTemplate: templateResult.template,
    isHost: true,
  });

  await writeGameSaveCheckpoint({
    supabase,
    gameId: game.id,
    clerkUserId: userId,
    saveName: "Lobby erstellt",
    incrementVersion: false,
  });

  revalidatePath("/lobby");
  redirect(`/games/${game.room_code}`);
}

async function joinGame(formData: FormData) {
  const { userId, displayName, imageUrl, supabase } = await requireLobbyContext();
  const roomCode = normalizeRoomCode(String(formData.get("room_code") || ""));
  const templateResult = validateClubTemplateId(String(formData.get("club_template_id") || ""));

  if (!validateRoomCode(roomCode)) {
    throw new Error("Bitte gib einen gueltigen Room-Code ein.");
  }

  if (!templateResult.ok) {
    throw new Error(templateResult.error);
  }

  const game = await findGameByRoomCode(supabase, roomCode);

  if (!game) {
    throw new Error("Dieser Room-Code existiert nicht.");
  }

  if (game.phase !== "lobby") {
    throw new Error("Dieses Spiel ist nicht mehr in der Lobby.");
  }

  const existingClubs = await getLobbyClubs(supabase, game.id);
  const templateTaken = existingClubs.some(
    (club) => club.club_template_id === templateResult.template.id && club.clerk_user_id !== userId,
  );

  if (templateTaken) {
    throw new Error("Dieser Verein ist in der Lobby bereits vergeben.");
  }

  await createMembershipAndClub({
    supabase,
    game,
    clerkUserId: userId,
    displayName,
    imageUrl,
    clubTemplate: templateResult.template,
    isHost: game.host_clerk_user_id === userId,
  });

  revalidatePath("/lobby");
  redirect(`/games/${game.room_code}`);
}

export async function updateClubNameAction(gameId: string, clubName: string): Promise<ActionResult> {
  try {
    const { userId, supabase } = await requireLobbyContext();
    const clubNameResult = validateClubName(clubName);

    if (!clubNameResult.ok) {
      return { ok: false, error: clubNameResult.error };
    }

    const { error } = await supabase
      .from("clubs")
      .update({ club_name: clubNameResult.value })
      .eq("game_id", gameId)
      .eq("clerk_user_id", userId);

    if (error) {
      throw error;
    }

    await touchGameSaveMetadata(supabase, gameId, userId);
    revalidatePath(`/games/${gameId}/lobby`);
    revalidatePath("/lobby");
    return { ok: true, message: "Clubname gespeichert." };
  } catch (error) {
    return { ok: false, error: getSupabaseSetupHint(error) ?? getErrorMessage(error, "Clubname konnte nicht gespeichert werden.") };
  }
}

export async function setReadyAction(gameId: string, ready: boolean): Promise<ActionResult> {
  try {
    const { userId, supabase } = await requireLobbyContext();
    const { error } = await supabase
      .from("clubs")
      .update({ is_ready: ready })
      .eq("game_id", gameId)
      .eq("clerk_user_id", userId);

    if (error) {
      throw error;
    }

    await touchGameSaveMetadata(supabase, gameId, userId);
    revalidatePath(`/games/${gameId}/lobby`);
    revalidatePath("/lobby");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: getSupabaseSetupHint(error) ?? getErrorMessage(error, "Bereit-Status konnte nicht geaendert werden.") };
  }
}

export async function startGameAction(gameId: string): Promise<ActionResult> {
  try {
    const { userId, supabase } = await requireLobbyContext();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, room_code, phase, host_clerk_user_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id")
      .eq("id", gameId)
      .single<LobbyGame>();

    if (gameError) {
      throw gameError;
    }

    const clubs = await getLobbyClubs(supabase, gameId);
    const canStart = canStartLobby(game, clubs, userId);

    if (!canStart.ok) {
      return { ok: false, error: canStart.error };
    }

    const { error } = await supabase.from("games").update({ phase: "draft" }).eq("id", gameId);

    if (error) {
      throw error;
    }

    await ensureDraftRound({
      supabase,
      game: { ...game, phase: "draft" },
      clubs,
      roundIndex: 0,
    });

    await writeGameSaveCheckpoint({
      supabase,
      gameId,
      clerkUserId: userId,
      saveName: "Spiel gestartet",
    });

    revalidatePath(`/games/${game.room_code}/lobby`);
    revalidatePath("/lobby");
    return { ok: true, message: "Spiel gestartet." };
  } catch (error) {
    return { ok: false, error: getSupabaseSetupHint(error) ?? getErrorMessage(error, "Spiel konnte nicht gestartet werden.") };
  }
}

export async function saveGameAction(gameId: string): Promise<ActionResult> {
  try {
    const { userId, supabase } = await requireLobbyContext();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, room_code, phase, host_clerk_user_id, settings, save_name, save_status, save_version, last_saved_at, last_saved_by_clerk_user_id")
      .eq("id", gameId)
      .single<LobbyGame>();

    if (gameError) {
      throw gameError;
    }

    if (game.host_clerk_user_id !== userId) {
      return { ok: false, error: "Nur der Host kann einen Spielstand speichern." };
    }

    await writeGameSaveCheckpoint({
      supabase,
      gameId,
      clerkUserId: userId,
      saveName: "Manueller Speicherpunkt",
    });

    revalidatePath(`/games/${game.room_code}/lobby`);
    revalidatePath("/lobby");
    return { ok: true, message: "Spielstand gespeichert." };
  } catch (error) {
    return { ok: false, error: getSupabaseSetupHint(error) ?? getErrorMessage(error, "Spielstand konnte nicht gespeichert werden.") };
  }
}

export async function normalizeClubNameAction(clubName: string) {
  return normalizeClubName(clubName);
}
