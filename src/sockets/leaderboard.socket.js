const jwt = require("jsonwebtoken");

const ROLES = require("../constants/roles");
const SOCKET_EVENTS = require("../constants/socketEvents");
const leaderboardService = require("../modules/leaderboard/leaderboard.service");
const Team = require("../modules/matches/team.model");
const {
  getHostRoom,
  getMatchRoom,
  getPresentationRoom,
  getTeamRoom,
  getSocketServer,
} = require("./match.socket");

function emitSocketError(socket, message = "Socket authentication failed.") {
  socket.emit(SOCKET_EVENTS.SOCKET_ERROR, {
    message,
  });
}

function verifyToken(token) {
  if (!token || !process.env.JWT_SECRET) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function getTokenFromSocket(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  const header = socket.handshake.headers && socket.handshake.headers.authorization;

  if (authToken) {
    return authToken;
  }

  if (header && header.startsWith("Bearer ")) {
    return header.split(" ")[1];
  }

  return null;
}

function attachSocketAuth(socket) {
  const decoded = verifyToken(getTokenFromSocket(socket));

  if (!decoded) {
    return;
  }

  if (decoded.role === ROLES.PLAYER || decoded.role === "player") {
    socket.player = {
      teamId: decoded.teamId,
      matchDbId: decoded.matchDbId,
      matchId: decoded.matchId,
      teamName: decoded.teamName,
      deviceId: decoded.deviceId,
      role: "player",
    };
    return;
  }

  socket.user = {
    id: decoded.id,
    role: decoded.role,
    email: decoded.email,
  };
}

async function handleJoinMatchRoom(socket, payload) {
  const match = await leaderboardService.canAccessMatchByMatchId(socket, payload.matchId);

  if (!match) {
    throw new Error("You do not have access to this match.");
  }

  socket.join(getMatchRoom(match.matchId));

  if (socket.user && socket.user.role === ROLES.HOST) {
    socket.join(getHostRoom(socket.user.id));
  }
}

async function handleJoinTeamRoom(socket, payload) {
  if (!socket.player || socket.player.teamId !== payload.teamId) {
    throw new Error("You do not have access to this match.");
  }

  const team = await Team.findById(payload.teamId).select("_id activeDeviceId");

  if (!team || team.activeDeviceId !== socket.player.deviceId) {
    throw new Error("Player session is invalid or expired.");
  }

  socket.join(getTeamRoom(payload.teamId));
}

async function handleJoinPresentationRoom(socket, payload) {
  const match = await leaderboardService.validatePresentationAccess(payload.matchId, payload.entryCode);
  socket.join(getPresentationRoom(match.matchId));
}

async function handleRequestLeaderboard(socket, payload) {
  const match = await leaderboardService.canAccessMatchByMatchId(socket, payload.matchId);

  if (!match) {
    throw new Error("You do not have access to this match.");
  }

  const items = await leaderboardService.getMatchLeaderboard(match._id);
  socket.emit(SOCKET_EVENTS.LEADERBOARD_UPDATED, {
    matchId: match.matchId,
    items,
  });
}

async function handleRequestMatchState(socket, payload) {
  const match = await leaderboardService.canAccessMatchByMatchId(socket, payload.matchId);

  if (!match) {
    throw new Error("You do not have access to this match.");
  }

  const state = socket.player
    ? await leaderboardService.getPlayerState(socket.player)
    : await leaderboardService.getPresentationState(match.matchId);

  socket.emit(SOCKET_EVENTS.MATCH_STATE_UPDATED, state);
}

function registerLeaderboardSocketHandlers(io) {
  io.on("connection", (socket) => {
    attachSocketAuth(socket);

    socket.on(SOCKET_EVENTS.JOIN_MATCH_ROOM, async (payload = {}) => {
      try {
        await handleJoinMatchRoom(socket, payload);
      } catch (error) {
        emitSocketError(socket, error.message);
      }
    });

    socket.on(SOCKET_EVENTS.JOIN_TEAM_ROOM, async (payload = {}) => {
      try {
        await handleJoinTeamRoom(socket, payload);
      } catch (error) {
        emitSocketError(socket, error.message);
      }
    });

    socket.on(SOCKET_EVENTS.JOIN_PRESENTATION_ROOM, async (payload = {}) => {
      try {
        await handleJoinPresentationRoom(socket, payload);
      } catch (error) {
        emitSocketError(socket, error.message || "Presentation access denied.");
      }
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (payload = {}) => {
      if (payload.room) {
        socket.leave(payload.room);
      }
    });

    socket.on(SOCKET_EVENTS.REQUEST_LEADERBOARD, async (payload = {}) => {
      try {
        await handleRequestLeaderboard(socket, payload);
      } catch (error) {
        emitSocketError(socket, error.message);
      }
    });

    socket.on(SOCKET_EVENTS.REQUEST_MATCH_STATE, async (payload = {}) => {
      try {
        await handleRequestMatchState(socket, payload);
      } catch (error) {
        emitSocketError(socket, error.message);
      }
    });
  });
}

function emitToRooms(eventName, match, payload = {}, extraRooms = []) {
  const io = getSocketServer();

  if (!io || !match) {
    return;
  }

  const matchId = match.matchId || match;
  const rooms = [getMatchRoom(matchId), getPresentationRoom(matchId), ...extraRooms];

  rooms.forEach((room) => {
    io.to(room).emit(eventName, payload);
  });
}

function emitLeaderboardUpdated(match, payload = {}) {
  emitToRooms(SOCKET_EVENTS.LEADERBOARD_UPDATED, match, payload);
}

function emitMatchStateUpdated(match, payload = {}) {
  emitToRooms(SOCKET_EVENTS.MATCH_STATE_UPDATED, match, payload);
}

function emitQuestionStateUpdated(match, payload = {}) {
  emitToRooms(SOCKET_EVENTS.QUESTION_STATE_UPDATED, match, payload);
}

function emitTeamScoreUpdated(match, team) {
  emitToRooms(SOCKET_EVENTS.TEAM_SCORE_UPDATED, match, {
    matchId: match.matchId,
    teamId: team._id ? team._id.toString() : team.teamId,
    teamName: team.teamName,
    score: team.score,
    rank: team.rank,
  }, [getTeamRoom(team._id ? team._id.toString() : team.teamId)]);
}

function emitTeamJoined(match, team) {
  emitToRooms(SOCKET_EVENTS.TEAM_JOINED, match, team);
}

function emitAnswerSubmitted(match, answer) {
  emitToRooms(SOCKET_EVENTS.ANSWER_SUBMITTED, match, answer);
}

function emitAnswerReviewed(match, answer, team) {
  emitToRooms(SOCKET_EVENTS.ANSWER_REVIEWED, match, {
    answer,
    team,
  });
}

module.exports = {
  emitAnswerReviewed,
  emitAnswerSubmitted,
  emitLeaderboardUpdated,
  emitMatchStateUpdated,
  emitQuestionStateUpdated,
  emitTeamJoined,
  emitTeamScoreUpdated,
  registerLeaderboardSocketHandlers,
};
