const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const calendarController = require("./calendar.controller");

const router = express.Router();

const superAdminOnly = [
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, {
    message: "Calendar access is restricted to Super Admins.",
  }),
];

router.get("/overview", superAdminOnly, calendarController.getOverview);
router.get("/summary", superAdminOnly, calendarController.getSummary);
router.get("/matches", superAdminOnly, calendarController.getMonthlyMatches);
router.get("/range", superAdminOnly, calendarController.getRangeMatches);
router.get("/day", superAdminOnly, calendarController.getDayMatches);
router.get("/matches/:matchId", superAdminOnly, calendarController.getMatchDetail);

module.exports = router;
