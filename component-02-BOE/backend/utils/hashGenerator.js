const crypto = require("crypto");

const generateResultHash = ({
  candidateId,
  moduleCode,
  marks,
  grade,
  version,
}) => {
  const hashData = [candidateId, moduleCode, marks, grade, version].join("|");

  return crypto.createHash("sha256").update(hashData).digest("hex");
};

module.exports = {
  generateResultHash,
};