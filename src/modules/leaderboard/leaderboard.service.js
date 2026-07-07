const mongoose = require("mongoose");

const { TEAM_STATUS } = require("../../constants/teamStatus");
const { getQuestionPoints } = require("../../utils/scoring");
const Answer = require("../matches/answer.model");
const Game = require("../games/game.model");
const Match = require("../matches/match.model");
const Team = require("../matches/team.model");
const Question = require("../questions/question.model");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureObjectId(id, message = "Match not found.") {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(message, 404);
  }
}

function toLeaderboardItem(team, rank) {
  return {
    teamId: team._id.toString(),
    teamName: team.teamName,
    score: team.score || 0,
    rank,
    status: team.status,
    lastSeenAt: team.lastSeenAt,
  };
}

async function getMatchByDbId(matchDbId) {
  ensureObjectId(matchDbId);

  const match = await Match.findById(matchDbId).lean();

  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  return match;
}

async function getMatchByPublicId(matchId) {
  const match = await Match.findOne({ matchId: matchId.toUpperCase() }).lean();

  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  return match;
}

async function getMatchLeaderboard(matchDbId) {
  ensureObjectId(matchDbId);

  const teams = await Team.find({
    matchDbId,
    status: { $ne: TEAM_STATUS.REMOVED },
  })
    .select("teamName score rank status lastSeenAt joinedAt")
    .sort({ score: -1, joinedAt: 1 })
    .lean();

  return teams.map((team, index) => toLeaderboardItem(team, index + 1));
}

async function getPlayerLeaderboard(playerPayload) {
  const items = await getMatchLeaderboard(playerPayload.matchDbId);

  return {
    myTeamId: playerPayload.teamId,
    items,
    myTeam: items.find((item) => item.teamId === playerPayload.teamId) || null,
  };
}

async function getPublicLeaderboard(matchId) {
  const match = await getMatchByPublicId(matchId);
  const items = await getMatchLeaderboard(match._id);

  return {
    gameTitle: match.gameTitle,
    locationName: match.locationName,
    matchId: match.matchId,
    currentState: match.currentState,
    items,
  };
}

async function ensureHostCanAccessMatch(hostId, matchDbId) {
  ensureObjectId(matchDbId);

  const match = await Match.findOne({ _id: matchDbId, hostId }).lean();

  if (!match) {
    throw createHttpError("You do not have access to this match.", 403);
  }

  return match;
}

async function getHostLeaderboard(matchDbId, hostId) {
  const match = await ensureHostCanAccessMatch(hostId, matchDbId);
  const items = await getMatchLeaderboard(match._id);
  const submittedCount = match.currentQuestionId
    ? await Answer.countDocuments({ matchDbId: match._id, questionId: match.currentQuestionId })
    : 0;

  return {
    totalTeams: items.length,
    submittedCount,
    currentState: match.currentState,
    currentQuestionId: match.currentQuestionId,
    items,
  };
}

function getCorrectAnswerDisplay(question) {
  if (!question) return "";
  if (Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0) {
    return question.correctAnswers.join(", ");
  }
  if (Array.isArray(question.orderingAnswer) && question.orderingAnswer.length > 0) {
    return question.orderingAnswer.join(", ");
  }
  if (question.numericAnswer !== null && question.numericAnswer !== undefined) {
    return String(question.numericAnswer);
  }
  return question.correctAnswer || "";
}

function safeQuestionData(question, includeAnswer = false, extra = {}) {
  if (!question) {
    return null;
  }

  const canShowOptions = ["multiple_choice", "fifty_fifty", "ordering"].includes(question.type);
  const options =
    question.type === "fifty_fifty"
      ? (question.fiftyFiftyOptions || []).map((option) => ({ label: option, text: option }))
      : question.options || [];

  return {
    questionId: question._id.toString(),
    questionText: question.questionText,
    category: question.category,
    type: question.type,
    mediaType: question.mediaType,
    imageUrl: question.mediaType === "image" ? question.imageUrl : "",
    options: canShowOptions ? options : [],
    estimatedTimeSeconds: question.estimatedTimeSeconds,
    isFinalRound: Boolean(extra.isFinalRound),
    maxWagerPercent: question.maxWagerPercent || 50,
    points: getQuestionPoints(question),
    answerCount: Math.max((question.correctAnswers || []).filter(Boolean).length, 1),
    answer: includeAnswer ? getCorrectAnswerDisplay(question) : "",
    notes: includeAnswer && question.type === "multiple_choice" ? question.notes || "" : "",
  };
}

async function getCurrentSafeQuestion(match, includeWhenClosed = false) {
  if (!match.currentQuestionId) {
    return null;
  }

  if (match.isIntermission || match.currentState === "intermission") {
    return null;
  }

  const isVisible = match.isQuestionOpen || match.isAnswerRevealed || includeWhenClosed;
  if (!isVisible) {
    return null;
  }

  const [question, game] = await Promise.all([
    Question.findById(match.currentQuestionId).lean(),
    Game.findById(match.gameId).select("finalRound.questionIds").lean(),
  ]);
  const finalQuestionIds = (game?.finalRound?.questionIds || []).map((questionId) => questionId.toString());

  const isFinalRound = finalQuestionIds.includes(match.currentQuestionId.toString());
  const safeQuestion = isFinalRound && !match.isFinalQuestionRevealed
    ? {
        ...question,
        questionText: "Final Round Wager",
      }
    : question;

  return safeQuestionData(safeQuestion, Boolean(match.isAnswerRevealed), {
    isFinalRound,
  });
}

async function getPlayerState(playerPayload) {
  const [match, team] = await Promise.all([
    Match.findById(playerPayload.matchDbId).lean(),
    Team.findById(playerPayload.teamId).lean(),
  ]);

  if (!match || !team) {
    throw createHttpError("Player session is invalid or expired.", 401);
  }

  if (team.activeDeviceId !== playerPayload.deviceId || team.status === TEAM_STATUS.REMOVED) {
    throw createHttpError("Player session is invalid or expired.", 401);
  }

  const [leaderboard, currentQuestion, currentAnswer] = await Promise.all([
    getMatchLeaderboard(match._id),
    getCurrentSafeQuestion(match, false),
    match.currentQuestionId
      ? Answer.findOne({
          matchDbId: match._id,
          teamId: team._id,
          questionId: match.currentQuestionId,
        })
          .select(
            "answerText selectedOption selectedOptions orderingAnswer numericAnswer wagerAmount submittedAnswerDisplay submittedAt isLocked reviewStatus"
          )
          .lean()
      : null,
  ]);
  const myRank = leaderboard.find((item) => item.teamId === team._id.toString());

  return {
    matchId: match.matchId,
    gameTitle: match.gameTitle,
    locationName: match.locationName,
    status: match.status,
    currentState: match.currentState,
    currentRoundIndex: match.currentRoundIndex,
    currentQuestionIndex: match.currentQuestionIndex,
    isQuestionOpen: match.isQuestionOpen,
    isAnswerRevealed: Boolean(match.isAnswerRevealed),
    isFinalQuestionRevealed: Boolean(match.isFinalQuestionRevealed),
    isIntermission: match.isIntermission,
    team: {
      teamId: team._id.toString(),
      teamName: team.teamName,
      score: team.score || 0,
      rank: myRank ? myRank.rank : team.rank,
      status: team.status,
      currentAnswerStatus: team.currentAnswerStatus,
    },
    currentQuestion,
    currentAnswer: currentAnswer
        ? {
          submittedAnswerDisplay: currentAnswer.submittedAnswerDisplay,
          answerText: currentAnswer.answerText,
          selectedOption: currentAnswer.selectedOption,
          selectedOptions: currentAnswer.selectedOptions || [],
          orderingAnswer: currentAnswer.orderingAnswer || [],
          numericAnswer: currentAnswer.numericAnswer,
          wagerAmount: currentAnswer.wagerAmount,
          submittedAt: currentAnswer.submittedAt,
          isLocked: currentAnswer.isLocked,
          reviewStatus: currentAnswer.reviewStatus,
        }
      : null,
  };
}

async function getPresentationState(matchId) {
  const match = await getMatchByPublicId(matchId);
  const [leaderboard, currentQuestion] = await Promise.all([
    getMatchLeaderboard(match._id),
    getCurrentSafeQuestion(match, true),
  ]);

  return {
    gameTitle: match.gameTitle,
    locationName: match.locationName,
    matchId: match.matchId,
    entryCode: match.entryCode,
    qrCodeUrl: match.qrCodeUrl,
    qrCodeDataUrl: match.qrCodeDataUrl,
    joinUrl: match.joinUrl,
    status: match.status,
    currentState: match.currentState,
    isQuestionOpen: match.isQuestionOpen,
    isAnswerRevealed: Boolean(match.isAnswerRevealed),
    isFinalQuestionRevealed: Boolean(match.isFinalQuestionRevealed),
    currentQuestion,
    leaderboard,
  };
}

async function validatePresentationAccess(matchId, entryCode) {
  const match = await getMatchByPublicId(matchId);

  if (match.entryCode !== entryCode) {
    throw createHttpError("Presentation access denied.", 403);
  }

  return match;
}

async function canAccessMatchByMatchId(socketContext, matchId) {
  const match = await getMatchByPublicId(matchId);

  if (socketContext.player) {
    return socketContext.player.matchId === match.matchId ? match : null;
  }

  if (socketContext.user && socketContext.user.role === "host") {
    return match.hostId.toString() === socketContext.user.id ? match : null;
  }

  if (socketContext.user && socketContext.user.role === "super_admin") {
    return match;
  }

  return null;
}

module.exports = {
  canAccessMatchByMatchId,
  ensureHostCanAccessMatch,
  getHostLeaderboard,
  getMatchByDbId,
  getMatchByPublicId,
  getMatchLeaderboard,
  getPlayerLeaderboard,
  getPlayerState,
  getPresentationState,
  getPublicLeaderboard,
  safeQuestionData,
  validatePresentationAccess,
};
