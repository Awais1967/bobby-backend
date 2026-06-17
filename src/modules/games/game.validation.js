const Joi = require("joi");

const statusValues = ["draft", "scheduled", "active", "archived"];
const typeValues = ["weekly", "test", "private_event", "special"];
const minGameRounds = 1;
const maxGameRounds = 4;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = Joi.string().pattern(objectIdPattern);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const roundSchema = Joi.object({
  roundNumber: Joi.number().integer().required(),
  title: Joi.string().trim().required(),
  type: Joi.string().required(),
  questionIds: Joi.array().items(objectId).default([]),
  sortOrder: Joi.number().integer().required(),
  isFinalRound: Joi.boolean().default(false),
});

const finalRoundSchema = roundSchema.keys({
  questionIds: Joi.array().items(objectId).max(1).default([]).messages({
    "array.max": "Final round can have only one question.",
  }),
  isFinalRound: Joi.boolean().valid(true).default(true),
});

const intermissionSchema = Joi.object({
  afterRound: Joi.number().integer().required(),
  title: Joi.string().trim().required(),
  message: Joi.string().trim().allow("").default(""),
  promoImageUrl: Joi.string().trim().allow("").default(""),
  durationSeconds: Joi.number().integer().min(0).required(),
});

const baseGameFields = {
  title: Joi.string().trim(),
  description: Joi.string().trim().allow("").default(""),
  type: Joi.string().valid(...typeValues),
  status: Joi.string().valid(...statusValues),
  scheduledDate: Joi.date().iso().allow(null).default(null),
  scheduledTime: Joi.string().trim().pattern(timePattern).allow("").default("").messages({
    "string.pattern.base": "Scheduled time must be in HH:mm format.",
  }),
  availableFrom: Joi.date().iso().allow(null).default(null),
  availableTo: Joi.date().iso().allow(null).default(null),
  isRecurring: Joi.boolean().default(false),
  recurrenceRule: Joi.string().trim().allow("").default(""),
  assignedLocationIds: Joi.array().items(objectId).default([]),
  assignedHostIds: Joi.array().items(objectId).default([]),
  isGlobal: Joi.boolean().default(false),
  rounds: Joi.array().items(roundSchema).min(minGameRounds).max(maxGameRounds).default([]).messages({
    "array.min": "Game must have at least 1 quarter.",
    "array.max": "Game can have a maximum of 4 quarters.",
  }),
  intermissions: Joi.array().items(intermissionSchema).default([]),
  finalRound: finalRoundSchema.allow(null).default(null),
  defaultQuestionTime: Joi.number().integer().min(0).default(60),
  allowFlexibleRounds: Joi.boolean().default(true),
  coverImageUrl: Joi.string().trim().allow("").default(""),
  presentationTheme: Joi.string().trim().allow("").default("default"),
  welcomeMessage: Joi.string().trim().allow("").default(""),
  intermissionMessage: Joi.string().trim().allow("").default(""),
  gameOverMessage: Joi.string().trim().allow("").default(""),
};

const createGameValidation = Joi.object({
  ...baseGameFields,
  title: baseGameFields.title.required().messages({
    "any.required": "Game title is required.",
    "string.empty": "Game title is required.",
  }),
  type: baseGameFields.type.required().messages({
    "any.required": "Invalid game type.",
    "any.only": "Invalid game type.",
  }),
  status: baseGameFields.status.default("draft").messages({
    "any.only": "Invalid game status.",
  }),
  defaultQuestionTime: baseGameFields.defaultQuestionTime.required().messages({
    "any.required": "defaultQuestionTime is required.",
    "number.min": "defaultQuestionTime must be >= 0.",
  }),
});

const updateGameValidation = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("").optional(),
  type: Joi.string().valid(...typeValues).optional().messages({
    "any.only": "Invalid game type.",
  }),
  status: Joi.string().valid(...statusValues).optional().messages({
    "any.only": "Invalid game status.",
  }),
  scheduledDate: Joi.date().iso().allow(null).optional(),
  scheduledTime: Joi.string().trim().pattern(timePattern).allow("").optional().messages({
    "string.pattern.base": "Scheduled time must be in HH:mm format.",
  }),
  availableFrom: Joi.date().iso().allow(null).optional(),
  availableTo: Joi.date().iso().allow(null).optional(),
  isRecurring: Joi.boolean().optional(),
  recurrenceRule: Joi.string().trim().allow("").optional(),
  assignedLocationIds: Joi.array().items(objectId).optional(),
  assignedHostIds: Joi.array().items(objectId).optional(),
  isGlobal: Joi.boolean().optional(),
  rounds: Joi.array().items(roundSchema).min(minGameRounds).max(maxGameRounds).optional().messages({
    "array.min": "Game must have at least 1 quarter.",
    "array.max": "Game can have a maximum of 4 quarters.",
  }),
  intermissions: Joi.array().items(intermissionSchema).optional(),
  finalRound: finalRoundSchema.allow(null).optional(),
  defaultQuestionTime: Joi.number().integer().min(0).optional(),
  allowFlexibleRounds: Joi.boolean().optional(),
  coverImageUrl: Joi.string().trim().allow("").optional(),
  presentationTheme: Joi.string().trim().allow("").optional(),
  welcomeMessage: Joi.string().trim().allow("").optional(),
  intermissionMessage: Joi.string().trim().allow("").optional(),
  gameOverMessage: Joi.string().trim().allow("").optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update game.",
  });

const updateGameStatusValidation = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required()
    .messages({
      "any.required": "Invalid game status.",
      "any.only": "Invalid game status.",
    }),
});

const assignGameLocationsValidation = Joi.object({
  assignedLocationIds: Joi.array().items(objectId).required().messages({
    "any.required": "assignedLocationIds is required.",
  }),
});

const assignGameHostsValidation = Joi.object({
  assignedHostIds: Joi.array().items(objectId).required().messages({
    "any.required": "assignedHostIds is required.",
  }),
});

const getGamesQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  status: Joi.string().valid(...statusValues).optional(),
  type: Joi.string().valid(...typeValues).optional(),
  scheduledDate: Joi.string().trim().optional(),
  locationId: objectId.optional(),
  hostId: objectId.optional(),
  sortBy: Joi.string()
    .valid("title", "type", "status", "scheduledDate", "createdAt", "updatedAt")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const getAvailableGamesQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  locationId: objectId.optional(),
  date: Joi.string().trim().optional(),
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
  assignGameHostsValidation,
  assignGameLocationsValidation,
  createGameValidation,
  getAvailableGamesQueryValidation,
  getGamesQueryValidation,
  updateGameStatusValidation,
  updateGameValidation,
  validate,
};
