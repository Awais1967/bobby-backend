require("dotenv").config();

const dns = require("node:dns");
const http = require("http");
const mongoose = require("mongoose");

const app = require("./app");
const connectDB = require("./config/db");
const initializeSocket = require("./sockets");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const PORT = process.env.PORT || 4000;

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  initializeSocket(server);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Set a different PORT in .env.`);
      process.exit(1);
    }

    console.error("Server error:", error);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Trivia Goat API listening on port ${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Shutting down Trivia Goat API.`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start Trivia Goat API:", error);
  process.exit(1);
});
