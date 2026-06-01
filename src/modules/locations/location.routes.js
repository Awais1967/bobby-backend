const express = require("express");

const ROLES = require("../../constants/roles");
const authMiddleware = require("../../middleware/auth.middleware");
const requireRole = require("../../middleware/role.middleware");
const locationController = require("./location.controller");

const router = express.Router();
const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN, {
  message: "Only Super Admin can manage locations.",
});

router.post("/", authMiddleware, requireSuperAdmin, locationController.createLocation);
router.get("/", authMiddleware, requireSuperAdmin, locationController.getLocations);
router.get("/my", authMiddleware, requireRole(ROLES.HOST), locationController.getMyLocations);
router.get("/:id", authMiddleware, requireSuperAdmin, locationController.getLocationById);
router.put("/:id", authMiddleware, requireSuperAdmin, locationController.updateLocation);
router.patch(
  "/:id/status",
  authMiddleware,
  requireSuperAdmin,
  locationController.updateLocationStatus
);
router.patch(
  "/:id/hosts",
  authMiddleware,
  requireSuperAdmin,
  locationController.assignHostsToLocation
);
router.delete("/:id", authMiddleware, requireSuperAdmin, locationController.deleteLocation);

module.exports = router;
