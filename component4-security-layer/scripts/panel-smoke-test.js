'use strict';

require('dotenv').config({ path: require('node:path').resolve(__dirname, '..', 'backend', '.env') });
const { createVerificationService } = require('../backend/src/verification-service-clean');

const candidateId = process.env.PANEL_CANDIDATE_ID;
const moduleCode = process.env.PANEL_MODULE_CODE;
const validGrade = process.env.PANEL_VALID_GRADE;

async function main() {
  if (!candidateId || !moduleCode || !validGrade) {
    throw new Error('Set PANEL_CANDIDATE_ID, PANEL_MODULE_CODE, and PANEL_VALID_GRADE to a current finalized Component 1 record');
  }
  const baseUrl = String(process.env.ACADEMIC_DATA_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('ACADEMIC_DATA_BASE_URL is required');
  const service = createVerificationService({
    dataBaseUrl: baseUrl,
    authenticateTokenImpl: async () => ({ userId: 'panel-smoke-test', userEmail: 'panel@test.local', companyId: 'PANEL', role: 'verifier' }),
  });

  const valid = await service.verifyGradeRequest({ candidateId, moduleCode, claimedGrade: validGrade, sessionToken: 'panel' });
  const invalid = await service.verifyGradeRequest({ candidateId, moduleCode, claimedGrade: 'F', sessionToken: 'panel' });
  const transcript = await service.verifyTranscriptRequest({ candidateId, sessionToken: 'panel' });

  if (valid.result !== 'VALID' || !valid.checks.zkpValid) throw new Error(`Valid claim failed: ${valid.error || valid.result}`);
  if (invalid.result !== 'INVALID') throw new Error('Tampered claim was accepted');
  if (transcript.result !== 'VALID') throw new Error(`Valid transcript failed: ${transcript.error || transcript.result}`);

  console.log(JSON.stringify({
    success: true,
    component1BaseUrl: baseUrl,
    validClaim: { candidateId, moduleCode, result: valid.result, checks: valid.checks },
    tamperedClaim: { claimedGrade: 'F', result: invalid.result, checks: invalid.checks },
    transcript: { candidateId, result: transcript.result },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`PANEL_SMOKE_TEST_FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await require('../backend/src/mongo-verification-store').disconnectMongo();
  });
