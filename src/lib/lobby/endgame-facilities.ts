import type { ClubStatus } from "@/lib/game/types";
import { getManagerScoreBand } from "@/lib/game/rules";
import { CLUB_STATUS_ORDER, normalizeClubStatus } from "@/lib/lobby/club-status";
import type { LobbyClub } from "@/lib/lobby/types";

export const ENDGAME_FACILITY_ACTIONS = ["medical", "analytics", "youth_academy", "construction_yard"] as const;
export type EndgameFacilityAction = (typeof ENDGAME_FACILITY_ACTIONS)[number];

export const ENDGAME_MAX_LEVEL = 3;

export const ENDGAME_UPGRADE_COSTS: Record<EndgameFacilityAction, number[]> = {
  medical: [0, 30_000_000, 60_000_000, 90_000_000],
  analytics: [0, 40_000_000, 70_000_000, 100_000_000],
  youth_academy: [0, 50_000_000, 70_000_000, 110_000_000],
  construction_yard: [0, 100_000_000],
};

export const ENDGAME_FACILITY_LABELS: Record<EndgameFacilityAction, string> = {
  medical: "Medizin-Zentrum",
  analytics: "Analyse-Zentrum",
  youth_academy: "Nachwuchsleistungszentrum",
  construction_yard: "Bauhof",
};

export function isEndgameFacilityAction(value: string): value is EndgameFacilityAction {
  return (ENDGAME_FACILITY_ACTIONS as readonly string[]).includes(value);
}

export function getInvestmentActionLimit(extraActionBonus = 0, constructionYardBuilt = false) {
  return 2 + extraActionBonus + (constructionYardBuilt ? 2 : 0);
}

export function clubStatusRank(status: ClubStatus) {
  return CLUB_STATUS_ORDER.indexOf(status);
}

export function hasMidTableStatus(status: ClubStatus) {
  return clubStatusRank(status) >= clubStatusRank("mid_table");
}

export function hasTitleContenderStatus(status: ClubStatus) {
  return clubStatusRank(status) >= clubStatusRank("title_contender");
}

export function getEndgameUpgradeTargetLevel(action: EndgameFacilityAction, currentLevel: number) {
  if (action === "construction_yard") {
    return currentLevel >= 1 ? 1 : 1;
  }
  return Math.min(ENDGAME_MAX_LEVEL, currentLevel + 1);
}

export function getEndgameFacilityLevel(
  club: Pick<
    LobbyClub,
    | "medical_center_level"
    | "analytics_hub_level"
    | "youth_academy_level"
    | "construction_yard_built"
  >,
  action: EndgameFacilityAction,
) {
  if (action === "medical") {
    return club.medical_center_level ?? 0;
  }
  if (action === "analytics") {
    return club.analytics_hub_level ?? 0;
  }
  if (action === "youth_academy") {
    return club.youth_academy_level ?? 0;
  }
  return club.construction_yard_built ? 1 : 0;
}

export function getEndgameUpgradeCost(action: EndgameFacilityAction, currentLevel: number) {
  const costs = ENDGAME_UPGRADE_COSTS[action];
  if (action === "construction_yard") {
    return currentLevel >= 1 ? 0 : costs[1] ?? 0;
  }
  const index = Math.min(currentLevel + 1, costs.length - 1);
  return costs[index] ?? 0;
}

export function getEndgameUnlockRequirement(action: EndgameFacilityAction, targetLevel: number) {
  if (action === "construction_yard") {
    return "mid_table" as const;
  }
  if (targetLevel <= 1) {
    return "mid_table" as const;
  }
  return "title_contender" as const;
}

export function isEndgameUnlockMet(status: ClubStatus, requirement: "mid_table" | "title_contender") {
  if (requirement === "title_contender") {
    return hasTitleContenderStatus(status);
  }
  return hasMidTableStatus(status);
}

export type EndgameUpgradeCheckInput = {
  action: EndgameFacilityAction;
  actionsThisSeason: string[];
  clubStatus: ClubStatus;
  currentLevel: number;
  money: number;
  actionLimit: number;
};

export function canUpgradeEndgameFacility(input: EndgameUpgradeCheckInput) {
  const { action, actionsThisSeason, clubStatus, currentLevel, money, actionLimit } = input;

  if (action === "construction_yard" && currentLevel >= 1) {
    return { ok: false, reason: "max_level" } as const;
  }

  if (action !== "construction_yard" && currentLevel >= ENDGAME_MAX_LEVEL) {
    return { ok: false, reason: "max_level" } as const;
  }

  if (actionsThisSeason.length >= actionLimit) {
    return { ok: false, reason: "investment_action_limit" } as const;
  }

  if (actionsThisSeason.includes(action)) {
    return { ok: false, reason: "same_department_twice" } as const;
  }

  const targetLevel = getEndgameUpgradeTargetLevel(action, currentLevel);
  const requirement = getEndgameUnlockRequirement(action, targetLevel);
  if (!isEndgameUnlockMet(clubStatus, requirement)) {
    return {
      ok: false,
      reason: requirement === "title_contender" ? "requires_title_contender" : "requires_mid_table",
    } as const;
  }

  const cost = getEndgameUpgradeCost(action, currentLevel);
  if (money < cost) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  return { ok: true, cost } as const;
}

export function getEndgameUpgradeReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    insufficient_money: "Nicht genug Geld",
    investment_action_limit: "Keine Investment-Aktionen mehr frei",
    max_level: "Max Level erreicht",
    same_department_twice: "Bereits in dieser Saison ausgebaut",
    requires_mid_table: "Benötigt: Mittlerer Tabellenplatz",
    requires_title_contender: "Benötigt: Titelanwärter",
  };
  return labels[reason] ?? "Nicht moeglich";
}

export function getMedicalHealLimit(medicalCenterLevel: number) {
  if (medicalCenterLevel <= 0) {
    return 0;
  }
  if (medicalCenterLevel >= 3) {
    return Number.POSITIVE_INFINITY;
  }
  return medicalCenterLevel;
}

export function getMedicalHealsRemaining(medicalCenterLevel: number, used: number) {
  const limit = getMedicalHealLimit(medicalCenterLevel);
  if (!Number.isFinite(limit)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, limit - used);
}

export function hasAutoMedicalCenter(medicalCenterLevel: number) {
  return medicalCenterLevel >= 3;
}

export function getNlzTalentCountPerOffseason(youthAcademyLevel: number) {
  if (youthAcademyLevel <= 0) {
    return 0;
  }
  return youthAcademyLevel >= 3 ? 2 : 1;
}

export function canRevealDeadlineAuctionPlayers(analyticsHubLevel: number) {
  return analyticsHubLevel >= 3;
}

export function resolveClubInvestmentStatus(
  club: Pick<LobbyClub, "status" | "status_override" | "status_override_until_season">,
  seasonNumber: number,
  liveManagerScore?: number | null,
) {
  if (liveManagerScore != null && Number.isFinite(liveManagerScore)) {
    return getManagerScoreBand(liveManagerScore).status;
  }

  const overrideUntil = club.status_override_until_season ?? null;
  if (club.status_override && (overrideUntil == null || overrideUntil >= seasonNumber)) {
    return normalizeClubStatus(club.status_override);
  }
  return normalizeClubStatus(club.status);
}
