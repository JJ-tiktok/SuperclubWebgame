const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

/**
 * Returns the number of stars to deduct when a player is placed in a zone
 * that doesn't match their natural position.
 *
 * GK playing any outfield zone always returns Infinity (→ 0 effective stars).
 * For field players: one star per positional step away (DEF→MID = 1, DEF→ATT = 2).
 */
export function getPositionPenalty(naturalPosition: string, slotZone: string): number {
  if (naturalPosition === "GK" && slotZone !== "GK") {
    return Infinity;
  }

  const nat = POSITION_ORDER[naturalPosition] ?? 2;
  const slot = POSITION_ORDER[slotZone] ?? 2;
  return Math.abs(nat - slot);
}

export function applyPositionPenalty(stars: number, penalty: number): number {
  if (!isFinite(penalty)) return 0;
  return Math.max(0, stars - penalty);
}
