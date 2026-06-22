const { Server } = require("socket.io");

const { getFrontendOrigins } = require("../config/frontendOrigins");
const { setSocketServer } = require("./match.socket");
const { registerLeaderboardSocketHandlers } = require("./leaderboard.socket");

const allowedCorsOrigins = getFrontendOrigins();

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: allowedCorsOrigins,
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
