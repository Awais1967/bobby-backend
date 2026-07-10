const answerService = require("./answer.service");
const {
  getAnswerQueryValidation,
  submitAnswerValidation,
  validate,
} = require("./answer.validation");

async function submitAnswer(req, res, next) {
  try {
    const payload = validate(submitAnswerValidation, req.body);
    const answer = await answerService.submitAnswer(req.player, payload);

    return res.status(201).json({
      success: true,
      message: "Response sent",
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function giveUpCurrentQuestion(req, res, next) {
  try {
    const answer = await answerService.giveUpCurrentQuestion(req.player);

    return res.status(201).json({
      success: true,
      message: "Give up submitted",
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyCurrentAnswer(req, res, next) {
  try {
    const answer = await answerService.getMyCurrentAnswer(req.player);

    return res.status(200).json({
      success: true,
      data: {
        answer,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyAnswerHistory(req, res, next) {
  try {
    const query = validate(getAnswerQueryValidation, req.query);
    const data = await answerService.getMyAnswerHistory(req.player, query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  giveUpCurrentQuestion,
  getMyAnswerHistory,
  getMyCurrentAnswer,
  submitAnswer,
};
