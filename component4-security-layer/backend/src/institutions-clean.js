const crypto = require('crypto');

function normalizeText(value) {
  return String(value ?? '').trim();
}

const INSTITUTION_CATALOG = [
  {
    id: 'EMP001',
    name: 'Employer Verification Portal',
    label: 'Employer / External Institution',
    secretEnvKey: 'DEMO_INSTITUTION_SECRET',
    secretFallback: 'demo-institution-zkp-secret',
  },
];

function secretFromInstitution(institution) {
  return process.env[institution.secretEnvKey] || institution.secretFallback;
}

function secretToFieldElement(secret) {
  const digest = crypto.createHash('sha256').update(String(secret)).digest('hex');
  const field = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
  return BigInt(`0x${digest}`) % field;
}

function poseidonCommitmentFromSecret(secret) {
  const secretField = secretToFieldElement(secret).toString();
  return crypto.createHash('sha256').update(secretField).digest('hex');
}

async function resolveInstitution(institutionId) {
  const normalizedId = normalizeText(institutionId).toUpperCase();
  const institution = INSTITUTION_CATALOG.find((entry) => entry.id === normalizedId);

  if (!institution) {
    return null;
  }

  const commitment = poseidonCommitmentFromSecret(secretFromInstitution(institution));

  return {
    id: institution.id,
    institutionId: institution.id,
    name: institution.name,
    institutionName: institution.name,
    label: institution.label,
    commitment,
  };
}

async function listInstitutions() {
  const institutions = [];

  for (const institution of INSTITUTION_CATALOG) {
    institutions.push(await resolveInstitution(institution.id));
  }

  return institutions.filter(Boolean);
}

module.exports = {
  listInstitutions,
  poseidonCommitmentFromSecret,
  resolveInstitution,
  secretFromInstitution,
  secretToFieldElement,
};
