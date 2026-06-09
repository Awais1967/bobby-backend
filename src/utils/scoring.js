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

  return possibleAnswers.some((candidate) => normalizeAnswer(candidate) === submitted);
}

function isNumericCorrect(question, answer) {
  if (typeof answer.numericAnswer !== "number" || typeof question.numericAnswer !== "number") {
    return false;
  }

  const tolerance = typeof question.numericTolerance === "number" ? question.numericTolerance : 0;
  return Math.abs(answer.numericAnswer - question.numericAnswer) <= tolerance;
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

function calculateAwardedPoints(question, answer, reviewPayload) {
  if (typeof reviewPayload.awardedPoints === "number") {
    return reviewPayload.awardedPoints;
  }

  if (reviewPayload.reviewStatus === "correct") {
    const basePoints = question.points || 0;
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
  isFiftyFiftyCorrect,
  isMultipleChoiceCorrect,
  isNumericCorrect,
  isOpenTextExactCorrect,
  isOrderingCorrect,
  normalizeAnswer,
  recalculateAnswerScore,
};
