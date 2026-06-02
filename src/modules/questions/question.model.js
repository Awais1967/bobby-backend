const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    // Basic fields
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      required: true,
      default: "draft",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    explanation: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // Media fields
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    audioUrl: {
      type: String,
      default: "",
      trim: true,
    },
    mediaType: {
      type: String,
      enum: ["none", "image", "audio"],
      default: "none",
    },
    mediaCaption: {
      type: String,
      default: "",
      trim: true,
    },

    // Answer data fields
    options: [optionSchema],
    correctAnswer: {
      type: String,
      default: "",
      trim: true,
    },
    correctAnswers: [
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
    numericTolerance: {
      type: Number,
      default: 0,
    },
    fiftyFiftyOptions: [
      {
        type: String,
        trim: true,
      },
    ],
    songTitle: {
      type: String,
      default: "",
      trim: true,
    },
    artistName: {
      type: String,
      default: "",
      trim: true,
    },

    // Scoring configurations
    points: {
      type: Number,
      default: 10,
      min: 0,
    },
    partialCredit: {
      type: Boolean,
      default: false,
    },
    speedScoringEnabled: {
      type: Boolean,
      default: false,
    },
    maxSpeedPoints: {
      type: Number,
      default: null,
    },
    wagerEnabled: {
      type: Boolean,
      default: false,
    },
    maxWagerPercent: {
      type: Number,
      default: 50,
    },

    // Game Organization fields
    defaultRoundType: {
      type: String,
      default: "",
      trim: true,
    },
    estimatedTimeSeconds: {
      type: Number,
      default: 60,
    },

    // System fields
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

// Indexes
questionSchema.index({ type: 1 });
questionSchema.index({ status: 1 });
questionSchema.index({ category: 1 });
questionSchema.index({ difficulty: 1 });

// Text index for search functionality
questionSchema.index({
  questionText: "text",
  category: "text",
  tags: "text",
});

module.exports = mongoose.model("Question", questionSchema);
