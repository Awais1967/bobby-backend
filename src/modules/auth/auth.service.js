const crypto = require("crypto");

const ROLES = require("../../constants/roles");
const generateToken = require("../../utils/generateToken");
const Admin = require("../admins/admin.model");
const Host = require("../hosts/host.model");
const authEmailService = require("./auth-email.service");

const OTP_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES || 10);
const TOKEN_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || 15);
const OTP_MAX_ATTEMPTS = 5;
const RECOVERY_FIELDS =
  "+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts +passwordResetTokenHash +passwordResetTokenExpiresAt";

function getModelByRole(role) {
  if (role === ROLES.SUPER_ADMIN) {
    return Admin;
  }

  if (role === ROLES.HOST) {
    return Host;
  }

  return null;
}

function toUserProfile(user, role) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    role,
    status: user.status,
  };
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createRecoveryError() {
  const error = new Error("The verification code or reset token is invalid or expired.");
  error.statusCode = 400;
  return error;
}

async function findRecoveryUser({ email, role }) {
  const UserModel = getModelByRole(role);
  if (!UserModel) return null;
  return UserModel.findOne({ email: email.toLowerCase() }).select(RECOVERY_FIELDS);
}

async function requestPasswordReset({ email, role }) {
  const user = await findRecoveryUser({ email, role });
  let devOtp;

  if (user && user.status === "active") {
    const otp = String(crypto.randomInt(100000, 1000000));
    user.passwordResetOtpHash = hashSecret(otp);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.passwordResetOtpAttempts = 0;
    user.passwordResetTokenHash = "";
    user.passwordResetTokenExpiresAt = null;
    await user.save();

    try {
      await authEmailService.sendPasswordResetOtp({
        email: user.email,
        name: user.name,
        otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    } catch (error) {
      console.error(`Password reset email delivery failed: ${error.message}`);
    }

    if (
      process.env.NODE_ENV !== "production" &&
      String(process.env.PASSWORD_RESET_EXPOSE_OTP || "").toLowerCase() === "true"
    ) {
      devOtp = otp;
    }
  }

  return {
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    ...(devOtp ? { devOtp } : {}),
  };
}

async function verifyPasswordResetOtp({ email, role, otp }) {
  const user = await findRecoveryUser({ email, role });
  const valid =
    user &&
    user.status === "active" &&
    user.passwordResetOtpHash &&
    user.passwordResetOtpExpiresAt > new Date() &&
    user.passwordResetOtpAttempts < OTP_MAX_ATTEMPTS &&
    crypto.timingSafeEqual(
      Buffer.from(user.passwordResetOtpHash),
      Buffer.from(hashSecret(otp))
    );

  if (!valid) {
    if (user && user.passwordResetOtpHash) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;
      if (user.passwordResetOtpAttempts >= OTP_MAX_ATTEMPTS) {
        user.passwordResetOtpHash = "";
        user.passwordResetOtpExpiresAt = null;
      }
      await user.save();
    }
    throw createRecoveryError();
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetOtpHash = "";
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpAttempts = 0;
  user.passwordResetTokenHash = hashSecret(resetToken);
  user.passwordResetTokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await user.save();

  return {
    resetToken,
    expiresInSeconds: TOKEN_EXPIRY_MINUTES * 60,
  };
}

async function resetPassword({ email, role, resetToken, newPassword }) {
  const user = await findRecoveryUser({ email, role });
  const valid =
    user &&
    user.status === "active" &&
    user.passwordResetTokenHash &&
    user.passwordResetTokenExpiresAt > new Date() &&
    crypto.timingSafeEqual(
      Buffer.from(user.passwordResetTokenHash),
      Buffer.from(hashSecret(resetToken))
    );

  if (!valid) {
    throw createRecoveryError();
  }

  user.password = newPassword;
  user.passwordResetOtpHash = "";
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpAttempts = 0;
  user.passwordResetTokenHash = "";
  user.passwordResetTokenExpiresAt = null;
  await user.save();
}

async function login({ email, password, role }) {
  const UserModel = getModelByRole(role);

  if (!UserModel) {
    const error = new Error("Invalid login role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findOne({ email: email.toLowerCase() }).select("+password");

  if (!user) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  if (role === ROLES.HOST && user.status === "archived") {
    const error = new Error("Your host account has been archived. Please contact Super Admin.");
    error.statusCode = 403;
    throw error;
  }

  if (user.status !== "active") {
    const error = new Error("Account is not active.");
    error.statusCode = 403;
    throw error;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const profile = toUserProfile(user, role);
  const token = generateToken(profile);

  return {
    token,
    user: profile,
  };
}

async function getCurrentUser({ id, role }) {
  const UserModel = getModelByRole(role);

  if (!UserModel) {
    const error = new Error("Invalid user role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findById(id);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return toUserProfile(user, role);
}

async function changePassword({ user: authUser, currentPassword, newPassword }) {
  const UserModel = getModelByRole(authUser.role);

  if (!UserModel) {
    const error = new Error("Invalid user role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findById(authUser.id).select("+password");

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const isPasswordValid = await user.comparePassword(currentPassword);

  if (!isPasswordValid) {
    const error = new Error("Current password is incorrect.");
    error.statusCode = 400;
    throw error;
  }

  user.password = newPassword;
  await user.save();

  return toUserProfile(user, authUser.role);
}

async function updateProfile({ user: authUser, name, avatarUrl }) {
  const UserModel = getModelByRole(authUser.role);

  if (!UserModel) {
    const error = new Error("Invalid user role.");
    error.statusCode = 400;
    throw error;
  }

  const user = await UserModel.findById(authUser.id);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  user.name = name;
  if (avatarUrl !== undefined) {
    user.avatarUrl = avatarUrl;
  }

  await user.save();
  return toUserProfile(user, authUser.role);
}

module.exports = {
  changePassword,
  getCurrentUser,
  login,
  requestPasswordReset,
  resetPassword,
  updateProfile,
  verifyPasswordResetOtp,
};
