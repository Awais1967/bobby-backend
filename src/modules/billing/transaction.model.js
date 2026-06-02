const mongoose = require("mongoose");

const { BILLING_MODE, BILLING_STATUS } = require("../../constants/billingStatus");

const transactionSchema = new mongoose.Schema(
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
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    gameTitle: {
      type: String,
      required: true,
      trim: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    locationName: {
      type: String,
      required: true,
      trim: true,
    },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Host",
      required: true,
    },
    hostName: {
      type: String,
      required: true,
      trim: true,
    },
    billingMode: {
      type: String,
      enum: Object.values(BILLING_MODE),
      required: true,
    },
    billingStatus: {
      type: String,
      enum: Object.values(BILLING_STATUS),
      default: BILLING_STATUS.NOT_STARTED,
    },
    amount: {
      type: Number,
      min: 0,
      required: true,
    },
    currency: {
      type: String,
      lowercase: true,
      trim: true,
      default: "usd",
    },
    stripeCustomerId: {
      type: String,
      trim: true,
      default: "",
    },
    stripePaymentMethodId: {
      type: String,
      trim: true,
      default: "",
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: "",
    },
    stripeChargeId: {
      type: String,
      trim: true,
      default: "",
    },
    stripeReceiptUrl: {
      type: String,
      trim: true,
      default: "",
    },
    receiptSent: {
      type: Boolean,
      default: false,
    },
    receiptEmailDestinations: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
    invoiceNotes: {
      type: String,
      trim: true,
      default: "",
    },
    chargedAt: {
      type: Date,
      default: null,
    },
    invoicedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: "",
    },
    adminNote: {
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

transactionSchema.index({ matchDbId: 1 });
transactionSchema.index({ matchId: 1 });
transactionSchema.index({ billingStatus: 1 });
transactionSchema.index({ billingMode: 1 });
transactionSchema.index({ locationId: 1 });
transactionSchema.index({ hostId: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ stripePaymentIntentId: 1 });
transactionSchema.index({ matchId: "text", gameTitle: "text", locationName: "text", hostName: "text" });

module.exports = mongoose.model("Transaction", transactionSchema);
