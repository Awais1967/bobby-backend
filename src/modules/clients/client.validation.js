const Joi = require("joi");

const statusValues = ["active", "inactive", "suspended", "archived"];
const restoreStatusValues = ["active", "inactive"];
const billingMethodValues = ["card", "invoice"];
const discountTypeValues = ["percentage", "fixed", ""];
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = Joi.string().pattern(objectIdPattern);
const rawCardField = Joi.any().forbidden().messages({
  "any.unknown": "Do not send raw card number or CVV. Use Stripe payment method token.",
});

function rejectRawCardFields(value, helpers) {
  if (value.cardNumber || value.cvv || value.cvvCode || value.cardCvv) {
    return helpers.error("any.custom");
  }

  return value;
}

const baseClientFields = {
  clientName: Joi.string().trim(),
  venueLocation: Joi.string().trim().allow(""),
  location: Joi.string().trim().allow(""),
  city: Joi.string().trim(),
  state: Joi.string().trim().allow("").default(""),
  zip: Joi.string().trim().allow("").default(""),
  country: Joi.string().trim().allow("").default(""),
  timezone: Joi.string().trim().allow("").default("UTC"),
  clientEmail: Joi.string().email(),
  contactName: Joi.string().trim().allow("").default(""),
  contactPhone: Joi.string().trim().allow("").default(""),
  status: Joi.string().valid(...statusValues).default("active"),
  billingMethod: Joi.string().valid(...billingMethodValues),
  discountType: Joi.string().valid(...discountTypeValues).default(""),
  discountValue: Joi.number().min(0).default(0),
  discountDate: Joi.date().iso().allow(null).default(null),
  pricingDiscount: Joi.boolean().truthy("true").falsy("false").default(false),
  billingContactName: Joi.string().trim().allow("").default(""),
  billingContactEmail: Joi.string().email().allow("").default(""),
  billingContactEmails: Joi.array().items(Joi.string().email()).default([]),
  stripePaymentMethodId: Joi.string().trim().allow("").default(""),
  cardBrand: Joi.string().trim().allow("").default(""),
  cardLast4: Joi.string().trim().pattern(/^\d{4}$/).allow("").default(""),
  cardExpMonth: Joi.number().integer().min(1).max(12).allow(null).default(null),
  cardExpYear: Joi.number().integer().min(2024).allow(null).default(null),
  currency: Joi.string().trim().lowercase().default("usd"),
  assignedHostIds: Joi.array().items(objectId).default([]),
  logoUrl: Joi.string().trim().allow("").default(""),
  invoiceNotes: Joi.string().trim().allow("").default(""),
  cardNumber: rawCardField,
  cvv: rawCardField,
  cvvCode: rawCardField,
  cardCvv: rawCardField,
};

const createClientValidation = Joi.object({
  ...baseClientFields,
  clientName: baseClientFields.clientName.required().messages({
    "any.required": "Client name is required.",
    "string.empty": "Client name is required.",
  }),
  city: baseClientFields.city.required().messages({
    "any.required": "City is required.",
    "string.empty": "City is required.",
  }),
  clientEmail: baseClientFields.clientEmail.required().messages({
    "any.required": "Client email is required.",
    "string.email": "Client email is required.",
  }),
  billingMethod: baseClientFields.billingMethod.required().messages({
    "any.required": "Invalid billing method.",
    "any.only": "Invalid billing method.",
  }),
})
  .custom(rejectRawCardFields)
  .messages({
    "any.custom": "Do not send raw card number or CVV. Use Stripe payment method token.",
  });

const updateClientValidation = Joi.object({
  ...Object.entries(baseClientFields).reduce((fields, [key, schema]) => {
    fields[key] = schema.optional();
    return fields;
  }, {}),
})
  .min(1)
  .custom(rejectRawCardFields)
  .messages({
    "object.min": "At least one field is required to update client.",
    "any.custom": "Do not send raw card number or CVV. Use Stripe payment method token.",
  });

const updateClientBillingMethodValidation = Joi.object({
  billingMethod: Joi.string()
    .valid(...billingMethodValues)
    .required()
    .messages({
      "any.required": "Invalid billing method.",
      "any.only": "Invalid billing method.",
    }),
  stripePaymentMethodId: Joi.string().trim().allow("").default(""),
  cardBrand: Joi.string().trim().allow("").default(""),
  cardLast4: Joi.string().trim().pattern(/^\d{4}$/).allow("").default(""),
  cardExpMonth: Joi.number().integer().min(1).max(12).allow(null).default(null),
  cardExpYear: Joi.number().integer().min(2024).allow(null).default(null),
  cardNumber: rawCardField,
  cvv: rawCardField,
  cvvCode: rawCardField,
  cardCvv: rawCardField,
})
  .custom(rejectRawCardFields)
  .messages({
    "any.custom": "Do not send raw card number or CVV. Use Stripe payment method token.",
  });

const archiveClientValidation = Joi.object({
  reason: Joi.string().trim().allow("").default(""),
});

const restoreClientValidation = Joi.object({
  status: Joi.string().valid(...restoreStatusValues).default("active"),
});

const getClientsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  city: Joi.string().trim().allow("").optional(),
  state: Joi.string().trim().allow("").optional(),
  zip: Joi.string().trim().allow("").optional(),
  billingMethod: Joi.string().valid(...billingMethodValues).optional(),
  status: Joi.string().valid(...statusValues).optional(),
  includeArchived: Joi.boolean().truthy("true").falsy("false").default(false),
  sortBy: Joi.string()
    .valid("clientName", "venueLocation", "city", "zip", "billingMethod", "clientEmail", "lastLoginAt", "status", "createdAt", "updatedAt")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const assignClientHostsValidation = Joi.object({
  assignedHostIds: Joi.array().items(objectId).required(),
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
  archiveClientValidation,
  assignClientHostsValidation,
  createClientValidation,
  getClientsQueryValidation,
  restoreClientValidation,
  updateClientBillingMethodValidation,
  updateClientValidation,
  validate,
};
