const { buildPoseidon } = require('circomlibjs');
const crypto = require('crypto');
const { normalizeMerkleRoot } = require('./verification-utils');

const INSTITUTION_CATALOG = [
  {
    id: 'EMP001',
    name: 'Employer Verification Portal',
    label: 'Employer / External Institution',
  },
];

function secretFromEnv() {
  return process.env.DEMO_INSTITUTION_SECRET || process.env.INSTITUTION_SECRET || 'demo-institution-zkp-secret';
}

function secretToFieldElement(secret) {
  const digest = crypto.createHash('sha256').update(String(secret)).digest('hex');
  const normalized = BigInt(`0x${digest}`);
  const field = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
  return normalized % field;
}

let poseidonPromise;

async function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }

  return poseidonPromise;
}

async function poseidonCommitmentFromSecret(secret) {
  const poseidon = await getPoseidon();
  const secretField = secretToFieldElement(secret);
  const hash = poseidon([secretField]);

  return poseidon.F.toString(hash);
}

async function resolveInstitution(institutionId) {
  const institution = INSTITUTION_CATALOG.find((entry) => entry.id === institutionId);

  if (!institution) {
    return null;
  }

  const secret = secretFromEnv();
  const commitment = await poseidonCommitmentFromSecret(secret);

  return {
    id: institution.id,
    label: institution.label,
    name: institution.name,
    commitment: normalizeMerkleRoot(commitment),
  };
}

async function listInstitutions() {
  const items = [];

  for (const institution of INSTITUTION_CATALOG) {
    items.push(await resolveInstitution(institution.id));
  }

  return items.filter(Boolean);
}

module.exports = {
  listInstitutions,
  poseidonCommitmentFromSecret,
  resolveInstitution,
  secretFromEnv,
  secretToFieldElement,
};"use strict";

const { poseidonCommitmentFromSecret, normalizeIdentifier } = require("./crypto-utils-fixed");

const INSTITUTIONS = [
  {
    institutionId: "EMP001",
    institutionName: "ABC Verification Institution",
    secretEnvKey: "DEMO_INSTITUTION_SECRET",
    secretFallback: "demo-institution-zkp-secret",
  },
];

async function resolveInstitution(institution) {
  const secretValue = process.env[institution.secretEnvKey] || institution.secretFallback;
  const commitment = await poseidonCommitmentFromSecret(secretValue);

  return {
    institutionId: institution.institutionId,
    institutionName: institution.institutionName,
    commitment,
  };
}

async function listInstitutions() {
  return Promise.all(INSTITUTIONS.map(resolveInstitution));
}

async function getInstitutionById(institutionId) {
  const normalizedId = normalizeIdentifier(institutionId);
  const institution = INSTITUTIONS.find(
    (entry) => normalizeIdentifier(entry.institutionId) === normalizedId
  );

  if (!institution) {
    return null;
  }

  return resolveInstitution(institution);
}

module.exports = {
  getInstitutionById,
  listInstitutions,
};