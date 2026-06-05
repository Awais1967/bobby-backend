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

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).required().messages({
    "any.required": "Full name is required.",
    "string.empty": "Full name is required.",
  }),
  avatarUrl: Joi.string().trim().allow("").max(750000).optional(),
});

const recoveryAccountFields = {
  email: Joi.string().email().required(),
  role: Joi.string().valid(ROLES.SUPER_ADMIN, ROLES.HOST).required(),
};

const forgotPasswordSchema = Joi.object(recoveryAccountFields);

const verifyOtpSchema = Joi.object({
  ...recoveryAccountFields,
  otp: Joi.string().pattern(/^\d{6}$/).required(),
});

const resetPasswordSchema = Joi.object({
  ...recoveryAccountFields,
  resetToken: Joi.string().min(32).required(),
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
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
  validate,
  verifyOtpSchema,
};
