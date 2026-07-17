const mongoose = require("mongoose");

const Question = require("./question.model");

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureQuestionObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError("Question not found.", 404);
  }
}

function toQuestionResponse(question) {
  if (!question) {
    return null;
  }

  const data = typeof question.toObject === "function" ? question.toObject() : question;

  delete data.__v;
  if (data._id) {
    data.id = data._id.toString();
    delete data._id;
  }

  return data;
}

function cleanUnnecessaryAnswerKeys(data) {
  const type = data.type;

  // Remove options array for non-choice/non-ordering questions
  if (type !== "multiple_choice" && type !== "ordering") {
    delete data.options;
  }

  // Remove fifty fifty options
  if (type !== "fifty_fifty") {
    delete data.fiftyFiftyOptions;
  }

  // Remove music keys
  if (type !== "name_that_tune" && type !== "audio") {
    delete data.songTitle;
    delete data.artistName;
  }

  // Remove ordering answers
  if (type !== "ordering") {
    delete data.orderingAnswer;
  }

  // Remove numeric answer keys
  if (type !== "numeric_estimate") {
    delete data.numericAnswer;
    delete data.numericTolerance;
  }

  // Remove single correctAnswer
  const usesCorrectAnswer = [
    "multiple_choice",
    "fifty_fifty",
    "open_text",
    "image",
    "speed",
    "wager",
    "audio",
  ];
  if (!usesCorrectAnswer.includes(type)) {
    delete data.correctAnswer;
  }

  // Remove plural correctAnswers
  const usesCorrectAnswersList = ["open_text", "image", "speed", "wager", "audio"];
  if (!usesCorrectAnswersList.includes(type)) {
    delete data.correctAnswers;
  }
}

function toHostSafeQuestionResponse(question) {
  const data = toQuestionResponse(question);
  if (!data) {
    return null;
  }

  const answerNotes =
    data.notes ||
    data.explanation ||
    data.answerNotes ||
    data.answerExplanation ||
    "";
  data.explanation = answerNotes;
  data.notes = answerNotes;

  // Clean unnecessary answer keys that are not related to this question type
  cleanUnnecessaryAnswerKeys(data);

  return data;
}

function validateTypeSpecificFields(payload) {
  const type = payload.type;

  if (type === "multiple_choice") {
    if (!payload.options || !Array.isArray(payload.options) || payload.options.length === 0) {
      throw createHttpError("Options are required for this question type.", 400);
    }
    if (!payload.correctAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "ordering") {
    if (!payload.options || !Array.isArray(payload.options) || payload.options.length === 0) {
      throw createHttpError("Options are required for this question type.", 400);
    }
    if (!payload.orderingAnswer || !Array.isArray(payload.orderingAnswer) || payload.orderingAnswer.length === 0) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "fifty_fifty") {
    if (
      !payload.fiftyFiftyOptions ||
      !Array.isArray(payload.fiftyFiftyOptions) ||
      payload.fiftyFiftyOptions.length !== 2
    ) {
      throw createHttpError("Options are required for this question type.", 400);
    }
    if (!payload.correctAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "audio") {
    // Audio questions must have audioUrl and correct answers
    if (!payload.audioUrl) {
      throw createHttpError("Audio URL is required for audio questions.", 400);
    }
    const hasCorrectAnswer = payload.correctAnswer || (payload.correctAnswers && payload.correctAnswers.length > 0);
    if (!hasCorrectAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "name_that_tune") {
    // Name That Tune questions must have audioUrl, songTitle, and artistName
    if (!payload.audioUrl) {
      throw createHttpError("Audio URL is required for audio questions.", 400);
    }
    if (!payload.songTitle || !payload.artistName) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "image") {
    if (!payload.imageUrl) {
      throw createHttpError("Image URL is required for image questions.", 400);
    }
    const hasCorrectAnswer = payload.correctAnswer || (payload.correctAnswers && payload.correctAnswers.length > 0);
    if (!hasCorrectAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "numeric_estimate") {
    if (payload.numericAnswer === undefined || payload.numericAnswer === null) {
      throw createHttpError("Numeric answer is required.", 400);
    }
  } else if (type === "speed") {
    if (!payload.speedScoringEnabled) {
      throw createHttpError("Correct answer is required.", 400); // Trigger standard bad config error
    }
    if (payload.maxSpeedPoints === undefined || payload.maxSpeedPoints === null) {
      throw createHttpError("Correct answer is required.", 400);
    }
    const hasCorrectAnswer = payload.correctAnswer || (payload.correctAnswers && payload.correctAnswers.length > 0);
    if (!hasCorrectAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "wager") {
    if (!payload.wagerEnabled) {
      throw createHttpError("Correct answer is required.", 400);
    }
    const hasCorrectAnswer = payload.correctAnswer || (payload.correctAnswers && payload.correctAnswers.length > 0);
    if (!hasCorrectAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  } else if (type === "open_text") {
    const hasCorrectAnswer = payload.correctAnswer || (payload.correctAnswers && payload.correctAnswers.length > 0);
    if (!hasCorrectAnswer) {
      throw createHttpError("Correct answer is required.", 400);
    }
  }
}

async function isQuestionUsedInGame(questionId) {
  if (!mongoose.modelNames().includes("Game")) {
    return false;
  }

  const Game = mongoose.model("Game");
  const game = await Game.findOne({
    $or: [
      { "rounds.questionIds": questionId },
      { "finalRound.questionIds": questionId },
    ],
  }).select("_id");

  return Boolean(game);
}

async function createQuestion(payload, adminId) {
  validateTypeSpecificFields(payload);

  const question = await Question.create({
    ...payload,
    createdBy: adminId,
  });

  return toQuestionResponse(question);
}

async function getQuestions(query) {
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), "i");
    const searchConditions = [
      { questionText: searchRegex },
      { correctAnswer: searchRegex },
      { correctAnswers: searchRegex },
      { "options.text": searchRegex },
      { orderingAnswer: searchRegex },
      { fiftyFiftyOptions: searchRegex },
      { songTitle: searchRegex },
      { artistName: searchRegex },
      { category: searchRegex },
      { tags: searchRegex },
    ];
    const numericSearch = Number(query.search);

    if (Number.isFinite(numericSearch)) {
      searchConditions.push({ numericAnswer: numericSearch });
    }

    filter.$or = searchConditions;
  }

  if (query.category) {
    filter.category = new RegExp(`^${escapeRegex(query.category)}$`, "i");
  }

  if (query.type) {
    filter.type = query.type;
  }

  if (query.difficulty) {
    filter.difficulty = query.difficulty;
  }

  if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = { $ne: "archived" };
  }

  if (query.tag) {
    filter.tags = query.tag;
  }

  if (query.usageType) {
    filter.usageType = query.usageType;
  }

  const skip = (query.page - 1) * query.pageSize;
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .sort({ [query.sortBy]: sortDirection })
      .skip(skip)
      .limit(query.pageSize),
    Question.countDocuments(filter),
  ]);

  return {
    items: questions.map(toQuestionResponse),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

async function getQuestionById(id) {
  ensureQuestionObjectId(id);

  const question = await Question.findById(id);
  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  return toQuestionResponse(question);
}

async function getQuestionCategories() {
  const categories = await Question.distinct("category", { status: { $ne: "archived" } });
  return categories.filter(Boolean).sort((left, right) => left.localeCompare(right));
}

async function updateQuestion(id, payload) {
  ensureQuestionObjectId(id);

  const question = await Question.findById(id);
  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  const updatedMergedPayload = {
    ...question.toObject(),
    ...payload,
  };

  validateTypeSpecificFields(updatedMergedPayload);

  Object.entries(payload).forEach(([field, value]) => {
    question[field] = value;
  });

  await question.save();

  return toQuestionResponse(question);
}

async function updateQuestionStatus(id, status) {
  ensureQuestionObjectId(id);

  const question = await Question.findById(id);
  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  question.status = status;
  await question.save();

  return toQuestionResponse(question);
}

async function deleteQuestion(id) {
  ensureQuestionObjectId(id);

  const question = await Question.findById(id);
  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  const isUsed = await isQuestionUsedInGame(question._id);

  if (isUsed) {
    question.status = "archived";
    await question.save();
    return {
      archived: true,
      message: "Question is used in a game and has been archived instead of deleted.",
    };
  } else {
    await question.deleteOne();
    return {
      archived: false,
      message: "Question deleted successfully.",
    };
  }
}

async function duplicateQuestion(id, adminId) {
  ensureQuestionObjectId(id);

  const question = await Question.findById(id);
  if (!question) {
    throw createHttpError("Question not found.", 404);
  }

  const questionObj = question.toObject();

  delete questionObj._id;
  delete questionObj.id;
  delete questionObj.createdAt;
  delete questionObj.updatedAt;

  const newQuestionPayload = {
    ...questionObj,
    questionText: `Copy of ${questionObj.questionText}`,
    status: "draft",
    createdBy: adminId,
  };

  const newQuestion = await Question.create(newQuestionPayload);
  return toQuestionResponse(newQuestion);
}

async function bulkCreateQuestions(questionsArray, adminId) {
  let createdCount = 0;
  let failedCount = 0;
  const errors = [];
  const validQuestionsToInsert = [];

  const { createQuestionValidation } = require("./question.validation");

  for (let i = 0; i < questionsArray.length; i++) {
    const rawQuestion = questionsArray[i];
    try {
      // Validate schema format
      const { validate } = require("./question.validation");
      const parsed = validate(createQuestionValidation, rawQuestion);

      // Validate question type specific fields
      validateTypeSpecificFields(parsed);

      validQuestionsToInsert.push({
        ...parsed,
        createdBy: adminId,
      });
    } catch (error) {
      failedCount++;
      errors.push({
        row: i + 1, // 1-indexed row for user friendliness
        index: i,
        message: error.message,
      });
    }
  }

  if (validQuestionsToInsert.length > 0) {
    const inserted = await Question.insertMany(validQuestionsToInsert);
    createdCount = inserted.length;
  }

  return {
    createdCount,
    failedCount,
    errors,
  };
}

async function validateQuestionIds(questionIds, isDraftGame = false) {
  if (!questionIds || questionIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(questionIds.map((id) => id.toString()))];

  if (uniqueIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw createHttpError("One or more questions were not found.", 404);
  }

  const questions = await Question.find({ _id: { $in: uniqueIds } });

  if (questions.length !== uniqueIds.length) {
    throw createHttpError("One or more questions were not found.", 404);
  }

  if (!isDraftGame) {
    const inactiveQuestion = questions.find((q) => q.status !== "active");
    if (inactiveQuestion) {
      throw createHttpError(`One or more questions were not found.`, 400); // standard error or similar
    }
  }

  return questions;
}

module.exports = {
  bulkCreateQuestions,
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  getQuestionCategories,
  getQuestionById,
  getQuestions,
  toHostSafeQuestionResponse,
  updateQuestion,
  updateQuestionStatus,
  validateQuestionIds,
};
