const { Server } = require("socket.io");

const { setSocketServer } = require("./match.socket");
const { registerLeaderboardSocketHandlers } = require("./leaderboard.socket");

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || "*",
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
