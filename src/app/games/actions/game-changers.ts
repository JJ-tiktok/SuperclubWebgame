/**
 * Game-changer server actions and shared dispatch pipeline.
 */

export {
  healInjuredPlayerAction,
  resolveGameChangerChoiceAction,
} from "@/app/games/actions";

export { dispatchGameChangerEffects } from "@/lib/game/dispatch-game-changer-effects";
