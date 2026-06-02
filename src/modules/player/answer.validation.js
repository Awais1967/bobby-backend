const Joi = require("joi");

const submitAnswerValidation = Joi.object({
  answerText: Joi.string().trim().allow("").optional(),
  selectedOption: Joi.string().trim().allow("").optional(),
  selectedOptions: Joi.array().items(Joi.string().trim()).optional(),
  orderingAnswer: Joi.array().items(Joi.string().trim()).optional(),
  numericAnswer: Joi.number().optional(),
  wagerAmount: Joi.number().min(0).optional(),
  submittedSocketId: Joi.string().trim().allow("").optional(),
});

const reopenAnswerValidation = Joi.object({});

const getAnswerQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
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
  getAnswerQueryValidation,
  reopenAnswerValidation,
  submitAnswerValidation,
  validate,
};
