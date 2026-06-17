const mongoose = require("mongoose");

const {
  BILLING_STATUS,
  MATCH_CURRENT_STATE,
  MATCH_STATUS,
} = require("../../constants/matchStatus");

const matchSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    entryCode: {
      type: String,
      required: true,
      trim: true,
    },
    qrCodeUrl: {
      type: String,
      trim: true,
      default: "",
    },
    qrCodeDataUrl: {
      type: String,
      default: "",
    },
    joinUrl: {
      type: String,
      required: true,
      trim: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Host",
      required: true,
    },
    gameTitle: {
      type: String,
      required: true,
      trim: true,
    },
    locationName: {
      type: String,
      required: true,
      trim: true,
    },
    hostName: {
      type: String,
      required: true,
      trim: true,
    },
    billingMode: {
      type: String,
      enum: ["auto_charge", "invoice_later"],
      required: true,
    },
    defaultMatchPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      lowercase: true,
      trim: true,
      default: "usd",
    },
    status: {
      type: String,
      enum: Object.values(MATCH_STATUS),
      default: MATCH_STATUS.SETUP,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    currentRoundIndex: {
      type: Number,
      default: null,
    },
    currentQuestionIndex: {
      type: Number,
      default: null,
    },
    currentQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      default: null,
    },
    currentState: {
      type: String,
      enum: Object.values(MATCH_CURRENT_STATE),
      default: MATCH_CURRENT_STATE.SETUP,
    },
    isQuestionOpen: {
      type: Boolean,
      default: false,
    },
    isAnswerRevealed: {
      type: Boolean,
      default: false,
    },
    isIntermission: {
      type: Boolean,
      default: false,
    },
    activeIntermissionIndex: {
      type: Number,
      default: null,
    },
    timerStartedAt: {
      type: Date,
      default: null,
    },
    timerPausedAt: {
      type: Date,
      default: null,
    },
    timerDurationSeconds: {
      type: Number,
      min: 0,
      default: 60,
    },
    billingStatus: {
      type: String,
      enum: Object.values(BILLING_STATUS),
      default: BILLING_STATUS.NOT_STARTED,
    },
    chargedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: "",
    },
    receiptSent: {
      type: Boolean,
      default: false,
    },
    billingFailureReason: {
      type: String,
      trim: true,
      default: "",
    },
    receiptEmailDestinations: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    totalTeams: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      min: 0,
      default: 0,
    },
    skippedQuestionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
    cancelReason: {
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

matchSchema.index({ entryCode: 1, status: 1 });
matchSchema.index({ hostId: 1, status: 1 });
matchSchema.index({ locationId: 1, status: 1 });
matchSchema.index({ gameId: 1 });
matchSchema.index({ billingStatus: 1 });
matchSchema.index({ scheduledAt: 1 });
matchSchema.index({ createdAt: -1 });
matchSchema.index({ matchId: "text", gameTitle: "text", locationName: "text", hostName: "text" });

module.exports = mongoose.model("Match", matchSchema);
