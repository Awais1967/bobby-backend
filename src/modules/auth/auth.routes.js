const express = require("express");

const authController = require("./auth.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.me);
router.post("/logout", authMiddleware, authController.logout);
router.post("/change-password", authMiddleware, authController.changePassword);
router.patch("/profile", authMiddleware, authController.updateProfile);

module.exports = router;
