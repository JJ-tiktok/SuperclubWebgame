export type UpgradeAction = "training" | "scouting" | "stadium";

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
};

export function getUpgradeCost(action: UpgradeAction, currentLevel: number) {
  return UPGRADE_COSTS[action][clampLevel(currentLevel)] ?? 0;
}

export function canUpgradeFacility(input: UpgradeCheckInput) {
  const { action, actionsThisSeason, currentLevel, money } = input;

  if (currentLevel >= 4) {
    return { ok: false, reason: "max_level" } as const;
  }

  if (actionsThisSeason.length >= 2) {
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
