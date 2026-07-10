const mongoose = require("mongoose");

const { REVIEW_STATUS } = require("../../constants/answerStatus");
const { SCORE_ACTION_TYPES } = require("../../constants/scoringStatus");
const SOCKET_EVENTS = require("../../constants/socketEvents");
const { TEAM_STATUS } = require("../../constants/teamStatus");
const { emitTeamEvent } = require("../../sockets/player.socket");
const {
  emitAnswerReviewed,
  emitLeaderboardUpdated,
  emitTeamScoreUpdated,
} = require("../../sockets/leaderboard.socket");
const {
  applyScoreChange,
  calculateAwardedPoints,
  calculateMatchedAnswerPoints,
  calculateWagerPoints,
  getQuestionPoints,
  isFiftyFiftyCorrect,
  isMultipleChoiceCorrect,
  isNumericCorrect,
  isOpenTextExactCorrect,
  isOrderingCorrect,
  recalculateAnswerScore,
} = require("../../utils/scoring");
const Answer = require("./answer.model");
const Match = require("./match.model");
const ScoreLog = require("./scoreLog.model");
const Team = require("./team.model");
const Question = require("../questions/question.model");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureObjectId(id, message) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(message, 404);
  }
}

function toObject(document) {
  if (!document) {
    return null;
  }

  const data = typeof document.toObject === "function" ? document.toObject() : document;
  delete data.__v;
  if (data._id) {
    data.id = data._id.toString();
    delete data._id;
  }
  return data;
}

function toTeamScore(team) {
  return {
    bonusPoints: team.bonusPoints || 0,
    teamId: team._id ? team._id.toString() : team.id,
    teamName: team.teamName,
    score: team.score || 0,
    rank: team.rank,
    status: team.status,
  };
}

async function ensureHostOwnsMatch(hostId, matchDbId) {
  ensureObjectId(matchDbId, "Match not found.");

  const match = await Match.findOne({ _id: matchDbId, hostId });

  if (!match) {
    throw createHttpError("Only the assigned host can score this match.", 403);
  }

  return match;
}

async function ensureAnswerBelongsToMatch(answerId, matchDbId) {
  ensureObjectId(answerId, "Answer not found.");

  const answer = await Answer.findOne({ _id: answerId, matchDbId });

  if (!answer) {
    throw createHttpError("Answer does not belong to this match.", 404);
  }

  return answer;
}

async function ensureTeamBelongsToMatch(teamId, matchDbId) {
  ensureObjectId(teamId, "Team not found.");

  const team = await Team.findOne({ _id: teamId, matchDbId });

  if (!team) {
    throw createHttpError("Team does not belong to this match.", 404);
  }

  return team;
}

function getAnswerActionType(answer, reviewStatus) {
  if (hasWagerAmount(answer)) {
    return reviewStatus === REVIEW_STATUS.CORRECT
      ? SCORE_ACTION_TYPES.WAGER_CORRECT
      : SCORE_ACTION_TYPES.WAGER_INCORRECT;
  }

  if (reviewStatus === REVIEW_STATUS.CORRECT) {
    return SCORE_ACTION_TYPES.ANSWER_CORRECT;
  }

  if (reviewStatus === REVIEW_STATUS.PARTIAL) {
    return SCORE_ACTION_TYPES.ANSWER_PARTIAL;
  }

  return SCORE_ACTION_TYPES.ANSWER_INCORRECT;
}

function getIsCorrect(reviewStatus) {
  if (reviewStatus === REVIEW_STATUS.CORRECT) return true;
  if (reviewStatus === REVIEW_STATUS.INCORRECT) return false;
  return null;
}

function getWagerAwardedPoints(answer, reviewStatus) {
  if (reviewStatus === REVIEW_STATUS.PARTIAL) {
    return answer.awardedPoints || 0;
  }

  return calculateWagerPoints(answer, reviewStatus === REVIEW_STATUS.CORRECT);
}

function hasWagerAmount(answer) {
  return typeof answer?.wagerAmount === "number";
}

function hasSubmittedAnswerValue(answer) {
  return Boolean(
    answer &&
      (
        (typeof answer.answerText === "string" && answer.answerText.trim()) ||
        (typeof answer.selectedOption === "string" && answer.selectedOption.trim()) ||
        (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) ||
        (Array.isArray(answer.orderingAnswer) && answer.orderingAnswer.length > 0) ||
        typeof answer.numericAnswer === "number"
      )
  );
}

async function createScoreLog(payload) {
  return ScoreLog.create(payload);
}

async function updateTeamRanks(matchDbId) {
  const teams = await Team.find({ matchDbId }).sort({ score: -1, joinedAt: 1 });
  let previousScore = null;
  let previousRank = 0;

  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index];
    const rank = previousScore === team.score ? previousRank : index + 1;
    team.rank = rank;
    previousRank = rank;
    previousScore = team.score;
    await team.save();
  }

  return teams;
}

function emitScoreEvents(match, team, scoreLog, answer = null) {
  const payload = {
    matchId: match.matchId,
    teamId: team._id.toString(),
    teamName: team.teamName,
    score: team.score,
    rank: team.rank,
    questionId: answer && answer.questionId ? answer.questionId.toString() : null,
  };

  if (answer) {
    emitAnswerReviewed(match, answer, team);
    emitTeamEvent(SOCKET_EVENTS.ANSWER_REVIEWED, match, {
      ...payload,
      answerId: answer._id.toString(),
      reviewStatus: answer.reviewStatus,
      awardedPoints: answer.awardedPoints,
    });
  }

  emitTeamScoreUpdated(match, team);
  emitLeaderboardUpdated(match, {
    matchId: match.matchId,
  });
  emitTeamEvent(SOCKET_EVENTS.SCORE_UPDATED, match, payload);
  emitTeamEvent(SOCKET_EVENTS.SCORE_LOG_CREATED, match, toObject(scoreLog));
}

async function applyAnswerReview(match, answer, team, question, hostId, payload) {
  if (team.status === TEAM_STATUS.REMOVED) {
    throw createHttpError("Cannot score a removed team.", 400);
  }

  let awardedPoints;
  let pointsChange;

  if (hasWagerAmount(answer) && payload.reviewStatus !== REVIEW_STATUS.PARTIAL) {
    awardedPoints = getWagerAwardedPoints(answer, payload.reviewStatus);
    pointsChange = awardedPoints - (answer.awardedPoints || 0);
  } else {
    const recalculated = recalculateAnswerScore(answer, question, team, payload);
    awardedPoints = recalculated.awardedPoints;
    pointsChange = recalculated.pointsChange;
  }

  const { previousScore, newScore } = applyScoreChange(team, pointsChange);
  await team.save();

  answer.reviewStatus = payload.reviewStatus;
  answer.isCorrect = getIsCorrect(payload.reviewStatus);
  answer.awardedPoints = awardedPoints;
  answer.reviewedBy = hostId;
  answer.reviewedAt = new Date();
  answer.hostNote = payload.note || "";
  await answer.save();

  const scoreLog = await createScoreLog({
    matchDbId: match._id,
    matchId: match.matchId,
    teamId: team._id,
    teamName: team.teamName,
    questionId: answer.questionId,
    answerId: answer._id,
    actionType: getAnswerActionType(answer, payload.reviewStatus),
    pointsChange,
    previousScore,
    newScore,
    reason: `Answer marked ${payload.reviewStatus}`,
    note: payload.note || "",
    performedBy: hostId,
    performedByRole: "host",
  });

  await updateTeamRanks(match._id);
  const updatedTeam = await Team.findById(team._id);
  emitScoreEvents(match, updatedTeam, scoreLog, answer);
  emitTeamEvent(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, {
    matchId: match.matchId,
  });

  return {
    answer: toObject(answer),
    scoreLog: toObject(scoreLog),
    team: toTeamScore(updatedTeam),
  };
}

async function reviewAnswer(matchDbId, answerId, hostId, payload) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  const answer = await ensureAnswerBelongsToMatch(answerId, matchDbId);
  const team = await ensureTeamBelongsToMatch(answer.teamId, matchDbId);
  const question = await Question.findById(answer.questionId);

  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  if (payload.reviewStatus === REVIEW_STATUS.PARTIAL) {
    const maxPoints = getQuestionPoints(question);
    if (payload.awardedPoints > maxPoints && answer.questionType !== "wager") {
      payload.awardedPoints = maxPoints;
    }
  }

  return applyAnswerReview(match, answer, team, question, hostId, payload);
}

async function bulkReviewAnswers(matchDbId, hostId, reviews) {
  await ensureHostOwnsMatch(hostId, matchDbId);

  const results = [];
  const errors = [];

  for (const review of reviews) {
    try {
      const result = await reviewAnswer(matchDbId, review.answerId, hostId, review);
      results.push(result);
    } catch (error) {
      errors.push({
        answerId: review.answerId,
        message: error.message,
      });
    }
  }

  const match = await Match.findById(matchDbId);
  emitTeamEvent(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, {
    matchId: match.matchId,
  });

  return {
    errors,
    failedCount: errors.length,
    successCount: results.length,
    results,
  };
}

function getAutoGradeStatus(question, answer) {
  if (hasWagerAmount(answer) && !hasSubmittedAnswerValue(answer)) {
    return REVIEW_STATUS.PENDING;
  }

  if (question.type === "multiple_choice" && isMultipleChoiceCorrect(question, answer)) {
    return REVIEW_STATUS.CORRECT;
  }

  if (question.type === "fifty_fifty" && isFiftyFiftyCorrect(question, answer)) {
    return REVIEW_STATUS.CORRECT;
  }

  if (question.type === "ordering" && isOrderingCorrect(question, answer)) {
    return REVIEW_STATUS.CORRECT;
  }

  const exactTextTypes = ["audio", "image", "name_that_tune", "open_text", "speed"];

  if (exactTextTypes.includes(question.type) && isOpenTextExactCorrect(question, answer)) {
    return REVIEW_STATUS.CORRECT;
  }

  if (question.type === "numeric_estimate" && isNumericCorrect(question, answer)) {
    return REVIEW_STATUS.CORRECT;
  }

  if (["multiple_choice", "fifty_fifty", "ordering", "open_text", "numeric_estimate", ...exactTextTypes].includes(question.type)) {
    return REVIEW_STATUS.INCORRECT;
  }

  return REVIEW_STATUS.PENDING;
}

function getAutoGradeReview(question, answer) {
  const matchedAnswers = calculateMatchedAnswerPoints(question, answer);

  if (matchedAnswers) {
    if (matchedAnswers.correctCount === matchedAnswers.totalAnswers) {
      return { reviewStatus: REVIEW_STATUS.CORRECT };
    }

    if (matchedAnswers.correctCount === 0) {
      return { reviewStatus: REVIEW_STATUS.INCORRECT };
    }

    return {
      reviewStatus: REVIEW_STATUS.PARTIAL,
      awardedPoints: matchedAnswers.awardedPoints,
    };
  }

  return { reviewStatus: getAutoGradeStatus(question, answer) };
}

async function autoGradeQuestion(matchDbId, questionId, hostId) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  const question = await Question.findById(questionId);

  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  const answers = await Answer.find({ matchDbId, questionId });
  let gradedCount = 0;
  let pendingCount = 0;
  const errors = [];

  for (const answer of answers) {
    if (answer.reviewStatus !== REVIEW_STATUS.PENDING) {
      continue;
    }

    const review = getAutoGradeReview(question, answer);
    const { reviewStatus } = review;

    if (reviewStatus === REVIEW_STATUS.PENDING) {
      pendingCount += 1;
      continue;
    }

    try {
      const team = await ensureTeamBelongsToMatch(answer.teamId, matchDbId);
      await applyAnswerReview(match, answer, team, question, hostId, { ...review, note: "Auto-graded" });
      gradedCount += 1;
    } catch (error) {
      errors.push({
        answerId: answer._id.toString(),
        message: error.message,
      });
    }
  }

  return {
    errors,
    gradedCount,
    pendingCount,
  };
}

async function autoReviewSubmittedAnswer(match, answer, team, question) {
  const review = getAutoGradeReview(question, answer);
  const { reviewStatus } = review;

  if (reviewStatus === REVIEW_STATUS.PENDING) {
    return null;
  }

  return applyAnswerReview(match, answer, team, question, match.hostId, {
    ...review,
    note: "Auto-graded on submit",
  });
}

async function applyManualScoreChange(matchDbId, teamId, hostId, payload, actionType, pointsChange) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  const team = await ensureTeamBelongsToMatch(teamId, matchDbId);
  const { previousScore, newScore } = applyScoreChange(team, pointsChange);

  await team.save();

  const scoreLog = await createScoreLog({
    matchDbId: match._id,
    matchId: match.matchId,
    teamId: team._id,
    teamName: team.teamName,
    questionId: null,
    answerId: null,
    actionType,
    pointsChange: newScore - previousScore,
    previousScore,
    newScore,
    reason: payload.reason,
    note: payload.note || "",
    performedBy: hostId,
    performedByRole: "host",
  });

  await updateTeamRanks(match._id);
  const updatedTeam = await Team.findById(team._id);
  emitScoreEvents(match, updatedTeam, scoreLog);
  emitTeamEvent(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, {
    matchId: match.matchId,
  });

  return {
    scoreLog: toObject(scoreLog),
    team: toTeamScore(updatedTeam),
  };
}

function addTeamScore(matchDbId, teamId, hostId, payload) {
  return applyManualScoreChange(
    matchDbId,
    teamId,
    hostId,
    payload,
    SCORE_ACTION_TYPES.MANUAL_ADD,
    payload.points
  );
}

function deductTeamScore(matchDbId, teamId, hostId, payload) {
  return applyManualScoreChange(
    matchDbId,
    teamId,
    hostId,
    payload,
    SCORE_ACTION_TYPES.MANUAL_DEDUCT,
    -payload.points
  );
}

async function overrideTeamScore(matchDbId, teamId, hostId, payload) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  const team = await ensureTeamBelongsToMatch(teamId, matchDbId);
  const previousScore = team.score || 0;
  const newScore = payload.newScore;

  team.score = newScore;
  await team.save();

  const scoreLog = await createScoreLog({
    matchDbId: match._id,
    matchId: match.matchId,
    teamId: team._id,
    teamName: team.teamName,
    questionId: null,
    answerId: null,
    actionType: SCORE_ACTION_TYPES.SCORE_OVERRIDE,
    pointsChange: newScore - previousScore,
    previousScore,
    newScore,
    reason: payload.reason,
    note: payload.note || "",
    performedBy: hostId,
    performedByRole: "host",
  });

  await updateTeamRanks(match._id);
  const updatedTeam = await Team.findById(team._id);
  emitScoreEvents(match, updatedTeam, scoreLog);
  emitTeamEvent(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, {
    matchId: match.matchId,
  });

  return {
    scoreLog: toObject(scoreLog),
    team: toTeamScore(updatedTeam),
  };
}

async function setTeamBonusScore(matchDbId, teamId, hostId, payload) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  const team = await ensureTeamBelongsToMatch(teamId, matchDbId);
  const previousScore = team.score || 0;
  const previousBonusPoints = team.bonusPoints || 0;
  const nextBonusPoints = Math.max(0, Number(payload.bonusPoints) || 0);
  const pointsChange = nextBonusPoints - previousBonusPoints;
  const newScore = Math.max(0, previousScore + pointsChange);

  team.bonusPoints = nextBonusPoints;
  team.score = newScore;
  await team.save();

  const scoreLog = await createScoreLog({
    matchDbId: match._id,
    matchId: match.matchId,
    teamId: team._id,
    teamName: team.teamName,
    questionId: null,
    answerId: null,
    actionType: SCORE_ACTION_TYPES.BONUS_SET,
    pointsChange,
    previousScore,
    newScore,
    reason: payload.reason,
    note: payload.note || "",
    performedBy: hostId,
    performedByRole: "host",
  });

  await updateTeamRanks(match._id);
  const updatedTeam = await Team.findById(team._id);
  emitScoreEvents(match, updatedTeam, scoreLog);
  emitTeamEvent(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, {
    matchId: match.matchId,
  });

  return {
    scoreLog: toObject(scoreLog),
    team: toTeamScore(updatedTeam),
  };
}

async function getScoreLogs(matchDbId, hostId, query) {
  await ensureHostOwnsMatch(hostId, matchDbId);

  const filter = { matchDbId };
  if (query.teamId) filter.teamId = query.teamId;
  if (query.questionId) filter.questionId = query.questionId;
  if (query.actionType) filter.actionType = query.actionType;

  const skip = (query.page - 1) * query.pageSize;
  const [logs, total] = await Promise.all([
    ScoreLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    ScoreLog.countDocuments(filter),
  ]);

  return {
    items: logs.map(toObject),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getMatchScores(matchDbId, user) {
  ensureObjectId(matchDbId, "Match not found.");

  const filter = { _id: matchDbId };
  if (user.role === "host") {
    filter.hostId = user.id;
  }

  const match = await Match.findOne(filter);
  if (!match) {
    throw createHttpError(user.role === "host" ? "Only the assigned host can score this match." : "Match not found.", 404);
  }

  const teams = await updateTeamRanks(match._id);

  return {
    items: teams.sort((left, right) => {
      if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
      return (left.rank || 0) - (right.rank || 0);
    }).map(toTeamScore),
  };
}

module.exports = {
  addTeamScore,
  autoGradeQuestion,
  autoReviewSubmittedAnswer,
  bulkReviewAnswers,
  createScoreLog,
  deductTeamScore,
  ensureAnswerBelongsToMatch,
  ensureHostOwnsMatch,
  ensureTeamBelongsToMatch,
  getMatchScores,
  getScoreLogs,
  overrideTeamScore,
  reviewAnswer,
  setTeamBonusScore,
  updateTeamRanks,
};
