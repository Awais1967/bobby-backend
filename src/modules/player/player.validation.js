const Joi = require("joi");

const teamName = Joi.string().trim().min(2).max(40).required().messages({
  "any.required": "Team name is required.",
  "string.empty": "Team name is required.",
});

const joinMatchValidation = Joi.object({
  gameCode: Joi.string().trim().uppercase().required().messages({
    "any.required": "Game code is required.",
    "string.empty": "Game code is required.",
  }),
  teamName,
  deviceId: Joi.string().trim().required(),
});

const reconnectTeamValidation = joinMatchValidation;

const confirmDeviceSwitchValidation = Joi.object({
  gameCode: Joi.string().trim().uppercase().required(),
  teamName,
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
