const Joi = require("joi");

const ROLES = require("../../constants/roles");

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  role: Joi.string().valid(ROLES.SUPER_ADMIN, ROLES.HOST).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "confirmPassword must match newPassword",
  }),
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
  changePasswordSchema,
  loginSchema,
  validate,
};
