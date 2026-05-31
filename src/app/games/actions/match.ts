/**
 * Match / fixture server actions.
 *
 * Hosts the actions that drive the lineup + match resolution flow:
 *   - saveLineupAction
 *   - lockFixtureLineupAction
 *   - resolveFixtureAction
 *   - initializeSeasonScheduleAction
 *   - startMatchAction
 *   - markReadyForNextThirdAction
 *   - playSecretWeaponAction
 *   - triggerDrawRerollAction
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  saveLineupAction,
  lockFixtureLineupAction,
  resolveFixtureAction,
  initializeSeasonScheduleAction,
  startMatchAction,
  markReadyForNextThirdAction,
  playSecretWeaponAction,
  triggerDrawRerollAction,
} from "@/app/games/actions";

