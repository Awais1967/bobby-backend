const mongoose = require("mongoose");

const {
  BILLING_STATUS,
  MATCH_CURRENT_STATE,
  MATCH_STATUS,
} = require("../../constants/matchStatus");
const SOCKET_EVENTS = require("../../constants/socketEvents");
const {
  emitMatchStateUpdated,
  emitQuestionStateUpdated,
} = require("../../sockets/leaderboard.socket");
const { emitMatchEvent } = require("../../sockets/match.socket");
const { generateEntryCode, generateMatchCode } = require("../../utils/generateMatchCode");
const generateQrCode = require("../../utils/generateQrCode");
const Game = require("../games/game.model");
const Host = require("../hosts/host.model");
const Location = require("../locations/location.model");
const billingService = require("../billing/billing.service");
const Question = require("../questions/question.model");
const Match = require("./match.model");

const ACTIVE_MATCH_STATUSES = [
  MATCH_STATUS.SETUP,
  MATCH_STATUS.WAITING,
  MATCH_STATUS.LIVE,
  MATCH_STATUS.INTERMISSION,
];

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureMatchObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Match not found.", 404);
  }
}

function idsEqual(left, right) {
  return left && right && left.toString() === right.toString();
}

function isIdInList(list = [], id) {
  return list.some((item) => idsEqual(item, id));
}

function toResponse(document) {
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

function toPublicMatchResponse(match) {
  const data = toResponse(match);

  return {
    gameTitle: data.gameTitle,
    locationName: data.locationName,
    matchId: data.matchId,
    qrCodeUrl: data.qrCodeUrl,
    qrCodeDataUrl: data.qrCodeDataUrl,
    status: data.status,
    currentState: data.currentState,
  };
}

function buildJoinUrl(matchId, entryCode) {
  const baseUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/join?gameCode=${matchId || entryCode}`;
}

async function generateUniqueMatchId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const matchId = generateMatchCode(6);
    const existing = await Match.findOne({
      matchId,
      status: { $in: ACTIVE_MATCH_STATUSES },
    }).select("_id");

    if (!existing) {
      return matchId;
    }
  }

  throw createHttpError("Unable to generate unique match ID.", 500);
}

async function generateUniqueEntryCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entryCode = generateEntryCode(4);
    const existing = await Match.findOne({
      entryCode,
      status: { $in: ACTIVE_MATCH_STATUSES },
    }).select("_id");

    if (!existing) {
      return entryCode;
    }
  }

  throw createHttpError("Unable to generate unique entry code.", 500);
}

async function ensureHostAssignedToLocation(hostId, locationId) {
  const host = await Host.findById(hostId);

  if (!host) {
    throw createHttpError("Only the assigned host can control this match.", 403);
  }

  if (host.status === "archived") {
    throw createHttpError("Archived host cannot start a match.", 403);
  }

  if (host.status !== "active") {
    throw createHttpError("Host account is not active.", 403);
  }

  if (!isIdInList(host.assignedLocationIds || [], locationId)) {
    throw createHttpError("You are not assigned to this location.", 403);
  }

  return host;
}

async function ensureHostHasNoActiveMatch(host) {
  if (host.currentActiveMatchId) {
    const activeMatch = await Match.findOne({
      _id: host.currentActiveMatchId,
      status: { $in: ACTIVE_MATCH_STATUSES },
    }).select("_id");

    if (activeMatch) {
      throw createHttpError("Host already has an active match.", 409);
    }
  }

  const existingActiveMatch = await Match.findOne({
    hostId: host._id,
    status: { $in: ACTIVE_MATCH_STATUSES },
  }).select("_id");

  if (existingActiveMatch) {
    throw createHttpError("Host already has an active match.", 409);
  }
}

function isGameDateAvailable(game) {
  const now = new Date();

  if (game.availableFrom && game.availableFrom > now) {
    return false;
  }

  if (game.availableTo && game.availableTo < now) {
    return false;
  }

  return true;
}

async function ensureGameAvailableForHost(gameId, hostId, locationId) {
  if (!mongoose.isValidObjectId(gameId)) {
    throw createHttpError("Game not found.", 404);
  }

  const game = await Game.findById(gameId);

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const isPlayableStatus = game.status !== "archived";

  if (!isPlayableStatus || !isGameDateAvailable(game)) {
    throw createHttpError("This game is not available for this host or location.", 403);
  }

  return game;
}

function getQuestionGroups(game) {
  const groups = Array.isArray(game.rounds) ? [...game.rounds] : [];

  if (game.finalRound && Array.isArray(game.finalRound.questionIds)) {
    groups.push(game.finalRound);
  }

  return groups;
}

function getQuestionPointerFromGame(game, roundIndex, questionIndex) {
  const groups = getQuestionGroups(game);
  const round = groups[roundIndex];
  const questionId = round && round.questionIds ? round.questionIds[questionIndex] : null;

  if (!questionId) {
    throw createHttpError("Question not found in game structure.", 404);
  }

  return {
    roundIndex,
    questionIndex,
    questionId,
  };
}

function getIntermissionAfterRound(game, round) {
  if (!round || !Array.isArray(game.intermissions)) {
    return null;
  }

  const roundNumber = round.roundNumber;
  const index = game.intermissions.findIndex((intermission) => intermission.afterRound === roundNumber);

  if (index === -1) {
    return null;
  }

  return {
    intermission: game.intermissions[index],
    intermissionIndex: index,
  };
}

function getNextQuestionPointer(match, game) {
  const groups = getQuestionGroups(game);

  if (groups.length === 0) {
    throw createHttpError("Question not found in game structure.", 404);
  }

  if (match.currentRoundIndex === null || match.currentQuestionIndex === null) {
    return getQuestionPointerFromGame(game, 0, 0);
  }

  const currentRound = groups[match.currentRoundIndex];
  const nextQuestionIndex = match.currentQuestionIndex + 1;

  if (currentRound && currentRound.questionIds[nextQuestionIndex]) {
    return getQuestionPointerFromGame(game, match.currentRoundIndex, nextQuestionIndex);
  }

  if (match.status !== MATCH_STATUS.INTERMISSION) {
    const intermissionPointer = getIntermissionAfterRound(game, currentRound);

    if (intermissionPointer) {
      return intermissionPointer;
    }
  }

  const nextRoundIndex = match.currentRoundIndex + 1;

  if (groups[nextRoundIndex] && groups[nextRoundIndex].questionIds[0]) {
    return getQuestionPointerFromGame(game, nextRoundIndex, 0);
  }

  return {
    gameOver: true,
  };
}

async function findOwnedMatch(matchDbId, hostId, allowedStatuses = null) {
  ensureMatchObjectId(matchDbId);

  const filter = {
    _id: matchDbId,
    hostId,
  };

  if (allowedStatuses) {
    filter.status = { $in: allowedStatuses };
  }

  const match = await Match.findOne(filter);

  if (!match) {
    throw createHttpError("Only the assigned host can control this match.", 403);
  }

  const host = await Host.findById(hostId).select("status");

  if (host && host.status === "archived") {
    throw createHttpError("Archived host cannot start a match.", 403);
  }

  if (host && host.status !== "active") {
    throw createHttpError("Host account is not active.", 403);
  }

  return match;
}

async function createMatch(payload, hostId) {
  const host = await ensureHostAssignedToLocation(hostId, payload.locationId);
  await ensureHostHasNoActiveMatch(host);

  const location = await Location.findById(payload.locationId);

  if (!location) {
    throw createHttpError("Location not found.", 404);
  }

  if (location.status !== "active") {
    throw createHttpError("Location not found.", 404);
  }

  const game = await ensureGameAvailableForHost(payload.gameId, hostId, payload.locationId);
  const billingMode = payload.billingMode || location.billingMode;

  if (payload.billingMode && payload.billingMode !== location.billingMode) {
    throw createHttpError("Billing mode is locked once match is live.", 400);
  }

  const matchId = await generateUniqueMatchId();
  const entryCode = matchId;
  const joinUrl = buildJoinUrl(matchId, entryCode);
  const qrCodeDataUrl = await generateQrCode(joinUrl);

  const match = await Match.create({
    matchId,
    entryCode,
    qrCodeDataUrl,
    joinUrl,
    gameId: game._id,
    locationId: location._id,
    hostId: host._id,
    gameTitle: game.title,
    locationName: location.clientName || location.name,
    hostName: host.name,
    billingMode,
    defaultMatchPrice: location.defaultMatchPrice || 0,
    currency: location.currency || "usd",
    status: MATCH_STATUS.SETUP,
    scheduledAt: game.scheduledDate || null,
    currentState: MATCH_CURRENT_STATE.SETUP,
    timerDurationSeconds: game.defaultQuestionTime || 60,
    billingStatus: BILLING_STATUS.NOT_STARTED,
    receiptEmailDestinations: location.billingContactEmails || [],
    totalQuestions: game.totalQuestions || 0,
  });

  host.currentActiveMatchId = match._id;
  await host.save();

  emitMatchEvent(SOCKET_EVENTS.MATCH_CREATED, match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function confirmMatch(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.SETUP]);

  if (!match.locationName) {
    throw createHttpError("This match will be billed to location confirmation is required.", 400);
  }

  match.status = MATCH_STATUS.WAITING;
  match.currentState = MATCH_CURRENT_STATE.WAITING_FOR_TEAMS;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.MATCH_CONFIRMED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function getMyActiveMatch(hostId) {
  const match = await Match.findOne({
    hostId,
    status: { $in: ACTIVE_MATCH_STATUSES },
  }).sort({ createdAt: -1 });

  return match ? toResponse(match) : null;
}

async function getMatchById(matchDbId, user) {
  ensureMatchObjectId(matchDbId);

  const filter = { _id: matchDbId };

  if (user.role === "host") {
    filter.hostId = user.id;
  }

  const match = await Match.findOne(filter)
    .populate("gameId", "title status totalQuestions")
    .populate("locationId", "name clientName status city state country")
    .populate("hostId", "name email status");

  if (!match) {
    throw createHttpError(user.role === "host" ? "Only the assigned host can control this match." : "Match not found.", 404);
  }

  return toResponse(match);
}

function toHostQuestionResponse(question) {
  if (!question) return null;

  return {
    id: question._id.toString(),
    questionText: question.questionText,
    category: question.category,
    type: question.type,
    difficulty: question.difficulty,
    mediaType: question.mediaType,
    imageUrl: question.imageUrl,
    audioUrl: question.audioUrl,
    mediaCaption: question.mediaCaption,
    options: question.options || [],
    correctAnswer: question.correctAnswer,
    correctAnswers: question.correctAnswers || [],
    orderingAnswer: question.orderingAnswer || [],
    numericAnswer: question.numericAnswer,
    numericTolerance: question.numericTolerance,
    fiftyFiftyOptions: question.fiftyFiftyOptions || [],
    songTitle: question.songTitle,
    artistName: question.artistName,
    estimatedTimeSeconds: question.estimatedTimeSeconds,
    points: question.points,
  };
}

async function getOwnedMatchQuestions(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId);
  const game = await Game.findById(match.gameId).lean();

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const groups = getQuestionGroups(game);
  const questionIds = groups.flatMap((round) => round.questionIds || []);
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  const questionMap = new Map(questions.map((question) => [question._id.toString(), question]));

  return {
    matchId: match.matchId,
    matchDbId: match._id.toString(),
    gameId: game._id.toString(),
    gameTitle: game.title,
    rounds: groups.map((round, roundIndex) => ({
      roundIndex,
      roundNumber: round.roundNumber,
      title: round.title,
      type: round.type,
      isFinalRound: Boolean(round.isFinalRound),
      questions: (round.questionIds || [])
        .map((questionId, questionIndex) => {
          const question = toHostQuestionResponse(questionMap.get(questionId.toString()));
          return question ? { roundIndex, questionIndex, ...question } : null;
        })
        .filter(Boolean),
    })),
  };
}

async function startMatch(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.WAITING]);
  const game = await Game.findById(match.gameId);

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const firstQuestion = getQuestionPointerFromGame(game, 0, 0);

  match.status = MATCH_STATUS.LIVE;
  match.startedAt = new Date();
  match.currentRoundIndex = firstQuestion.roundIndex;
  match.currentQuestionIndex = firstQuestion.questionIndex;
  match.currentQuestionId = firstQuestion.questionId;
  match.currentState = MATCH_CURRENT_STATE.QUESTION_CLOSED;
  match.isQuestionOpen = false;
  match.isIntermission = false;
  match.activeIntermissionIndex = null;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.MATCH_STARTED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function openCurrentQuestion(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.LIVE]);

  if (!match.currentQuestionId) {
    throw createHttpError("Question not found in game structure.", 404);
  }

  match.isQuestionOpen = true;
  match.currentState = MATCH_CURRENT_STATE.QUESTION_OPEN;
  match.timerStartedAt = new Date();
  match.timerPausedAt = null;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.QUESTION_OPENED, match, toPublicMatchResponse(match));
  emitQuestionStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function closeCurrentQuestion(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.LIVE]);

  match.isQuestionOpen = false;
  match.currentState = MATCH_CURRENT_STATE.REVIEWING_ANSWERS;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.QUESTION_CLOSED, match, toPublicMatchResponse(match));
  emitQuestionStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function advanceToNextQuestion(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [
    MATCH_STATUS.LIVE,
    MATCH_STATUS.INTERMISSION,
  ]);
  const game = await Game.findById(match.gameId);

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const nextPointer = getNextQuestionPointer(match, game);

  if (nextPointer.gameOver) {
    match.currentState = MATCH_CURRENT_STATE.GAME_OVER;
    match.isQuestionOpen = false;
    match.isIntermission = false;
    match.activeIntermissionIndex = null;
    match.timerStartedAt = null;
    match.timerPausedAt = null;
    await match.save();

    emitMatchEvent(SOCKET_EVENTS.QUESTION_CHANGED, match, toPublicMatchResponse(match));
    emitQuestionStateUpdated(match, toPublicMatchResponse(match));
    return toResponse(match);
  }

  if (nextPointer.intermission) {
    match.status = MATCH_STATUS.INTERMISSION;
    match.currentState = MATCH_CURRENT_STATE.INTERMISSION;
    match.isIntermission = true;
    match.isQuestionOpen = false;
    match.activeIntermissionIndex = nextPointer.intermissionIndex;
    await match.save();

    emitMatchEvent(SOCKET_EVENTS.INTERMISSION_STARTED, match, toPublicMatchResponse(match));
    emitMatchStateUpdated(match, toPublicMatchResponse(match));
    return toResponse(match);
  }

  match.status = MATCH_STATUS.LIVE;
  match.currentRoundIndex = nextPointer.roundIndex;
  match.currentQuestionIndex = nextPointer.questionIndex;
  match.currentQuestionId = nextPointer.questionId;
  match.currentState = MATCH_CURRENT_STATE.QUESTION_CLOSED;
  match.isQuestionOpen = false;
  match.isIntermission = false;
  match.activeIntermissionIndex = null;
  match.timerStartedAt = null;
  match.timerPausedAt = null;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.QUESTION_CHANGED, match, toPublicMatchResponse(match));
  emitQuestionStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function jumpToQuestion(matchDbId, hostId, payload) {
  const match = await findOwnedMatch(matchDbId, hostId, [
    MATCH_STATUS.LIVE,
    MATCH_STATUS.INTERMISSION,
  ]);
  const game = await Game.findById(match.gameId);

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  const pointer = getQuestionPointerFromGame(game, payload.roundIndex, payload.questionIndex);

  match.status = MATCH_STATUS.LIVE;
  match.currentRoundIndex = pointer.roundIndex;
  match.currentQuestionIndex = pointer.questionIndex;
  match.currentQuestionId = pointer.questionId;
  match.currentState = MATCH_CURRENT_STATE.QUESTION_CLOSED;
  match.isQuestionOpen = false;
  match.isIntermission = false;
  match.activeIntermissionIndex = null;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.QUESTION_CHANGED, match, toPublicMatchResponse(match));
  emitQuestionStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function skipQuestion(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.LIVE]);

  if (match.currentQuestionId) {
    match.skippedQuestionIds.addToSet(match.currentQuestionId);
    await match.save();
  }

  return advanceToNextQuestion(matchDbId, hostId);
}

async function startIntermission(matchDbId, hostId, payload) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.LIVE]);
  const game = await Game.findById(match.gameId);

  if (!game) {
    throw createHttpError("Game not found.", 404);
  }

  if (!game.intermissions || !game.intermissions[payload.intermissionIndex]) {
    throw createHttpError("Question not found in game structure.", 404);
  }

  match.status = MATCH_STATUS.INTERMISSION;
  match.currentState = MATCH_CURRENT_STATE.INTERMISSION;
  match.isIntermission = true;
  match.isQuestionOpen = false;
  match.activeIntermissionIndex = payload.intermissionIndex;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.INTERMISSION_STARTED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function endIntermission(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [MATCH_STATUS.INTERMISSION]);

  match.status = MATCH_STATUS.LIVE;
  match.currentState = MATCH_CURRENT_STATE.QUESTION_CLOSED;
  match.isIntermission = false;
  match.activeIntermissionIndex = null;
  await match.save();

  emitMatchEvent(SOCKET_EVENTS.INTERMISSION_ENDED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function closeMatch(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId);

  if ([MATCH_STATUS.COMPLETED, MATCH_STATUS.CANCELLED].includes(match.status)) {
    throw createHttpError("Match cannot be started from current status.", 400);
  }

  if (match.status !== MATCH_STATUS.CLOSED) {
    if (![MATCH_STATUS.LIVE, MATCH_STATUS.INTERMISSION, MATCH_STATUS.WAITING].includes(match.status)) {
      throw createHttpError("Match cannot be started from current status.", 400);
    }

    match.status = MATCH_STATUS.CLOSED;
    match.closedAt = new Date();
    match.currentState = MATCH_CURRENT_STATE.GAME_OVER;
    match.isQuestionOpen = false;
    match.isIntermission = false;
    await match.save();

    await Host.findByIdAndUpdate(hostId, { currentActiveMatchId: null });
  }

  let billingResult;

  try {
    billingResult = await billingService.processClosedMatchBilling(match._id);
  } catch (error) {
    match.billingStatus = BILLING_STATUS.FAILED;
    match.billingFailureReason = error.message;
    await match.save();
    billingResult = {
      transaction: null,
      error,
    };
  }

  const refreshedMatch = await Match.findById(match._id);

  emitMatchEvent(SOCKET_EVENTS.MATCH_CLOSED, refreshedMatch, toPublicMatchResponse(refreshedMatch));
  emitMatchStateUpdated(refreshedMatch, toPublicMatchResponse(refreshedMatch));

  return {
    billing: billingResult.transaction
      ? {
          amount: billingResult.transaction.amount,
          billingMode: billingResult.transaction.billingMode,
          billingStatus: billingResult.transaction.billingStatus,
          currency: billingResult.transaction.currency,
          failureReason: billingResult.transaction.failureReason,
          transactionId: billingResult.transaction._id.toString(),
        }
      : {
          billingMode: refreshedMatch.billingMode,
          billingStatus: refreshedMatch.billingStatus,
          failureReason: billingResult.error ? billingResult.error.message : "",
        },
    match: toResponse(refreshedMatch),
  };
}

async function endMatch(matchDbId, hostId) {
  const match = await findOwnedMatch(matchDbId, hostId, [
    MATCH_STATUS.CLOSED,
    MATCH_STATUS.LIVE,
    MATCH_STATUS.INTERMISSION,
    MATCH_STATUS.WAITING,
  ]);

  match.status = MATCH_STATUS.COMPLETED;
  match.endedAt = new Date();
  match.currentState = MATCH_CURRENT_STATE.GAME_OVER;
  match.isQuestionOpen = false;
  match.isIntermission = false;
  await match.save();

  await Host.findByIdAndUpdate(hostId, { currentActiveMatchId: null });

  emitMatchEvent(SOCKET_EVENTS.MATCH_ENDED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function cancelMatch(matchDbId, user, reason = "") {
  ensureMatchObjectId(matchDbId);

  const filter = { _id: matchDbId };

  if (user.role === "host") {
    filter.hostId = user.id;
  }

  const match = await Match.findOne(filter);

  if (!match) {
    throw createHttpError(user.role === "host" ? "Only the assigned host can control this match." : "Match not found.", 404);
  }

  match.status = MATCH_STATUS.CANCELLED;
  match.endedAt = new Date();
  match.currentState = MATCH_CURRENT_STATE.GAME_OVER;
  match.isQuestionOpen = false;
  match.isIntermission = false;
  match.cancelReason = reason || "";
  await match.save();

  await Host.findByIdAndUpdate(match.hostId, { currentActiveMatchId: null });

  emitMatchEvent(SOCKET_EVENTS.MATCH_CANCELLED, match, toPublicMatchResponse(match));
  emitMatchStateUpdated(match, toPublicMatchResponse(match));

  return toResponse(match);
}

async function getMatches(query) {
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [
      { matchId: searchRegex },
      { gameTitle: searchRegex },
      { locationName: searchRegex },
      { hostName: searchRegex },
    ];
  }

  if (query.status) filter.status = query.status;
  if (query.locationId) filter.locationId = query.locationId;
  if (query.hostId) filter.hostId = query.hostId;
  if (query.gameId) filter.gameId = query.gameId;
  if (query.billingStatus) filter.billingStatus = query.billingStatus;

  if (query.date) {
    const startOfDay = new Date(query.date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(query.date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    filter.$or = [
      { scheduledAt: { $gte: startOfDay, $lte: endOfDay } },
      { scheduledAt: null, startedAt: { $gte: startOfDay, $lte: endOfDay } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [matches, total] = await Promise.all([
    Match.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize),
    Match.countDocuments(filter),
  ]);

  return {
    items: matches.map(toResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getMyMatches(hostId, query) {
  return getMatches({
    ...query,
    hostId,
  });
}

async function getPublicMatchInfo(matchId) {
  const match = await Match.findOne({ matchId: matchId.toUpperCase() });

  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  return toPublicMatchResponse(match);
}

module.exports = {
  advanceToNextQuestion,
  cancelMatch,
  closeCurrentQuestion,
  closeMatch,
  confirmMatch,
  createMatch,
  endIntermission,
  endMatch,
  getMatchById,
  getMatches,
  getMyActiveMatch,
  getMyMatches,
  getOwnedMatchQuestions,
  getPublicMatchInfo,
  jumpToQuestion,
  openCurrentQuestion,
  skipQuestion,
  startIntermission,
  startMatch,
};
