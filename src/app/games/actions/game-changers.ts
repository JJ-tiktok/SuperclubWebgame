/**
 * Game-changer server actions.
 *
 * Hosts the player-facing actions for healing and resolving Good/Bad-News
 * choice cards:
 *   - healInjuredPlayerAction
 *   - resolveGameChangerChoiceAction
 *
 * The supporting helpers (assignRandomGameChanger, dispatchGameChangerEffects,
 * applyTargetedInjury, getActivePendingEffects, injectNextMatchEffects,
 * healExpiredInjuries, transitionPendingEffectsToOffseason,
 * expireCurrentOffseasonEffects, bookSeasonFinance) are used internally by the
 * match/phase actions and are exported by `@/app/games/actions` for any
 * consumer that needs them.
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  healInjuredPlayerAction,
  resolveGameChangerChoiceAction,
} from "@/app/games/actions";

