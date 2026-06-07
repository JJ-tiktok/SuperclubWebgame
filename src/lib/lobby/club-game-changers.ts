import type { ClubGameChangerSnapshot } from "@/lib/lobby/types";

export function isUnusedSecretWeapon(row: ClubGameChangerSnapshot): boolean {
  return row.card.category === "secret_weapon" && row.used_at == null;
}

/** Keeps unused secret weapons from prior seasons visible after season rollover. */
export function mergeCarriedSecretWeapons(
  currentSeasonRows: ClubGameChangerSnapshot[],
  carryOverRows: ClubGameChangerSnapshot[],
): ClubGameChangerSnapshot[] {
  const byId = new Map<string, ClubGameChangerSnapshot>();

  for (const row of carryOverRows) {
    if (isUnusedSecretWeapon(row)) {
      byId.set(row.id, row);
    }
  }

  for (const row of currentSeasonRows) {
    byId.set(row.id, row);
  }

  return [...byId.values()].sort(compareClubGameChangersByCreatedAt);
}

function compareClubGameChangersByCreatedAt(a: ClubGameChangerSnapshot, b: ClubGameChangerSnapshot): number {
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aTime - bTime;
}
