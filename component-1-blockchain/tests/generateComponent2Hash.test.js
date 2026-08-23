const crypto = require("crypto");

function generateComponent2Hash(record) {
    const hashData = `
      ${record.candidateId}
      ${record.moduleCode}
      ${record.marks}
      ${record.grade}
      ${record.version}
    `;

    return crypto
        .createHash("sha256")
        .update(hashData)
        .digest("hex");
}

const records = [
    {
        candidateId: "IT010",
        moduleCode: "SE3050",
        marks: 85,
        grade: "A",
        version: 2
    },
    {
        candidateId: "IT002",
        moduleCode: "SE3050",
        marks: 72,
        grade: "B",
        version: 1
    }
];

for (const record of records) {
    console.log(
        `${record.candidateId}: ${generateComponent2Hash(record)}`
    );
}