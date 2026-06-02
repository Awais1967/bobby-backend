const express = require("express");

const authRoutes = require("../modules/auth/auth.routes");
const hostRoutes = require("../modules/hosts/host.routes");
const locationRoutes = require("../modules/locations/location.routes");
const clientRoutes = require("../modules/clients/client.routes");
const gameRoutes = require("../modules/games/game.routes");
const questionRoutes = require("../modules/questions/question.routes");
const matchRoutes = require("../modules/matches/match.routes");
const answerRoutes = require("../modules/player/answer.routes");
const leaderboardRoutes = require("../modules/leaderboard/leaderboard.routes");
const billingRoutes = require("../modules/billing/billing.routes");
const playerRoutes = require("../modules/player/player.routes");
const reportRoutes = require("../modules/reports/report.routes");
const calendarRoutes = require("../modules/calendar/calendar.routes");
const adminRoutes = require("../modules/admins/admin.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "Trivia Goat API",
    status: "ok",
  });
});

router.use("/auth", authRoutes);
router.use("/hosts", hostRoutes);
router.use("/locations", locationRoutes);
router.use("/clients", clientRoutes);
router.use("/games", gameRoutes);
router.use("/questions", questionRoutes);
router.use("/matches", matchRoutes);
router.use("/player/answers", answerRoutes);
router.use("/player", playerRoutes);
router.use("/leaderboard", leaderboardRoutes);
router.use("/billing", billingRoutes);
router.use("/reports", reportRoutes);
router.use("/calendar", calendarRoutes);
router.use("/admins", adminRoutes);

module.exports = router;
