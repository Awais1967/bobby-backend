const Joi = require("joi");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const { MATCH_STATUS } = require("../../constants/matchStatus");

const CALENDAR_MAX_RANGE_DAYS = 366;
const CALENDAR_DEFAULT_PAGE = 1;
const CALENDAR_DEFAULT_PAGE_SIZE = 50;
const CALENDAR_MAX_PAGE_SIZE = 200;
const CALENDAR_DEFAULT_OVERVIEW_LIMIT = 10;
const CALENDAR_MAX_OVERVIEW_LIMIT = 100;
const CALENDAR_GAME_STATUSES = ["draft", "scheduled", "active"];
const CALENDAR_GAME_TYPES = ["weekly", "test", "private_event", "special"];

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const pageFields = {
  page: Joi.number().integer().min(1).default(CALENDAR_DEFAULT_PAGE),
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(CALENDAR_MAX_PAGE_SIZE)
    .default(CALENDAR_DEFAULT_PAGE_SIZE),
};

const optionalFilterFields = {
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
  gameId: Joi.string().pattern(objectIdPattern).optional(),
  gameStatus: Joi.string().valid(...CALENDAR_GAME_STATUSES).optional(),
  gameType: Joi.string().valid(...CALENDAR_GAME_TYPES).optional(),
  matchStatus: Joi.string().valid(...Object.values(MATCH_STATUS)).optional(),
  billingStatus: Joi.string().valid(...Object.values(BILLING_STATUS)).optional(),
  billingMode: Joi.string().valid(...Object.values(BILLING_MODE)).optional(),
  eventCategory: Joi.string().valid("game", "match").optional(),
  search: Joi.string().trim().allow("").optional(),
};

const sortFields = ["scheduledAt", "startedAt", "closedAt", "createdAt", "matchId", "gameTitle", "locationName", "hostName"];

const monthlyFilters = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  ...pageFields,
  ...optionalFilterFields,
  sortBy: Joi.string()
    .valid(...sortFields)
    .default("scheduledAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const rangeFilters = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  ...pageFields,
  ...optionalFilterFields,
  sortBy: Joi.string()
    .valid(...sortFields)
    .default("scheduledAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
})
  .custom((value, helpers) => {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);
    if (start > end) {
      return helpers.error("any.invalid", { message: "startDate must be before or equal to endDate." });
    }
    const diffDays = (end - start) / 86400000;
    if (diffDays > CALENDAR_MAX_RANGE_DAYS) {
      return helpers.error("any.invalid", {
        message: `Date range cannot exceed ${CALENDAR_MAX_RANGE_DAYS} days.`,
      });
    }
    return value;
  }, "range validation")
  .messages({
    "any.invalid": "{{#message}}",
  });

const dayFilters = Joi.object({
  date: Joi.date().iso().required(),
  ...optionalFilterFields,
});

const matchIdParam = Joi.object({
  matchId: Joi.string().trim().required(),
});

const summaryFilters = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
  year: Joi.number().integer().min(2000).max(2100).optional(),
  ...optionalFilterFields,
})
  .or("startDate", "month")
  .custom((value, helpers) => {
    if (value.month && !value.year) {
      return helpers.error("any.invalid", { message: "year is required when month is provided." });
    }
    if (value.year && !value.month) {
      return helpers.error("any.invalid", { message: "month is required when year is provided." });
    }
    if (value.startDate && value.endDate && new Date(value.startDate) > new Date(value.endDate)) {
      return helpers.error("any.invalid", { message: "startDate must be before or equal to endDate." });
    }
    if (value.startDate && value.endDate) {
      const diffDays = (new Date(value.endDate) - new Date(value.startDate)) / 86400000;
      if (diffDays > CALENDAR_MAX_RANGE_DAYS) {
        return helpers.error("any.invalid", {
          message: `Date range cannot exceed ${CALENDAR_MAX_RANGE_DAYS} days.`,
        });
      }
    }
    return value;
  }, "summary validation")
  .messages({
    "any.invalid": "{{#message}}",
  });

const overviewFilters = Joi.object({
  limit: Joi.number()
    .integer()
    .min(1)
    .max(CALENDAR_MAX_OVERVIEW_LIMIT)
    .default(CALENDAR_DEFAULT_OVERVIEW_LIMIT),
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
  CALENDAR_DEFAULT_OVERVIEW_LIMIT,
  CALENDAR_DEFAULT_PAGE,
  CALENDAR_DEFAULT_PAGE_SIZE,
  CALENDAR_MAX_OVERVIEW_LIMIT,
  CALENDAR_MAX_PAGE_SIZE,
  CALENDAR_MAX_RANGE_DAYS,
  dayFilters,
  matchIdParam,
  monthlyFilters,
  overviewFilters,
  rangeFilters,
  summaryFilters,
  validate,
};
