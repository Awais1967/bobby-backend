const authService = require("./auth.service");
const {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  updateProfileSchema,
  validate,
  verifyOtpSchema,
} = require("./auth.validation");

async function login(req, res, next) {
  try {
    const payload = validate(loginSchema, req.body);
    const data = await authService.login(payload);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getCurrentUser(req.user);

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
}

async function changePassword(req, res, next) {
  try {
    const payload = validate(changePasswordSchema, req.body);
    const user = await authService.changePassword({
      user: req.user,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const payload = validate(updateProfileSchema, req.body);
    const user = await authService.updateProfile({
      user: req.user,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const payload = validate(forgotPasswordSchema, req.body);
    const data = await authService.requestPasswordReset(payload);

    return res.status(200).json({
      success: true,
      message: "If an eligible account exists, a password reset code has been sent.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function resendOtp(req, res, next) {
  return forgotPassword(req, res, next);
}

async function verifyOtp(req, res, next) {
  try {
    const payload = validate(verifyOtpSchema, req.body);
    const data = await authService.verifyPasswordResetOtp(payload);

    return res.status(200).json({
      success: true,
      message: "Verification code accepted.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const payload = validate(resetPasswordSchema, req.body);
    await authService.resetPassword(payload);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  resendOtp,
  resetPassword,
  updateProfile,
  verifyOtp,
};
