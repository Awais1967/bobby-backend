const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const leaderboardController = require("../leaderboard/leaderboard.controller");
const matchController = require("./match.controller");
const scoringController = require("./scoring.controller");

const router = express.Router();

router.post("/", authMiddleware, requireRole(ROLES.HOST), matchController.createMatch);
router.get("/", authMiddleware, requireRole(ROLES.SUPER_ADMIN), matchController.getMatches);
router.get("/active", authMiddleware, requireRole(ROLES.HOST), matchController.getMyActiveMatch);
router.get("/mine", authMiddleware, requireRole(ROLES.HOST), matchController.getMyMatches);
router.get("/public/:matchId/state", leaderboardController.getPresentationState);
router.get("/public/:matchId", matchController.getPublicMatchInfo);
router.patch(
  "/:id/answers/review-bulk",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.bulkReviewAnswers
);
router.patch(
  "/:id/answers/:answerId/review",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.reviewAnswer
);
router.get(
  "/:id/answers/current",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.getCurrentQuestionSubmissions
);
router.get(
  "/:id/questions/:questionId/answers",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.getAnswersByQuestion
);
router.post(
  "/:id/questions/:questionId/auto-grade",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.autoGradeQuestion
);
router.patch(
  "/:id/answers/:answerId/reopen",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.reopenAnswer
);
router.patch(
  "/:id/teams/:teamId/score/add",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.addTeamScore
);
router.patch(
  "/:id/teams/:teamId/score/deduct",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.deductTeamScore
);
router.patch(
  "/:id/teams/:teamId/score/override",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.overrideTeamScore
);
router.patch(
  "/:id/teams/:teamId/score/bonus",
  authMiddleware,
  requireRole(ROLES.HOST),
  scoringController.setTeamBonusScore
);
router.get("/:id/score-logs", authMiddleware, requireRole(ROLES.HOST), scoringController.getScoreLogs);
router.get("/:id/questions", authMiddleware, requireRole(ROLES.HOST), matchController.getOwnedMatchQuestions);
router.get(
  "/:id/tie-breaker/questions",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.getTieBreakerQuestions
);
router.get("/:id/tie-breaker", authMiddleware, requireRole(ROLES.HOST), matchController.getTieBreakerSession);
router.post("/:id/tie-breaker", authMiddleware, requireRole(ROLES.HOST), matchController.startTieBreaker);
router.patch("/:id/tie-breaker/judge", authMiddleware, requireRole(ROLES.HOST), matchController.judgeTieBreaker);
router.patch("/:id/tie-breaker/review", authMiddleware, requireRole(ROLES.HOST), matchController.reviewTieBreakerResponse);
router.patch("/:id/tie-breaker/reveal", authMiddleware, requireRole(ROLES.HOST), matchController.revealTieBreaker);
router.get(
  "/:id/scores",
  authMiddleware,
  requireRole(ROLES.HOST, ROLES.SUPER_ADMIN),
  scoringController.getMatchScores
);
router.get("/:id/teams", authMiddleware, requireRole(ROLES.HOST), matchController.getMatchTeams);
router.patch(
  "/:id/teams/:teamId/remove",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.removeTeam
);
router.patch(
  "/:id/teams/:teamId/restore",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.restoreTeam
);
router.get(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HOST),
  matchController.getMatchById
);
router.patch("/:id/confirm", authMiddleware, requireRole(ROLES.HOST), matchController.confirmMatch);
router.patch("/:id/start", authMiddleware, requireRole(ROLES.HOST), matchController.startMatch);
router.patch(
  "/:id/question/open",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.openCurrentQuestion
);
router.patch(
  "/:id/question/close",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.closeCurrentQuestion
);
router.patch(
  "/:id/question/reveal-answer",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.revealCurrentAnswer
);
router.patch(
  "/:id/question/reveal-final",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.revealFinalQuestion
);
router.patch(
  "/:id/question/next",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.advanceToNextQuestion
);
router.patch(
  "/:id/question/jump",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.jumpToQuestion
);
router.patch(
  "/:id/question/skip",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.skipQuestion
);
router.patch(
  "/:id/intermission/start",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.startIntermission
);
router.patch(
  "/:id/intermission/end",
  authMiddleware,
  requireRole(ROLES.HOST),
  matchController.endIntermission
);
router.patch("/:id/pause", authMiddleware, requireRole(ROLES.HOST), matchController.pauseMatch);
router.patch("/:id/resume", authMiddleware, requireRole(ROLES.HOST), matchController.resumeMatch);
router.patch("/:id/close", authMiddleware, requireRole(ROLES.HOST), matchController.closeMatch);
router.patch("/:id/end", authMiddleware, requireRole(ROLES.HOST), matchController.endMatch);
router.patch(
  "/:id/cancel",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HOST),
  matchController.cancelMatch
);

module.exports = router;
