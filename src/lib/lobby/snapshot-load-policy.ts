import type { LobbyPhase } from "@/lib/lobby/types";

export type ClubOverviewLoadProfile = {
  loadGameChangers: boolean;
  loadInvestments: boolean;
  loadOpenStaffOffer: boolean;
  loadPendingEffects: boolean;
  loadSalesTransactions: boolean;
  loadSponsorContracts: boolean;
  loadSquad: boolean;
  loadStaff: boolean;
  loadTrainingTransactions: boolean;
};

export function needsOffSeasonChecklistSnapshot(phase: LobbyPhase): boolean {
  return phase === "off_season";
}

export function isOffseasonDashboardView(phase: LobbyPhase, view: string): boolean {
  return (
    view === "dashboard" &&
    (phase === "off_season" ||
      phase === "offseason_finance" ||
      phase === "offseason_training" ||
      phase === "offseason_scouting" ||
      phase === "offseason_investments")
  );
}

export function shouldLoadScoutingForView(phase: LobbyPhase, view: string): boolean {
  if (needsOffSeasonChecklistSnapshot(phase)) {
    return true;
  }

  return view === "scouting" || (view === "dashboard" && phase === "offseason_scouting");
}

export function shouldLoadClubOverviewForView(phase: LobbyPhase, view: string): boolean {
  if (phase === "season_end" && view === "dashboard") {
    return true;
  }

  if (needsOffSeasonChecklistSnapshot(phase)) {
    return true;
  }

  if (isOffseasonDashboardView(phase, view)) {
    return true;
  }

  return ["grounds", "lineup", "squad", "training", "scouting", "transfer", "deadline", "matchday", "continental", "dashboard", "hall_of_fame"].includes(
    view,
  );
}

export function shouldLoadHallOfFameSnapshot(view: string): boolean {
  return view === "hall_of_fame";
}

export function getClubOverviewLoadProfileForView(phase: LobbyPhase, view: string): ClubOverviewLoadProfile {
  const offseasonDashboard = isOffseasonDashboardView(phase, view);
  const offSeasonChecklist = needsOffSeasonChecklistSnapshot(phase);
  const loadSquad = ["grounds", "lineup", "squad", "training", "scouting", "transfer", "deadline", "matchday", "continental", "dashboard", "hall_of_fame"].includes(
    view,
  );
  const loadStaff =
    offseasonDashboard ||
    offSeasonChecklist ||
    ["grounds", "lineup", "squad", "training", "matchday", "continental"].includes(view);
  const loadPendingEffects =
    offseasonDashboard ||
    offSeasonChecklist ||
    ["grounds", "lineup", "training", "scouting", "transfer", "matchday", "continental"].includes(view);

  return {
    loadGameChangers: ["grounds", "matchday", "continental"].includes(view),
    loadInvestments: offseasonDashboard || view === "grounds" || offSeasonChecklist,
    loadOpenStaffOffer: view === "grounds",
    loadPendingEffects,
    loadSalesTransactions: view === "transfer",
    loadSponsorContracts: offseasonDashboard || view === "grounds" || offSeasonChecklist,
    loadSquad,
    loadStaff,
    loadTrainingTransactions: offseasonDashboard || view === "training" || offSeasonChecklist,
  };
}
