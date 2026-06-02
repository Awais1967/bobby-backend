const Joi = require("joi");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");
const { MATCH_STATUS } = require("../../constants/matchStatus");
const { REPORT_GROUP_BY } = require("../../constants/reportTypes");

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const pageFields = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
};

const dateFields = {
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
};

const matchSortFields = [
  "matchId",
  "gameTitle",
  "locationName",
  "hostName",
  "startedAt",
  "closedAt",
  "createdAt",
  "totalTeams",
  "billingStatus",
  "status",
];

const getMatchReportsQueryValidation = Joi.object({
  ...pageFields,
  ...dateFields,
  search: Joi.string().trim().allow("").optional(),
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
  gameId: Joi.string().pattern(objectIdPattern).optional(),
  matchStatus: Joi.string().valid(...Object.values(MATCH_STATUS)).optional(),
  billingStatus: Joi.string().valid(...Object.values(BILLING_STATUS)).optional(),
  billingMode: Joi.string().valid(...Object.values(BILLING_MODE)).optional(),
  sortBy: Joi.string().valid(...matchSortFields).default("startedAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const getBillingReportsQueryValidation = Joi.object({
  ...pageFields,
  ...dateFields,
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
  billingStatus: Joi.string().valid(...Object.values(BILLING_STATUS)).optional(),
  billingMode: Joi.string().valid(...Object.values(BILLING_MODE)).optional(),
});

const getHostReportsQueryValidation = Joi.object({
  ...pageFields,
  ...dateFields,
  hostId: Joi.string().pattern(objectIdPattern).optional(),
  locationId: Joi.string().pattern(objectIdPattern).optional(),
});

const getLocationReportsQueryValidation = Joi.object({
  ...pageFields,
  ...dateFields,
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  country: Joi.string().trim().allow("").optional(),
  city: Joi.string().trim().allow("").optional(),
});

const getReportsSummaryQueryValidation = Joi.object({
  ...dateFields,
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
});

const getRevenueAnalyticsQueryValidation = Joi.object({
  ...dateFields,
  groupBy: Joi.string()
    .valid(...Object.values(REPORT_GROUP_BY))
    .default(REPORT_GROUP_BY.MONTH),
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
});

const getTeamAnalyticsQueryValidation = Joi.object({
  ...dateFields,
  locationId: Joi.string().pattern(objectIdPattern).optional(),
  hostId: Joi.string().pattern(objectIdPattern).optional(),
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
  getBillingReportsQueryValidation,
  getHostReportsQueryValidation,
  getLocationReportsQueryValidation,
  getMatchReportsQueryValidation,
  getReportsSummaryQueryValidation,
  getRevenueAnalyticsQueryValidation,
  getTeamAnalyticsQueryValidation,
  validate,
};
