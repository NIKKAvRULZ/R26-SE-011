const express = require("express");

const router = express.Router();

const { exportResultsByModule } = require("../controllers/exportController");

const { authenticateUser } = require("../middleware/authMiddleware");

const { authorizeBOA } = require("../middleware/roleMiddleware");

// =======================================
// EXPORT MODULE RESULTS
// =======================================

router.get(
  "/export/:moduleCode",
  authenticateUser,
  authorizeBOA,
  exportResultsByModule,
);

module.exports = router;
