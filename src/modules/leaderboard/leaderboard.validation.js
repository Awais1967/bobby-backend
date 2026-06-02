const Joi = require("joi");

const getPublicLeaderboardValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
});

const getHostLeaderboardValidation = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
});

const joinPresentationRoomValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
  entryCode: Joi.string().trim().required(),
});

const requestLeaderboardValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
});

const requestMatchStateValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
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
  getHostLeaderboardValidation,
  getPublicLeaderboardValidation,
  joinPresentationRoomValidation,
  requestLeaderboardValidation,
  requestMatchStateValidation,
  validate,
};
