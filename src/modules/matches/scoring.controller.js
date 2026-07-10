const scoringService = require("./scoring.service");
const {
  bulkReviewAnswersValidation,
  getScoreLogsQueryValidation,
  manualAddScoreValidation,
  manualDeductScoreValidation,
  overrideScoreValidation,
  reviewAnswerValidation,
  setBonusScoreValidation,
  validate,
} = require("./scoring.validation");

async function reviewAnswer(req, res, next) {
  try {
    const payload = validate(reviewAnswerValidation, req.body);
    const data = await scoringService.reviewAnswer(
      req.params.id,
      req.params.answerId,
      req.user.id,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Answer reviewed successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function bulkReviewAnswers(req, res, next) {
  try {
    const payload = validate(bulkReviewAnswersValidation, req.body);
    const data = await scoringService.bulkReviewAnswers(req.params.id, req.user.id, payload.reviews);

    return res.status(200).json({
      success: true,
      message: "Bulk review completed",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function autoGradeQuestion(req, res, next) {
  try {
    const data = await scoringService.autoGradeQuestion(req.params.id, req.params.questionId, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Auto-grade completed",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function addTeamScore(req, res, next) {
  try {
    const payload = validate(manualAddScoreValidation, req.body);
    const data = await scoringService.addTeamScore(
      req.params.id,
      req.params.teamId,
      req.user.id,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Score added successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function deductTeamScore(req, res, next) {
  try {
    const payload = validate(manualDeductScoreValidation, req.body);
    const data = await scoringService.deductTeamScore(
      req.params.id,
      req.params.teamId,
      req.user.id,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Score deducted successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function overrideTeamScore(req, res, next) {
  try {
    const payload = validate(overrideScoreValidation, req.body);
    const data = await scoringService.overrideTeamScore(
      req.params.id,
      req.params.teamId,
      req.user.id,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Score overridden successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function setTeamBonusScore(req, res, next) {
  try {
    const payload = validate(setBonusScoreValidation, req.body);
    const data = await scoringService.setTeamBonusScore(
      req.params.id,
      req.params.teamId,
      req.user.id,
      payload
    );

    return res.status(200).json({
      success: true,
      message: "Bonus points updated",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getScoreLogs(req, res, next) {
  try {
    const query = validate(getScoreLogsQueryValidation, req.query);
    const data = await scoringService.getScoreLogs(req.params.id, req.user.id, query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMatchScores(req, res, next) {
  try {
    const data = await scoringService.getMatchScores(req.params.id, req.user);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  addTeamScore,
  autoGradeQuestion,
  bulkReviewAnswers,
  deductTeamScore,
  getMatchScores,
  getScoreLogs,
  overrideTeamScore,
  reviewAnswer,
  setTeamBonusScore,
};
