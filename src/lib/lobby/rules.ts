import { dedupeCpuTeamIds } from "./cpu-teams";
import type { LobbyClub, LobbyGame, LobbySettings } from "./types";

const ROOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_DIGITS = "23456789";

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  starting_money: 100_000_000,
  max_draft_stars: 3,
  turn_timeout_seconds: 60,
  continental_cup_enabled: true,
  sponsoring_enabled: true,
  archetypes_enabled: true,
  prestige_enabled: true,
  prestige_target: 100,
};

export function generateRoomCode(random = Math.random) {
  const letters = Array.from({ length: 3 }, () => ROOM_LETTERS[Math.floor(random() * ROOM_LETTERS.length)]);
  const digits = Array.from({ length: 2 }, () => ROOM_DIGITS[Math.floor(random() * ROOM_DIGITS.length)]);

  return `${letters.join("")}-${digits.join("")}`;
}

export function normalizeRoomCode(value: string) {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(3, 5);

  return suffix ? `${prefix}-${suffix}` : prefix;
}

export function validateRoomCode(value: string) {
  return /^[A-Z]{3}-[0-9]{2}$/.test(normalizeRoomCode(value));
}

export function normalizeClubName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

export function validateClubName(value: string) {
  const normalized = normalizeClubName(value);

  if (normalized.length < 2) {
    return { ok: false, error: "Der Clubname braucht mindestens 2 Zeichen." } as const;
  }

  return { ok: true, value: normalized } as const;
}

export function getDefaultClubName(displayName?: string | null) {
  const base = displayName?.trim() || "Neuer Club";
  return normalizeClubName(`${base} FC`);
}

export function canMutateClub(club: Pick<LobbyClub, "clerk_user_id"> | undefined, clerkUserId: string) {
  return Boolean(club && club.clerk_user_id === clerkUserId);
}

export function canStartLobby(game: Pick<LobbyGame, "phase" | "host_clerk_user_id">, clubs: LobbyClub[], clerkUserId: string) {
  if (game.host_clerk_user_id !== clerkUserId) {
    return { ok: false, error: "Nur der Host kann das Spiel starten." } as const;
  }

  if (game.phase !== "lobby") {
    return { ok: false, error: "Dieses Spiel ist nicht mehr in der Lobby." } as const;
  }

  if (clubs.length < 1) {
    return { ok: false, error: "Mindestens 1 Club muss beitreten." } as const;
  }

  if (clubs.some((club) => !club.is_ready)) {
    return { ok: false, error: "Alle Clubs muessen bereit sein." } as const;
  }

  if (clubs.some((club) => !club.philosophy_id)) {
    return { ok: false, error: "Alle Manager muessen eine Vereinsphilosophie waehlen." } as const;
  }

  return { ok: true } as const;
}

function parseBooleanSetting(value: FormDataEntryValue | undefined, defaultValue: boolean) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
    return false;
  }
  return defaultValue;
}

export function parseLobbySettings(input: Partial<Record<string, FormDataEntryValue>> = {}) {
  const startingMoney = Number(input.starting_money ?? DEFAULT_LOBBY_SETTINGS.starting_money);
  const maxDraftStars = Number(input.max_draft_stars ?? DEFAULT_LOBBY_SETTINGS.max_draft_stars);
  const turnTimeout = Number(input.turn_timeout_seconds ?? DEFAULT_LOBBY_SETTINGS.turn_timeout_seconds);
  const continentalCupEnabled = parseBooleanSetting(
    input.continental_cup_enabled,
    DEFAULT_LOBBY_SETTINGS.continental_cup_enabled ?? true,
  );
  const sponsoringEnabled = parseBooleanSetting(
    input.sponsoring_enabled,
    DEFAULT_LOBBY_SETTINGS.sponsoring_enabled ?? true,
  );
  const archetypesEnabled = parseBooleanSetting(
    input.archetypes_enabled,
    DEFAULT_LOBBY_SETTINGS.archetypes_enabled ?? true,
  );
  const prestigeEnabled = parseBooleanSetting(
    input.prestige_enabled,
    DEFAULT_LOBBY_SETTINGS.prestige_enabled ?? true,
  );
  const prestigeTargetRaw = Number(input.prestige_target ?? DEFAULT_LOBBY_SETTINGS.prestige_target ?? 100);
  const cpuTeamIdsRaw = input.cpu_team_ids;
  let cpu_team_ids: string[] | undefined;
  if (typeof cpuTeamIdsRaw === "string" && cpuTeamIdsRaw.trim()) {
    try {
      const parsed = JSON.parse(cpuTeamIdsRaw) as unknown;
      if (Array.isArray(parsed)) {
        cpu_team_ids = dedupeCpuTeamIds(parsed.map((v) => String(v)));
      }
    } catch {
      cpu_team_ids = undefined;
    }
  }

  const base = {
    starting_money: Number.isFinite(startingMoney) ? Math.max(10_000_000, Math.trunc(startingMoney)) : DEFAULT_LOBBY_SETTINGS.starting_money,
    max_draft_stars: Number.isFinite(maxDraftStars) ? Math.min(Math.max(Math.trunc(maxDraftStars), 1), 6) : DEFAULT_LOBBY_SETTINGS.max_draft_stars,
    turn_timeout_seconds: Number.isFinite(turnTimeout) ? Math.min(Math.max(Math.trunc(turnTimeout), 15), 180) : DEFAULT_LOBBY_SETTINGS.turn_timeout_seconds,
    continental_cup_enabled: continentalCupEnabled,
    sponsoring_enabled: sponsoringEnabled,
    archetypes_enabled: archetypesEnabled,
    prestige_enabled: prestigeEnabled,
    prestige_target:
      Number.isFinite(prestigeTargetRaw) && prestigeTargetRaw > 0
        ? Math.trunc(prestigeTargetRaw)
        : (DEFAULT_LOBBY_SETTINGS.prestige_target ?? 100),
  } satisfies LobbySettings;

  if (cpu_team_ids && cpu_team_ids.length > 0) {
    return { ...base, cpu_team_ids };
  }
  return base;
}
