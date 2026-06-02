const Joi = require("joi");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const getTransactionsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  billingStatus: Joi.string().valid(...Object.values(BILLING_STATUS)).optional(),
  billingMode: Joi.string().valid(...Object.values(BILLING_MODE)).optional(),
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
  matchId: Joi.string().trim().uppercase().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  sortBy: Joi.string().valid("createdAt", "updatedAt", "chargedAt", "invoicedAt", "amount").default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const retryTransactionValidation = Joi.object({});

const markInvoicePaidValidation = Joi.object({
  note: Joi.string().trim().allow("").optional(),
});

const cancelTransactionValidation = Joi.object({
  reason: Joi.string().trim().required(),
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
  cancelTransactionValidation,
  getTransactionsQueryValidation,
  markInvoicePaidValidation,
  retryTransactionValidation,
  validate,
};
