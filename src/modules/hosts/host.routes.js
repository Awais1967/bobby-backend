const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const hostController = require("./host.controller");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole(ROLES.SUPER_ADMIN, { message: "Only Super Admin can manage hosts." }));

router.post("/", hostController.createHost);
router.get("/", hostController.getHosts);
router.patch("/:id/archive", hostController.archiveHost);
router.patch("/:id/restore", hostController.restoreHost);
router.get("/:id", hostController.getHostById);
router.put("/:id", hostController.updateHost);
router.patch("/:id/password", hostController.changeHostPassword);
router.patch("/:id/status", hostController.updateHostStatus);
router.delete("/:id", hostController.deleteHost);

module.exports = router;
