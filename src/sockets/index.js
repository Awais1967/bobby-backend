const { Server } = require("socket.io");

const { isFrontendOriginAllowed } = require("../config/frontendOrigins");
const { setSocketServer } = require("./match.socket");
const { registerLeaderboardSocketHandlers } = require("./leaderboard.socket");

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isFrontendOriginAllowed(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Socket CORS origin not allowed: ${origin}`));
      },
      credentials: true,
    },
  });

  setSocketServer(io);
  registerLeaderboardSocketHandlers(io);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Placeholder for live match, answer submission, leaderboard, and host control events.

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

module.exports = initializeSocket;
