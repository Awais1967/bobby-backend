const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    clientName: {
      type: String,
      trim: true,
    },
    contactName: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    timezone: {
      type: String,
      trim: true,
      default: "UTC",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    billingMode: {
      type: String,
      enum: ["auto_charge", "invoice_later"],
      required: true,
    },
    billingContactName: {
      type: String,
      trim: true,
      default: "",
    },
    billingContactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    billingContactEmails: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
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
    maskedPaymentMethod: {
      type: String,
      trim: true,
      default: "",
    },
    invoiceNotes: {
      type: String,
      trim: true,
      default: "",
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
    assignedHostIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Host",
      },
    ],
    logoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    promoImageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    intermissionMessage: {
      type: String,
      trim: true,
      default: "",
    },
    welcomeMessage: {
      type: String,
      trim: true,
      default: "",
    },
    gameOverMessage: {
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

locationSchema.pre("validate", function defaultClientName(next) {
  if (!this.clientName) {
    this.clientName = this.name;
  }

  next();
});

locationSchema.index({ name: "text", clientName: "text", contactEmail: "text", city: "text" });

module.exports = mongoose.model("Location", locationSchema);
