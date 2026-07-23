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
    venueLocation: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
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
    clientEmail: {
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
    zip: {
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
      enum: ["active", "inactive", "suspended", "archived"],
      default: "active",
    },
    billingMethod: {
      type: String,
      enum: ["card", "invoice"],
      default: "invoice",
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
    cardBrand: {
      type: String,
      trim: true,
      default: "",
    },
    cardLast4: {
      type: String,
      trim: true,
      default: "",
    },
    cardExpMonth: {
      type: Number,
      default: null,
    },
    cardExpYear: {
      type: Number,
      default: null,
    },
    cardSetupStatus: {
      type: String,
      enum: ["not_requested", "pending", "complete", "expired"],
      default: "not_requested",
    },
    cardSetupTokenHash: {
      type: String,
      select: false,
      default: "",
    },
    cardSetupExpiresAt: {
      type: Date,
      default: null,
    },
    stripeSetupIntentId: {
      type: String,
      trim: true,
      default: "",
    },
    cardSetupEmailSentAt: {
      type: Date,
      default: null,
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
    pricingDiscount: {
      type: Boolean,
      default: false,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed", ""],
      default: "",
    },
    discountValue: {
      type: Number,
      default: 0,
    },
    discountDate: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    archiveReason: {
      type: String,
      trim: true,
      default: "",
    },
    restoredAt: {
      type: Date,
      default: null,
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
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

  if (!this.name) {
    this.name = this.clientName;
  }

  if (!this.venueLocation) {
    this.venueLocation = this.location || this.address || this.name;
  }

  if (!this.location) {
    this.location = this.venueLocation || this.address || "";
  }

  if (!this.clientEmail) {
    this.clientEmail = this.contactEmail;
  }

  if (!this.contactEmail) {
    this.contactEmail = this.clientEmail;
  }

  if (!this.billingMethod) {
    this.billingMethod = this.billingMode === "auto_charge" ? "card" : "invoice";
  }

  if (typeof next === "function") {
    next();
  }
});

locationSchema.index({
  name: "text",
  clientName: "text",
  venueLocation: "text",
  clientEmail: "text",
  contactEmail: "text",
  city: "text",
  zip: "text",
});

module.exports = mongoose.model("Location", locationSchema);
