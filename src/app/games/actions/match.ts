/**
 * Match / fixture server actions.
 *
 * Hosts the actions that drive the lineup + match resolution flow:
 *   - saveLineupAction
 *   - setCaptainAction
 *   - lockFixtureLineupAction
 *   - resolveFixtureAction
 *   - initializeSeasonScheduleAction
 *   - startMatchAction
 *   - markReadyForNextThirdAction
 *   - playSecretWeaponAction
 *   - playMatchCardAction
 *   - triggerDrawRerollAction
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  saveLineupAction,
  setCaptainAction,
  lockFixtureLineupAction,
  resolveFixtureAction,
  initializeSeasonScheduleAction,
  startMatchAction,
  markReadyForNextThirdAction,
  playSecretWeaponAction,
  playMatchCardAction,
  triggerDrawRerollAction,
} from "@/app/games/actions";

