const mongoose = require("mongoose");

const { ANSWER_STATUS, REVIEW_STATUS } = require("../../constants/answerStatus");

const answerSchema = new mongoose.Schema(
  {
    matchDbId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },
    matchId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    roundIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    questionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    questionType: {
      type: String,
      required: true,
      trim: true,
    },
    answerText: {
      type: String,
      trim: true,
      default: "",
    },
    selectedOption: {
      type: String,
      trim: true,
      default: "",
    },
    selectedOptions: [
      {
        type: String,
        trim: true,
      },
    ],
    orderingAnswer: [
      {
        type: String,
        trim: true,
      },
    ],
    numericAnswer: {
      type: Number,
      default: null,
    },
    wagerAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    submittedAnswerDisplay: {
      type: String,
      trim: true,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    responseTimeMs: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(ANSWER_STATUS),
      default: ANSWER_STATUS.SUBMITTED,
    },
    isLocked: {
      type: Boolean,
      default: true,
    },
    reopenedByHost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Host",
      default: null,
    },
    reopenedAt: {
      type: Date,
      default: null,
    },
    submittedDeviceId: {
      type: String,
      required: true,
      trim: true,
    },
    submittedSocketId: {
      type: String,
      trim: true,
      default: "",
    },
    reviewStatus: {
      type: String,
      enum: Object.values(REVIEW_STATUS),
      default: REVIEW_STATUS.PENDING,
    },
    isCorrect: {
      type: Boolean,
      default: null,
    },
    awardedPoints: {
      type: Number,
      default: 0,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Host",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    hostNote: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

answerSchema.index({ matchDbId: 1, teamId: 1, questionId: 1 }, { unique: true });
answerSchema.index({ matchDbId: 1, questionId: 1 });
answerSchema.index({ teamId: 1, submittedAt: -1 });
answerSchema.index({ reviewStatus: 1 });

module.exports = mongoose.model("Answer", answerSchema);
