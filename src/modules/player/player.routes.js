const express = require("express");

const playerAuthMiddleware = require("../../middleware/playerAuth.middleware");
const leaderboardController = require("../leaderboard/leaderboard.controller");
const playerController = require("./player.controller");

const router = express.Router();

router.post("/join", playerController.joinMatch);
router.post("/reconnect", playerController.reconnectTeam);
router.post("/switch-device/confirm", playerController.confirmDeviceSwitch);
router.get("/state", playerAuthMiddleware, leaderboardController.getPlayerState);
router.get("/session", playerAuthMiddleware, playerController.getPlayerSession);
router.patch("/leave", playerAuthMiddleware, playerController.leaveTeam);
router.get("/match/:matchId", playerController.getPublicJoinInfo);

module.exports = router;
