/**
 * Staff recruitment server actions.
 *
 * Hosts the actions that drive the staff offers:
 *   - recruitStaffOpenAction (open a new staff offer / draw cards)
 *   - recruitStaffResolveAction (pick a card from an open offer)
 *   - dismissStaffAction (release a hired staff card)
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  recruitStaffOpenAction,
  recruitStaffResolveAction,
  dismissStaffAction,
} from "@/app/games/actions";

