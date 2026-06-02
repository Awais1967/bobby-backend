const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const { handleQuestionMediaUpload, validateQuestionMediaFiles } = require("../../middleware/upload.middleware");
const questionController = require("./question.controller");

const router = express.Router();

const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN, {
  message: "Only Super Admin can manage questions.",
});

// Admin-only management endpoints
router.post(
  "/",
  authMiddleware,
  requireSuperAdmin,
  handleQuestionMediaUpload,
  validateQuestionMediaFiles,
  questionController.createQuestion
);
router.get("/", authMiddleware, requireSuperAdmin, questionController.getQuestions);

// Bulk questions import (Registered BEFORE /:id to prevent parameter collision)
router.post("/bulk", authMiddleware, requireSuperAdmin, questionController.bulkCreateQuestions);

// Host-safe question detail (Registered BEFORE /:id, accessible by Host & Super Admin)
router.get(
  "/:id/host-safe",
  authMiddleware,
  requireRole(ROLES.HOST, ROLES.SUPER_ADMIN),
  questionController.getHostSafeQuestion
);

// Detail and modification endpoints (Admin only)
router.get("/:id", authMiddleware, requireSuperAdmin, questionController.getQuestionById);
router.put(
  "/:id",
  authMiddleware,
  requireSuperAdmin,
  handleQuestionMediaUpload,
  validateQuestionMediaFiles,
  questionController.updateQuestion
);
router.patch("/:id/status", authMiddleware, requireSuperAdmin, questionController.updateQuestionStatus);
router.post("/:id/duplicate", authMiddleware, requireSuperAdmin, questionController.duplicateQuestion);
router.delete("/:id", authMiddleware, requireSuperAdmin, questionController.deleteQuestion);

module.exports = router;
