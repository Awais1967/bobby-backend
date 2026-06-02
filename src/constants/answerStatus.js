const ANSWER_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  REOPENED: "reopened",
  VOIDED: "voided",
});

const REVIEW_STATUS = Object.freeze({
  PENDING: "pending",
  CORRECT: "correct",
  INCORRECT: "incorrect",
  PARTIAL: "partial",
});

module.exports = {
  ANSWER_STATUS,
  REVIEW_STATUS,
};
