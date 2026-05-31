/**
 * Pure helper functions extracted from `game-dashboard.tsx`.
 *
 * These have no JSX or React-state dependencies and are safe to import from
 * any client component. Keeping them here lets us shrink the dashboard shell
 * and reuse the formatters from the not-yet-extracted per-view modules.
 */

import { getDeadlineActionLabel } from "@/lib/lobby/deadline";
import { getScoutingActionLabel } from "@/lib/lobby/scouting";
import { canTrainOwnedPlayer, getTrainingReasonLabel } from "@/lib/lobby/training";
import type { LobbyClub } from "@/lib/lobby/types";

export type GameView =
  | "dashboard"
  | "squad"
  | "grounds"
  | "lineup"
  | "matchday"
  | "transfer"
  | "table"
  | "settings"
  | "draft"
  | "training"
  | "scouting"
  | "deadline";

const GAME_VIEWS: GameView[] = [
  "dashboard",
  "squad",
  "grounds",
  "lineup",
  "matchday",
  "transfer",
  "table",
  "settings",
  "draft",
  "training",
  "scouting",
  "deadline",
];

export function normalizeView(value: string | undefined): GameView {
  return GAME_VIEWS.includes(value as GameView) ? (value as GameView) : "dashboard";
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

export function formatStars(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatSavedLine(value: string | null | undefined): string {
  return value ? `Zuletzt gespeichert: ${formatSavedAt(value)}` : "Spielstand geladen";
}

export function getClubStatusLabel(status: LobbyClub["status"]): string {
  const labels: Record<string, string> = {
    established: "Established",
    mid_table: "Mid Table",
    newly_promoted: "Newly Promoted",
    title_contender: "Title Contender",
  };

  return labels[status ?? "newly_promoted"] ?? "Newly Promoted";
}

export function getTurnFallback(phase: string, isHost: boolean): string {
  if (phase === "lobby") {
    return isHost ? "Host" : "Wartet";
  }
  return "Noch offen";
}

export function getTrainingDisabledLabel(
  trainingEnabled: boolean,
  check: ReturnType<typeof canTrainOwnedPlayer>,
): string {
  if (!trainingEnabled) {
    return "Phase gesperrt";
  }
  return check.ok ? "Trainieren" : getTrainingReasonLabel(check.reason);
}

export function getScoutingCheckLabel(
  check: { ok: true } | { ok: false; reason: string },
): string {
  return check.ok ? "OK" : getScoutingActionLabel(check.reason);
}

export function getDeadlineBidTitle(money: number, nextBid: number, squadSize: number): string {
  if (squadSize >= 23) {
    return getDeadlineActionLabel("squad_full");
  }
  if (money < nextBid) {
    return getDeadlineActionLabel("insufficient_money");
  }
  return "Gebot abgeben";
}

export function getAuctionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: "aktiv",
    passed: "nicht verkauft",
    resolved: "verkauft",
    resolving: "wird aufgeloest",
    scheduled: "wartet",
  };
  return labels[status] ?? status;
}

export function getAuctionBadgeTone(status: string): "neutral" | "green" | "blue" | "red" {
  if (status === "open") return "green";
  if (status === "resolved") return "blue";
  if (status === "passed") return "red";
  return "neutral";
}

export function getInvestmentLabel(action: string): string {
  const labels: Record<string, string> = {
    scouting: "Scouting",
    stadium: "Stadion",
    staff: "Mitarbeiter",
    training: "Training",
  };
  return labels[action] ?? action;
}

export function getThirdLabel(label: "away_attack" | "home_attack" | "midfield"): string {
  const labels = {
    away_attack: "Auswaerts greift an",
    home_attack: "Heim greift an",
    midfield: "Mittelfeld",
  } as const;
  return labels[label];
}
