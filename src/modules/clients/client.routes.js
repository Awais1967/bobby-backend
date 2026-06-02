const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const { handleClientLogoUpload, validateClientLogoFile } = require("../../middleware/upload.middleware");
const clientController = require("./client.controller");

const router = express.Router();

const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN, {
  message: "Only Super Admin can manage clients.",
});

router.post(
  "/",
  authMiddleware,
  requireSuperAdmin,
  handleClientLogoUpload,
  validateClientLogoFile,
  clientController.createClient
);
router.get("/", authMiddleware, requireSuperAdmin, clientController.getClients);
router.get("/my", authMiddleware, requireRole(ROLES.HOST, { message: "Host can only view assigned clients." }), clientController.getMyClients);
router.patch("/:id/billing-method", authMiddleware, requireSuperAdmin, clientController.updateClientBillingMethod);
router.patch("/:id/archive", authMiddleware, requireSuperAdmin, clientController.archiveClient);
router.patch("/:id/restore", authMiddleware, requireSuperAdmin, clientController.restoreClient);
router.patch("/:id/hosts", authMiddleware, requireSuperAdmin, clientController.assignClientHosts);
router.get("/:id", authMiddleware, requireSuperAdmin, clientController.getClientById);
router.put(
  "/:id",
  authMiddleware,
  requireSuperAdmin,
  handleClientLogoUpload,
  validateClientLogoFile,
  clientController.updateClient
);
router.delete("/:id", authMiddleware, requireSuperAdmin, clientController.deleteClient);

module.exports = router;
