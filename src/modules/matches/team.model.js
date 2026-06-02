const mongoose = require("mongoose");

const { CURRENT_ANSWER_STATUS, TEAM_STATUS } = require("../../constants/teamStatus");

const deviceHistorySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
    ipAddress: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
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
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    teamNameNormalized: {
      type: String,
      required: true,
      trim: true,
    },
    securityCodeHash: {
      type: String,
      required: true,
      select: false,
    },
    activeDeviceId: {
      type: String,
      required: true,
      trim: true,
    },
    activeSocketId: {
      type: String,
      trim: true,
      default: "",
    },
    deviceHistory: [deviceHistorySchema],
    deviceSwitchRequested: {
      type: Boolean,
      default: false,
    },
    pendingDeviceId: {
      type: String,
      trim: true,
      default: "",
    },
    playerSessionToken: {
      type: String,
      select: false,
      default: "",
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    rejoinedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(TEAM_STATUS),
      default: TEAM_STATUS.ACTIVE,
    },
    score: {
      type: Number,
      default: 0,
    },
    rank: {
      type: Number,
      default: null,
    },
    currentAnswerStatus: {
      type: String,
      enum: Object.values(CURRENT_ANSWER_STATUS),
      default: CURRENT_ANSWER_STATUS.NOT_SUBMITTED,
    },
    removedByHost: {
      type: Boolean,
      default: false,
    },
    removedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.securityCodeHash;
        delete ret.playerSessionToken;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.securityCodeHash;
        delete ret.playerSessionToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

teamSchema.index({ matchDbId: 1, teamNameNormalized: 1 }, { unique: true });
teamSchema.index({ matchId: 1 });
teamSchema.index({ status: 1 });
teamSchema.index({ activeDeviceId: 1 });
teamSchema.index({ matchDbId: 1, score: -1, joinedAt: 1 });
teamSchema.index({ matchDbId: 1, status: 1 });
teamSchema.index({ matchDbId: 1, joinedAt: 1 });

module.exports = mongoose.model("Team", teamSchema);
