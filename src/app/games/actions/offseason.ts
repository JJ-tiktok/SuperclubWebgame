/**
 * Off-season server actions: investments and training.
 *
 * Hosts the actions that touch club money, facilities and player development
 * during the off-season:
 *   - upgradeInvestmentAction (training / scouting / stadium)
 *   - trainPlayerAction
 *
 * Implementations currently live in `src/app/games/actions.ts`.
 */

export {
  healPlayerMedicalAction,
  renameClubPlayerAction,
  respecPlayerArchetypeAction,
  trainPlayerAction,
  upgradeInvestmentAction,
} from "@/app/games/actions";

export { signSponsorDealAction, pickSponsorRewardPlayerAction } from "@/app/games/actions/sponsoring";

