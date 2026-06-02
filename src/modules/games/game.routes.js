const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const gameController = require("./game.controller");

const router = express.Router();

const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN, {
  message: "Only Super Admin can manage games.",
});

const requireHost = requireRole(ROLES.HOST, {
  message: "Host can only view available games.",
});

// Admin-only management endpoints
router.post("/", authMiddleware, requireSuperAdmin, gameController.createGame);
router.get("/", authMiddleware, requireSuperAdmin, gameController.getGames);

// Host availability endpoint (registered BEFORE /:id to prevent ID route collision)
router.get("/available/today", authMiddleware, requireHost, gameController.getAvailableGamesForToday);

// Detail and modification endpoints (Admin only)
router.get("/:id", authMiddleware, requireSuperAdmin, gameController.getGameById);
router.put("/:id", authMiddleware, requireSuperAdmin, gameController.updateGame);
router.patch("/:id/status", authMiddleware, requireSuperAdmin, gameController.updateGameStatus);
router.patch("/:id/locations", authMiddleware, requireSuperAdmin, gameController.assignGameLocations);
router.patch("/:id/hosts", authMiddleware, requireSuperAdmin, gameController.assignGameHosts);
router.post("/:id/duplicate", authMiddleware, requireSuperAdmin, gameController.duplicateGame);
router.delete("/:id", authMiddleware, requireSuperAdmin, gameController.deleteGame);

module.exports = router;
