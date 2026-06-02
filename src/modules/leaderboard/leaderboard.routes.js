const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const playerAuthMiddleware = require("../../middleware/playerAuth.middleware");
const requireRole = require("../../middleware/role.middleware");
const leaderboardController = require("./leaderboard.controller");

const router = express.Router();

router.get("/player", playerAuthMiddleware, leaderboardController.getPlayerLeaderboard);
router.get("/match/:matchId", leaderboardController.getPublicLeaderboard);
router.get(
  "/host/matches/:id",
  authMiddleware,
  requireRole(ROLES.HOST),
  leaderboardController.getHostLeaderboard
);

module.exports = router;
