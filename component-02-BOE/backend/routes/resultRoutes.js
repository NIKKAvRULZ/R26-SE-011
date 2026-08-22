const express = require("express");

const router = express.Router();

const {
  getResultsByModule,
  getCandidateById,
  editResult,
} = require("../controllers/resultController");
const { authenticateUser } = require("../middleware/authMiddleware");

const { authorizeBOA } = require("../middleware/roleMiddleware");

router.get(
  "/results/:moduleCode",
  authenticateUser,
  authorizeBOA,
  getResultsByModule,
);

router.get(
  "/candidate/:candidateId",
  authenticateUser,
  authorizeBOA,
  getCandidateById,
);

router.post("/edit", authenticateUser, authorizeBOA, editResult);

module.exports = router;
