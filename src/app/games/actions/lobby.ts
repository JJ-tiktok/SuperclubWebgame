/**
 * Lobby / phase-flow server actions.
 *
 * Hosts the actions that drive lobby readiness, the global game lifecycle and
 * the phase transition flow:
 *   - setReadyFromDashboardAction
 *   - startGameFromDashboardAction
 *   - deleteGameAction
 *   - setPhaseDoneAction
 *   - advancePhaseAction
 *
 * Implementations currently live in `src/app/games/actions.ts`. This module
 * re-exports them so consumers can import via the modular path.
 */

export {
  setReadyFromDashboardAction,
  startGameFromDashboardAction,
  deleteGameAction,
  updateGameSettingsAction,
  setPhaseDoneAction,
  advancePhaseAction,
} from "@/app/games/actions";

