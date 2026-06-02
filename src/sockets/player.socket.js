const SOCKET_EVENTS = require("../constants/socketEvents");
const { emitMatchEvent } = require("./match.socket");

function emitTeamEvent(eventName, match, payload = {}) {
  emitMatchEvent(eventName, match, payload);
}

module.exports = {
  SOCKET_EVENTS,
  emitTeamEvent,
};
