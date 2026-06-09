const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
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
    amount: {
      type: Number,
      min: 1,
      required: true,
    },
    currency: {
      type: String,
      lowercase: true,
      trim: true,
      default: "usd",
    },
    reason: {
      type: String,
      enum: ["duplicate", "fraudulent", "requested_by_customer", ""],
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "requires_action", "succeeded", "failed", "canceled"],
      default: "pending",
    },
    stripeRefundId: {
      type: String,
      trim: true,
      default: "",
    },
    stripeChargeId: {
      type: String,
      trim: true,
      default: "",
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: "",
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
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

refundSchema.index({ transactionId: 1 });
refundSchema.index({ matchDbId: 1 });
refundSchema.index({ matchId: 1 });
refundSchema.index({ locationId: 1 });
refundSchema.index({ status: 1 });
refundSchema.index({ createdAt: -1 });
refundSchema.index({ stripeRefundId: 1 }, { sparse: true });

module.exports = mongoose.model("Refund", refundSchema);
