/**
 * Deadline-day auction server actions.
 *
 * Hosts the actions that drive the deadline-day open-auction flow:
 *   - initializeDeadlineDayAction (host-only setup)
 *   - placeDeadlineBidAction
 *   - passDeadlineBidAction
 *   - resolveDeadlineAuctionAction (host-only resolution)
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  initializeDeadlineDayAction,
  placeDeadlineBidAction,
  passDeadlineBidAction,
  resolveDeadlineAuctionAction,
} from "@/app/games/actions";

