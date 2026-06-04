export type UpgradeAction = "training" | "scouting" | "stadium";

export type StaffRecruitCheckInput = {
  actionsThisSeason: string[];
  currentStaffCount: number;
  hasOpenOffer: boolean;
  extraActionBonus?: number;
};

export function canRecruitStaff(input: StaffRecruitCheckInput) {
  const { actionsThisSeason, currentStaffCount, hasOpenOffer, extraActionBonus = 0 } = input;
  const actionLimit = 2 + extraActionBonus;

  if (hasOpenOffer) {
    return { ok: false, reason: "open_offer_pending" } as const;
  }

  if (currentStaffCount >= 3) {
    return { ok: false, reason: "staff_limit" } as const;
  }

  if (actionsThisSeason.includes("staff")) {
    return { ok: false, reason: "already_recruited_this_season" } as const;
  }

  if (actionsThisSeason.length >= actionLimit) {
    return { ok: false, reason: "investment_action_limit" } as const;
  }

  return { ok: true } as const;
}

export function getStaffRecruitReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    already_recruited_this_season: "Bereits rekrutiert diese Saison",
    investment_action_limit: "Keine Investment-Aktionen mehr frei",
    investment_action_limit_free_staff: "Gratis-Mitarbeiter (Game Changer): Zuerst ziehen, bevor alle Investment-Aktionen verbraucht sind",
    open_offer_pending: "Offenes Angebot ausstehend",
    staff_limit: "Max. 3 Mitarbeiter",
  };

  return labels[reason] ?? "Nicht moeglich";
}

export function getStaffRecruitBlockReason(input: StaffRecruitCheckInput & { hasFreeStaffOffer?: boolean }) {
  const check = canRecruitStaff(input);
  if (check.ok) {
    return null;
  }
  if (check.reason === "investment_action_limit" && input.hasFreeStaffOffer) {
    return "investment_action_limit_free_staff";
  }
  return check.reason;
}

export function getStaffRecruitHint(input: {
  hasFreeStaffOffer?: boolean;
  hasFreeStaffSigning?: boolean;
  actionsThisSeason: string[];
  extraActionBonus?: number;
}) {
  const limit = 2 + (input.extraActionBonus ?? 0);
  const slotsLeft = limit - input.actionsThisSeason.length;
  if (input.hasFreeStaffOffer && slotsLeft > 0) {
    return "Game Changer aktiv: Mitarbeiter-Zug jetzt nutzen – kostet keine Aktion, braucht aber noch freie Investment-Slots.";
  }
  if (input.hasFreeStaffSigning && slotsLeft > 0) {
    return "Gratis-Verpflichtung bereit, sobald du ein Staff-Angebot oeffnest.";
  }
  return null;
}

export const UPGRADE_COSTS: Record<UpgradeAction, number[]> = {
  scouting: [0, 15_000_000, 30_000_000, 60_000_000],
  stadium: [0, 20_000_000, 40_000_000, 80_000_000],
  training: [0, 15_000_000, 30_000_000, 60_000_000],
};

export type UpgradeCheckInput = {
  action: UpgradeAction;
  currentLevel: number;
  money: number;
  actionsThisSeason: string[];
  extraActionBonus?: number;
};

export function getUpgradeCost(action: UpgradeAction, currentLevel: number) {
  return UPGRADE_COSTS[action][clampLevel(currentLevel)] ?? 0;
}

export function canUpgradeFacility(input: UpgradeCheckInput) {
  const { action, actionsThisSeason, currentLevel, money, extraActionBonus = 0 } = input;
  const actionLimit = 2 + extraActionBonus;

  if (currentLevel >= 4) {
    return { ok: false, reason: "max_level" } as const;
  }

  if (actionsThisSeason.length >= actionLimit) {
    return { ok: false, reason: "investment_action_limit" } as const;
  }

  if (actionsThisSeason.includes(action)) {
    return { ok: false, reason: "same_department_twice" } as const;
  }

  const cost = getUpgradeCost(action, currentLevel);

  if (money < cost) {
    return { ok: false, reason: "insufficient_money" } as const;
  }

  return { ok: true, cost } as const;
}

export function getUpgradeReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    insufficient_money: "Nicht genug Geld",
    investment_action_limit: "Maximal 2 Aktionen",
    max_level: "Max Level erreicht",
    same_department_twice: "Bereits investiert",
  };

  return labels[reason] ?? "Nicht moeglich";
}

function clampLevel(level: number) {
  return Math.min(4, Math.max(1, Math.floor(level)));
}
