const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const adminController = require("./admin.controller");

const router = express.Router();

const superAdminOnly = [
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, {
    message: "Only Super Admin can create another Super Admin.",
  }),
];

router.post("/", superAdminOnly, adminController.createAdmin);

module.exports = router;
