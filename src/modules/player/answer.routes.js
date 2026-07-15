const express = require("express");

const playerAuthMiddleware = require("../../middleware/playerAuth.middleware");
const answerController = require("./answer.controller");

const router = express.Router();

router.post("/", playerAuthMiddleware, answerController.submitAnswer);
router.post("/give-up", playerAuthMiddleware, answerController.giveUpCurrentQuestion);
router.post("/tie-breaker", playerAuthMiddleware, answerController.submitTieBreakerAnswer);
router.get("/current", playerAuthMiddleware, answerController.getMyCurrentAnswer);
router.get("/", playerAuthMiddleware, answerController.getMyAnswerHistory);

module.exports = router;
