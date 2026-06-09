const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { MATCH_STATUS } = require("../../constants/matchStatus");
const SOCKET_EVENTS = require("../../constants/socketEvents");
const { CURRENT_ANSWER_STATUS, TEAM_STATUS } = require("../../constants/teamStatus");
const { emitTeamEvent } = require("../../sockets/player.socket");
const {
  emitLeaderboardUpdated,
  emitMatchStateUpdated,
  emitTeamJoined,
} = require("../../sockets/leaderboard.socket");
const Match = require("../matches/match.model");
const Team = require("../matches/team.model");

const JOINABLE_MATCH_STATUSES = [
  MATCH_STATUS.WAITING,
  MATCH_STATUS.LIVE,
  MATCH_STATUS.INTERMISSION,
];

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTeamName(teamName) {
  return teamName.trim().replace(/\s+/g, " ").toLowerCase();
}

function getRequestMeta(req) {
  return {
    userAgent: req.get ? req.get("user-agent") || "" : "",
    ipAddress: req.ip || "",
  };
}

function ensureJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }
}

function generatePlayerSessionToken(team, match, deviceId) {
  ensureJwtSecret();

  return jwt.sign(
    {
      teamId: team._id.toString(),
      matchDbId: match._id.toString(),
      matchId: match.matchId,
      teamName: team.teamName,
      deviceId,
      role: "player",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_PLAYER_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "7d",
    }
  );
}

function toTeamResponse(team) {
  const data = typeof team.toObject === "function" ? team.toObject() : team;

  return {
    id: data._id ? data._id.toString() : data.id,
    teamName: data.teamName,
    matchId: data.matchId,
    score: data.score,
    rank: data.rank,
    status: data.status,
    joinedAt: data.joinedAt,
    lastSeenAt: data.lastSeenAt,
    currentAnswerStatus: data.currentAnswerStatus,
  };
}

function toSafeMatchResponse(match) {
  return {
    matchId: match.matchId,
    gameTitle: match.gameTitle,
    locationName: match.locationName,
    status: match.status,
    currentState: match.currentState,
  };
}

function ensureMatchAllowsJoining(match) {
  if (!JOINABLE_MATCH_STATUSES.includes(match.status)) {
    throw createHttpError("This match is not accepting teams.", 400);
  }
}

function ensureTeamObjectId(teamId) {
  if (!mongoose.isValidObjectId(teamId)) {
    throw createHttpError("Team not found.", 404);
  }
}

function pushDeviceHistory(team, deviceId, requestMeta) {
  const now = new Date();
  const existingDevice = team.deviceHistory.find((device) => device.deviceId === deviceId);

  if (existingDevice) {
    existingDevice.lastSeenAt = now;
    existingDevice.userAgent = requestMeta.userAgent || existingDevice.userAgent;
    existingDevice.ipAddress = requestMeta.ipAddress || existingDevice.ipAddress;
    return;
  }

  team.deviceHistory.push({
    deviceId,
    joinedAt: now,
    lastSeenAt: now,
    userAgent: requestMeta.userAgent || "",
    ipAddress: requestMeta.ipAddress || "",
  });
}

async function findMatchByGameCode(gameCode) {
  const normalizedGameCode = String(gameCode || "").trim().toUpperCase();
  const match = await Match.findOne({
    $or: [{ matchId: normalizedGameCode }, { entryCode: normalizedGameCode }],
  });

  if (!match) {
    throw createHttpError("Match not found.", 404);
  }

  return match;
}

async function createTeamSession(team, match, deviceId) {
  const token = generatePlayerSessionToken(team, match, deviceId);
  team.playerSessionToken = token;
  await team.save();

  return {
    team: toTeamResponse(team),
    token,
    match: toSafeMatchResponse(match),
  };
}

async function joinOrReconnectTeam(payload, requestMeta, mode) {
  const match = await findMatchByGameCode(payload.gameCode);
  ensureMatchAllowsJoining(match);

  const teamNameNormalized = normalizeTeamName(payload.teamName);
  let team = await Team.findOne({
    matchDbId: match._id,
    teamNameNormalized,
  }).select("+playerSessionToken");

  if (!team) {
    team = await Team.create({
      matchDbId: match._id,
      matchId: match.matchId,
      teamName: payload.teamName.trim().replace(/\s+/g, " "),
      teamNameNormalized,
      activeDeviceId: payload.deviceId,
      status: TEAM_STATUS.ACTIVE,
      deviceHistory: [],
    });
    pushDeviceHistory(team, payload.deviceId, requestMeta);

    match.totalTeams += 1;
    await match.save();

    const data = await createTeamSession(team, match, payload.deviceId);
    emitTeamJoined(match, data.team);
    emitLeaderboardUpdated(match, { matchId: match.matchId });
    emitTeamEvent(SOCKET_EVENTS.TEAM_JOINED, match, data);
    return { deviceSwitchRequired: false, data };
  }

  if (team.status === TEAM_STATUS.REMOVED) {
    throw createHttpError("Team has been removed from this match.", 403);
  }

  if (team.activeDeviceId !== payload.deviceId) {
    team.deviceSwitchRequested = true;
    team.pendingDeviceId = payload.deviceId;
    await team.save();

    const response = {
      teamId: team._id.toString(),
      teamName: team.teamName,
    };

    emitTeamEvent(SOCKET_EVENTS.TEAM_DEVICE_SWITCH_REQUIRED, match, response);

    return {
      deviceSwitchRequired: true,
      data: response,
    };
  }

  team.status = TEAM_STATUS.ACTIVE;
  team.lastSeenAt = new Date();
  team.rejoinedAt = mode === "reconnect" ? new Date() : team.rejoinedAt || new Date();
  team.deviceSwitchRequested = false;
  team.pendingDeviceId = "";
  pushDeviceHistory(team, payload.deviceId, requestMeta);

  const data = await createTeamSession(team, match, payload.deviceId);
  emitTeamEvent(SOCKET_EVENTS.TEAM_RECONNECTED, match, data);
  return { deviceSwitchRequired: false, data };
}

async function joinMatch(payload, requestMeta) {
  return joinOrReconnectTeam(payload, requestMeta, "join");
}

async function reconnectTeam(payload, requestMeta) {
  return joinOrReconnectTeam(payload, requestMeta, "reconnect");
}

async function confirmDeviceSwitch(payload, requestMeta) {
  const match = await findMatchByGameCode(payload.gameCode);
  ensureMatchAllowsJoining(match);

  const team = await Team.findOne({
    matchDbId: match._id,
    teamNameNormalized: normalizeTeamName(payload.teamName),
  }).select("+playerSessionToken");

  if (!team) {
    throw createHttpError("Team not found.", 404);
  }

  if (team.status === TEAM_STATUS.REMOVED) {
    throw createHttpError("Team has been removed from this match.", 403);
  }

  team.activeDeviceId = payload.deviceId;
  team.deviceSwitchRequested = false;
  team.pendingDeviceId = "";
  team.status = TEAM_STATUS.ACTIVE;
  team.lastSeenAt = new Date();
  team.rejoinedAt = new Date();
  pushDeviceHistory(team, payload.deviceId, requestMeta);

  const data = await createTeamSession(team, match, payload.deviceId);
  emitTeamEvent(SOCKET_EVENTS.TEAM_DEVICE_SWITCHED, match, data);

  return data;
}

async function getPlayerSession(playerTokenPayload) {
  const [team, match] = await Promise.all([
    Team.findById(playerTokenPayload.teamId),
    Match.findById(playerTokenPayload.matchDbId),
  ]);

  if (!team || !match || team.status === TEAM_STATUS.REMOVED) {
    throw createHttpError("Player session is invalid or expired.", 401);
  }

  if (team.activeDeviceId !== playerTokenPayload.deviceId) {
    throw createHttpError("Player session is invalid or expired.", 401);
  }

  return {
    team: toTeamResponse(team),
    match: toSafeMatchResponse(match),
  };
}

async function leaveTeam(playerTokenPayload) {
  const team = await Team.findById(playerTokenPayload.teamId);

  if (!team) {
    throw createHttpError("Team not found.", 404);
  }

  if (team.activeDeviceId !== playerTokenPayload.deviceId) {
    throw createHttpError("Player session is invalid or expired.", 401);
  }

  team.status = TEAM_STATUS.LEFT;
  team.lastSeenAt = new Date();
  await team.save();

  const match = await Match.findById(team.matchDbId);
  emitTeamEvent(SOCKET_EVENTS.TEAM_LEFT, match, toTeamResponse(team));

  return toTeamResponse(team);
}

async function ensureHostOwnsMatch(hostId, matchDbId) {
  if (!mongoose.isValidObjectId(matchDbId)) {
    throw createHttpError("Match not found.", 404);
  }

  const match = await Match.findOne({
    _id: matchDbId,
    hostId,
  });

  if (!match) {
    throw createHttpError("Only the assigned host can manage teams in this match.", 403);
  }

  return match;
}

async function getMatchTeams(matchDbId, hostId) {
  await ensureHostOwnsMatch(hostId, matchDbId);

  const teams = await Team.find({ matchDbId }).sort({ joinedAt: 1 });

  return {
    items: teams.map(toTeamResponse),
    total: teams.length,
  };
}

async function removeTeam(matchDbId, teamId, hostId, reason = "") {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  ensureTeamObjectId(teamId);

  const team = await Team.findOne({ _id: teamId, matchDbId });

  if (!team) {
    throw createHttpError("Team not found.", 404);
  }

  team.status = TEAM_STATUS.REMOVED;
  team.removedByHost = true;
  team.removedAt = new Date();
  team.currentAnswerStatus = CURRENT_ANSWER_STATUS.LOCKED;
  await team.save();

  const response = {
    ...toTeamResponse(team),
    reason: reason || "",
  };

  emitTeamEvent(SOCKET_EVENTS.TEAM_REMOVED, match, response);
  emitLeaderboardUpdated(match, { matchId: match.matchId });
  emitMatchStateUpdated(match, { matchId: match.matchId });
  return response;
}

async function restoreTeam(matchDbId, teamId, hostId) {
  const match = await ensureHostOwnsMatch(hostId, matchDbId);
  ensureTeamObjectId(teamId);

  const team = await Team.findOne({ _id: teamId, matchDbId });

  if (!team) {
    throw createHttpError("Team not found.", 404);
  }

  team.status = TEAM_STATUS.ACTIVE;
  team.removedByHost = false;
  team.removedAt = null;
  await team.save();

  const response = toTeamResponse(team);
  emitTeamEvent(SOCKET_EVENTS.TEAM_RESTORED, match, response);
  emitLeaderboardUpdated(match, { matchId: match.matchId });
  emitMatchStateUpdated(match, { matchId: match.matchId });
  return response;
}

async function getPublicJoinInfo(matchId) {
  const match = await findMatchByGameCode(matchId);

  return {
    gameTitle: match.gameTitle,
    locationName: match.locationName,
    matchId: match.matchId,
    status: match.status,
    currentState: match.currentState,
    canJoin: JOINABLE_MATCH_STATUSES.includes(match.status),
  };
}

function ensureDeviceCanSubmit(team, deviceId) {
  if (team.activeDeviceId !== deviceId) {
    throw createHttpError("This team is already active on another device.", 403);
  }
}

module.exports = {
  confirmDeviceSwitch,
  ensureDeviceCanSubmit,
  ensureHostOwnsMatch,
  ensureMatchAllowsJoining,
  getMatchTeams,
  getPlayerSession,
  getPublicJoinInfo,
  joinMatch,
  leaveTeam,
  normalizeTeamName,
  reconnectTeam,
  removeTeam,
  restoreTeam,
  getRequestMeta,
};
