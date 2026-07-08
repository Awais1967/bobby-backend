const mongoose = require("mongoose");

const { ANSWER_STATUS, REVIEW_STATUS } = require("../../constants/answerStatus");
const { MATCH_CURRENT_STATE, MATCH_STATUS } = require("../../constants/matchStatus");
const SOCKET_EVENTS = require("../../constants/socketEvents");
const { CURRENT_ANSWER_STATUS, TEAM_STATUS } = require("../../constants/teamStatus");
const { emitTeamEvent } = require("../../sockets/player.socket");
const { emitAnswerSubmitted } = require("../../sockets/leaderboard.socket");
const { getQuestionPoints } = require("../../utils/scoring");
const Answer = require("../matches/answer.model");
const Game = require("../games/game.model");
const Match = require("../matches/match.model");
const Team = require("../matches/team.model");
const Question = require("../questions/question.model");
const playerService = require("./player.service");

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

function toAnswerResponse(answer, question = null) {
  if (!answer) {
    return null;
  }

  const data = typeof answer.toObject === "function" ? answer.toObject() : answer;
  const storedAwardedPoints = data.awardedPoints || 0;
  const awardedPoints =
    data.reviewStatus === REVIEW_STATUS.CORRECT &&
    storedAwardedPoints === 0 &&
    typeof data.wagerAmount !== "number" &&
    question
      ? getQuestionPoints(question)
      : storedAwardedPoints;

  return {
    id: data._id ? data._id.toString() : data.id,
    teamName: data.teamName,
    matchDbId: data.matchDbId ? data.matchDbId.toString() : null,
    matchId: data.matchId,
    questionId: data.questionId ? data.questionId.toString() : null,
    roundIndex: data.roundIndex,
    questionIndex: data.questionIndex,
    questionType: data.questionType,
    answerText: data.answerText,
    selectedOption: data.selectedOption,
    selectedOptions: data.selectedOptions,
    orderingAnswer: data.orderingAnswer,
    numericAnswer: data.numericAnswer,
    wagerAmount: data.wagerAmount,
    submittedAnswerDisplay: data.submittedAnswerDisplay,
    submittedAt: data.submittedAt,
    responseTimeMs: data.responseTimeMs,
    status: data.status,
    isLocked: data.isLocked,
    isCorrect: data.isCorrect,
    reviewStatus: data.reviewStatus,
    awardedPoints,
  };
}

function toHostAnswerResponse(answer) {
  const data = toAnswerResponse(answer);

  if (!data) {
    return null;
  }

  return {
    ...data,
    awardedPoints: answer.awardedPoints,
    teamId: answer.teamId ? answer.teamId.toString() : undefined,
    reopenedAt: answer.reopenedAt,
    reviewedAt: answer.reviewedAt,
    hostNote: answer.hostNote,
  };
}

function ensureTeamCanSubmit(team, playerDeviceId) {
  if (!team) {
    throw createHttpError("Team not found.", 404);
  }

  if (team.status === TEAM_STATUS.REMOVED || team.removedByHost) {
    throw createHttpError("This team has been removed from the match.", 403);
  }

  if (team.status !== TEAM_STATUS.ACTIVE) {
    throw createHttpError("Team is not active.", 403);
  }

  if (team.activeDeviceId !== playerDeviceId) {
    throw createHttpError("Only the active device can submit answers for this team.", 403);
  }
}

function ensureMatchQuestionIsOpen(match) {
  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  if (match.status !== MATCH_STATUS.LIVE) {
    throw createHttpError("Question is not open for submissions.", 400);
  }

  const isOpenForSubmission =
    match.currentState === MATCH_CURRENT_STATE.QUESTION_OPEN ||
    match.currentState === MATCH_CURRENT_STATE.FINAL_WAGER ||
    match.currentState === MATCH_CURRENT_STATE.FINAL_QUESTION;

  if (!isOpenForSubmission || !match.isQuestionOpen || !match.currentQuestionId) {
    throw createHttpError(match.currentQuestionId ? "Question is not open for submissions." : "No current question found.", 400);
  }
}

async function getCurrentQuestion(match) {
  if (!match.currentQuestionId) {
    throw createHttpError("No current question found.", 400);
  }

  const question = await Question.findById(match.currentQuestionId);

  if (!question) {
    throw createHttpError("No current question found.", 400);
  }

  return question;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPayloadAnswer(payload) {
  return (
    hasText(payload.answerText) ||
    hasText(payload.selectedOption) ||
    (Array.isArray(payload.selectedOptions) && payload.selectedOptions.length > 0) ||
    (Array.isArray(payload.orderingAnswer) && payload.orderingAnswer.length > 0) ||
    typeof payload.numericAnswer === "number"
  );
}

function getPreRevealWagerAmount(payload) {
  if (typeof payload.wagerAmount === "number") {
    return payload.wagerAmount;
  }

  const hasOnlyTextValue =
    hasText(payload.answerText) &&
    !hasText(payload.selectedOption) &&
    (!Array.isArray(payload.selectedOptions) || payload.selectedOptions.length === 0) &&
    (!Array.isArray(payload.orderingAnswer) || payload.orderingAnswer.length === 0) &&
    typeof payload.numericAnswer !== "number";

  if (!hasOnlyTextValue) {
    return null;
  }

  const wagerAmount = Number(payload.answerText.trim());
  return Number.isFinite(wagerAmount) ? wagerAmount : null;
}

function getMaxWagerAmount(question, team) {
  const maxWagerPercent = Math.min(Number(question.maxWagerPercent) || 50, 50);
  return Math.floor(((team.score || 0) * maxWagerPercent) / 100);
}

function validateWagerAmount(question, team, wagerAmount) {
  if (typeof wagerAmount !== "number" || !Number.isFinite(wagerAmount) || wagerAmount < 0) {
    throw createHttpError("Wager amount is required.", 400);
  }

  const maxWager = getMaxWagerAmount(question, team);

  if (wagerAmount > maxWager) {
    throw createHttpError("Wager amount exceeds allowed limit.", 400);
  }
}

function validateAnswerByQuestionType(question, payload, team) {
  const questionType = question.type;

  if (questionType === "open_text" || questionType === "name_that_tune" || questionType === "audio") {
    if (!hasText(payload.answerText)) {
      throw createHttpError("Answer text is required.", 400);
    }
  }

  if (questionType === "multiple_choice" || questionType === "fifty_fifty") {
    if (!hasText(payload.selectedOption)) {
      throw createHttpError("Selected option is required.", 400);
    }
  }

  if (questionType === "ordering") {
    if (!Array.isArray(payload.orderingAnswer) || payload.orderingAnswer.length === 0) {
      throw createHttpError("Ordering answer is required.", 400);
    }
  }

  if (questionType === "numeric_estimate") {
    if (typeof payload.numericAnswer !== "number") {
      throw createHttpError("Numeric answer is required.", 400);
    }
  }

  if (questionType === "image" || questionType === "speed") {
    const hasAnswerText = hasText(payload.answerText);
    const hasSelectedOption = hasText(payload.selectedOption);
    const expectsOption = Array.isArray(question.options) && question.options.length > 0;

    if (expectsOption && !hasSelectedOption) {
      throw createHttpError("Selected option is required.", 400);
    }

    if (!expectsOption && !hasAnswerText) {
      throw createHttpError("Answer text is required.", 400);
    }
  }

  if (questionType === "wager") {
    const hasWager = typeof payload.wagerAmount === "number";
    const hasFinalAnswer = hasText(payload.answerText) || hasText(payload.selectedOption);

    if (!hasWager && !hasFinalAnswer) {
      throw createHttpError("Wager amount is required.", 400);
    }

    if (hasWager) {
      validateWagerAmount(question, team, payload.wagerAmount);
    }

    return;
  }
}

function buildSubmittedAnswerDisplay(question, payload) {
  if (hasText(payload.answerText)) {
    return payload.answerText.trim();
  }

  if (hasText(payload.selectedOption)) {
    return payload.selectedOption.trim();
  }

  if (Array.isArray(payload.selectedOptions) && payload.selectedOptions.length > 0) {
    return payload.selectedOptions.join(", ");
  }

  if (Array.isArray(payload.orderingAnswer) && payload.orderingAnswer.length > 0) {
    return payload.orderingAnswer.join(" > ");
  }

  if (typeof payload.numericAnswer === "number") {
    return String(payload.numericAnswer);
  }

  if (typeof payload.wagerAmount === "number") {
    return `Wager: ${payload.wagerAmount}`;
  }

  return "";
}

function calculateResponseTime(match) {
  if (!match.timerStartedAt) {
    return 0;
  }

  return Math.max(0, Date.now() - new Date(match.timerStartedAt).getTime());
}

function findExistingAnswer(matchDbId, teamId, questionId) {
  return Answer.findOne({ matchDbId, teamId, questionId });
}

async function isCurrentFinalRoundQuestion(match) {
  if (!match.currentQuestionId) {
    return false;
  }

  const game = await Game.findById(match.gameId).select("finalRound.questionIds").lean();
  const finalQuestionIds = (game?.finalRound?.questionIds || []).map((questionId) => questionId.toString());
  return finalQuestionIds.includes(match.currentQuestionId.toString());
}

async function submitAnswer(playerPayload, answerPayload) {
  const [match, team] = await Promise.all([
    Match.findById(playerPayload.matchDbId),
    Team.findById(playerPayload.teamId),
  ]);

  ensureMatchQuestionIsOpen(match);
  ensureTeamCanSubmit(team, playerPayload.deviceId);

  const [question, isFinalRoundQuestion] = await Promise.all([
    getCurrentQuestion(match),
    isCurrentFinalRoundQuestion(match),
  ]);
  let answer = await findExistingAnswer(match._id, team._id, match.currentQuestionId);

  const isAwaitingFinalQuestionReveal = isFinalRoundQuestion && !match.isFinalQuestionRevealed;
  const preRevealWagerAmount = isAwaitingFinalQuestionReveal
    ? getPreRevealWagerAmount(answerPayload)
    : null;
  const isPreRevealWagerSubmission = preRevealWagerAmount !== null;

  if (isPreRevealWagerSubmission) {
    answerPayload = {
      wagerAmount: preRevealWagerAmount,
      answerText: "",
      selectedOption: "",
      selectedOptions: [],
      orderingAnswer: [],
    };
  } else if (isAwaitingFinalQuestionReveal && hasPayloadAnswer(answerPayload)) {
    throw createHttpError("Final question has not been revealed yet.", 400);
  }

  if (typeof answerPayload.wagerAmount === "number") {
    validateWagerAmount(question, team, answerPayload.wagerAmount);
  }

  const isFinalRoundWagerOnly =
    isFinalRoundQuestion &&
    typeof answerPayload.wagerAmount === "number" &&
    !hasText(answerPayload.answerText) &&
    !hasText(answerPayload.selectedOption) &&
    (
      isAwaitingFinalQuestionReveal ||
      answer?.wagerAmount === null ||
      answer?.wagerAmount === undefined
    );

  if (isFinalRoundWagerOnly) {
    validateWagerAmount(question, team, answerPayload.wagerAmount);
  } else {
    validateAnswerByQuestionType(question, answerPayload, team);
  }

  const isFinalWagerAnswer =
    isFinalRoundQuestion &&
    match.isFinalQuestionRevealed &&
    answer &&
    answer.isLocked &&
    answer.wagerAmount !== null &&
    !hasText(answer.answerText) &&
    (hasText(answerPayload.answerText) || hasText(answerPayload.selectedOption));

  if (answer && answer.isLocked && !isFinalWagerAnswer && !isPreRevealWagerSubmission) {
    throw createHttpError("Answer already submitted and locked.", 409);
  }

  const submittedAnswerDisplay = buildSubmittedAnswerDisplay(question, answerPayload);
  const answerData = {
    matchDbId: match._id,
    matchId: match.matchId,
    teamId: team._id,
    teamName: team.teamName,
    questionId: match.currentQuestionId,
    roundIndex: match.currentRoundIndex,
    questionIndex: match.currentQuestionIndex,
    questionType: question.type,
    answerText: answerPayload.answerText || "",
    selectedOption: answerPayload.selectedOption || "",
    selectedOptions: answerPayload.selectedOptions || [],
    orderingAnswer: answerPayload.orderingAnswer || [],
    numericAnswer:
      typeof answerPayload.numericAnswer === "number" ? answerPayload.numericAnswer : null,
    wagerAmount:
      typeof answerPayload.wagerAmount === "number" ? answerPayload.wagerAmount : answer?.wagerAmount ?? null,
    submittedAnswerDisplay,
    submittedAt: new Date(),
    responseTimeMs: calculateResponseTime(match),
    status: ANSWER_STATUS.SUBMITTED,
    isLocked: true,
    reviewStatus: REVIEW_STATUS.PENDING,
    submittedDeviceId: playerPayload.deviceId,
    submittedSocketId: answerPayload.submittedSocketId || "",
  };

  if (!answer) {
    answer = await Answer.create(answerData);
  } else {
    Object.assign(answer, answerData);
    await answer.save();
  }

  team.currentAnswerStatus = CURRENT_ANSWER_STATUS.SUBMITTED;
  team.lastSeenAt = new Date();
  await team.save();

  const response = toAnswerResponse(answer);
  emitAnswerSubmitted(match, response);
  emitTeamEvent(SOCKET_EVENTS.ANSWER_SUBMITTED, match, response);
  emitTeamEvent(SOCKET_EVENTS.TEAM_ANSWER_STATUS_UPDATED, match, {
    teamId: team._id.toString(),
    teamName: team.teamName,
    currentAnswerStatus: team.currentAnswerStatus,
  });

  return toAnswerResponse(answer);
}

async function getMyCurrentAnswer(playerPayload) {
  const match = await Match.findById(playerPayload.matchDbId);

  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  if (!match.currentQuestionId) {
    return null;
  }

  const answer = await Answer.findOne({
    matchDbId: match._id,
    teamId: playerPayload.teamId,
    questionId: match.currentQuestionId,
  });

  return toAnswerResponse(answer);
}

async function getMyAnswerHistory(playerPayload, query) {
  const skip = (query.page - 1) * query.pageSize;

  const [answers, total] = await Promise.all([
    Answer.find({
      matchDbId: playerPayload.matchDbId,
      teamId: playerPayload.teamId,
    })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(query.pageSize),
    Answer.countDocuments({
      matchDbId: playerPayload.matchDbId,
      teamId: playerPayload.teamId,
    }),
  ]);
  const questionIds = [...new Set(answers.map((answer) => answer.questionId?.toString()).filter(Boolean))];
  const questions = questionIds.length
    ? await Question.find({ _id: { $in: questionIds } }).lean()
    : [];
  const questionById = new Map(questions.map((question) => [question._id.toString(), question]));

  return {
    items: answers.map((answer) => toAnswerResponse(answer, questionById.get(answer.questionId?.toString()))),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function reopenAnswer(matchDbId, answerId, hostId) {
  ensureObjectId(answerId, "Answer not found.");
  const match = await playerService.ensureHostOwnsMatch(hostId, matchDbId);

  if (match.status !== MATCH_STATUS.LIVE) {
    throw createHttpError("Question is not open for submissions.", 400);
  }

  const answer = await Answer.findOne({ _id: answerId, matchDbId });

  if (!answer) {
    throw createHttpError("Answer not found.", 404);
  }

  answer.status = ANSWER_STATUS.REOPENED;
  answer.isLocked = false;
  answer.reopenedByHost = hostId;
  answer.reopenedAt = new Date();
  await answer.save();

  if (match.currentQuestionId && answer.questionId.toString() === match.currentQuestionId.toString()) {
    await Team.findByIdAndUpdate(answer.teamId, {
      currentAnswerStatus: CURRENT_ANSWER_STATUS.NOT_SUBMITTED,
    });
  }

  const response = toHostAnswerResponse(answer);
  emitTeamEvent(SOCKET_EVENTS.ANSWER_REOPENED, match, response);
  emitTeamEvent(SOCKET_EVENTS.TEAM_ANSWER_STATUS_UPDATED, match, {
    teamId: answer.teamId.toString(),
    teamName: answer.teamName,
    currentAnswerStatus: CURRENT_ANSWER_STATUS.NOT_SUBMITTED,
  });

  return response;
}

async function getCurrentQuestionSubmissions(matchDbId, hostId) {
  const match = await playerService.ensureHostOwnsMatch(hostId, matchDbId);

  if (!match.currentQuestionId) {
    return {
      items: [],
      total: 0,
    };
  }

  const answers = await Answer.find({
    matchDbId,
    questionId: match.currentQuestionId,
  }).sort({ submittedAt: 1 });

  return {
    items: answers.map(toHostAnswerResponse),
    total: answers.length,
  };
}

async function getAnswersByQuestion(matchDbId, questionId, hostId, query) {
  ensureObjectId(questionId, "No current question found.");
  await playerService.ensureHostOwnsMatch(hostId, matchDbId);

  const skip = (query.page - 1) * query.pageSize;

  const [answers, total] = await Promise.all([
    Answer.find({ matchDbId, questionId })
      .sort({ submittedAt: 1 })
      .skip(skip)
      .limit(query.pageSize),
    Answer.countDocuments({ matchDbId, questionId }),
  ]);

  return {
    items: answers.map(toHostAnswerResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

module.exports = {
  buildSubmittedAnswerDisplay,
  calculateResponseTime,
  ensureMatchQuestionIsOpen,
  ensureTeamCanSubmit,
  findExistingAnswer,
  getAnswersByQuestion,
  getCurrentQuestion,
  getCurrentQuestionSubmissions,
  getMyAnswerHistory,
  getMyCurrentAnswer,
  reopenAnswer,
  submitAnswer,
  validateAnswerByQuestionType,
};
