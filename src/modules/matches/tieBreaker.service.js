const mongoose = require("mongoose");
const Match = require("./match.model");
const Team = require("./team.model");
const TieBreaker = require("./tieBreaker.model");
const Question = require("../questions/question.model");
const { TEAM_STATUS } = require("../../constants/teamStatus");
const scoringService = require("./scoring.service");

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeAnswer(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isExactTieBreakerAnswer(question, answerText) {
  const expectedParts = (question.correctAnswers || []).filter(Boolean);

  if (expectedParts.length > 1) {
    const submittedParts = String(answerText || "")
      .split("|")
      .map(normalizeAnswer)
      .filter(Boolean);
    return (
      submittedParts.length === expectedParts.length &&
      expectedParts.every(
        (expected, index) => normalizeAnswer(expected) === submittedParts[index]
      )
    );
  }

  const possibleAnswers = [question.correctAnswer, ...expectedParts]
    .filter(Boolean)
    .map(normalizeAnswer);
  return possibleAnswers.includes(normalizeAnswer(answerText));
}

function getAutomaticReviewStatus(question, answerText) {
  const expectedParts = (question.correctAnswers || []).filter(Boolean);
  if (question.type === "name_that_tune" && expectedParts.length > 1) {
    const submittedParts = String(answerText || "")
      .split("|")
      .map(normalizeAnswer);
    const correctCount = expectedParts.reduce(
      (count, expected, index) =>
        count + (normalizeAnswer(expected) === submittedParts[index] ? 1 : 0),
      0
    );
    if (correctCount === expectedParts.length) return "correct";
    if (correctCount > 0) return "partial";
    return "incorrect";
  }
  return isExactTieBreakerAnswer(question, answerText) ? "correct" : "incorrect";
}

function getTieBreakerPoints(question, reviewStatus) {
  const basePoints = Number(question.points) || 10;
  const answerCount = Math.max((question.correctAnswers || []).filter(Boolean).length, 1);
  const fullPoints = question.type === "name_that_tune"
    ? basePoints * answerCount
    : basePoints;
  if (reviewStatus === "correct") return fullPoints;
  if (reviewStatus === "partial" && question.type === "name_that_tune") {
    return fullPoints / 2;
  }
  return 0;
}

async function ownedMatch(matchDbId, hostId) {
  if (!mongoose.isValidObjectId(matchDbId)) throw httpError("Match not found.", 404);
  const match = await Match.findOne({ _id: matchDbId, hostId });
  if (!match) throw httpError("Match not found.", 404);
  return match;
}

function hostView(session) {
  if (!session) return null;
  const value = session.toObject ? session.toObject() : session;
  return { ...value, id: value._id.toString(), _id: undefined };
}

async function getHostSession(matchDbId, hostId) {
  await ownedMatch(matchDbId, hostId);
  return hostView(await TieBreaker.findOne({ matchDbId }).sort({ createdAt: -1 }));
}

async function startSession(matchDbId, hostId, payload) {
  const match = await ownedMatch(matchDbId, hostId);
  const teamIds = [...new Set((payload.teamIds || []).map(String))];
  if (teamIds.length < 2) throw httpError("Select at least two teams.", 400);
  if (!mongoose.isValidObjectId(payload.questionId) || teamIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw httpError("Invalid question or team selection.", 400);
  }

  const [question, teams] = await Promise.all([
    Question.findOne({
      _id: payload.questionId,
      status: "active",
      usageType: "tie_breaker",
    }).lean(),
    Team.find({ _id: { $in: teamIds }, matchDbId: match._id, status: { $ne: TEAM_STATUS.REMOVED } }).lean(),
  ]);
  if (!question) throw httpError("Tie-breaker question not found.", 404);
  if (teams.length !== teamIds.length) throw httpError("One or more selected teams are unavailable.", 400);

  await TieBreaker.updateMany({ matchDbId: match._id, status: "open" }, { status: "closed", closedAt: new Date() });
  const session = await TieBreaker.create({
    matchDbId: match._id,
    matchId: match.matchId,
    questionId: question._id,
    question: question,
    responses: teams.map((team) => ({ teamId: team._id, teamName: team.teamName })),
  });
  return hostView(session);
}

async function judgeSession(matchDbId, hostId, payload) {
  await ownedMatch(matchDbId, hostId);
  if (!mongoose.isValidObjectId(payload.winnerTeamId)) throw httpError("Select a winning team.", 400);
  const session = await TieBreaker.findOne({ matchDbId, status: "open" });
  if (!session) throw httpError("No active tie-breaker exists.", 404);
  if (!session.responses.some((item) => item.teamId.toString() === payload.winnerTeamId)) {
    throw httpError("The winner must be one of the selected teams.", 400);
  }
  session.responses.forEach((item) => { item.result = item.teamId.toString() === payload.winnerTeamId ? "winner" : "not_winner"; });
  session.status = "closed";
  session.closedAt = new Date();
  await session.save();
  return hostView(session);
}

async function reviewResponse(matchDbId, hostId, payload) {
  await ownedMatch(matchDbId, hostId);
  if (!mongoose.isValidObjectId(payload.teamId) || !["correct", "partial", "incorrect"].includes(payload.reviewStatus)) {
    throw httpError("Provide a valid team and review status.", 400);
  }
  const session = await TieBreaker.findOne({ matchDbId }).sort({ createdAt: -1 });
  if (!session) throw httpError("No tie-breaker exists.", 404);
  const response = session.responses.find((item) => item.teamId.toString() === payload.teamId);
  if (!response || !response.submittedAt) throw httpError("That team has not submitted a response.", 400);

  if (session.revealedAt) {
    const previousPoints = Number(response.pointsAwarded) || 0;
    const nextPoints = getTieBreakerPoints(session.question, payload.reviewStatus);
    const pointsChange = nextPoints - previousPoints;

    if (pointsChange > 0) {
      await scoringService.addTeamScore(matchDbId, response.teamId.toString(), hostId, {
        points: pointsChange,
        reason: "Tie-breaker grading updated",
        note: `Tie-breaker question: ${session.question.questionText}`,
      });
    } else if (pointsChange < 0) {
      await scoringService.deductTeamScore(matchDbId, response.teamId.toString(), hostId, {
        points: Math.abs(pointsChange),
        reason: "Tie-breaker grading updated",
        note: `Tie-breaker question: ${session.question.questionText}`,
      });
    }

    response.pointsAwarded = nextPoints;
  }

  response.reviewStatus = payload.reviewStatus;
  if (session.revealedAt) {
    const correctResponses = session.responses.filter(
      (item) => item.reviewStatus === "correct"
    );
    session.responses.forEach((item) => {
      item.result =
        correctResponses.length === 1 && item.reviewStatus === "correct"
          ? "winner"
          : "not_winner";
    });
  }
  await session.save();
  return hostView(session);
}

async function revealSession(matchDbId, hostId) {
  await ownedMatch(matchDbId, hostId);
  const session = await TieBreaker.findOne({ matchDbId, status: "open" });
  if (!session) throw httpError("No active tie-breaker exists.", 404);
  if (session.responses.some((item) => !item.submittedAt)) {
    throw httpError("Wait for every selected team to submit before revealing.", 400);
  }

  session.responses.forEach((item) => {
    if (item.reviewStatus === "pending") {
      item.reviewStatus = getAutomaticReviewStatus(session.question, item.answerText);
    }
  });

  const correct = session.responses.filter((item) => item.reviewStatus === "correct");
  const awardedResponses = session.responses.filter((item) =>
    ["correct", "partial"].includes(item.reviewStatus)
  );
  for (const response of awardedResponses) {
    if (!response.pointsAwarded) {
      const points = getTieBreakerPoints(session.question, response.reviewStatus);
      await scoringService.addTeamScore(matchDbId, response.teamId.toString(), hostId, {
        points,
        reason: "Correct tie-breaker answer",
        note: `Tie-breaker question: ${session.question.questionText}`,
      });
      response.pointsAwarded = points;
      await session.save();
    }
  }
  session.responses.forEach((item) => {
    item.result = correct.length === 1 && item.reviewStatus === "correct" ? "winner" : "not_winner";
  });
  session.status = "closed";
  session.revealedAt = new Date();
  session.closedAt = new Date();
  await session.save();
  return hostView(session);
}

async function getPlayerSession(player) {
  const session = await TieBreaker.findOne({ matchDbId: player.matchDbId, "responses.teamId": player.teamId }).sort({ createdAt: -1 }).lean();
  if (!session) return null;
  const response = session.responses.find((item) => item.teamId.toString() === player.teamId);
  return {
    id: session._id.toString(), status: session.status, revealedAt: session.revealedAt, question: {
      questionText: session.question.questionText, category: session.question.category,
      type: session.question.type, imageUrl: session.question.imageUrl, audioUrl: session.question.audioUrl,
      options: session.question.type === "fifty_fifty"
        ? (session.question.fiftyFiftyOptions || []).map((text) => ({ text, label: text }))
        : (session.question.options || []),
      answerCount: Math.max((session.question.correctAnswers || []).filter(Boolean).length, 1),
      points: getTieBreakerPoints(session.question, "correct"),
      ...(session.revealedAt ? { correctAnswer: session.question.correctAnswers?.join(", ") || session.question.correctAnswer || String(session.question.numericAnswer ?? "") } : {}),
    }, response: { answerText: response.answerText, submittedAt: response.submittedAt, result: response.result, reviewStatus: response.reviewStatus, pointsAwarded: response.pointsAwarded },
  };
}

async function submitPlayerResponse(player, answerText) {
  const value = String(answerText || "").trim();
  if (!value) throw httpError("Answer is required.", 400);
  if (value.length > 1000) throw httpError("Answer must be 1000 characters or fewer.", 400);
  const session = await TieBreaker.findOne({ matchDbId: player.matchDbId, status: "open", "responses.teamId": player.teamId });
  if (!session) throw httpError("No active tie-breaker is available for your team.", 404);
  const response = session.responses.find((item) => item.teamId.toString() === player.teamId);
  if (response.submittedAt) throw httpError("Your tie-breaker answer has already been submitted.", 409);
  response.answerText = value;
  response.submittedAt = new Date();
  await session.save();
  return { answerText: response.answerText, submittedAt: response.submittedAt, result: response.result };
}

module.exports = { getHostSession, getPlayerSession, judgeSession, revealSession, reviewResponse, startSession, submitPlayerResponse };
