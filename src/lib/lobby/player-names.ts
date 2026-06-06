import type { ClubPlayerSnapshot } from "@/lib/lobby/types";

export const CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH = 32;

export type CustomNameValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: "too_long" | "invalid_characters" };
export type CustomNameValidationReason = Extract<CustomNameValidationResult, { ok: false }>["reason"];

export function getClubPlayerDisplayName(
  player: Pick<ClubPlayerSnapshot, "custom_name" | "player"> | null | undefined,
) {
  return player?.custom_name?.trim() || player?.player.display_name || "Spieler";
}

export function getClubPlayerDisplayNameFromRow(row: {
  custom_name?: string | null;
  player?: { display_name?: string | null } | null;
}) {
  return row.custom_name?.trim() || row.player?.display_name || "Spieler";
}

export function normalizeClubPlayerCustomName(input: unknown): CustomNameValidationResult {
  const value = String(input ?? "").trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { ok: false, reason: "invalid_characters" };
  }

  return { ok: true, value };
}

export function getClubPlayerCustomNameReasonLabel(reason: CustomNameValidationReason) {
  const labels = {
    invalid_characters: "Der Name muss mindestens einen Buchstaben oder eine Zahl enthalten.",
    too_long: `Der Name darf maximal ${CLUB_PLAYER_CUSTOM_NAME_MAX_LENGTH} Zeichen lang sein.`,
  } satisfies Record<string, string>;

  return labels[reason] ?? "Name nicht gueltig.";
}
