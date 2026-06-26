import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyNlzTrainingGuarantee,
  canTrainOwnedPlayer,
  filterTrainingEventsForWindow,
  getTrainingEventPresentation,
  getTrainingStatus,
  resolveTrainingAttempt,
  type TrainingEventSnapshot,
} from "@/lib/lobby/training";

describe("Training rules", () => {
  it("keeps the player unchanged when the dice roll is not above the current stars", () => {
    const result = resolveTrainingAttempt({
      currentStars: 2,
      diceRoll: 2,
      guaranteedBonusAvailable: false,
      skillMax: 6,
      trainingLevel: 2,
    });

    assert.equal(result.success, false);
    assert.equal(result.afterStars, 2);
  });

  it("raises the player to the dice roll when it beats the current stars", () => {
    const result = resolveTrainingAttempt({
      currentStars: 2,
      diceRoll: 3,
      guaranteedBonusAvailable: false,
      skillMax: 6,
      trainingLevel: 2,
    });

    assert.equal(result.success, true);
    assert.equal(result.afterStars, 3);
  });

  it("caps training by training level and skill max", () => {
    assert.equal(
      resolveTrainingAttempt({
        currentStars: 2,
        diceRoll: 6,
        guaranteedBonusAvailable: false,
        skillMax: 6,
        trainingLevel: 2,
      }).afterStars,
      4,
    );
    assert.equal(
      resolveTrainingAttempt({
        currentStars: 4,
        diceRoll: 6,
        guaranteedBonusAvailable: false,
        skillMax: 5,
        trainingLevel: 4,
      }).afterStars,
      5,
    );
  });

  it("uses the level four guaranteed bonus once", () => {
    const events: TrainingEventSnapshot[] = [];
    const status = getTrainingStatus({ events, trainingLevel: 4 });
    const result = resolveTrainingAttempt({
      currentStars: 3,
      diceRoll: 1,
      guaranteedBonusAvailable: status.guaranteed_bonus_available,
      skillMax: 6,
      trainingLevel: 4,
    });

    assert.equal(result.afterStars, 4);
    assert.equal(result.guaranteedBonusUsed, true);
  });

  it("raises a 1-star player to the dice roll capped by training level", () => {
    const result = resolveTrainingAttempt({
      currentStars: 1,
      diceRoll: 5,
      guaranteedBonusAvailable: false,
      skillMax: 6,
      trainingLevel: 4,
    });

    assert.equal(result.afterStars, 5);
  });

  it("caps training at the player skill maximum", () => {
    const result = resolveTrainingAttempt({
      currentStars: 1,
      diceRoll: 5,
      guaranteedBonusAvailable: false,
      skillMax: 4,
      trainingLevel: 4,
    });

    assert.equal(result.afterStars, 4);
  });

  it("applies the dice result before the NLZ guarantee", () => {
    const dice = resolveTrainingAttempt({
      currentStars: 1,
      diceRoll: 5,
      guaranteedBonusAvailable: false,
      skillMax: 6,
      trainingLevel: 4,
    });
    const result = applyNlzTrainingGuarantee(dice, { enabled: true, skillMax: 6 });

    assert.equal(result.afterStars, 5);
    assert.equal(result.nlzGuaranteedUsed, false);
  });

  it("uses the NLZ guarantee only when the dice roll fails", () => {
    const dice = resolveTrainingAttempt({
      currentStars: 1,
      diceRoll: 1,
      guaranteedBonusAvailable: false,
      skillMax: 6,
      trainingLevel: 4,
    });
    const result = applyNlzTrainingGuarantee(dice, { enabled: true, skillMax: 6 });

    assert.equal(result.afterStars, 2);
    assert.equal(result.nlzGuaranteedUsed, true);
  });

  it("filters training events by season and phase", () => {
    const events: TrainingEventSnapshot[] = [
      {
        after_stars: 3,
        before_stars: 2,
        club_player_id: "cp-1",
        created_at: "2026-01-01",
        dice_roll: 3,
        game_phase: "off_season",
        guaranteed_bonus_used: false,
        nlz_guaranteed_used: false,
        id: "e-1",
        player_id: "p-1",
        season_number: 65,
        success: true,
        training_level: 4,
      },
      {
        after_stars: 4,
        before_stars: 3,
        club_player_id: "cp-2",
        created_at: "2026-01-02",
        dice_roll: 4,
        game_phase: "offseason_training",
        guaranteed_bonus_used: false,
        nlz_guaranteed_used: false,
        id: "e-2",
        player_id: "p-2",
        season_number: 65,
        success: true,
        training_level: 4,
      },
    ];

    assert.equal(
      filterTrainingEventsForWindow(events, { gamePhase: "off_season", seasonNumber: 65 }).length,
      1,
    );
  });

  it("labels NLZ and bonus outcomes in the training log", () => {
    assert.equal(
      getTrainingEventPresentation({
        after_stars: 5,
        before_stars: 4,
        dice_roll: 4,
        guaranteed_bonus_used: false,
        nlz_guaranteed_used: false,
        nlzOrigin: true,
      }).detailSuffix,
      " inkl. NLZ-Garantie",
    );
    assert.equal(
      getTrainingEventPresentation({
        after_stars: 3,
        before_stars: 2,
        dice_roll: 1,
        guaranteed_bonus_used: true,
        nlz_guaranteed_used: false,
      }).badgeTone,
      "amber",
    );
    assert.equal(
      getTrainingEventPresentation({
        after_stars: 3,
        before_stars: 2,
        dice_roll: 3,
        guaranteed_bonus_used: false,
        nlz_guaranteed_used: false,
      }).badgeTone,
      "green",
    );
  });

  it("blocks exhausted capacity and duplicate player training", () => {
    assert.equal(
      canTrainOwnedPlayer({
        alreadyTrained: false,
        attemptsUsed: 1,
        capacityPlayers: 1,
        currentStars: 2,
        injured: false,
        skillMax: 6,
      }).ok,
      false,
    );
    assert.equal(
      canTrainOwnedPlayer({
        alreadyTrained: true,
        attemptsUsed: 0,
        capacityPlayers: 1,
        currentStars: 2,
        injured: false,
        skillMax: 6,
      }).ok,
      false,
    );
  });
});
