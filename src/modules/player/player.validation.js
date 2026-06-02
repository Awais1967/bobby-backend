const Joi = require("joi");

const teamName = Joi.string().trim().min(2).max(40).required().messages({
  "any.required": "Team name is required.",
  "string.empty": "Team name is required.",
});

const securityCode = Joi.string().pattern(/^\d{4}$/).required().messages({
  "string.pattern.base": "Security code must be exactly 4 digits.",
});

const joinMatchValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
  entryCode: Joi.string().trim().required(),
  teamName,
  securityCode,
  deviceId: Joi.string().trim().required(),
});

const reconnectTeamValidation = joinMatchValidation;

const confirmDeviceSwitchValidation = Joi.object({
  matchId: Joi.string().trim().uppercase().required(),
  teamName,
  securityCode,
  deviceId: Joi.string().trim().required(),
});

const playerLeaveValidation = Joi.object({});

const removeTeamValidation = Joi.object({
  reason: Joi.string().trim().allow("").optional(),
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
  confirmDeviceSwitchValidation,
  joinMatchValidation,
  playerLeaveValidation,
  reconnectTeamValidation,
  removeTeamValidation,
  validate,
};
