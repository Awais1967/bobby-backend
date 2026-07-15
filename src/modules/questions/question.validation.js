const Joi = require("joi");

const typeValues = [
  "open_text",
  "multiple_choice",
  "ordering",
  "fifty_fifty",
  "name_that_tune",
  "audio",
  "image",
  "numeric_estimate",
  "speed",
  "wager",
];

const statusValues = ["draft", "active", "archived"];
const difficultyValues = ["easy", "medium", "hard"];
const mediaTypeValues = ["none", "image", "audio"];

const optionSchema = Joi.object({
  label: Joi.string().trim().required().messages({
    "any.required": "Option label is required.",
    "string.empty": "Option label is required.",
  }),
  text: Joi.string().trim().required().messages({
    "any.required": "Option text is required.",
    "string.empty": "Option text is required.",
  }),
});

const baseQuestionFields = {
  questionText: Joi.string().trim().required().messages({
    "any.required": "Question text is required.",
    "string.empty": "Question text is required.",
  }),
  category: Joi.string().trim().required().messages({
    "any.required": "Category is required.",
    "string.empty": "Category is required.",
  }),
  type: Joi.string()
    .valid(...typeValues)
    .required()
    .messages({
      "any.required": "Invalid question type.",
      "any.only": "Invalid question type.",
    }),
  difficulty: Joi.string()
    .valid(...difficultyValues)
    .required()
    .messages({
      "any.required": "Difficulty is required.",
      "any.only": "Invalid question difficulty.",
    }),
  status: Joi.string()
    .valid(...statusValues)
    .default("draft")
    .messages({
      "any.only": "Invalid question status.",
    }),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  usageType: Joi.string().valid("regular", "tie_breaker").default("regular"),
  explanation: Joi.string().trim().allow("").default(""),
  notes: Joi.string().trim().allow("").default(""),

  // Media
  imageUrl: Joi.string().trim().allow("").default(""),
  audioUrl: Joi.string().trim().allow("").default(""),
  mediaType: Joi.string()
    .valid(...mediaTypeValues)
    .default("none"),
  mediaCaption: Joi.string().trim().allow("").default(""),

  // Answer keys
  options: Joi.array().items(optionSchema).default([]),
  correctAnswer: Joi.string().trim().allow("").default(""),
  correctAnswers: Joi.array().items(Joi.string().trim()).default([]),
  orderingAnswer: Joi.array().items(Joi.string().trim()).default([]),
  numericAnswer: Joi.number().allow(null).default(null),
  numericTolerance: Joi.number().min(0).default(0),
  fiftyFiftyOptions: Joi.array().items(Joi.string().trim()).default([]),
  songTitle: Joi.string().trim().allow("").default(""),
  artistName: Joi.string().trim().allow("").default(""),

  // Scoring
  points: Joi.number().min(0).default(10),
  partialCredit: Joi.boolean().default(false),
  speedScoringEnabled: Joi.boolean().default(false),
  maxSpeedPoints: Joi.number().min(0).allow(null).default(null),
  wagerEnabled: Joi.boolean().default(false),
  maxWagerPercent: Joi.number().min(0).max(100).default(50),

  // Organization
  defaultRoundType: Joi.string().trim().allow("").default(""),
  estimatedTimeSeconds: Joi.number().min(0).default(60),
};

const createQuestionValidation = Joi.object(baseQuestionFields);

const updateQuestionValidation = Joi.object({
  questionText: Joi.string().trim().optional(),
  category: Joi.string().trim().optional(),
  type: Joi.string()
    .valid(...typeValues)
    .optional()
    .messages({
      "any.only": "Invalid question type.",
    }),
  difficulty: Joi.string()
    .valid(...difficultyValues)
    .optional(),
  status: Joi.string()
    .valid(...statusValues)
    .optional()
    .messages({
      "any.only": "Invalid question status.",
    }),
  tags: Joi.array().items(Joi.string().trim()).optional(),
  usageType: Joi.string().valid("regular", "tie_breaker").optional(),
  explanation: Joi.string().trim().allow("").optional(),
  notes: Joi.string().trim().allow("").optional(),

  // Media
  imageUrl: Joi.string().trim().allow("").optional(),
  audioUrl: Joi.string().trim().allow("").optional(),
  mediaType: Joi.string()
    .valid(...mediaTypeValues)
    .optional(),
  mediaCaption: Joi.string().trim().allow("").optional(),

  // Answer keys
  options: Joi.array().items(optionSchema).optional(),
  correctAnswer: Joi.string().trim().allow("").optional(),
  correctAnswers: Joi.array().items(Joi.string().trim()).optional(),
  orderingAnswer: Joi.array().items(Joi.string().trim()).optional(),
  numericAnswer: Joi.number().allow(null).optional(),
  numericTolerance: Joi.number().min(0).optional(),
  fiftyFiftyOptions: Joi.array().items(Joi.string().trim()).optional(),
  songTitle: Joi.string().trim().allow("").optional(),
  artistName: Joi.string().trim().allow("").optional(),

  // Scoring
  points: Joi.number().min(0).optional(),
  partialCredit: Joi.boolean().optional(),
  speedScoringEnabled: Joi.boolean().optional(),
  maxSpeedPoints: Joi.number().min(0).allow(null).optional(),
  wagerEnabled: Joi.boolean().optional(),
  maxWagerPercent: Joi.number().min(0).max(100).optional(),

  // Organization
  defaultRoundType: Joi.string().trim().allow("").optional(),
  estimatedTimeSeconds: Joi.number().min(0).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field is required to update question.",
  });

const updateQuestionStatusValidation = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required()
    .messages({
      "any.required": "Invalid question status.",
      "any.only": "Invalid question status.",
    }),
});

const bulkCreateQuestionsValidation = Joi.object({
  questions: Joi.array().items(Joi.object()).required().messages({
    "any.required": "Questions array is required.",
  }),
});

const getQuestionsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  category: Joi.string().trim().allow("").optional(),
  type: Joi.string()
    .valid(...typeValues)
    .optional(),
  difficulty: Joi.string()
    .valid(...difficultyValues)
    .optional(),
  status: Joi.string()
    .valid(...statusValues)
    .optional(),
  tag: Joi.string().trim().allow("").optional(),
  usageType: Joi.string().valid("regular", "tie_breaker").optional(),
  sortBy: Joi.string()
    .valid("questionText", "category", "type", "difficulty", "status", "createdAt", "updatedAt")
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
  bulkCreateQuestionsValidation,
  createQuestionValidation,
  getQuestionsQueryValidation,
  updateQuestionStatusValidation,
  updateQuestionValidation,
  validate,
};
