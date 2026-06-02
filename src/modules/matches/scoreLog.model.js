const mongoose = require("mongoose");

const { SCORE_ACTION_TYPES } = require("../../constants/scoringStatus");

const scoreLogSchema = new mongoose.Schema(
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
      default: null,
    },
    answerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Answer",
      default: null,
    },
    actionType: {
      type: String,
      enum: Object.values(SCORE_ACTION_TYPES),
      required: true,
    },
    pointsChange: {
      type: Number,
      required: true,
    },
    previousScore: {
      type: Number,
      required: true,
    },
    newScore: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Host",
      required: true,
    },
    performedByRole: {
      type: String,
      required: true,
      trim: true,
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

scoreLogSchema.index({ matchDbId: 1, createdAt: -1 });
scoreLogSchema.index({ teamId: 1 });
scoreLogSchema.index({ questionId: 1 });
scoreLogSchema.index({ actionType: 1 });

module.exports = mongoose.model("ScoreLog", scoreLogSchema);
