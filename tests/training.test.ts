import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canTrainOwnedPlayer,
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
