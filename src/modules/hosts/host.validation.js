const Joi = require("joi");

const statusValues = ["active", "inactive", "suspended", "archived"];
const editableStatusValues = ["active", "inactive", "suspended"];
const restoreStatusValues = ["active", "inactive"];
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createHostValidation = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...editableStatusValues).default("active"),
  assignedLocationIds: Joi.array().items(Joi.string().pattern(objectIdPattern)).default([]),
});

const updateHostValidation = Joi.object({
  name: Joi.string().trim().optional(),
  phone: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...editableStatusValues).optional(),
  assignedLocationIds: Joi.array().items(Joi.string().pattern(objectIdPattern)).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update host.",
  });

const updateHostStatusValidation = Joi.object({
  status: Joi.string().valid(...editableStatusValues).required(),
});

const archiveHostValidation = Joi.object({
  reason: Joi.string().trim().allow("").default(""),
});

const restoreHostValidation = Joi.object({
  status: Joi.string().valid(...restoreStatusValues).default("active"),
});

const changeHostPasswordValidation = Joi.object({
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Password and confirm password do not match.",
  }),
});

const getHostsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...statusValues).optional(),
  includeArchived: Joi.boolean().truthy("true").falsy("false").default(false),
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  sortBy: Joi.string()
    .valid("name", "email", "phone", "status", "createdAt", "updatedAt", "lastLoginAt")
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
  archiveHostValidation,
  changeHostPasswordValidation,
  createHostValidation,
  getHostsQueryValidation,
  restoreHostValidation,
  updateHostStatusValidation,
  updateHostValidation,
  validate,
};
