let ioInstance = null;

function setSocketServer(io) {
  ioInstance = io;
}

function getSocketServer() {
  return ioInstance;
}

function getMatchRoom(matchId) {
  return `match:${matchId}`;
}

function getHostRoom(hostId) {
  return `host:${hostId}`;
}

function getTeamRoom(teamId) {
  return `team:${teamId}`;
}

function getPresentationRoom(matchId) {
  return `presentation:${matchId}`;
}

function emitMatchEvent(eventName, match, payload = {}) {
  if (!ioInstance || !match) {
    return;
  }

  const room = getMatchRoom(match.matchId || match);
  ioInstance.to(room).emit(eventName, payload);
}

module.exports = {
  emitMatchEvent,
  getHostRoom,
  getMatchRoom,
  getPresentationRoom,
  getSocketServer,
  getTeamRoom,
  setSocketServer,
};
