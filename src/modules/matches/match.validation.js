const Joi = require("joi");

const { BILLING_STATUS, MATCH_STATUS } = require("../../constants/matchStatus");

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = Joi.string().pattern(objectIdPattern);

const createMatchValidation = Joi.object({
  gameId: objectId.required(),
  locationId: objectId.required(),
  billingMode: Joi.string().valid("auto_charge", "invoice_later").optional(),
});

const confirmMatchValidation = Joi.object({
  confirmed: Joi.boolean().valid(true).required(),
});

const jumpQuestionValidation = Joi.object({
  roundIndex: Joi.number().integer().min(0).required(),
  questionIndex: Joi.number().integer().min(0).required(),
});

const startIntermissionValidation = Joi.object({
  type: Joi.string().valid("manual").default("manual"),
});

const cancelMatchValidation = Joi.object({
  reason: Joi.string().trim().allow("").optional(),
});

const removeTeamValidation = Joi.object({
  reason: Joi.string().trim().allow("").optional(),
});

const getMatchesQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...Object.values(MATCH_STATUS)).optional(),
  locationId: objectId.optional(),
  hostId: objectId.optional(),
  gameId: objectId.optional(),
  date: Joi.date().iso().optional(),
  billingStatus: Joi.string().valid(...Object.values(BILLING_STATUS)).optional(),
  sortBy: Joi.string()
    .valid("createdAt", "updatedAt", "scheduledAt", "startedAt", "closedAt", "endedAt", "matchId", "status")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
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
  cancelMatchValidation,
  confirmMatchValidation,
  createMatchValidation,
  getMatchesQueryValidation,
  jumpQuestionValidation,
  removeTeamValidation,
  startIntermissionValidation,
  validate,
};
