/**
 * Scouting + player-sale server actions.
 *
 * Hosts the actions that drive the parallel scouting flow and free-form
 * off-season player sales:
 *   - drawScoutingPlayerAction
 *   - buyScoutedPlayerAction
 *   - passScoutedPlayerAction
 *   - passAllScoutedPlayersAction
 *   - sellClubPlayerAction
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  drawScoutingPlayerAction,
  buyScoutedPlayerAction,
  passScoutedPlayerAction,
  passAllScoutedPlayersAction,
  sellClubPlayerAction,
} from "@/app/games/actions";

