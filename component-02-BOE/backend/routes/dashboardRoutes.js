const express = require("express");

const router = express.Router();

const { getDashboard } = require("../controllers/dashboardController");

const { authenticateUser } = require("../middleware/authMiddleware");

const { authorizeBOA } = require("../middleware/roleMiddleware");

router.get(
  "/dashboard",

  authenticateUser,

  authorizeBOA,

  getDashboard,
);

module.exports = router;
