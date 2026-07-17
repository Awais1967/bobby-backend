const questionService = require("./question.service");
const fileUploadService = require("../../services/fileUpload.service");
const {
  bulkCreateQuestionsValidation,
  createQuestionValidation,
  getQuestionsQueryValidation,
  updateQuestionStatusValidation,
  updateQuestionValidation,
  validate,
} = require("./question.validation");

const arrayFields = new Set(["tags", "correctAnswers", "orderingAnswer", "fiftyFiftyOptions"]);
const jsonArrayFields = new Set(["options"]);
const booleanFields = new Set(["partialCredit", "speedScoringEnabled", "wagerEnabled"]);
const numberFields = new Set([
  "numericAnswer",
  "numericTolerance",
  "points",
  "maxSpeedPoints",
  "maxWagerPercent",
  "estimatedTimeSeconds",
]);

function parseJson(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) return value.map((item) => parseJson(item));
  if (value === undefined) return value;

  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed;

  if (typeof value === "string") {
    if (!value.trim()) return [];
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [value];
}

function normalizeMultipartQuestionBody(body = {}) {
  return Object.entries(body).reduce((payload, [field, rawValue]) => {
    let value = Array.isArray(rawValue) && rawValue.length === 1 ? rawValue[0] : rawValue;

    if (jsonArrayFields.has(field)) {
      value = normalizeArrayField(value);
    } else if (arrayFields.has(field)) {
      value = normalizeArrayField(value);
    } else if (booleanFields.has(field) && typeof value === "string") {
      value = value === "true" || value === "1";
    } else if (numberFields.has(field)) {
      value = value === "" || value === undefined ? null : Number(value);
    }

    payload[field] = value;
    return payload;
  }, {});
}

async function buildQuestionPayload(req) {
  const payload = normalizeMultipartQuestionBody(req.body);
  const uploadedMedia = await fileUploadService.uploadQuestionMedia(req.files);
  const mergedPayload = {
    ...payload,
    ...uploadedMedia,
  };

  if (!mergedPayload.mediaType && mergedPayload.imageUrl) {
    mergedPayload.mediaType = "image";
  }

  if (!mergedPayload.mediaType && mergedPayload.audioUrl) {
    mergedPayload.mediaType = "audio";
  }

  return mergedPayload;
}

async function createQuestion(req, res, next) {
  try {
    const rawPayload = await buildQuestionPayload(req);
    const payload = validate(createQuestionValidation, rawPayload);
    const question = await questionService.createQuestion(payload, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Question created successfully",
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getQuestions(req, res, next) {
  try {
    const query = validate(getQuestionsQueryValidation, req.query);
    const data = await questionService.getQuestions(query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getQuestionCategories(req, res, next) {
  try {
    const items = await questionService.getQuestionCategories();
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    return next(error);
  }
}

async function getQuestionById(req, res, next) {
  try {
    const question = await questionService.getQuestionById(req.params.id);

    return res.status(200).json({
      success: true,
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateQuestion(req, res, next) {
  try {
    const rawPayload = await buildQuestionPayload(req);
    const payload = validate(updateQuestionValidation, rawPayload);
    const question = await questionService.updateQuestion(req.params.id, payload);

    return res.status(200).json({
      success: true,
      message: "Question updated successfully",
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateQuestionStatus(req, res, next) {
  try {
    const payload = validate(updateQuestionStatusValidation, req.body);
    const question = await questionService.updateQuestionStatus(req.params.id, payload.status);

    return res.status(200).json({
      success: true,
      message: "Question status updated successfully",
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteQuestion(req, res, next) {
  try {
    const result = await questionService.deleteQuestion(req.params.id);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return next(error);
  }
}

async function duplicateQuestion(req, res, next) {
  try {
    const question = await questionService.duplicateQuestion(req.params.id, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Question duplicated successfully",
      data: {
        question,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function bulkCreateQuestions(req, res, next) {
  try {
    const payload = validate(bulkCreateQuestionsValidation, req.body);
    const result = await questionService.bulkCreateQuestions(payload.questions, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Bulk question import processed",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getHostSafeQuestion(req, res, next) {
  try {
    const question = await questionService.getQuestionById(req.params.id);
    const safeQuestion = questionService.toHostSafeQuestionResponse(question);

    return res.status(200).json({
      success: true,
      data: {
        question: safeQuestion,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  bulkCreateQuestions,
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  getQuestionCategories,
  getHostSafeQuestion,
  getQuestionById,
  getQuestions,
  updateQuestion,
  updateQuestionStatus,
};
