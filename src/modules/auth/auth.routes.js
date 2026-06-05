const express = require("express");

const authController = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authMiddleware, authController.me);
router.post("/logout", authMiddleware, authController.logout);
router.post("/change-password", authMiddleware, authController.changePassword);
router.patch("/profile", authMiddleware, authController.updateProfile);

module.exports = router;
