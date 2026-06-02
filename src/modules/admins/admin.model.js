const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const ROLES = require("../../constants/roles");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: [ROLES.SUPER_ADMIN],
      default: ROLES.SUPER_ADMIN,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

adminSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    if (typeof next === "function") return next();
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
  if (typeof next === "function") return next();
});

adminSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
