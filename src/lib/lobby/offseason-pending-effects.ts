import { isOffseasonManagementPhase } from "@/lib/lobby/phases";
import type { LobbyPhase } from "@/lib/lobby/types";

/** Phases where promoted (or stuck) off-season Game Changer effects apply. */
export function isOffseasonPendingEffectWindow(phase: string): boolean {
  return phase === "champions_league" || isOffseasonManagementPhase(phase);
}

/** Promote pending effects when leaving season_end for off-season or Continental Cup. */
export function shouldPromoteOffseasonEffectsOnPhaseAdvance(
  previousPhase: LobbyPhase,
  nextPhase: LobbyPhase,
): boolean {
  return (
    previousPhase === "season_end" &&
    (nextPhase === "off_season" || nextPhase === "champions_league")
  );
}

/**
 * Whether a pending effect scope counts for the current game phase.
 * During the off-season window, `next_offseason` rows that were not promoted
 * (e.g. season_end → champions_league before the fix) still apply.
 */
export function isOffseasonPendingScopeActive(scope: string, phase: string | undefined): boolean {
  if (scope === "current_offseason") {
    return phase ? isOffseasonPendingEffectWindow(phase) : true;
  }
  if (scope === "next_offseason") {
    return phase ? isOffseasonPendingEffectWindow(phase) : false;
  }
  return false;
}

export type OffseasonPendingEffectRow = {
  effect_type: string;
  scope: string;
  payload: Record<string, unknown>;
};

export function sumTrainingCapacityFromPendingEffects(
  pendingEffects: OffseasonPendingEffectRow[],
  phase: string,
): { pendingExtra: number; doubleTraining: boolean } {
  let pendingExtra = 0;
  let doubleTraining = false;
  for (const eff of pendingEffects) {
    if (eff.effect_type !== "training_capacity_delta") continue;
    if (!isOffseasonPendingScopeActive(eff.scope, phase)) continue;
    const delta = eff.payload.delta;
    if (delta === "double") {
      doubleTraining = true;
    } else if (typeof delta === "number") {
      pendingExtra += delta;
    }
  }
  return { pendingExtra, doubleTraining };
}

export function computeTrainingExtraPlayers(params: {
  baseCapacity: number;
  offseasonTrainingCapacity: number | null;
  staffEffects: Array<Record<string, unknown>>;
  pendingEffects: OffseasonPendingEffectRow[];
  phase: string;
}): number {
  const { pendingExtra, doubleTraining } = sumTrainingCapacityFromPendingEffects(
    params.pendingEffects,
    params.phase,
  );
  const snapshotExtra =
    params.offseasonTrainingCapacity != null
      ? Math.max(0, params.offseasonTrainingCapacity - params.baseCapacity)
      : params.staffEffects
          .filter((e) => e.type === "training_player_bonus")
          .reduce((sum, e) => sum + Number(e.players ?? 0), 0);
  const effectiveBase = doubleTraining ? params.baseCapacity * 2 : params.baseCapacity;
  return Math.max(0, effectiveBase - params.baseCapacity + snapshotExtra + pendingExtra);
}
