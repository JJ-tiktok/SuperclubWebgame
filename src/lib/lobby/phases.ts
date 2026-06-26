import { shouldRunContinentalCup } from "@/lib/lobby/continental-cup";
import type { LobbyPhase, LobbySettings } from "@/lib/lobby/types";

// Phases in which a manager is doing off-season management (training/scouting/investments + deadline day).
// off_season is the new consolidated phase. Legacy phases remain in the union so existing DB rows
// keep working until they get migrated by phase_consolidation_upgrade.sql.
export const OFFSEASON_MANAGEMENT_PHASES: LobbyPhase[] = [
  "off_season",
  "offseason_finance",
  "offseason_training",
  "offseason_scouting",
  "offseason_investments",
  "deadline_day",
];

export function getSeasonNumber(settings: Pick<LobbySettings, "seasonNumber"> | null | undefined) {
  return Number(settings?.seasonNumber ?? 1);
}

export function isFinalSeason(settings?: Pick<LobbySettings, "seasonNumber" | "final_season_number"> | null) {
  const finalSeasonNumber = settings?.final_season_number;
  if (!finalSeasonNumber) {
    return false;
  }
  return getSeasonNumber(settings) === finalSeasonNumber;
}

export function getNextLobbyPhase(
  phase: LobbyPhase,
  settings?: Pick<LobbySettings, "seasonNumber" | "continental_cup_enabled" | "final_season_number"> | null,
): LobbyPhase {
  if (phase === "season_end") {
    if (isFinalSeason(settings)) {
      return shouldRunContinentalCup(getSeasonNumber(settings), settings) ? "champions_league" : "completed";
    }
    return shouldRunContinentalCup(getSeasonNumber(settings), settings) ? "champions_league" : "off_season";
  }

  const nextByPhase: Partial<Record<LobbyPhase, LobbyPhase>> = {
    completed: "completed",
    lobby: "draft",
    draft: "off_season",
    off_season: "deadline_day",
    deadline_day: "season",
    season: "season_end",
    champions_league: isFinalSeason(settings) ? "completed" : "off_season",
    // Legacy fallbacks (until DB migration runs)
    offseason_finance: "off_season",
    offseason_training: "off_season",
    offseason_scouting: "off_season",
    offseason_investments: "deadline_day",
    prematch: "season",
    match: "season_end",
  };

  return nextByPhase[phase] ?? "completed";
}

export function shouldAdvanceSeason(previousPhase: LobbyPhase, nextPhase: LobbyPhase) {
  if (nextPhase === "completed") {
    return false;
  }
  return (
    (previousPhase === "season_end" && nextPhase === "off_season") ||
    (previousPhase === "champions_league" && nextPhase === "off_season")
  );
}

export function getSettingsForNextPhase(settings: LobbySettings, previousPhase: LobbyPhase, nextPhase: LobbyPhase): LobbySettings {
  if (!shouldAdvanceSeason(previousPhase, nextPhase)) {
    return settings;
  }

  return {
    ...settings,
    seasonNumber: getSeasonNumber(settings) + 1,
  };
}

export function isOffseasonManagementPhase(phase: string) {
  return OFFSEASON_MANAGEMENT_PHASES.includes(phase as LobbyPhase);
}

export function isInvestmentPhase(phase: string) {
  return phase === "off_season" || phase === "offseason_investments";
}

export function isTrainingPhase(phase: string) {
  return phase === "off_season" || phase === "offseason_training";
}

export function isScoutingPhase(phase: string) {
  return phase === "off_season" || phase === "offseason_scouting";
}

export function isSeasonPhase(phase: string) {
  return phase === "season" || phase === "prematch" || phase === "match";
}

export function getPhaseLabel(phase: LobbyPhase): string {
  const labels: Record<LobbyPhase, string> = {
    lobby: "Lobby",
    draft: "Draft",
    off_season: "Off-Season",
    deadline_day: "Deadline Day",
    season: "Saison",
    season_end: "Saisonabschluss",
    champions_league: "Continental Cup",
    completed: "Abgeschlossen",
    // Legacy fallbacks
    offseason_finance: "Off-Season",
    offseason_training: "Off-Season",
    offseason_scouting: "Off-Season",
    offseason_investments: "Off-Season",
    prematch: "Saison",
    match: "Saison",
  };
  return labels[phase] ?? phase;
}
