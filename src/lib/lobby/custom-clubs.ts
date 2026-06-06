import { getClubTemplate } from "./club-templates";
import { normalizeClubName, validateClubName } from "./rules";
import type { ClubTemplate, LobbyClub } from "./types";

export const CUSTOM_CLUB_TEMPLATE_VALUE = "custom";

export const CUSTOM_CLUB_COLOR_SWATCHES = [
  "#2563EB",
  "#059669",
  "#DC2626",
  "#7C3AED",
  "#EA580C",
  "#0891B2",
  "#BE185D",
  "#52525B",
] as const;

export type ClubSelection =
  | { kind: "template"; template: ClubTemplate }
  | { kind: "custom"; club_name: string; club_color: string };

export function isHexClubColor(value: string | null | undefined) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "").trim());
}

export function normalizeClubColor(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return isHexClubColor(normalized) ? normalized.toUpperCase() : null;
}

export function buildClubInitials(clubName: string, maxLength = 3) {
  const normalized = normalizeClubName(clubName);
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  if (words.length === 0) {
    return "FC";
  }

  const initials =
    words.length === 1
      ? words[0].slice(0, maxLength)
      : words
          .slice(0, maxLength)
          .map((word) => word[0])
          .join("");

  return initials.toLocaleUpperCase("de-DE");
}

export function parseClubSelectionFromFormData(formData: FormData) {
  const rawTemplateId = String(formData.get("club_template_id") || "");

  if (rawTemplateId === CUSTOM_CLUB_TEMPLATE_VALUE) {
    const nameResult = validateClubName(String(formData.get("custom_club_name") || ""));
    if (!nameResult.ok) {
      return nameResult;
    }

    const color = normalizeClubColor(String(formData.get("custom_club_color") || ""));
    if (!color) {
      return { ok: false, error: "Bitte waehle eine gueltige Clubfarbe im Format #RRGGBB." } as const;
    }

    return { ok: true, selection: { kind: "custom", club_name: nameResult.value, club_color: color } } as const;
  }

  const template = getClubTemplate(rawTemplateId);
  if (!template) {
    return { ok: false, error: "Bitte waehle einen verfuegbaren Verein aus." } as const;
  }

  return { ok: true, selection: { kind: "template", template } } as const;
}

export function getClubSelectionName(selection: ClubSelection) {
  return selection.kind === "custom" ? selection.club_name : selection.template.name;
}

export function isClubNameTaken(clubs: LobbyClub[], desiredName: string, currentClerkUserId: string) {
  const normalizedDesired = normalizeClubName(desiredName).toLocaleLowerCase("de-DE");
  return clubs.some(
    (club) =>
      club.clerk_user_id !== currentClerkUserId &&
      normalizeClubName(club.club_name).toLocaleLowerCase("de-DE") === normalizedDesired,
  );
}
