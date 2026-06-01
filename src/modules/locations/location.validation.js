const Joi = require("joi");

const statusValues = ["active", "inactive", "suspended"];
const billingModeValues = ["auto_charge", "invoice_later"];
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const emailOptional = Joi.string().email().allow("").optional();
const objectId = Joi.string().pattern(objectIdPattern);

const baseLocationFields = {
  name: Joi.string().trim(),
  clientName: Joi.string().trim().allow(""),
  contactName: Joi.string().trim().allow(""),
  contactEmail: emailOptional,
  contactPhone: Joi.string().trim().allow(""),
  address: Joi.string().trim().allow(""),
  city: Joi.string().trim().allow(""),
  state: Joi.string().trim().allow(""),
  country: Joi.string().trim().allow(""),
  timezone: Joi.string().trim().allow("").default("UTC"),
  status: Joi.string().valid(...statusValues),
  billingMode: Joi.string().valid(...billingModeValues),
  billingContactName: Joi.string().trim().allow(""),
  billingContactEmail: emailOptional,
  billingContactEmails: Joi.array().items(Joi.string().email()).default([]),
  stripeCustomerId: Joi.string().trim().allow(""),
  stripePaymentMethodId: Joi.string().trim().allow(""),
  maskedPaymentMethod: Joi.string().trim().allow(""),
  invoiceNotes: Joi.string().trim().allow(""),
  defaultMatchPrice: Joi.number().min(0).default(0),
  currency: Joi.string().trim().lowercase().default("usd"),
  assignedHostIds: Joi.array().items(objectId).default([]),
  logoUrl: Joi.string().trim().allow(""),
  promoImageUrl: Joi.string().trim().allow(""),
  intermissionMessage: Joi.string().trim().allow(""),
  welcomeMessage: Joi.string().trim().allow(""),
  gameOverMessage: Joi.string().trim().allow(""),
};

const createLocationValidation = Joi.object({
  ...baseLocationFields,
  name: baseLocationFields.name.required().messages({
    "any.required": "Location name is required.",
    "string.empty": "Location name is required.",
  }),
  status: baseLocationFields.status.default("active").messages({
    "any.only": "Invalid location status.",
  }),
  billingMode: baseLocationFields.billingMode.required().messages({
    "any.required": "Invalid billing mode.",
    "any.only": "Invalid billing mode.",
  }),
  billingContactEmail: Joi.when("billingMode", {
    is: "auto_charge",
    then: Joi.string().email().required(),
    otherwise: emailOptional,
  }),
});

const updateLocationValidation = Joi.object({
  name: Joi.string().trim().optional(),
  clientName: Joi.string().trim().allow("").optional(),
  contactName: Joi.string().trim().allow("").optional(),
  contactEmail: emailOptional,
  contactPhone: Joi.string().trim().allow("").optional(),
  address: Joi.string().trim().allow("").optional(),
  city: Joi.string().trim().allow("").optional(),
  state: Joi.string().trim().allow("").optional(),
  country: Joi.string().trim().allow("").optional(),
  timezone: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...statusValues).optional(),
  billingMode: Joi.string().valid(...billingModeValues).optional(),
  billingContactName: Joi.string().trim().allow("").optional(),
  billingContactEmail: emailOptional,
  billingContactEmails: Joi.array().items(Joi.string().email()).optional(),
  stripeCustomerId: Joi.string().trim().allow("").optional(),
  stripePaymentMethodId: Joi.string().trim().allow("").optional(),
  maskedPaymentMethod: Joi.string().trim().allow("").optional(),
  invoiceNotes: Joi.string().trim().allow("").optional(),
  defaultMatchPrice: Joi.number().min(0).optional(),
  currency: Joi.string().trim().lowercase().optional(),
  assignedHostIds: Joi.array().items(objectId).optional(),
  logoUrl: Joi.string().trim().allow("").optional(),
  promoImageUrl: Joi.string().trim().allow("").optional(),
  intermissionMessage: Joi.string().trim().allow("").optional(),
  welcomeMessage: Joi.string().trim().allow("").optional(),
  gameOverMessage: Joi.string().trim().allow("").optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update location.",
  });

const updateLocationStatusValidation = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required()
    .messages({
      "any.only": "Invalid location status.",
    }),
});

const assignLocationHostsValidation = Joi.object({
  assignedHostIds: Joi.array().items(objectId).required(),
});

const getLocationsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...statusValues).optional(),
  country: Joi.string().trim().allow("").optional(),
  city: Joi.string().trim().allow("").optional(),
  billingMode: Joi.string().valid(...billingModeValues).optional(),
  hostId: objectId.optional(),
  sortBy: Joi.string()
    .valid("name", "clientName", "city", "country", "status", "billingMode", "createdAt", "updatedAt")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const getHostLocationsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...statusValues).default("active"),
  sortBy: Joi.string().valid("name", "clientName", "city", "country", "createdAt").default("name"),
  sortOrder: Joi.string().valid("asc", "desc").default("asc"),
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
  assignLocationHostsValidation,
  createLocationValidation,
  getHostLocationsQueryValidation,
  getLocationsQueryValidation,
  updateLocationStatusValidation,
  updateLocationValidation,
  validate,
};
