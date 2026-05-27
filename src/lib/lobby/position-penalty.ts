const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

/**
 * Returns the penalty for placing a player with the given eligible positions in a slot zone.
 *
 * - If any of the player's eligible positions matches the slot zone → 0 penalty (natural fit).
 * - GK placed in any outfield zone → Infinity (→ 0 effective stars).
 * - Otherwise: minimum steps across all positions (DEF→MID = 1, DEF→ATT = 2).
 *
 * Accepts either a single position string or an array of eligible positions.
 */
export function getPositionPenalty(
  naturalPositions: string | string[],
  slotZone: string,
): number {
  const posArray = Array.isArray(naturalPositions) ? naturalPositions : [naturalPositions];

  // GK rule: if the player's only / primary position is GK and the slot is not GK → Infinity
  if (posArray.every((p) => p === "GK") && slotZone !== "GK") {
    return Infinity;
  }

  // If any eligible position matches the slot zone exactly → no penalty
  if (posArray.includes(slotZone)) {
    return 0;
  }

  // Minimum positional distance across all eligible non-GK positions
  const slot = POSITION_ORDER[slotZone] ?? 2;
  const minPenalty = posArray
    .filter((p) => p !== "GK")
    .reduce((min, p) => {
      const nat = POSITION_ORDER[p] ?? 2;
      return Math.min(min, Math.abs(nat - slot));
    }, Infinity);

  return minPenalty;
}

export function applyPositionPenalty(stars: number, penalty: number): number {
  if (!isFinite(penalty)) return 0;
  return Math.max(0, stars - penalty);
}
