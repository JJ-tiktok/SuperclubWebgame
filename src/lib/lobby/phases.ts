import type { LobbyPhase, LobbySettings } from "@/lib/lobby/types";

export const OFFSEASON_MANAGEMENT_PHASES: LobbyPhase[] = [
  "offseason_finance",
  "offseason_training",
  "offseason_scouting",
  "offseason_investments",
  "deadline_day",
];

export function getSeasonNumber(settings: Pick<LobbySettings, "seasonNumber"> | null | undefined) {
  return Number(settings?.seasonNumber ?? 1);
}

export function getNextLobbyPhase(phase: LobbyPhase): LobbyPhase {
  const nextByPhase: Partial<Record<LobbyPhase, LobbyPhase>> = {
    completed: "completed",
    deadline_day: "prematch",
    draft: "offseason_finance",
    lobby: "draft",
    match: "season_end",
    offseason_finance: "offseason_training",
    offseason_investments: "deadline_day",
    offseason_scouting: "offseason_investments",
    offseason_training: "offseason_scouting",
    prematch: "match",
    season_end: "offseason_finance",
  };

  return nextByPhase[phase] ?? "completed";
}

export function shouldAdvanceSeason(previousPhase: LobbyPhase, nextPhase: LobbyPhase) {
  return previousPhase === "season_end" && nextPhase === "offseason_finance";
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
  return phase === "offseason_investments";
}
