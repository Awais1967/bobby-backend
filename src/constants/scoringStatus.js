const SCORE_ACTION_TYPES = Object.freeze({
  ANSWER_CORRECT: "answer_correct",
  ANSWER_INCORRECT: "answer_incorrect",
  ANSWER_PARTIAL: "answer_partial",
  MANUAL_ADD: "manual_add",
  MANUAL_DEDUCT: "manual_deduct",
  BONUS_SET: "bonus_set",
  WAGER_CORRECT: "wager_correct",
  WAGER_INCORRECT: "wager_incorrect",
  SPEED_BONUS: "speed_bonus",
  SCORE_RESET: "score_reset",
  SCORE_OVERRIDE: "score_override",
});

const ANSWER_REVIEW_STATUS = Object.freeze({
  PENDING: "pending",
  CORRECT: "correct",
  INCORRECT: "incorrect",
  PARTIAL: "partial",
});

module.exports = {
  ANSWER_REVIEW_STATUS,
  SCORE_ACTION_TYPES,
};
