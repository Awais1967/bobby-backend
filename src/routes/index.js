const express = require("express");

const authRoutes = require("../modules/auth/auth.routes");
const hostRoutes = require("../modules/hosts/host.routes");
const locationRoutes = require("../modules/locations/location.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "Trivia Goat API",
    status: "ok",
  });
});

router.use("/auth", authRoutes);
router.use("/hosts", hostRoutes);
router.use("/locations", locationRoutes);

module.exports = router;
