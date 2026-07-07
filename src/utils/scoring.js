function normalizeAnswer(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function isMultipleChoiceCorrect(question, answer) {
  return normalizeAnswer(answer.selectedOption) === normalizeAnswer(question.correctAnswer);
}

function isFiftyFiftyCorrect(question, answer) {
  return normalizeAnswer(answer.selectedOption) === normalizeAnswer(question.correctAnswer);
}

function isOrderingCorrect(question, answer) {
  const expected = Array.isArray(question.orderingAnswer) ? question.orderingAnswer : [];
  const submitted = Array.isArray(answer.orderingAnswer) ? answer.orderingAnswer : [];

  if (expected.length === 0 || expected.length !== submitted.length) {
    return false;
  }

  return expected.every((item, index) => normalizeAnswer(item) === normalizeAnswer(submitted[index]));
}

function isOpenTextExactCorrect(question, answer) {
  const submitted = normalizeAnswer(answer.answerText || answer.selectedOption);
  const possibleAnswers = [
    question.correctAnswer,
    ...(Array.isArray(question.correctAnswers) ? question.correctAnswers : []),
  ].filter(Boolean);

  if (Array.isArray(question.correctAnswers) && question.correctAnswers.filter(Boolean).length > 1) {
    const expectedParts = question.correctAnswers.filter(Boolean).map(normalizeAnswer);
    const submittedParts = String(answer.answerText || answer.selectedOption || "")
      .split("|")
      .map(normalizeAnswer)
      .filter(Boolean);

    if (submittedParts.length >= expectedParts.length) {
      return expectedParts.every((expected, index) => submittedParts[index] === expected);
    }
  }

  return possibleAnswers.some((candidate) => normalizeAnswer(candidate) === submitted);
}

function isNumericCorrect(question, answer) {
  if (typeof answer.numericAnswer !== "number") {
    return false;
  }

  const tolerance = typeof question.numericTolerance === "number" ? question.numericTolerance : 0;
  const possibleAnswers = [
    question.numericAnswer,
    ...(Array.isArray(question.correctAnswers) ? question.correctAnswers : []),
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (possibleAnswers.length === 0) {
    return false;
  }

  return possibleAnswers.some((candidate) => Math.abs(answer.numericAnswer - candidate) <= tolerance);
}

function calculateSpeedBonus(question, responseTimeMs) {
  if (!question.speedScoringEnabled || !question.maxSpeedPoints) {
    return 0;
  }

  const estimatedTimeMs = (question.estimatedTimeSeconds || 60) * 1000;
  const remainingRatio = Math.max(0, estimatedTimeMs - responseTimeMs) / estimatedTimeMs;

  return Math.round(question.maxSpeedPoints * remainingRatio);
}

function calculateWagerPoints(answer, isCorrect) {
  const wagerAmount = answer.wagerAmount || 0;
  return isCorrect ? wagerAmount : -wagerAmount;
}

function getQuestionPoints(question) {
  return Math.max(Number(question?.points) || 0, 10);
}

function calculateAwardedPoints(question, answer, reviewPayload) {
  if (typeof reviewPayload.awardedPoints === "number") {
    return reviewPayload.awardedPoints;
  }

  if (reviewPayload.reviewStatus === "correct") {
    const basePoints = getQuestionPoints(question);
    const speedBonus = question.type === "speed" ? calculateSpeedBonus(question, answer.responseTimeMs || 0) : 0;
    return basePoints + speedBonus;
  }

  return 0;
}

function applyScoreChange(team, pointsChange) {
  const previousScore = team.score || 0;
  const newScore = Math.max(0, previousScore + pointsChange);

  team.score = newScore;

  return {
    newScore,
    previousScore,
  };
}

function recalculateAnswerScore(answer, question, team, reviewPayload) {
  const awardedPoints = calculateAwardedPoints(question, answer, reviewPayload);
  const previousAwardedPoints = answer.awardedPoints || 0;
  const pointsChange = awardedPoints - previousAwardedPoints;

  return {
    awardedPoints,
    pointsChange,
    previousAwardedPoints,
  };
}

module.exports = {
  applyScoreChange,
  calculateAwardedPoints,
  calculateSpeedBonus,
  calculateWagerPoints,
  getQuestionPoints,
  isFiftyFiftyCorrect,
  isMultipleChoiceCorrect,
  isNumericCorrect,
  isOpenTextExactCorrect,
  isOrderingCorrect,
  normalizeAnswer,
  recalculateAnswerScore,
};
