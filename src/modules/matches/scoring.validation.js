const Joi = require("joi");

const { ANSWER_REVIEW_STATUS, SCORE_ACTION_TYPES } = require("../../constants/scoringStatus");

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const reviewAnswerValidation = Joi.object({
  reviewStatus: Joi.string()
    .valid(ANSWER_REVIEW_STATUS.CORRECT, ANSWER_REVIEW_STATUS.INCORRECT, ANSWER_REVIEW_STATUS.PARTIAL)
    .required()
    .messages({
      "any.only": "Invalid review status.",
      "any.required": "Invalid review status.",
    }),
  awardedPoints: Joi.when("reviewStatus", {
    is: ANSWER_REVIEW_STATUS.PARTIAL,
    then: Joi.number().min(0).required().messages({
      "any.required": "Awarded points are required for partial credit.",
    }),
    otherwise: Joi.number().min(0).optional(),
  }),
  note: Joi.string().trim().allow("").optional(),
  songTitleCorrect: Joi.boolean().optional(),
  artistNameCorrect: Joi.boolean().optional(),
});

const bulkReviewAnswersValidation = Joi.object({
  reviews: Joi.array()
    .items(
      reviewAnswerValidation.keys({
        answerId: Joi.string().pattern(objectIdPattern).required(),
      })
    )
    .min(1)
    .required(),
});

const manualAddScoreValidation = Joi.object({
  points: Joi.number().greater(0).required().messages({
    "number.greater": "Points must be greater than 0.",
    "any.required": "Points must be greater than 0.",
  }),
  reason: Joi.string().trim().required().messages({
    "any.required": "Reason is required for manual score changes.",
    "string.empty": "Reason is required for manual score changes.",
  }),
  note: Joi.string().trim().allow("").optional(),
});

const manualDeductScoreValidation = manualAddScoreValidation;

const overrideScoreValidation = Joi.object({
  newScore: Joi.number().min(0).required(),
  reason: Joi.string().trim().required().messages({
    "any.required": "Reason is required for manual score changes.",
    "string.empty": "Reason is required for manual score changes.",
  }),
  note: Joi.string().trim().allow("").optional(),
});

const getScoreLogsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  teamId: Joi.string().pattern(objectIdPattern).optional(),
  questionId: Joi.string().pattern(objectIdPattern).optional(),
  actionType: Joi.string().valid(...Object.values(SCORE_ACTION_TYPES)).optional(),
});

function validate(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const validationError = new Error(error.details.map((detail) => detail.message).join(", "));
    validationError.statusCode = 400;
    throw validationError;
  }

  return value;
}

module.exports = {
  bulkReviewAnswersValidation,
  getScoreLogsQueryValidation,
  manualAddScoreValidation,
  manualDeductScoreValidation,
  overrideScoreValidation,
  reviewAnswerValidation,
  validate,
};
