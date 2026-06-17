const mongoose = require("mongoose");

const minGameRounds = 1;
const maxGameRounds = 4;

const roundSchema = new mongoose.Schema(
  {
    roundNumber: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
    },
    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
    sortOrder: {
      type: Number,
      required: true,
    },
    isFinalRound: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const intermissionSchema = new mongoose.Schema(
  {
    afterRound: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    promoImageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const gameSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      enum: ["weekly", "test", "private_event", "special"],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "archived"],
      required: true,
      default: "draft",
    },
    scheduledDate: {
      type: Date,
      default: null,
    },
    scheduledTime: {
      type: String,
      default: "",
      trim: true,
      match: /^$|^([01]\d|2[0-3]):[0-5]\d$/,
    },
    availableFrom: {
      type: Date,
      default: null,
    },
    availableTo: {
      type: Date,
      default: null,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrenceRule: {
      type: String,
      default: "",
      trim: true,
    },
    assignedLocationIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Location",
      },
    ],
    assignedHostIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Host",
      },
    ],
    isGlobal: {
      type: Boolean,
      default: false,
    },
    rounds: {
      type: [roundSchema],
      validate: {
        validator(rounds) {
          return (
            Array.isArray(rounds) &&
            rounds.length >= minGameRounds &&
            rounds.length <= maxGameRounds
          );
        },
        message: "Game must have between 1 and 4 quarters.",
      },
    },
    intermissions: [intermissionSchema],
    finalRound: {
      type: roundSchema,
      default: null,
      validate: {
        validator(round) {
          return !round || !Array.isArray(round.questionIds) || round.questionIds.length <= 1;
        },
        message: "Final round can have only one question.",
      },
    },
    totalQuestions: {
      type: Number,
      default: 0,
    },
    defaultQuestionTime: {
      type: Number,
      default: 60,
    },
    allowFlexibleRounds: {
      type: Boolean,
      default: true,
    },
    coverImageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    presentationTheme: {
      type: String,
      default: "default",
      trim: true,
    },
    welcomeMessage: {
      type: String,
      default: "",
      trim: true,
    },
    intermissionMessage: {
      type: String,
      default: "",
      trim: true,
    },
    gameOverMessage: {
      type: String,
      default: "",
      trim: true,
    },
    googleCalendarEventId: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
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

// Pre-save hook to calculate total questions
gameSchema.pre("save", function computeTotalQuestions(next) {
  let count = 0;
  if (Array.isArray(this.rounds)) {
    this.rounds.forEach((r) => {
      if (r && Array.isArray(r.questionIds)) {
        count += r.questionIds.length;
      }
    });
  }
  if (this.finalRound && Array.isArray(this.finalRound.questionIds)) {
    count += this.finalRound.questionIds.length;
  }
  this.totalQuestions = count;

  if (typeof next === "function") {
    next();
  }
});

// Single-field and compound indexes for efficient querying
gameSchema.index({ status: 1 });
gameSchema.index({ scheduledDate: 1 });
gameSchema.index({ availableFrom: 1, availableTo: 1 });
gameSchema.index({ assignedHostIds: 1 });
gameSchema.index({ assignedLocationIds: 1 });
gameSchema.index({ isGlobal: 1 });

// Text index for search functionality
gameSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Game", gameSchema);
